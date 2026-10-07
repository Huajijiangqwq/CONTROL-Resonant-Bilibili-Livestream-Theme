/* Controls only. Embedded chat canvases never receive this workspace UI. */
(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  if (params.get('embed') === 'main') return;
  const sidebar = document.querySelector('aside[aria-label="弹幕发送与模拟设置"]');
  if (!sidebar) return;
  const $ = id => document.getElementById(id);
  const sections = Array.from(sidebar.children).filter(node => node.matches('section.block'));
  const live = $('livePanel'), composer = $('send')?.closest('section.block'), stream = $('auto')?.closest('section.block');
  const visual = $('layoutInfo')?.closest('section.block'), history = $('history')?.closest('section.block');
  if (!live || !composer || !stream || !visual) return;
  const key = 'control-simulation-controls-v2', groups = [['send', '消息测试'], ['live', '直播接入'], ['view', '画面与特效']];
  const tabs = document.createElement('div'); tabs.className = 'studio-control-tabs simulation-control-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '消息模拟控制区');
  const panels = new Map(), buttons = new Map();
  let chosen = 'send';
  try { const last = localStorage.getItem(key); if (groups.some(([id]) => id === last) && !params.has('mode')) chosen = last; } catch {}
  function choose(id, focus = false) {
    if (!panels.has(id)) return;
    chosen = id;
    for (const [name, panel] of panels) { const active = name === id; panel.hidden = !active; buttons.get(name).setAttribute('aria-selected', String(active)); buttons.get(name).tabIndex = active ? 0 : -1; }
    sidebar.scrollTop = 0; if (focus) buttons.get(id).focus();
    try { localStorage.setItem(key, id); } catch {}
  }
  for (const [id, label] of groups) {
    const panel = document.createElement('div'); panel.id = 'simulation-panel-' + id; panel.className = 'simulation-control-panel'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'simulation-tab-' + id);
    const button = document.createElement('button'); button.id = 'simulation-tab-' + id; button.type = 'button'; button.textContent = label; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id); button.onclick = () => choose(id);
    button.onkeydown = event => {
      let target;
      const current = groups.findIndex(([name]) => name === id);
      if (event.key === 'ArrowRight') target = groups[(current + 1) % groups.length][0];
      if (event.key === 'ArrowLeft') target = groups[(current + groups.length - 1) % groups.length][0];
      if (event.key === 'Home') target = groups[0][0];
      if (event.key === 'End') target = groups.at(-1)[0];
      if (target) { event.preventDefault(); choose(target, true); }
    };
    panels.set(id, panel); buttons.set(id, button); tabs.append(button);
  }
  panels.get('send').append(composer, stream); if (history) panels.get('send').append(history);
  panels.get('live').append(live); panels.get('view').append(visual);
  for (const section of sections) if (![composer, stream, history, live, visual].includes(section)) panels.get('view').append(section);
  sidebar.prepend(tabs); sidebar.append(...panels.values());
  composer.querySelector('h2').textContent = '发送测试消息';
  const state = document.createElement('div'); state.className = 'simulation-source-note'; state.setAttribute('role', 'status');
  const description = document.createElement('span'), switchButton = document.createElement('button');
  switchButton.type = 'button'; switchButton.textContent = '切回本地模拟';
  switchButton.onclick = () => { $('messageSource').value = 'simulation'; $('messageSource').dispatchEvent(new Event('change', { bubbles: true })); syncSource(); };
  state.append(description, switchButton); composer.querySelector('.section-title').after(state);
  function syncSource() {
    const real = $('messageSource').value === 'live'; state.dataset.live = String(real);
    description.textContent = real ? '当前显示真实消息。切回本地模拟后可测试发送。' : '测试消息只显示在此预览中。';
    switchButton.hidden = !real;
  }
  $('messageSource').addEventListener('change', syncSource);
  const observer = new MutationObserver(syncSource); observer.observe($('liveStatus'), { childList: true, subtree: true, characterData: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  $('clear').textContent = '清空当前画面'; $('seed').textContent = '恢复混合示例';
  const fieldsetHint = document.createElement('p'); fieldsetHint.className = 'hint'; fieldsetHint.textContent = '先选消息类型，再填写对应内容。SC、礼物和上舰各有独立参数。'; composer.querySelector('.section-title').after(fieldsetHint);
  const fpsHint = document.createElement('p'); fpsHint.className = 'hint simulation-shared-setting'; fpsHint.textContent = '这里的动画帧率是通用预览设置，会影响使用通用帧率的其他预览页。';
  visual.querySelector('[data-frame-rate]')?.after(fpsHint);
  const references = document.createElement('section'); references.className = 'block simulation-references';
  const title = document.createElement('h2'); title.textContent = '独立特效检查';
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '在独立页面检查原生效果与动画时间轴，当前测试内容会保留。';
  const links = document.createElement('div'); links.className = 'simulation-reference-links';
  for (const link of Array.from(document.querySelectorAll('header .actions a.link'))) {
    if (!['normal.html', 'gift.html', 'levitation.html', 'sc-compare.html'].includes(link.getAttribute('href'))) continue;
    link.target = '_blank'; link.rel = 'noopener'; links.append(link);
  }
  for (const [href, label] of [['monitor.html', '组件监视与录制'], ['theme-editor.html', '编辑主题外观']]) { const link = document.createElement('a'); link.className = 'link'; link.href = href; link.target = '_blank'; link.rel = 'noopener'; link.textContent = label; links.append(link); }
  references.append(title, hint, links); panels.get('view').append(references);
  syncSource(); choose(chosen);
})();
