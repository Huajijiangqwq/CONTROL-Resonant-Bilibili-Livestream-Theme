'use strict';
// OBS credentials never leave this local process or enter exported theme documents.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (value) => crypto.createHash('sha256').update(value).digest('base64');
class ObsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function localConfig() {
  const base = process.env.APPDATA;
  if (!base) return null;
  try {
    const value = JSON.parse(
      fs
        .readFileSync(
          path.join(base, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json'),
          'utf8',
        )
        .replace(/^\uFEFF/, ''),
    );
    return {
      port: Number(value.server_port) || 4455,
      password: String(value.server_password || ''),
      enabled: value.server_enabled === true,
    };
  } catch {
    return null;
  }
}
class ObsConnection {
  constructor({ Socket = WebSocket, readConfig = localConfig, timeout = 5000 } = {}) {
    this.Socket = Socket;
    this.readConfig = readConfig;
    this.timeout = timeout;
    this.pending = new Map();
    this.generation = 0;
    this.phase = 'idle';
    this.message = '尚未连接 OBS';
  }
  state() {
    return {
      phase: this.phase,
      message: this.message,
      port: this.port || 4455,
      version: this.version || '',
      connected: this.phase === 'connected',
    };
  }
  disconnect() {
    this.generation++;
    clearTimeout(this.handshakeTimer);
    this.rejectConnect?.(new ObsError('CANCELLED', '连接已取消'));
    this.rejectConnect = null;
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close();
    } catch {}
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new ObsError('DISCONNECTED', 'OBS 连接已断开，请重新接入。'));
    }
    this.pending.clear();
    this.phase = 'idle';
    this.message = '已断开 OBS 连接';
  }
  connect(options = {}) {
    if (this.phase === 'connecting' && this.connecting) return this.connecting;
    if (this.phase === 'connected') return Promise.resolve(this.state());
    this.disconnect();
    const config = options.manual ? null : this.readConfig();
    const port = Number(options.manual ? options.port : config?.port || 4455);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new ObsError('PORT', '端口应为 1–65535 的整数。');
    let password = options.manual ? String(options.password || '') : config?.password || '';
    if (password.length > 2048) throw new ObsError('PASSWORD', '连接密码过长。');
    this.phase = 'connecting';
    this.message = '正在连接本机 OBS…';
    this.port = port;
    const generation = this.generation;
    this.connecting = new Promise((resolve, reject) => {
      this.rejectConnect = reject;
      const fail = (code, message) => {
        if (generation !== this.generation) return;
        this.rejectConnect = null;
        this.disconnect();
        this.phase = 'error';
        this.message = message;
        password = '';
        reject(new ObsError(code, message));
      };
      // Use the configured local port; hosts and URLs are deliberately not accepted.
      const socket = (this.socket = new this.Socket('ws://127.0.0.1:' + port));
      this.handshakeTimer = setTimeout(
        () =>
          fail(
            'UNAVAILABLE',
            config?.enabled === false
              ? 'OBS 的 WebSocket 服务尚未开启。请在「工具 → WebSocket 服务器设置」中勾选启用，然后重试。'
              : '未连接到 OBS。请确认 OBS 已打开，并已启用 WebSocket 服务。',
          ),
        this.timeout,
      );
      socket.addEventListener('message', (event) => {
        if (generation !== this.generation) return;
        let packet;
        try {
          packet = JSON.parse(String(event.data));
        } catch {
          fail('PROTOCOL', 'OBS 返回了无法识别的连接数据。');
          return;
        }
        const data = packet.d || {};
        if (packet.op === 0) {
          const identify = { rpcVersion: 1, eventSubscriptions: 0 };
          if (data.authentication)
            identify.authentication = hash(
              hash(password + data.authentication.salt) + data.authentication.challenge,
            );
          password = '';
          socket.send(JSON.stringify({ op: 1, d: identify }));
        } else if (packet.op === 2) {
          clearTimeout(this.handshakeTimer);
          this.rejectConnect = null;
          this.phase = 'connected';
          this.message = '已连接本机 OBS';
          resolve(this.state());
        } else if (packet.op === 7) {
          const request = this.pending.get(data.requestId);
          if (!request) return;
          clearTimeout(request.timer);
          this.pending.delete(data.requestId);
          if (data.requestStatus?.result) request.resolve(data.responseData || {});
          else
            request.reject(
              new ObsError(
                'OBS_REQUEST',
                'OBS 未完成操作：' +
                  request.type +
                  '（' +
                  (data.requestStatus?.code || '未知状态') +
                  '）。',
              ),
            );
        }
      });
      socket.addEventListener('error', () =>
        fail(
          'UNAVAILABLE',
          config?.enabled === false
            ? 'OBS 的 WebSocket 服务尚未开启。请在「工具 → WebSocket 服务器设置」中勾选启用，然后重试。'
            : '连接失败，请确认 OBS 已打开，端口和密码正确。',
        ),
      );
      socket.addEventListener('close', (event) =>
        fail(
          event.code === 4009 ? 'AUTH' : 'DISCONNECTED',
          event.code === 4009
            ? 'OBS 认证未通过。可展开手动连接，填写 OBS 设置中显示的端口和密码。'
            : 'OBS 连接已断开，请重新接入。',
        ),
      );
    });
    return this.connecting;
  }
  call(type, requestData = {}) {
    if (this.phase !== 'connected')
      return Promise.reject(new ObsError('DISCONNECTED', '请先接入 OBS。'));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ObsError('TIMEOUT', 'OBS 响应超时，请检查连接后重试。'));
      }, this.timeout);
      this.pending.set(requestId, { resolve, reject, timer, type });
      try {
        this.socket.send(
          JSON.stringify({ op: 6, d: { requestType: type, requestId, requestData } }),
        );
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new ObsError('DISCONNECTED', 'OBS 连接已断开。'));
      }
    });
  }
}
function createObsBridge({
  root = __dirname,
  connection = new ObsConnection(),
  model = () => require('./theme-editor-model.js'),
} = {}) {
  let installing = false;
  const live = require('./obs-live-sync.js').createLiveSync({
    root,
    connection,
    model,
    ErrorType: ObsError,
  });
  const json = (res, code, value) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  };
  async function inventory() {
    const [version, scenes, inputs, video, record] = await Promise.all([
      connection.call('GetVersion'),
      connection.call('GetSceneList'),
      connection.call('GetInputList'),
      connection.call('GetVideoSettings'),
      connection.call('GetRecordStatus'),
    ]);
    connection.version = version.obsVersion;
    return {
      ...connection.state(),
      scenes: scenes.scenes.map((s) => ({ name: s.sceneName })),
      currentScene: scenes.currentProgramSceneName,
      sources: inputs.inputs
        .filter((i) =>
          /^(game_capture|window_capture|monitor_capture|dshow_input|av_capture_input|screen_capture|pipewire|xshm|xcomposite)/.test(
            i.unversionedInputKind || i.inputKind,
          ),
        )
        .map((i) => ({ name: i.inputName, kind: i.unversionedInputKind || i.inputKind })),
      video: {
        width: video.baseWidth,
        height: video.baseHeight,
        fps: video.fpsNumerator / video.fpsDenominator,
      },
      recording: !!record.outputActive,
      recordTime: record.outputTimecode || '00:00:00.000',
    };
  }
  async function install(data, origin) {
    if (installing) throw new ObsError('BUSY', '正在创建场景，请稍候。');
    installing = true;
    let sceneName,
      inputName,
      createdScene = false,
      createdInput = false;
    try {
      if (
        data.document?.format !== 'control-theme' ||
        data.document?.version !== 1 ||
        !Array.isArray(data.document.layers)
      )
        throw new ObsError('DOCUMENT', '当前主题无法读取，请重新打开编辑器。');
      const M = model(),
        issue = M.capacityIssue(data.document);
      if (issue) throw new ObsError('DOCUMENT', issue);
      const doc = M.normalize(data.document),
        info = await inventory();
      const source = data.source ? info.sources.find((s) => s.name === data.source) : null;
      if (data.source && !source)
        throw new ObsError('SOURCE', '所选游戏来源已不存在，请刷新来源列表。');
      const onlyChat = data.output === 'chat',
        chat = doc.layers.find((l) => l.type === 'chat' && l.id === data.chatId);
      if (onlyChat && (!chat || !M.effective(doc, chat).visible))
        throw new ObsError('CHAT', '请选择一个可见的组合弹幕区。');
      const text = JSON.stringify(doc),
        id = crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
      const directory = path.join(root, 'theme-projects');
      await fs.promises.mkdir(directory, { recursive: true });
      try {
        await fs.promises.writeFile(path.join(directory, id + '.json'), text, { flag: 'wx' });
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      const url = new URL('/live.html', origin);
      url.search = new URLSearchParams({ layout: 'custom', theme: id, obs: '1' }).toString();
      if (onlyChat) {
        url.searchParams.set('output', 'chat');
        url.searchParams.set('chat', chat.id);
      }
      const stamp = crypto
        .createHash('sha256')
        .update(
          id +
            '|' +
            (source?.name || '') +
            '|' +
            (onlyChat ? chat.id : 'scene') +
            '|' +
            info.video.width +
            'x' +
            info.video.height,
        )
        .digest('hex')
        .slice(0, 10);
      sceneName = 'CONTROL · ' + doc.name.slice(0, 30) + ' · ' + stamp;
      inputName = 'CONTROL 主题 · ' + stamp;
      // Published snapshots are immutable. Repeated clicks reuse a matching scene,
      // and never overwrite a user-created source or the scene currently on air.
      if (info.scenes.some((s) => s.name === sceneName)) {
        const items = await connection.call('GetSceneItemList', { sceneName });
        if (items.sceneItems.some((i) => i.sourceName === inputName)) {
          const settings = await connection.call('GetInputSettings', { inputName });
          if (settings.inputSettings?.url === url.href)
            return {
              sceneName,
              inputName,
              url: url.href,
              reused: true,
              message: '这个主题版本已在 OBS 中，可以直接选择该场景。',
            };
        }
        const suffix = crypto.randomBytes(3).toString('hex');
        sceneName += '-' + suffix;
        inputName += '-' + suffix;
      }
      const allInputs = await connection.call('GetInputList');
      if (allInputs.inputs.some((i) => i.inputName === inputName))
        inputName += '-' + crypto.randomBytes(3).toString('hex');
      await connection.call('CreateScene', { sceneName });
      createdScene = true;
      const scale = Math.min(info.video.width / 1920, info.video.height / 1080),
        dx = (info.video.width - 1920 * scale) / 2,
        dy = (info.video.height - 1080 * scale) / 2;
      if (!onlyChat && source) {
        for (const game of doc.layers.filter(
          (l) => l.type === 'game' && M.effective(doc, l).visible,
        )) {
          const { sceneItemId } = await connection.call('CreateSceneItem', {
            sceneName,
            sourceName: source.name,
            sceneItemEnabled: true,
          });
          const angle = ((game.rotation || 0) * Math.PI) / 180,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
          const x = game.x + game.w / 2 - (game.w / 2) * cos + (game.h / 2) * sin,
            y = game.y + game.h / 2 - (game.w / 2) * sin - (game.h / 2) * cos;
          await connection.call('SetSceneItemTransform', {
            sceneName,
            sceneItemId,
            sceneItemTransform: {
              positionX: dx + x * scale,
              positionY: dy + y * scale,
              rotation: game.rotation || 0,
              alignment: 5,
              boundsType: 'OBS_BOUNDS_SCALE_INNER',
              boundsAlignment: 0,
              boundsWidth: game.w * scale,
              boundsHeight: game.h * scale,
            },
          });
        }
      }
      const width = onlyChat ? Math.ceil(chat.w) : 1920,
        height = onlyChat ? Math.ceil(chat.h) : 1080;
      const input = await connection.call('CreateInput', {
        sceneName,
        inputName,
        inputKind: 'browser_source',
        inputSettings: {
          url: url.href,
          width,
          height,
          fps: Math.max(1, Math.min(120, Math.round(info.video.fps || 60))),
          fps_custom: true,
          shutdown: false,
          restart_when_active: false,
          reroute_audio: false,
        },
        sceneItemEnabled: true,
      });
      createdInput = true;
      await connection.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId: input.sceneItemId,
        sceneItemTransform: {
          positionX: onlyChat ? 0 : dx,
          positionY: onlyChat ? 0 : dy,
          scaleX: onlyChat ? 1 : scale,
          scaleY: onlyChat ? 1 : scale,
          alignment: 5,
          boundsType: 'OBS_BOUNDS_NONE',
        },
      });
      return {
        sceneName,
        inputName,
        url: url.href,
        reused: false,
        message: '独立场景已创建。请在 OBS 中预览并选择该场景。',
      };
    } catch (error) {
      const leftovers = [];
      if (createdScene)
        try {
          await connection.call('RemoveScene', { sceneName });
        } catch {
          leftovers.push('场景「' + sceneName + '」');
        }
      if (createdInput)
        try {
          await connection.call('RemoveInput', { inputName });
        } catch {
          leftovers.push('来源「' + inputName + '」');
        }
      if (leftovers.length)
        throw new ObsError(
          'PARTIAL',
          '创建未完成，OBS 中可能保留了' + leftovers.join('、') + '，请检查后移除。',
        );
      throw error;
    } finally {
      installing = false;
    }
  }
  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://' + req.headers.host);
    } catch {
      json(res, 403, { error: '请从本机编辑器操作。' });
      return;
    }
    const hosts = ['127.0.0.1', 'localhost', '[::1]'];
    if (!hosts.includes(url.hostname)) {
      json(res, 403, { error: '请从本机编辑器操作。' });
      return;
    }
    if (req.method === 'GET' && live.read(req, res, url)) return;
    if (req.method === 'GET' && url.pathname === '/api/obs/status') {
      let sync;
      try {
        if (url.searchParams.has('binding')) sync = live.state(url.searchParams.get('binding'));
      } catch {}
      json(res, 200, { service: 'hiss-obs', bridgeVersion: 2, ...connection.state(), sync });
      return;
    }
    let caller;
    try {
      caller = new URL(req.headers.origin);
    } catch {}
    if (
      req.method !== 'POST' ||
      !caller ||
      !hosts.includes(caller.hostname) ||
      caller.protocol !== 'http:' ||
      caller.port !== url.port ||
      req.headers['x-theme-obs'] !== '1' ||
      !String(req.headers['content-type']).startsWith('application/json')
    ) {
      json(res, 403, { error: '请从本机编辑器操作。' });
      return;
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 40 * 1024 * 1024) throw new ObsError('SIZE', '主题文件过大。');
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      let result;
      if (url.pathname === '/api/obs/connect') {
        await connection.connect(data);
        result = await inventory();
      } else if (url.pathname === '/api/obs/refresh') result = await inventory();
      else if (url.pathname === '/api/obs/disconnect') {
        connection.disconnect();
        result = connection.state();
      } else if (url.pathname === '/api/obs/install') result = await install(data, url.origin);
      else if (url.pathname === '/api/obs/targets') result = { targets: await live.targets() };
      else if (url.pathname === '/api/obs/bind') result = await live.bind(data, url.origin);
      else if (url.pathname === '/api/obs/sync') result = await live.update(data);
      else if (url.pathname === '/api/obs/pause-sync') result = await live.pause(data);
      else {
        json(res, 404, { error: '未知操作。' });
        return;
      }
      json(res, 200, result);
    } catch (e) {
      json(res, 400, {
        code: e.code || 'FAILED',
        error: e instanceof ObsError ? e.message : '操作未完成，请检查本地服务与 OBS 后重试。',
        ...connection.state(),
      });
    }
  }
  return {
    handle,
    connection,
    inventory,
    install,
    live,
    close: () => {
      live.close();
      connection.disconnect();
    },
  };
}
module.exports = { ObsConnection, ObsError, createObsBridge, localConfig };
