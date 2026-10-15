// Release badge. Runtime rendering never reloads a running broadcast.
(() => {
  const badge = document.getElementById('versionBadge');
  if (badge && !new URLSearchParams(location.search).has('obs')) {
    const version = document.querySelector('meta[name="theme-version"]')?.content;
    badge.textContent = version || '';
    badge.hidden = !version;
    badge.title = 'Control Resonant-bilibili直播间主题' + (version ? ' · ' + version : '');
  }
})();
