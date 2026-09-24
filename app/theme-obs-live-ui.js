/* One document writer, one persistent OBS source. Edits never reload its URL. */
(() => {
  'use strict';
  const panel = document.getElementById('obsInstallPanel');
  if (!panel) return;
  const el = document.createElement('section');
  el.className = 'obs-live-panel';
  el.innerHTML = `<div class="obs-section-title"><h3>实时布局同步</h3><span id="obsSyncBadge">未绑定</span></div><p class="obs-note">绑定一次后，位置、尺寸、文字和特效参数会随编辑更新。切换预设时，游戏区域和主题一起过渡。</p><label>已有主题场景<select id="obsSyncTarget" aria-label="实时同步目标"><option value="">正在读取…</option></select></label><div class="obs-live-actions"><button id="obsSyncBind" type="button">绑定并开启实时同步</button><button id="obsSyncPause" type="button" hidden>暂停同步</button><button id="obsSyncResume" type="button" hidden>恢复同步</button></div><p id="obsSyncDetail" class="obs-note" role="status">新建场景后会自动开启同步；也可以选择已有主题场景。</p><p class="obs-note">旧场景首次绑定会初始化一次主题来源，之后修改无需刷新。</p>`;
  panel.append(el);
  const $ = (id) => document.getElementById(id),
    key = 'theme-obs-live-' + location.pathname;
  let saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(key) || '{}');
  } catch {}
  const writer = saved.writer || crypto.randomUUID();
  let binding = saved.id ? { id: saved.id, sceneName: saved.sceneName, enabled: false } : null,
    wants = !!saved.active,
    sequence = 0,
    targets = [],
    pending = null,
    inflight = null,
    timer = 0,
    lastSent = '',
    loading = false,
    available = false;
  function store() {
    sessionStorage.setItem(
      key,
      JSON.stringify({ writer, id: binding?.id, sceneName: binding?.sceneName, active: wants }),
    );
  }
  function show(text, phase) {
    $('obsSyncBadge').textContent =
      phase || (binding?.enabled ? '实时同步已开启' : binding ? '已暂停' : '未绑定');
    $('obsSyncDetail').textContent =
      text || (binding?.enabled ? '正在实时更新：' + binding.sceneName : binding?.message) || '';
    $('obsSyncPause').hidden = !binding?.enabled;
    $('obsSyncResume').hidden = !binding || binding.enabled;
    $('obsSyncBind').disabled = loading || !available || !targets.length;
    $('obsSyncPause').disabled = loading;
    $('obsSyncResume').disabled = loading || !available;
    const b = $('obsConnect');
    if (available)
      b.lastElementChild.textContent = binding?.enabled ? 'OBS · 实时同步' : 'OBS 已连接';
  }
  async function request(action, data = {}) {
    const r = await fetch('/api/obs/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Theme-Obs': '1' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(20000),
    });
    const result = await r.json();
    if (!r.ok) throw Object.assign(Error(result.error || '同步未完成'), { code: result.code });
    return result;
  }
  function doc() {
    if (!window.ThemeEditor) throw Error('编辑器尚未载入。');
    return window.ThemeEditor.project;
  }
  function choices() {
    const d = doc(),
      chat =
        d.layers.find((l) => l.type === 'chat' && l.id === $('chatInstancePicker')?.value) ||
        d.layers.find((l) => l.type === 'chat');
    return {
      source: $('obsGameSource').disabled ? '' : $('obsGameSource').value,
      output: $('obsChatOutput').value,
      chatId: chat?.id,
    };
  }
  async function refreshTargets() {
    targets = (await request('targets')).targets;
    const select = $('obsSyncTarget'),
      previous = select.value;
    select.replaceChildren(
      new Option(targets.length ? '选择要实时更新的主题场景' : '暂无主题场景，可先创建', ''),
    );
    targets.forEach((t, i) =>
      select.append(new Option(t.sceneName + ' / ' + t.inputName, String(i))),
    );
    const index = targets.findIndex((t) => t.sceneName === binding?.sceneName);
    if (index >= 0) select.value = String(index);
    else if (previous && targets[+previous]) select.value = previous;
    else if (targets.length === 1) select.value = '0';
    show(binding?.sceneName ? '绑定场景：' + binding.sceneName : undefined);
  }
  function failure(e) {
    wants = false;
    if (binding) binding.enabled = false;
    pending = null;
    clearTimeout(timer);
    store();
    show(e.message, '同步暂停');
  }
  async function bind(target) {
    if (loading) return;
    loading = true;
    show('正在绑定场景…');
    try {
      await settle();
      const d = structuredClone(doc());
      binding = await request('bind', { ...choices(), ...target, writer, document: d });
      sequence = 0;
      wants = true;
      lastSent = JSON.stringify(d);
      store();
      await refreshTargets();
      show('正在实时更新：' + binding.sceneName, '实时同步已开启');
      queue(doc(), 0);
    } catch (e) {
      failure(e);
      throw e;
    } finally {
      loading = false;
      show();
      if (pending && !timer) timer = setTimeout(flush, 40);
    }
  }
  async function flush() {
    clearTimeout(timer);
    timer = 0;
    if (inflight || !pending || !binding?.enabled || loading) return;
    const item = pending;
    pending = null;
    if (item.text === lastSent) return;
    inflight = request('sync', {
      id: binding.id,
      writer,
      sequence: ++sequence,
      document: item.document,
      duration: item.duration,
    });
    try {
      const info = await inflight;
      binding = { ...binding, ...info };
      lastSent = item.text;
      show('已同步到：' + binding.sceneName, '实时同步已开启');
    } catch (e) {
      failure(e);
    } finally {
      inflight = null;
      if (pending) timer = setTimeout(flush, 40);
    }
  }
  function queue(value, duration) {
    if (!binding?.enabled || !wants) return;
    const text = JSON.stringify(value);
    pending = { document: JSON.parse(text), text, duration: duration || 0 };
    if (!timer && !inflight) timer = setTimeout(flush, 70);
  }
  async function settle() {
    clearTimeout(timer);
    timer = 0;
    pending = null;
    if (inflight) await inflight.catch(() => {});
  }
  async function pause() {
    if (!binding?.enabled) return;
    wants = false;
    await settle();
    try {
      binding = await request('pause-sync', { id: binding.id, writer });
      store();
      show('同步已暂停，OBS 保持当前画面。', '已暂停');
    } catch (e) {
      failure(e);
      throw e;
    }
  }
  $('obsSyncBind').onclick = async () => {
    const target = targets[Number($('obsSyncTarget').value)];
    if (!target || $('obsSyncTarget').value === '') {
      show('先选择一个主题场景。');
      return;
    }
    try {
      await pause();
      await bind(target);
    } catch {}
  };
  $('obsSyncPause').onclick = () => pause().catch(() => {});
  $('obsSyncResume').onclick = () => bind({ id: binding.id }).catch(() => {});
  window.ThemeObsLive = {
    pause,
    bindInstalled: async (result) =>
      bind({ sceneName: result.sceneName, inputName: result.inputName }),
  };
  window.addEventListener('theme-document-change', (e) =>
    queue(e.detail.document, e.detail.duration),
  );
  window.addEventListener('obs-connected', async () => {
    available = true;
    try {
      await refreshTargets();
      if (wants && binding && !binding.enabled) await bind({ id: binding.id });
    } catch (e) {
      failure(e);
    }
  });
  const poll = setInterval(async () => {
    if (!binding || loading || inflight) return;
    try {
      const r = await fetch('/api/obs/status?binding=' + binding.id, {
          signal: AbortSignal.timeout(3000),
        }),
        v = await r.json();
      available = !!v.connected;
      if (!available) {
        if (binding.enabled) {
          binding.enabled = false;
          show('OBS 已断开，重新连接后恢复同步。', '等待连接');
        }
        return;
      }
      if (v.sync && !v.sync.enabled && binding.enabled) {
        binding = { ...binding, ...v.sync };
        show(v.sync.message, '已暂停');
      }
    } catch {
      available = false;
      if (binding?.enabled) {
        binding.enabled = false;
        show('主题服务已断开，重新连接后恢复同步。', '等待连接');
      }
    }
  }, 2500);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(poll);
      clearTimeout(timer);
      store();
    },
    { once: true },
  );
  store();
  show();
  if (wants && binding) setTimeout(() => window.dispatchEvent(new Event('obs-request-connect')), 0);
})();
