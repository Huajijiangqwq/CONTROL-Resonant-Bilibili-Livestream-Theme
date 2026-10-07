/* Live preview can inspect the applied editor checkpoint or return to presets. */
(() => {
  'use strict';
  const p = new URLSearchParams(location.search);
  const snapshotPreview = !p.has('published') && (p.has('theme') || new URLSearchParams(location.hash.slice(1)).has('theme'));
  if (p.has('editor') || p.has('obs') || (p.has('pure') && !snapshotPreview)) return;
  const host = document.querySelector('.editor-scroll'); if (!host) return;
  if (snapshotPreview) {
    const panel = document.createElement('section'); panel.className = 'control-section publication-live-choice';
    panel.innerHTML = '<h2>草稿快照预览</h2><p class="hint">这是打开预览时的草稿。它不会替换已应用主题，也不会随之后的编辑更新。</p><a id="snapshotBackEditor">回到编辑器</a><p><a href="live.html">查看实际直播版本</a></p>';
    panel.querySelector('#snapshotBackEditor').href = p.get('chatSync') === 'chat' ? 'chat-editor.html' : 'theme-editor.html';
    host.prepend(panel);
    for (const section of host.querySelectorAll('.control-section')) {
      if (section === panel || section.classList.contains('local-message-section')) continue;
      section.hidden = true; section.style.display = 'none';
    }
    const copy = document.getElementById('copyObs'); copy.textContent = '复制草稿快照地址';
    copy.addEventListener('click', async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const url = new URL(location.href); url.searchParams.delete('pure'); url.searchParams.set('obs', '1');
      document.getElementById('obsUrl').value = url.href;
      const hint = document.querySelector('#urlDialog p');
      if (hint) hint.textContent = '此地址固定在当前草稿快照，不会随“应用到直播”更新。正式使用请从编辑器复制固定 OBS 地址。';
      try { await navigator.clipboard.writeText(url.href); } catch {}
      document.getElementById('urlDialog').showModal(); document.getElementById('obsUrl').select();
    }, true);
    return;
  }
  const published = p.has('published'), channel = p.get('published') === 'chat' ? 'chat' : 'theme';
  const section = document.createElement('section'); section.className = 'control-section publication-live-choice';
  section.innerHTML = '<h2>直播画面</h2><label>画面来源<select id="livePublicationChoice"><option value="preset">预设布局</option><option value="theme">编辑器 · 已应用主题</option><option value="chat">弹幕编辑器 · 已应用主题</option></select></label><p id="livePublicationState" class="hint" role="status"></p><a id="livePublicationEdit" href="theme-editor.html">回到主题编辑器</a>';
  host.prepend(section);
  const $ = id => document.getElementById(id);
  $('livePublicationChoice').value = published ? channel : 'preset';
  $('livePublicationEdit').href = channel === 'chat' ? 'chat-editor.html' : 'theme-editor.html';
  $('livePublicationEdit').textContent = channel === 'chat' ? '回到弹幕编辑器' : '回到主题编辑器';
  $('livePublicationState').textContent = published ? '正在读取已应用主题…' : '正在使用原版预设。可切换到编辑器已应用的主题；原版布局仍会保留。';
  function preference() { try { return JSON.parse(localStorage.getItem('control-live-view') || 'null'); } catch { return null; } }
  function navigate(mode) {
    if (mode === (published ? channel : 'preset')) return;
    const next = new URL('live.html', location.href);
    if (mode !== 'preset') {
      next.searchParams.set('published', mode);
      next.searchParams.set('layout', 'custom');
      next.searchParams.set('chatSync', mode);
    }
    location.assign(next.href);
  }
  $('livePublicationChoice').onchange = event => {
    const mode = event.target.value;
    try { localStorage.setItem('control-live-view', JSON.stringify({ mode, at: Date.now() })); } catch {}
    navigate(mode);
  };
  window.addEventListener('storage', event => { if (event.key === 'control-live-view') { const value = preference(); if (value) navigate(value.mode); } });
  // A new explicit application selects that theme in live preview as well. A
  // later explicit return to presets is remembered until the next application.
  let latest = null, selectionTimer = 0;
  const subscriptions = ['theme', 'chat'].map(kind => {
    const path = '/api/theme-publish/' + kind + '/events';
    const stream = window.StudioEvents ? window.StudioEvents.open(path) : new EventSource(path);
    stream.addEventListener('published', event => {
      let value; try { value = JSON.parse(event.data); } catch { return; }
      if (!value.document || (latest && latest.appliedAt > value.appliedAt)) return;
      latest = value;
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        const saved = preference();
        if (!saved || saved.at < latest.appliedAt) {
          try { localStorage.setItem('control-live-view', JSON.stringify({ mode: latest.channel, at: latest.appliedAt })); } catch {}
          navigate(latest.channel);
        } else if (!p.has('published') && !p.has('layout')) navigate(saved.mode);
      }, 40);
    });
    return stream;
  });
  window.addEventListener('pagehide', () => { clearTimeout(selectionTimer); subscriptions.forEach(stream => stream.close()); });
  if (published) {
    for (const id of ['layoutSelect', 'hostInput', 'nowPlayingEnabled', 'resonanceStrength', 'fleetHold']) {
      const block = $(id)?.closest('.control-section');
      if (block) { block.hidden = true; block.style.display = 'none'; }
    }
    $('copyObs').addEventListener('click', async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const link = new URL(location.href); link.hash = '';
      for (const key of ['pure', 'v', 'demo']) link.searchParams.delete(key);
      link.searchParams.set('obs', '1');
      $('obsUrl').value = link.href;
      try { await navigator.clipboard.writeText(link.href); } catch {}
      $('urlDialog').showModal(); $('obsUrl').select();
    }, true);
    window.addEventListener('theme-publication-state', event => {
      const { state, packet } = event.detail;
      $('livePublicationState').textContent = state === 'ready' ? `${packet.name} · 修订 ${packet.revision} · 与固定 OBS 地址同步。修改布局与效果请回编辑器。` : state === 'empty' ? '尚未应用主题。请回编辑器选择“应用到直播”。' : state === 'reconnecting' ? '直播服务正在重连，保留最后一次画面。' : '主题更新失败，请检查编辑器中的应用状态。';
    });
  }
  const local = document.querySelector('.local-message-section');
  if (local) {
    const label = document.createElement('label'); label.className = 'check';
    label.innerHTML = '<input type="checkbox" id="liveTestMirroring">将检查消息显示到 OBS';
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '默认仅在此页检查。开启后，发送和清空也会同步到 OBS；不会向直播间发送弹幕。';
    local.prepend(label, hint);
    $('liveTestMirroring').onchange = event => window.EditorMessageSync?.setMirroring(event.target.checked);
  }
})();
