(() => {
  'use strict';

  const root = document.documentElement;
  const button = document.getElementById('theme-toggle');
  const label = document.getElementById('theme-label');
  const browserTheme = window.matchMedia('(prefers-color-scheme: light)');
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('lashvir-theme'); } catch {}

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const next = theme === 'dark' ? 'light' : 'dark';
    label.textContent = `${next === 'light' ? 'Light' : 'Dark'} mode`;
    button.setAttribute('aria-label', `Switch to ${next} theme`);
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f0f5eb' : '#10171c';
  }

  applyTheme(root.dataset.theme);
  button.hidden = false;
  button.addEventListener('click', () => {
    savedTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(savedTheme);
    try { localStorage.setItem('lashvir-theme', savedTheme); } catch {}
  });
  browserTheme.addEventListener('change', event => {
    if (savedTheme !== 'light' && savedTheme !== 'dark') applyTheme(event.matches ? 'light' : 'dark');
  });

  const navigation = Array.from(document.querySelectorAll('.nav-link'));
  function updateNavigation() {
    const current = location.hash === '#about' ? '#about' :
      ['#projects', '#infra-project', '#tfmobile-project', '#infra-notes'].includes(location.hash) ? '#projects' : '#home';
    navigation.forEach(link => {
      if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', updateNavigation);
  updateNavigation();
})();
