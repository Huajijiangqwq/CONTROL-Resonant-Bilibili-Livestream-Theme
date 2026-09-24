'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  Motion = require('./theme-sync-motion.js');
function createLiveSync({ root, connection, model, ErrorType = Error }) {
  const sessions = new Map(),
    directory = path.join(root, 'theme-live');
  let closed = false;
  const error = (code, text) => {
    const e = new ErrorType(code, text);
    e.code = code;
    if (e.message === code) e.message = text;
    return e;
  };
  const publicState = (s) => ({
    id: s.id,
    sceneName: s.sceneName,
    inputName: s.inputName,
    source: s.source,
    output: s.output,
    chatId: s.chatId,
    enabled: s.enabled,
    revision: s.revision,
    message: s.message,
    phase: s.phase,
    viewers: s.clients.size,
  });
  function persist(s) {
    const value = {
      id: s.id,
      sceneName: s.sceneName,
      inputName: s.inputName,
      source: s.source,
      output: s.output,
      chatId: s.chatId,
      collection: s.collection,
      document: s.document,
      revision: s.revision,
      gameItems: s.gameItems,
      browserItem: s.browserItem,
      url: s.url,
      video: s.video,
      overlayX: s.overlayX,
      overlayY: s.overlayY,
    };
    try {
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, s.id + '.json'),
        tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, file);
    } catch {
      s.message = '画面已同步，但本地同步记录保存失败。';
    }
  }
  function save(s) {
    clearTimeout(s.saveTimer);
    s.saveTimer = setTimeout(() => persist(s), 180);
  }
  function get(id) {
    if (!/^[a-f0-9]{24}$/.test(id || '')) throw error('SESSION', '同步绑定无效，请重新绑定场景。');
    let s = sessions.get(id);
    if (!s) {
      let value;
      try {
        value = JSON.parse(fs.readFileSync(path.join(directory, id + '.json'), 'utf8'));
      } catch {
        throw error('SESSION', '同步绑定不存在，请重新绑定场景。');
      }
      s = {
        ...value,
        document: model().normalize(value.document),
        clients: new Set(),
        enabled: false,
        phase: 'paused',
        message: '等待编辑器恢复同步',
        writer: '',
        seq: 0,
        chain: Promise.resolve(),
      };
      sessions.set(id, s);
    }
    return s;
  }
  const snapshot = (s) => ({
    id: s.id,
    revision: s.revision,
    document: s.document,
    ...(s.packet && s.enabled ? s.packet : {}),
    output: s.output,
    chatId: s.chatId,
  });
  function emit(s, event, value) {
    const text = 'event: ' + event + '\ndata: ' + JSON.stringify(value) + '\n\n';
    for (const client of s.clients) {
      if (client.writableLength > 2 * 1024 * 1024) {
        client.end();
        s.clients.delete(client);
      } else client.write(text);
    }
  }
  function stop(s, phase = 'paused', message = '实时同步已暂停') {
    s.enabled = false;
    s.phase = phase;
    s.message = message;
    clearTimeout(s.timer);
    emit(s, 'sync-status', publicState(s));
  }
  function normalized(value) {
    if (value?.format !== 'control-theme' || value?.version !== 1 || !Array.isArray(value.layers))
      throw error('DOCUMENT', '主题内容无效。');
    const M = model(),
      issue = M.capacityIssue(value);
    if (issue) throw error('DOCUMENT', issue);
    return M.normalize(value);
  }
  const isTheme = (url) => {
    try {
      const u = new URL(url);
      return (
        u.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
        u.pathname === '/live.html'
      );
    } catch {
      return false;
    }
  };
  async function targets() {
    const [sceneList, inputList] = await Promise.all([
      connection.call('GetSceneList'),
      connection.call('GetInputList'),
    ]);
    const browsers = [];
    for (const input of inputList.inputs.filter(
      (i) => (i.unversionedInputKind || i.inputKind) === 'browser_source',
    )) {
      const value = await connection.call('GetInputSettings', { inputName: input.inputName });
      if (isTheme(value.inputSettings?.url)) browsers.push(input.inputName);
    }
    const output = [];
    if (!browsers.length) return output;
    for (const scene of sceneList.scenes) {
      const value = await connection.call('GetSceneItemList', { sceneName: scene.sceneName });
      for (const item of value.sceneItems)
        if (browsers.includes(item.sourceName))
          output.push({ sceneName: scene.sceneName, inputName: item.sourceName });
    }
    return output;
  }
  async function inspect(s) {
    const [list, settings, collection, video] = await Promise.all([
      connection.call('GetSceneItemList', { sceneName: s.sceneName }),
      connection.call('GetInputSettings', { inputName: s.inputName }),
      connection.call('GetSceneCollectionList'),
      connection.call('GetVideoSettings'),
    ]);
    if (collection.currentSceneCollectionName !== s.collection)
      throw error('COLLECTION', 'OBS 场景集合已切换，请重新绑定。');
    if (settings.inputSettings?.url !== s.url)
      throw error('SOURCE_CHANGED', '绑定的主题来源地址已改变，请重新绑定。');
    const browser = list.sceneItems.find(
      (i) => i.sceneItemId === s.browserItem && i.sourceName === s.inputName,
    );
    if (!browser) throw error('SOURCE_MISSING', '绑定的主题来源已移除，请重新绑定。');
    s.video = { width: video.baseWidth, height: video.baseHeight };
    return list.sceneItems;
  }
  async function reconcile(s, doc, items) {
    const desired = s.output === 'chat' ? [] : doc.layers.filter((l) => l.type === 'game'),
      ids = new Set(desired.map((l) => l.id));
    if (!s.source && desired.length) return;
    for (const [id, itemId] of Object.entries(s.gameItems)) {
      const actual = items.find((i) => i.sceneItemId === itemId);
      if (actual && actual.sourceName !== s.source)
        throw error('SOURCE_CHANGED', '游戏来源已被替换，请重新绑定。');
      if (!ids.has(id)) {
        if (actual)
          await connection.call('RemoveSceneItem', { sceneName: s.sceneName, sceneItemId: itemId });
        delete s.gameItems[id];
      }
    }
    for (const game of desired) {
      if (
        s.gameItems[game.id] !== undefined &&
        !items.some((i) => i.sceneItemId === s.gameItems[game.id])
      )
        throw error('SOURCE_MISSING', '游戏来源已被移除，请重新绑定。');
      if (s.gameItems[game.id] === undefined) {
        const item = await connection.call('CreateSceneItem', {
          sceneName: s.sceneName,
          sourceName: s.source,
          sceneItemEnabled: false,
        });
        s.gameItems[game.id] = item.sceneItemId;
      }
    }
    const fresh = await connection.call('GetSceneItemList', { sceneName: s.sceneName });
    await connection.call('SetSceneItemIndex', {
      sceneName: s.sceneName,
      sceneItemId: s.browserItem,
      sceneItemIndex: fresh.sceneItems.length - 1,
    });
  }
  async function place(s, doc) {
    const M = model(),
      scale = Math.min(s.video.width / 1920, s.video.height / 1080),
      dx = (s.video.width - 1920 * scale) / 2,
      dy = (s.video.height - 1080 * scale) / 2,
      calls = [];
    const commands = (id, enabled, transform) => {
      const stamp = JSON.stringify([enabled, transform]);
      if (s.transforms?.get(id) === stamp) return;
      s.transforms ??= new Map();
      calls.push(
        connection
          .call('SetSceneItemTransform', {
            sceneName: s.sceneName,
            sceneItemId: id,
            sceneItemTransform: transform,
          })
          .then(() =>
            connection.call('SetSceneItemEnabled', {
              sceneName: s.sceneName,
              sceneItemId: id,
              sceneItemEnabled: enabled,
            }),
          )
          .then(() => s.transforms.set(id, stamp)),
      );
    };
    for (const l of doc.layers.filter((l) => l.type === 'game')) {
      const item = s.gameItems[l.id];
      if (item === undefined) continue;
      commands(item, M.effective(doc, l).visible, {
        positionX: dx + l.x * scale,
        positionY: dy + l.y * scale,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsAlignment: 0,
        boundsWidth: l.w * scale,
        boundsHeight: l.h * scale,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      });
    }
    const chat =
      s.output === 'chat' ? doc.layers.find((l) => l.type === 'chat' && l.id === s.chatId) : null;
    commands(s.browserItem, chat ? M.effective(doc, chat).visible : true, {
      positionX: s.output === 'chat' ? s.overlayX : dx,
      positionY: s.output === 'chat' ? s.overlayY : dy,
      alignment: 5,
      rotation: 0,
      boundsType: 'OBS_BOUNDS_NONE',
      scaleX: s.output === 'chat' ? 1 : scale,
      scaleY: s.output === 'chat' ? 1 : scale,
      cropLeft: 0,
      cropTop: 0,
      cropRight: chat ? Math.max(0, 1920 - Math.ceil(chat.w)) : 0,
      cropBottom: chat ? Math.max(0, 1080 - Math.ceil(chat.h)) : 0,
    });
    await Promise.all(calls);
  }
  function tick(s, revision) {
    if (closed || !s.enabled || s.revision !== revision) return;
    const doc = Motion.at(s.packet);
    s.frame = place(s, doc)
      .then(() => {
        if (!s.enabled || s.revision !== revision) return;
        if (Date.now() < s.packet.startAt + s.packet.duration)
          s.timer = setTimeout(() => tick(s, revision), 16);
        else {
          s.phase = 'synced';
          s.message = '已实时同步';
          emit(s, 'sync-status', publicState(s));
        }
      })
      .catch((e) => stop(s, 'error', e.message));
  }
  async function activate(s, doc, duration) {
    clearTimeout(s.timer);
    if (s.frame) await s.frame;
    const items = await inspect(s);
    if (s.output === 'chat' && !doc.layers.some((l) => l.id === s.chatId && l.type === 'chat'))
      throw error('CHAT_REMOVED', '正在输出的弹幕区已删除，请选择新的弹幕区重新绑定。');
    await reconcile(s, doc, items);
    const current = s.packet ? Motion.at(s.packet) : s.document;
    s.document = doc;
    s.revision++;
    s.enabled = true;
    s.phase = 'syncing';
    s.message = '正在同步布局';
    s.packet = {
      document: doc,
      from: Motion.geometry(current),
      revision: s.revision,
      startAt: Date.now() + (duration > 200 ? 70 : 0),
      duration,
    };
    emit(s, 'layout', snapshot(s));
    save(s);
    tick(s, s.revision);
    return publicState(s);
  }
  async function bind(data, origin) {
    const doc = normalized(data.document),
      writer = String(data.writer || '');
    if (!/^[\w-]{8,80}$/.test(writer)) throw error('WRITER', '编辑器标识无效，请重新打开页面。');
    if (data.id) {
      const s = get(data.id);
      if (s.writer && s.writer !== writer && s.enabled)
        throw error('WRITER', '另一个编辑器正在同步此场景，请先在那里暂停同步。');
      s.writer = writer;
      s.seq = 0;
      await activate(s, doc, 0);
      return publicState(s);
    }
    const sceneName = String(data.sceneName || ''),
      inputName = String(data.inputName || '');
    const [settings, list, collection, video] = await Promise.all([
      connection.call('GetInputSettings', { inputName }),
      connection.call('GetSceneItemList', { sceneName }),
      connection.call('GetSceneCollectionList'),
      connection.call('GetVideoSettings'),
    ]);
    const old = settings.inputSettings;
    if (settings.inputKind !== 'browser_source' || !isTheme(old?.url))
      throw error('SOURCE', '请选择本主题的 OBS 浏览器来源。');
    const browser = list.sceneItems.find((i) => i.sourceName === inputName);
    if (!browser) throw error('SOURCE', '所选来源不在这个场景中。');
    const previousId = new URL(old.url).searchParams.get('live');
    if (previousId) {
      try {
        const prior = get(previousId);
        if (prior.sceneName !== sceneName || prior.inputName !== inputName)
          throw error('SOURCE', '该来源已绑定到另一个场景。');
        return await bind({ ...data, id: previousId }, origin);
      } catch (e) {
        if (e.code !== 'SESSION') throw e;
      }
    }
    const source = String(data.source || ''),
      output = data.output === 'chat' ? 'chat' : 'scene',
      chatId = String(data.chatId || '');
    if (output === 'chat' && !doc.layers.some((l) => l.type === 'chat' && l.id === chatId))
      throw error('CHAT', '请选择一个组合弹幕区。');
    if (source) {
      const inputs = await connection.call('GetInputList');
      if (
        !inputs.inputs.some(
          (i) =>
            i.inputName === source &&
            /^(game_capture|window_capture|monitor_capture|dshow_input|av_capture_input|screen_capture|pipewire|xshm|xcomposite)/.test(
              i.unversionedInputKind || i.inputKind,
            ),
        )
      )
        throw error('SOURCE', '采集来源不存在，请刷新后选择。');
    }
    const id = crypto.randomBytes(12).toString('hex'),
      s = {
        id,
        sceneName,
        inputName,
        source,
        output,
        chatId,
        collection: collection.currentSceneCollectionName,
        document: doc,
        revision: 0,
        clients: new Set(),
        writer,
        seq: 0,
        enabled: false,
        phase: 'paused',
        message: '正在建立实时通道',
        chain: Promise.resolve(),
        gameItems: {},
        browserItem: browser.sceneItemId,
        video: { width: video.baseWidth, height: video.baseHeight },
        overlayX: browser.sceneItemTransform?.positionX || 0,
        overlayY: browser.sceneItemTransform?.positionY || 0,
      };
    if (source && output !== 'chat') {
      const games = doc.layers.filter(
          (l) => l.type === 'game' && model().effective(doc, l).visible,
        ),
        items = list.sceneItems
          .filter((i) => i.sourceName === source)
          .sort((a, b) => a.sceneItemIndex - b.sceneItemIndex);
      for (let i = 0; i < Math.min(games.length, items.length); i++)
        s.gameItems[games[i].id] = items[i].sceneItemId;
    }
    const themeId = crypto
        .createHash('sha256')
        .update(JSON.stringify(doc))
        .digest('hex')
        .slice(0, 24),
      themeDir = path.join(root, 'theme-projects');
    fs.mkdirSync(themeDir, { recursive: true });
    fs.writeFileSync(path.join(themeDir, themeId + '.json'), JSON.stringify(doc));
    const url = new URL('/live.html', origin);
    url.search = new URLSearchParams({
      layout: 'custom',
      theme: themeId,
      obs: '1',
      live: id,
    }).toString();
    if (output === 'chat') {
      url.searchParams.set('output', 'chat');
      url.searchParams.set('chat', chatId);
    }
    s.url = url.href;
    sessions.set(id, s);
    try {
      await connection.call('SetInputSettings', {
        inputName,
        inputSettings: {
          url: s.url,
          width: 1920,
          height: 1080,
          shutdown: false,
          restart_when_active: false,
        },
        overlay: true,
      });
      await activate(s, doc, 0);
      return publicState(s);
    } catch (e) {
      stop(s, 'error', e.message);
      save(s);
      throw e;
    }
  }
  async function update(data) {
    const s = get(data.id);
    if (s.writer !== data.writer) throw error('WRITER', '此场景由其他编辑器控制，请重新绑定。');
    if (!s.enabled) throw error('PAUSED', s.message || '实时同步已暂停，请重新启用。');
    const sequence = Number(data.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw error('SEQUENCE', '更新序号无效。');
    if (sequence <= s.seq) return publicState(s);
    const doc = normalized(data.document);
    s.seq = sequence;
    const duration = Math.max(0, Math.min(1800, Number(data.duration) || 0));
    const job = s.chain.catch(() => {}).then(() => activate(s, doc, duration));
    s.chain = job;
    try {
      return await job;
    } catch (e) {
      stop(s, 'error', e.message);
      throw e;
    }
  }
  async function pause(data) {
    const s = get(data.id);
    if (s.writer !== data.writer) throw error('WRITER', '请在控制该场景的编辑器中暂停。');
    await s.chain.catch(() => {});
    if (s.frame) await s.frame;
    const doc = s.packet ? Motion.at(s.packet) : s.document;
    stop(s);
    await place(s, doc);
    s.document = doc;
    s.packet = null;
    s.revision++;
    emit(s, 'layout', snapshot(s));
    save(s);
    return publicState(s);
  }
  function read(req, res, url) {
    const match = /^\/api\/obs\/live\/([a-f0-9]{24})(\/events)?$/.exec(url.pathname);
    if (!match) return false;
    let s;
    try {
      s = get(match[1]);
    } catch {
      res.writeHead(404).end();
      return true;
    }
    if (!match[2]) {
      res
        .writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        .end(JSON.stringify({ ...snapshot(s), state: publicState(s) }));
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1000\n\n');
    s.clients.add(res);
    res.write('event: layout\ndata: ' + JSON.stringify(snapshot(s)) + '\n\n');
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 12000);
    req.on('close', () => {
      clearInterval(heartbeat);
      s.clients.delete(res);
    });
    return true;
  }
  function close() {
    closed = true;
    for (const s of sessions.values()) {
      clearTimeout(s.timer);
      clearTimeout(s.saveTimer);
      persist(s);
      for (const res of s.clients) res.end();
    }
  }
  return { bind, update, pause, targets, read, get, state: (id) => publicState(get(id)), close };
}
module.exports = { createLiveSync };
