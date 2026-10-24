(() => {
  'use strict';
  const root = document.documentElement;
  const config = document.getElementById('text-decode');
  const duration = Math.max(300, Math.min(6000, Number(config?.dataset.duration) || 1000));
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  root.dataset.decodeState = 'ready';
  root.dataset.decodeFrames = '0';

  if (motion.matches) {
    root.dataset.decodeState = 'skipped';
    return;
  }

  const records = [];
  const words = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let timer = 0;
  let fallback = 0;
  let finished = false;
  let frames = 0;

  function restore(state) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(fallback);
    for (const record of records) {
      if (record.wrapper.isConnected) record.wrapper.replaceWith(record.node);
    }
    document.removeEventListener('pointerdown', cancel, true);
    document.removeEventListener('keydown', cancel, true);
    document.removeEventListener('focusin', cancel, true);
    window.removeEventListener('wheel', cancel, true);
    motion.removeEventListener('change', motionChanged);
    root.dataset.decodeState = state;
    root.dataset.decodeFrames = String(frames);
  }

  function cancel() { restore('skipped'); }
  function motionChanged(event) { if (event.matches) cancel(); }

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

  try {
    // Collect before changing the DOM, so generated glyphs are never visited again.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || !/[A-Za-z0-9]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script,style,noscript,svg,textarea,pre,code,decode-fragment,[data-decode-skip],.skip-link')) {
          return NodeFilter.FILTER_REJECT;
        }
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
        if (!/[A-Za-z0-9]/.test(token)) {
          wrapper.append(document.createTextNode(token));
          continue;
        }
        const word = document.createElement('decode-word');
        const source = document.createElement('span');
        source.className = 'decode-source';
        source.textContent = token;
        const visual = document.createElement('span');
        visual.className = 'decode-scramble';
        visual.setAttribute('aria-hidden', 'true');
        visual.textContent = token;
        word.append(source, visual);
        wrapper.append(word);
        words.push({
          visual,
          text: token,
          chars: Array.from(token),
          seed: words.length * 53 + 19,
          delay: (delay + Math.min(wordIndex++ * .006, .06)) * duration,
          done: false
        });
      }
      records.push({node, wrapper});
      parent.replaceChild(wrapper, node);
    }

    root.dataset.decodeWords = String(words.length);
    if (!words.length) { restore('complete'); return; }
    root.dataset.decodeState = 'playing';
    document.addEventListener('pointerdown', cancel, {capture: true});
    document.addEventListener('keydown', cancel, {capture: true});
    document.addEventListener('focusin', cancel, {capture: true});
    window.addEventListener('wheel', cancel, {capture: true, passive: true});
    motion.addEventListener('change', motionChanged);

    const start = performance.now();
    function draw() {
      if (finished) return;
      const elapsed = Math.max(1, performance.now() - start);
      const tick = Math.floor(elapsed / 65);
      for (const word of words) {
        if (word.done) continue;
        const progress = Math.max(0, Math.min(1, (elapsed - word.delay) / (duration * .66)));
        if (progress >= 1) {
          word.visual.textContent = word.text;
          word.done = true;
          continue;
        }
        const settled = Math.floor(progress * word.chars.length);
        let text = '';
        for (let i = 0; i < word.chars.length; i++) {
          const char = word.chars[i];
          text += i < settled || !/[A-Za-z0-9]/.test(char)
            ? char
            : alphabet[Math.floor(random(word.seed + i * 17 + tick * 137) * alphabet.length)];
        }
        word.visual.textContent = text;
      }
      root.dataset.decodeFrames = String(++frames);
      if (elapsed >= duration) { restore('complete'); return; }
      timer = setTimeout(draw, 40);
    }

    // Paint immediately, without depending on an embedded frame's visibility or RAF.
    draw();
    fallback = setTimeout(() => restore('skipped'), duration + 350);
  } catch (error) {
    restore('skipped');
  }
})();
