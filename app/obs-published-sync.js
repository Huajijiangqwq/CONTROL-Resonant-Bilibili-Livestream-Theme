'use strict';
// Only scenes created through the applied-theme flow are managed here. Never
// discover arbitrary captures, switch the program scene, or overwrite a changed URL.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function createPublishedSync({ root, connection, publication, model, interval = 1800 }) {
  const file = path.join(root, 'theme-live', 'managed-obs.json'), targets = new Map(), observers = new Set();
  let closed = false, polling = false, lastCollection = '', wasConnected = false;
  const fail = (code, message) => Object.assign(Error(message), { code });
  const sceneRef = target => target.sceneUuid ? { sceneUuid: target.sceneUuid } : { sceneName: target.sceneName };
  const inputRef = target => target.inputUuid ? { inputUuid: target.inputUuid } : { inputName: target.inputName };
  function transformMatches(actual, desired) {
    if (!actual) return false;
    return Object.entries(desired).every(([key, value]) => {
      // OBS may report the resolved source scale for a bounded capture. Its
      // authored geometry is defined by the bounds, not that derived value.
      if (desired.boundsType !== 'OBS_BOUNDS_NONE' && ['scaleX', 'scaleY'].includes(key)) return true;
      return typeof value === 'number' ? typeof actual[key] === 'number' && Math.abs(actual[key] - value) < 0.001 : actual[key] === value;
    });
  }
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const value of Array.isArray(saved) ? saved : []) if (/^[a-f0-9]{24}$/.test(value.id) && ['theme', 'chat'].includes(value.channel) && value.sceneName && value.inputName && value.collection)
      targets.set(value.id, { ...value, phase: 'pending', message: '等待 OBS 连接', task: null, pending: null });
  } catch {}
  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const values = [...targets.values()].map(({ task, pending, phase, message, detached, ...value }) => value);
    fs.writeFileSync(file + '.tmp', JSON.stringify(values), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
  }
  function state(channel) {
    const connected = !!connection.state().connected;
    const rows = [...targets.values()].filter(value => !channel || value.channel === channel).map(value => ({ id: value.id, channel: value.channel, sceneName: value.sceneName, inputName: value.inputName, collection: value.collection, revision: value.revision || 0, wantedRevision: publication?.snapshot(value.channel).revision || 0, phase: connected ? value.phase : 'pending', message: connected ? value.message : '等待 OBS 连接后同步最新应用版本' }));
    return { connected, channel: channel || '', targets: rows, pending: rows.filter(value => value.phase !== 'synced').length };
  }
  function announce() { for (const callback of observers) callback(state()); }
  function note(target, phase, message) {
    const changed = target.phase !== phase || target.message !== message;
    target.phase = phase; target.message = message; if (changed) announce();
  }
  async function update(target, packet) {
    const output = packet.output === 'chat' ? 'chat' : 'scene';
    const collection = await connection.call('GetSceneCollectionList');
    if (collection.currentSceneCollectionName !== target.collection) throw fail('COLLECTION', '请在 OBS 切回场景集合「' + target.collection + '」以同步');
    {
      const [scenes, inputs] = await Promise.all([connection.call('GetSceneList'), connection.call('GetInputList')]);
      if (target.sceneUuid) {
        const scene = scenes.scenes.find(value => value.sceneUuid === target.sceneUuid);
        if (!scene) throw fail('SCENE_MISSING', '受管场景已删除；同名的新场景不会被自动修改');
        target.sceneName = scene.sceneName;
      } else if (!scenes.scenes.some(value => value.sceneName === target.sceneName)) throw fail('SCENE_MISSING', '受管场景已删除或改名，请重新创建场景');
      if (target.inputUuid) {
        const input = inputs.inputs.find(value => value.inputUuid === target.inputUuid);
        if (!input) throw fail('SOURCE_MISSING', '受管主题来源已删除；同名的新来源不会被自动修改');
        target.inputName = input.inputName;
      } else if (!inputs.inputs.some(value => value.inputName === target.inputName)) throw fail('SOURCE_MISSING', '受管主题来源已删除或改名，请重新创建场景');
      if (target.sourceUuid) {
        const source = inputs.inputs.find(value => value.inputUuid === target.sourceUuid);
        if (!source && output === 'scene') throw fail('GAME_CHANGED', '受管游戏来源已删除或替换，请重新创建场景');
        if (source) target.source = source.inputName;
      } else if (output === 'scene' && target.source && !inputs.inputs.some(value => value.inputName === target.source)) throw fail('GAME_CHANGED', '受管游戏来源已删除或改名，请重新创建场景');
    }
    const [list, input, video] = await Promise.all([
      connection.call('GetSceneItemList', { ...sceneRef(target) }),
      connection.call('GetInputSettings', { ...inputRef(target) }), connection.call('GetVideoSettings'),
    ]);
    if (input.inputSettings?.url !== target.url) throw fail('SOURCE_CHANGED', '主题来源地址已被修改，自动更新已停止');
    if (!list.sceneItems.some(item => item.sceneItemId === target.browserItem && item.sourceName === target.inputName)) throw fail('SOURCE_MISSING', '受管主题来源已移除，请重新创建场景');
    const doc = packet.document, M = model();
    const chat = output === 'chat' && doc.layers.find(layer => layer.id === packet.chatId && layer.type === 'chat');
    if (output === 'chat' && !chat) throw fail('CHAT_REMOVED', '已应用主题没有这个组合弹幕区');
    const games = output === 'scene' && target.source ? doc.layers.filter(layer => layer.type === 'game') : [];
    const ids = new Set(games.map(layer => layer.id));
    for (const [id, itemId] of Object.entries(target.gameItems || {})) {
      const actual = list.sceneItems.find(item => item.sceneItemId === itemId);
      if (!actual || actual.sourceName !== target.source) throw fail('GAME_CHANGED', '受管游戏来源被移除或替换，请重新创建场景');
      if (!ids.has(id)) { await connection.call('RemoveSceneItem', { ...sceneRef(target), sceneItemId: itemId }); delete target.gameItems[id]; }
    }
    for (const game of games) if (target.gameItems[game.id] === undefined) {
      const result = await connection.call('CreateSceneItem', { ...sceneRef(target), sourceName: target.source, sceneItemEnabled: false });
      target.gameItems[game.id] = result.sceneItemId;
    }
    // Keep ownership records recoverable even if a later transform request fails.
    persist();
    const scale = Math.min(video.baseWidth / 1920, video.baseHeight / 1080), dx = (video.baseWidth - 1920 * scale) / 2, dy = (video.baseHeight - 1080 * scale) / 2;
    async function place(itemId, transform, enabled) {
      const actual = list.sceneItems.find(item => item.sceneItemId === itemId);
      if (!transformMatches(actual?.sceneItemTransform, transform))
        await connection.call('SetSceneItemTransform', { ...sceneRef(target), sceneItemId: itemId, sceneItemTransform: transform });
      if (actual?.sceneItemEnabled !== enabled)
        await connection.call('SetSceneItemEnabled', { ...sceneRef(target), sceneItemId: itemId, sceneItemEnabled: enabled });
    }
    for (const game of games) {
      const angle = (game.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      await place(target.gameItems[game.id], {
        positionX: dx + (game.x + game.w / 2 - game.w / 2 * cos + game.h / 2 * sin) * scale,
        positionY: dy + (game.y + game.h / 2 - game.w / 2 * sin - game.h / 2 * cos) * scale,
        rotation: game.rotation || 0, scaleX: 1, scaleY: 1, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0,
        boundsWidth: game.w * scale, boundsHeight: game.h * scale,
      }, M.effective(doc, game).visible);
    }
    const width = chat ? Math.ceil(chat.w) : 1920, height = chat ? Math.ceil(chat.h) : 1080;
    if (input.inputSettings.width !== width || input.inputSettings.height !== height)
      await connection.call('SetInputSettings', { ...inputRef(target), inputSettings: { width, height }, overlay: true });
    await place(target.browserItem, { positionX: output === 'chat' ? target.overlayX || 0 : dx, positionY: output === 'chat' ? target.overlayY || 0 : dy, rotation: 0, alignment: 5, boundsType: 'OBS_BOUNDS_NONE', scaleX: chat ? 1 : scale, scaleY: chat ? 1 : scale }, chat ? M.effective(doc, chat).visible : true);
    const latest = await connection.call('GetSceneItemList', { ...sceneRef(target) });
    const browser = latest.sceneItems.find(item => item.sceneItemId === target.browserItem);
    let below = Number.isFinite(browser?.sceneItemIndex) ? browser.sceneItemIndex : latest.sceneItems.indexOf(browser);
    for (const itemId of Object.values(target.gameItems)) {
      const item = latest.sceneItems.find(value => value.sceneItemId === itemId);
      const index = Number.isFinite(item?.sceneItemIndex) ? item.sceneItemIndex : latest.sceneItems.indexOf(item);
      if (index > below) await connection.call('SetSceneItemIndex', { ...sceneRef(target), sceneItemId: itemId, sceneItemIndex: below++ });
    }
    target.revision = packet.revision; target.output = output; target.chatId = packet.chatId || ''; target.epoch = packet.epoch;
    persist(); note(target, 'synced', '已同步到应用版本 ' + packet.revision);
  }
  function flush(target) {
    if (target.task || target.detached || closed || !target.pending) return target.task || Promise.resolve();
    if (!connection.state().connected) { note(target, 'pending', '主题已应用；等待 OBS 连接后同步采集位置'); return Promise.resolve(); }
    const packet = target.pending; target.pending = null;
    note(target, 'syncing', '正在同步游戏采集和主题尺寸');
    target.task = update(target, packet).catch(error => {
      if (!target.pending || target.pending.revision < packet.revision) target.pending = packet;
      note(target, error.code === 'COLLECTION' ? 'collection' : connection.state().connected ? 'error' : 'pending', error.message || 'OBS 同步失败，重新连接后重试');
    }).finally(() => { target.task = null; if (target.pending && target.phase === 'synced') flush(target); });
    return target.task;
  }
  function queue(channel, packet) {
    for (const target of targets.values()) if (!target.detached && target.channel === channel) { target.pending = packet; flush(target); }
  }
  const unsubscribe = publication?.subscribe(queue);
  async function register(value) {
    const existing = [...targets.values()].find(item => item.sceneName === value.sceneName && item.inputName === value.inputName && item.collection === value.collection);
    const target = { ...value, id: existing?.id || crypto.randomBytes(12).toString('hex'), phase: 'pending', message: '等待首次同步', task: null, pending: null };
    targets.set(target.id, target);
    try { persist(); } catch (error) { targets.delete(target.id); if (existing) targets.set(existing.id, existing); throw error; }
    const current = publication?.snapshot(target.channel);
    if (current?.document) { target.pending = current; await flush(target); }
    announce(); return { ...state(target.channel), id: target.id };
  }
  async function retry() {
    for (const target of targets.values()) { const value = publication?.snapshot(target.channel); if (value?.document) target.pending = value; }
    await Promise.all([...targets.values()].map(flush)); return state();
  }
  async function forget(id) {
    const target = targets.get(id); if (!target) return state();
    target.detached = true; target.pending = null;
    if (target.task) await target.task;
    targets.delete(id); try { persist(); } catch (error) { target.detached = false; targets.set(id, target); throw error; }
    announce(); return state();
  }
  async function poll() {
    if (closed || polling || !targets.size) return; polling = true;
    try {
      const connected = !!connection.state().connected;
      if (!connected) { wasConnected = false; for (const target of targets.values()) { target.pending = publication?.snapshot(target.channel); note(target, 'pending', '主题已应用；等待 OBS 连接后同步采集位置'); } return; }
      const value = await connection.call('GetSceneCollectionList'), collection = value.currentSceneCollectionName;
      const changed = !wasConnected || collection !== lastCollection; wasConnected = true; lastCollection = collection;
      for (const target of targets.values()) {
        if (changed && target.collection === collection) { target.pending = publication?.snapshot(target.channel); note(target, 'pending', 'OBS 已恢复，正在接续最新应用版本'); }
        if (target.collection !== collection) note(target, 'collection', '请在 OBS 切回场景集合「' + target.collection + '」以同步');
        else if (target.pending?.document && target.phase !== 'error') await flush(target);
      }
    } catch { wasConnected = false; } finally { polling = false; }
  }
  const timer = setInterval(poll, interval); timer.unref?.();
  return { state, register, retry, forget, poll, subscribe(callback) { observers.add(callback); return () => observers.delete(callback); },
    async settled() { while ([...targets.values()].some(target => target.task)) await Promise.all([...targets.values()].map(target => target.task)); },
    close() { closed = true; clearInterval(timer); unsubscribe?.(); observers.clear(); },
  };
}
module.exports = { createPublishedSync };
