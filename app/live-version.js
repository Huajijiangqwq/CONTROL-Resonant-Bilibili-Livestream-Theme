// Release badge. Runtime rendering never reloads a running broadcast.
(() => {
  const badge = document.getElementById('versionBadge');
  if (badge && !new URLSearchParams(location.search).has('obs')) {
    const version = document.querySelector('meta[name="theme-version"]')?.content;
    badge.textContent = version || '1.0.0';
    badge.hidden = false;
    badge.title = 'Control Resonant-bilibili直播间主题' + (version ? ' · ' + version : '');
  }
})();
