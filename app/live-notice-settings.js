(() => {
  'use strict';
  const key = 'hiss-notice-times-v1',
    p = new URLSearchParams(location.search),
    obs = p.has('obs'),
    frame = document.getElementById('chatFrame');
  let raw = {};
  try {
    raw = JSON.parse(p.get('notices') || (!obs && localStorage.getItem(key)) || '{}');
  } catch {}
  let settings = NoticeLifetime.normalize(raw);
  function feed() {
    frame.contentWindow?.postMessage(
      { channel: 'hiss-main', command: 'notice-settings', data: settings },
      location.origin,
    );
  }
  function sync() {
    for (const k of Object.keys(settings)) document.getElementById(k).value = settings[k];
  }
  for (const k of Object.keys(settings))
    document.getElementById(k).addEventListener('change', (e) => {
      settings = NoticeLifetime.normalize({ ...settings, [k]: e.target.value });
      sync();
      if (!obs)
        try {
          localStorage.setItem(key, JSON.stringify(settings));
        } catch {}
      feed();
    });
  frame.addEventListener('load', feed);
  window.addEventListener('message', (e) => {
    if (
      e.source === frame.contentWindow &&
      e.origin === location.origin &&
      e.data?.channel === 'hiss-main-reply' &&
      e.data.type === 'ready'
    )
      feed();
  });
  window.LiveNoticeSettings = {
    get value() {
      return { ...settings };
    },
  };
  sync();
  feed();
})();
