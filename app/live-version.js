// Release badge. Runtime rendering never reloads a running broadcast.
(() => {
  const badge = document.getElementById('versionBadge');
  if (badge && !new URLSearchParams(location.search).has('obs')) {
    badge.textContent = 'Beta 1';
    badge.hidden = false;
    badge.title = 'Control Resonant-bilibili直播间主题 · 0.1.0-beta.1';
  }
})();
