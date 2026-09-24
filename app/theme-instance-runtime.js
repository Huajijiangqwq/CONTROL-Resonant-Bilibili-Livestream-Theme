/* Additional message views own render state, but never connect to Bilibili. */
(() => {
  'use strict';
  window.ThemeInstanceRuntime = {
    create({ scene, nodes, getProject, drawLayer, paintChatDecorations, mainFrame }) {
      const views = new Map(),
        controls = new Map(),
        receipts = new Set(),
        seenOrder = [],
        apiCache = new Map();
      let pendingPreview = null;
      let cachedProject = null;
      const projections = new Map();
      const doc = (key) => {
        const value = getProject();
        if (value !== cachedProject) {
          cachedProject = value;
          projections.clear();
        }
        if (!projections.has(key)) projections.set(key, ThemeInstances.project(value, key));
        return projections.get(key);
      };
      const send = (frame, command, data) =>
        frame?.contentWindow?.postMessage({ channel: 'hiss-main', command, data }, location.origin);
      function configure(v) {
        if (!v.ready) return;
        const d = doc(v.id);
        if (!d) return;
        send(v.frame, 'presentation', { layout: 'custom', custom: ThemeEditorModel.custom(d) });
        send(v.frame, 'fleet-effects', d.composition === 'feed');
      }
      function scoped(key = '') {
        if (apiCache.has(key)) return apiCache.get(key);
        const mask = window.ThemePanelMask.create();
        const api = {
          paintChatDecorations(c) {
            return paintChatDecorations(c, doc(key));
          },
          chatSignalMask(active, region) {
            const d = doc(key),
              chat = d?.layers.find((l) => l.type === 'chat');
            if (!active || !chat || (chat.panelOpacity >= 1 && chat.opacity >= 1)) {
              mask.clear();
              return false;
            }
            mask.apply(
              d.layers
                .filter(
                  (l) =>
                    l.type === 'chat' ||
                    (l.scope === 'chat' && !ThemeInstances.kinds.includes(l.type)),
                )
                .map((l) => [nodes.get(l.id), l])
                .filter(([el]) => el),
              chat,
              region,
            );
            return true;
          },
          get value() {
            return doc(key);
          },
          get active() {
            return !!getProject();
          },
          accepts(m) {
            const l = doc(key)?.layers.find((l) => l.type === m.kind);
            return !!l && ThemeInstances.matches(l, m);
          },
          drawLayer(kind, surface, options) {
            return drawLayer(kind, surface, options, key);
          },
          clear() {
            for (const l of doc(key)?.layers || []) {
              const el = nodes.get(l.id);
              if (ThemeInstances.kinds.includes(l.type) && el?.tagName === 'CANVAS') {
                el.getContext('2d').clearRect(0, 0, el.width, el.height);
                el.dataset.editorMessages = '[]';
              }
            }
          },
        };
        apiCache.set(key, api);
        return api;
      }
      function sync() {
        const d = getProject();
        if (!d) return;
        const targets = ThemeInstances.targets(d),
          keys = new Set(targets.map((l) => l.id));
        for (const [id, v] of views)
          if (!keys.has(id)) {
            v.interlude?.dispose();
            apiCache.get(id)?.chatSignalMask(false);
            v.frame.remove();
            views.delete(id);
            apiCache.delete(id);
          }
        const primary = ThemeInstances.project(d),
          primaryChat = primary.layers.find((l) => l.type === 'chat');
        if (primaryChat && primary.composition === 'feed') {
          const panel = nodes.get(primaryChat.id),
            feed = panel?.querySelector('.chat-feed');
          if (feed && mainFrame.parentNode !== feed) {
            if (feed.moveBefore && mainFrame.isConnected) feed.moveBefore(mainFrame, null);
            else feed.append(mainFrame);
          }
          Object.assign(mainFrame.style, {
            left: '-56px', top: '0px', width: primaryChat.w + 112 + 'px',
            height: '100%', opacity: '1', pointerEvents: '',
          });
          window.FleetMainInterlude?.rebind(panel);
        } else {
          // Layer canvases are painted by this iframe's animation loop. Keeping
          // it inside a display:none chat panel suspends that loop in Electron.
          // Retain the same document/queue, but host it in the visible scene.
          if (mainFrame.parentNode !== scene) {
            if (scene.moveBefore && mainFrame.isConnected) scene.moveBefore(mainFrame, null);
            else scene.append(mainFrame);
          }
          Object.assign(mainFrame.style, {
            position: 'absolute', left: '0px', top: '0px',
            width: '1920px', height: '1080px', opacity: '0',
            border: '0', pointerEvents: 'none',
          });
        }
        for (const l of targets) {
          let v = views.get(l.id);
          if (!v) {
            const frame = document.createElement('iframe');
            frame.title = l.name + ' · 独立消息视图';
            frame.dataset.themeInstance = l.id;
            frame.tabIndex = -1;
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText =
              'position:absolute;border:0;pointer-events:none;color-scheme:dark;';
            v = { id: l.id, frame, ready: false, queue: [] };
            try {
              v.snapshot = mainFrame.contentWindow.NativeMessageSnapshot?.();
            } catch {}
            views.set(l.id, v);
            frame.src =
              'simulation.html?embed=main&themeInstance=' +
              encodeURIComponent(l.id) +
              '&v=instances154';
            frame.addEventListener('load', () => send(frame, 'hello'));
          }
          if (l.type === 'chat') {
            const panel = nodes.get(l.id),
              feed = panel.querySelector('.chat-feed');
            Object.assign(feed.style, {
              left: '0px',
              right: '0px',
              top: l.paddingTop + 'px',
              bottom: l.paddingBottom + 'px',
            });
            if (v.frame.parentNode !== feed) feed.append(v.frame);
            Object.assign(v.frame.style, {
              left: '-56px',
              top: '0px',
              width: l.w + 112 + 'px',
              height: '100%',
              opacity: '1',
            });
            if (!v.interlude && window.FleetMainInterlude) {
              v.interlude = window.FleetMainInterlude.create(v.frame, panel, l.id);
              if (v.interlude) {
                scene.append(v.interlude.canvas);
              }
            }
            if (v.interlude) {
              Object.assign(v.interlude.canvas.style, {
                left: l.x + 'px',
                top: l.y + 'px',
                width: l.w + 'px',
                height: l.h + 'px',
                zIndex: String(
                  Math.max(
                    10 + d.layers.indexOf(l),
                    ...d.layers.map((child, i) =>
                      ThemeInstances.owner(d, child)?.id === l.id ? 10 + i : 0,
                    ),
                  ) + 1,
                ),
              });
            }
          } else {
            if (v.frame.parentNode !== scene) scene.append(v.frame);
            Object.assign(v.frame.style, {
              left: '0px',
              top: '0px',
              width: '1920px',
              height: '1080px',
              opacity: '0',
            });
          }
          configure(v);
        }
      }
      function broadcast(command, data) {
        if (!getProject()) return;
        if (['fps', 'source', 'liveStatus', 'notice-settings', 'pause'].includes(command))
          controls.set(command, structuredClone(data));
        if (command === 'clear' || command === 'source') {
          pendingPreview = null;
          receipts.clear();
          seenOrder.length = 0;
        }
        if ((command === 'manual' || command === 'live') && data?.receipt !== undefined) {
          const key = command + ':' + data.receipt;
          if (receipts.has(key)) return;
          receipts.add(key);
          seenOrder.push(key);
          if (seenOrder.length > 1000) receipts.delete(seenOrder.shift());
        }
        if (command === 'presentation' || command === 'fleet-effects') return;
        for (const v of views.values()) {
          if (v.ready) send(v.frame, command, data);
          else {
            if (command === 'clear' || command === 'source') {
              v.snapshot = null;
              v.queue = [];
            }
            if (!['fps', 'source', 'liveStatus', 'notice-settings', 'pause'].includes(command)) {
              v.queue.push({ command, data: structuredClone(data) });
              if (v.queue.length > 200) v.queue.shift();
            }
          }
        }
      }
      function preview(command, data) {
        if (command === 'editor-preview' || command === 'editor-demo') pendingPreview = { command, data };
        if (command === 'clear') pendingPreview = null;
        const target = data?.layerId,
          d = getProject(),
          host = target && ThemeInstances.owner(d, d.layers.find((l) => l.id === target) || {}),
          key = views.has(target) ? target : host && views.has(host.id) ? host.id : '';
        if (target) {
          const v = views.get(key);
          if (v) {
            if (v.ready) send(v.frame, command, data);
            else v.preview = { command, data };
          } else send(mainFrame, command, data);
        } else {
          send(mainFrame, command, data);
          for (const v of views.values()) {
            if (v.ready) send(v.frame, command, data);
            else if (command === 'editor-preview' || command === 'editor-demo') v.preview = { command, data };
          }
        }
      }
      function records() {
        const result = [];
        const read = (frame, key) => {
          try {
            const d = doc(key);
            if (!d) return;
            if (d.composition === 'feed') {
              const list = JSON.parse(
                frame.contentDocument.getElementById('stream').dataset.editorMessages || '[]',
              );
              for (const m of list) {
                const l = d.layers.find((l) => l.type === m.kind);
                if (l) result.push({ ...m, layerId: l.id });
              }
            } else
              for (const l of d.layers.filter((l) => ThemeInstances.kinds.includes(l.type))) {
                for (const m of JSON.parse(nodes.get(l.id)?.dataset.editorMessages || '[]'))
                  result.push({ ...m, layerId: l.id });
              }
          } catch {}
        };
        read(mainFrame, '');
        for (const v of views.values()) read(v.frame, v.id);
        return result;
      }
      window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.data?.channel !== 'hiss-main-reply') return;
        const v = [...views.values()].find((v) => v.frame.contentWindow === event.source);
        if (!v || event.data.type !== 'ready') return;
        if (v.ready && v.session === event.data.instance) return;
        v.ready = true;
        v.session = event.data.instance;
        configure(v);
        for (const [command, data] of controls) send(v.frame, command, data);
        const pending = v.preview || pendingPreview;
        if (pending) send(v.frame, pending.command, pending.data);
        else if (v.snapshot) send(v.frame, 'instance-snapshot', v.snapshot);
        for (const item of v.queue) send(v.frame, item.command, item.data);
        v.queue = [];
        v.snapshot = null;
        delete v.preview;
      });
      return { sync, broadcast, preview, records, scoped };
    },
  };
})();
