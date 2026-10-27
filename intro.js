(() => {
  'use strict';
  const root = document.documentElement;
  const config = document.getElementById('text-decode');
  const replay = document.getElementById('intro-replay');
  const duration = Math.max(300, Math.min(6000, Number(config?.dataset.duration) || 2000));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let active = null;
  let pending = null;
  let startFrame = 0;
  let automaticPending = true;
  let hasPlayed = false;

  root.dataset.decodeVersion = '3';
  root.dataset.decodeFrames = '0';

  function status(state, reason = state) {
    root.dataset.decodeState = state;
    root.dataset.decodeReason = reason;
    if (replay) {
      replay.textContent = active || pending ? 'Skip intro' : hasPlayed ? 'Replay intro' : 'Play intro';
      replay.setAttribute('aria-label', active || pending ? 'Skip text animation' : 'Play text animation once');
    }
  }

  function restore(state, reason) {
    cancelAnimationFrame(startFrame);
    startFrame = 0;
    pending = null;
    if (active) {
      cancelAnimationFrame(active.frame);
      for (const record of active.records) {
        if (record.wrapper.isConnected) record.wrapper.replaceWith(record.node);
      }
      active = null;
    }
    status(state, reason);
  }

  function sectionDelay(element) {
    if (element.closest('.page-footer')) return .28;
    if (element.closest('.about-section')) return .24;
    if (element.closest('.experiments-section')) return .20;
    if (element.closest('.projects-section')) return .14;
    if (element.closest('.building-note')) return .10;
    if (element.closest('.hero')) return .06;
    return 0;
  }

  function random(value) {
    let n = value | 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function draw(run) {
    const tick = Math.floor(run.elapsed / 65);
    for (const word of run.words) {
      if (word.done) continue;
      const progress = Math.max(0, Math.min(1, (run.elapsed - word.delay) / (duration * .66)));
      if (progress >= 1) {
        word.visual.textContent = word.text;
        word.done = true;
        continue;
      }
      const settled = Math.floor(progress * word.chars.length);
      let text = '';
      for (let i = 0; i < word.chars.length; i++) {
        const char = word.chars[i];
        const index = Math.min(alphabet.length - 1, Math.floor(random(word.seed + i * 17 + tick * 137) * alphabet.length));
        text += i < settled || !/[A-Za-z0-9]/.test(char) ? char : alphabet[index];
      }
      word.visual.textContent = text;
    }
    root.dataset.decodeFrames = String(++run.frames);
    run.lastDraw = run.elapsed;
  }

  function animate(timestamp) {
    const run = active;
    if (!run) return;
    run.frame = 0;
    if (document.visibilityState !== 'visible') {
      run.lastTime = null;
      status('paused', 'background-tab');
      return;
    }
    try {
      // Count painted, visible time. Loading or background tabs cannot consume the intro.
      if (run.lastTime !== null) run.elapsed += Math.max(0, timestamp - run.lastTime);
      run.lastTime = timestamp;
      if (run.elapsed - run.lastDraw >= 40 || run.elapsed >= duration) draw(run);
      if (run.elapsed >= duration) restore('complete');
      else run.frame = requestAnimationFrame(animate);
    } catch (error) {
      restore('skipped', 'error');
      console.warn('Text animation stopped safely.', error);
    }
  }

  function begin(manual) {
    if (!manual && motion.matches) { restore('skipped', 'reduced-motion'); return; }
    const run = active = {records: [], words: [], elapsed: 0, lastTime: null, lastDraw: 0, frame: 0, frames: 0};
    try {
      // Collect before changing the DOM, so generated glyphs are never visited again.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !/[A-Za-z0-9]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('script,style,noscript,svg,textarea,pre,code,decode-fragment,[data-decode-skip],.skip-link')) return NodeFilter.FILTER_REJECT;
          if (!parent.getClientRects().length || parent.closest('[hidden]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const parent = node.parentElement;
        const delay = sectionDelay(parent);
        const wrapper = document.createElement('decode-fragment');
        let wordIndex = 0;
        for (const token of node.nodeValue.match(/\s+|\S+/g) || []) {
          if (!/[A-Za-z0-9]/.test(token)) { wrapper.append(document.createTextNode(token)); continue; }
          const word = document.createElement('decode-word');
          const source = document.createElement('span');
          source.className = 'decode-source';
          source.textContent = token;
          const visual = document.createElement('span');
          visual.className = 'decode-scramble';
          visual.setAttribute('aria-hidden', 'true');
          word.append(source, visual);
          wrapper.append(word);
          run.words.push({
            visual, text: token, chars: Array.from(token), seed: run.words.length * 53 + 19,
            delay: (delay + Math.min(wordIndex++ * .006, .06)) * duration, done: false
          });
        }
        run.records.push({node, wrapper});
        parent.replaceChild(wrapper, node);
      }
      root.dataset.decodeWords = String(run.words.length);
      if (!run.words.length) { restore('complete'); return; }
      hasPlayed = true;
      status('playing');
      draw(run);
      run.frame = requestAnimationFrame(animate);
    } catch (error) {
      restore('skipped', 'error');
      console.warn('Text animation could not start.', error);
    }
  }

  function scheduleStart() {
    if (!pending || startFrame || document.visibilityState !== 'visible') return;
    // Let the loaded page reach the screen before beginning its visible animation clock.
    startFrame = requestAnimationFrame(() => {
      startFrame = requestAnimationFrame(() => {
        startFrame = 0;
        if (!pending || document.visibilityState !== 'visible') return;
        const manual = pending.manual;
        pending = null;
        begin(manual);
      });
    });
  }

  function requestStart(manual) {
    restore('ready');
    automaticPending = false;
    if (!manual && motion.matches) { status('skipped', 'reduced-motion'); return; }
    pending = {manual};
    status('waiting', document.visibilityState === 'visible' ? 'first-paint' : 'background-tab');
    scheduleStart();
  }

  function autoStart() {
    if (automaticPending) requestStart(false);
  }

  // A browser's initial focus event is not a request to cancel the animation.
  function interact(event) {
    if (event.target instanceof Element && event.target.closest('#intro-replay')) return;
    if (active || pending || automaticPending) {
      automaticPending = false;
      restore('skipped', 'interaction');
    }
  }
  document.addEventListener('pointerdown', interact, {capture: true, passive: true});
  document.addEventListener('keydown', interact, {capture: true});
  window.addEventListener('wheel', interact, {capture: true, passive: true});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      cancelAnimationFrame(startFrame);
      startFrame = 0;
      if (active) {
        cancelAnimationFrame(active.frame);
        active.frame = 0;
        active.lastTime = null;
        status('paused', 'background-tab');
      }
    } else if (active) {
      status('playing');
      if (!active.frame) active.frame = requestAnimationFrame(animate);
    } else scheduleStart();
  });
  motion.addEventListener('change', event => {
    if (event.matches && (active || pending)) restore('skipped', 'reduced-motion');
  });
  window.addEventListener('pagehide', () => restore('skipped', 'navigation'));
  if (replay) {
    replay.hidden = false;
    replay.addEventListener('click', () => {
      if (active || pending) restore('skipped', 'interaction');
      else requestStart(true);
    });
  }
  status('ready');
  if (document.readyState === 'complete') autoStart();
  else window.addEventListener('pageshow', autoStart, {once: true});
})();
