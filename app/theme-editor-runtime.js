/* The editor and OBS use the same native animated renderers and portable document. */
(async () => {
  'use strict';
  const p = new URLSearchParams(location.search),
    hash = new URLSearchParams(location.hash.slice(1));
  if (!p.has('editor') && !hash.has('theme') && !p.has('theme')) return;
  const M = ThemeEditorModel,
    scene = document.getElementById('scene'),
    $ = (id) => document.getElementById(id),
    nodes = new Map(),
    flowFields = new Map();
  let project = null,
    lastCustom = '',
    lastTimer = '',
    lastBands = '';
  const native = {
    chat: scene.querySelector('.chat-panel'),
    game: $('gameWindow'),
    header: scene.querySelector('.broadcast-header'),
    logos: scene.querySelector('.game-logos'),
    timer: scene.querySelector('.broadcast-timer'),
    music: $('nowPlayingSlot'),
    background: scene.querySelector('.scene-background'),
    grain: $('surfaceGrain'),
  };
  let paused = false,
    pauseAt = 0,
    clockOffset = 0,
    lastClock = 0,
    heldAudio = { level: 0, hit: 0 };
  const nativeBackground = native.background.cloneNode(true);
  nativeBackground.classList.remove('scene-background');
  const material = scene.querySelector('.frame-material'),
    hiss = document.createElement('div');
  hiss.className = 'theme-hiss';
  hiss.append($('junctionResonance'), $('footResonance'));
  scene.append(hiss);
  native.hiss = hiss;
  scene.append(native.grain);
  const bg = document.createElement('div');
  bg.className = 'theme-background';
  native.background.replaceWith(bg);
  native.background = bg;
  bg.append(nativeBackground);
  const effects = document.createElement('style');
  effects.textContent = `
@font-face{font-family:'Roboto Condensed';src:url('now-playing-fonts/robotocondensed.woff2');font-weight:100 900;font-display:swap}
.scene[data-editor-theme] .frame-material,.scene[data-editor-theme] .scene-background,.scene[data-editor-theme] .print-rules,.scene[data-editor-theme] .custom-extras,.scene[data-editor-theme] .custom-handles{display:none!important}
.scene[data-editor-theme] .chat-feed iframe{opacity:0!important}
.scene[data-editor-theme][data-composition=feed] .chat-feed iframe{opacity:1!important}
.scene[data-editor-theme] .chat-panel{background-color:var(--panel-fill,#0e100f)!important;background-image:none!important;border:0!important;overflow:hidden!important;transform:none!important}
.scene[data-editor-theme] .chat-panel::before{content:'';position:absolute;inset:0;background-image:var(--ink-texture);opacity:var(--panel-grain,1);pointer-events:none}
.scene[data-editor-theme] .chat-feed::after{opacity:calc(.14 * var(--panel-grain,1))}
.scene[data-editor-theme] .chat-panel iframe[data-theme-instance]{opacity:1!important}.scene[data-editor-theme] .chat-heading{display:none!important}
.scene[data-editor-theme] .theme-component-hidden{display:none!important}
.scene[data-editor-theme] .theme-hiss,.scene[data-editor-theme] .surface-grain{display:block;position:absolute;pointer-events:none}
.scene[data-editor-theme] .theme-hiss{width:1920px;height:1080px;inset:0}
.scene[data-editor-theme] .theme-background{position:absolute;inset:0}
.theme-background>svg,.theme-background>img,.theme-background>video{position:absolute;inset:0;width:100%;height:100%}
.scene-part-hidden{display:none!important}
.theme-layer{position:absolute;box-sizing:border-box;pointer-events:none;transform-origin:center;overflow-wrap:anywhere;white-space:pre-wrap}
.scene[data-editor-theme] .game-window{display:block;outline:none;box-shadow:none}
.scene[data-editor-theme] .game-window .game-trace,.scene[data-editor-theme] .game-window .corner{display:block!important}
.scene[data-editor-theme] .game-window[data-frame-visible=false] .game-trace,.scene[data-editor-theme] .game-window[data-frame-visible=false] .corner{display:none!important}
.scene[data-editor-theme] .broadcast-header{display:flex;align-items:center;gap:24px}
.scene[data-editor-theme] [data-native-id=hostText]{font-size:23px;line-height:33px;max-width:315px;font-weight:650;letter-spacing:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.scene[data-editor-theme] [data-native-id=topicText]{font-size:26px;font-weight:750;line-height:1.4;background:#eeeee7;background-image:var(--paper-texture);color:#101210;padding:0 30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:1100px}.obs [data-native-id=gameImage],.no-game [data-native-id=gameImage]{display:none!important}.scene[data-editor-theme] #topicText{display:block;font-size:26px;line-height:1.4;max-width:1100px}
.scene[data-editor-theme] #topicText[hidden]{display:none}
.scene[data-editor-theme] :is(#topicText,[data-native-id=topicText]){text-shadow:none}
.scene[data-editor-theme] .broadcast-header[data-theme-type]:not([data-theme-type=header]){justify-content:flex-start;border:0;padding:0}
.scene[data-editor-theme] .broadcast-header[data-theme-type=host] :is(#hostText,[data-native-id=hostText]){min-width:0;max-width:100%;flex:0 1 auto}
.scene[data-editor-theme] .broadcast-header[data-theme-type=topic] [data-native-id=topicText]{box-sizing:border-box;min-width:0;max-width:100%;flex:0 1 auto}
.scene[data-editor-theme] .broadcast-header[data-theme-type=status] .on-air{margin:0;padding:0}
.scene[data-editor-theme] .header-separator{display:block}
.scene[data-editor-theme] .on-air{margin-left:auto}
.scene[data-editor-theme] .broadcast-timer{font-size:28px}
.scene[data-editor-theme] .game-logos{display:block!important}
.scene[data-editor-theme] .theme-hidden{display:none!important}
html.editor-render #gameImage{display:block!important;visibility:visible!important}
html.editor-render.no-game #gameImage{display:none!important}
html.editor-render,html.editor-render body,html.editor-render .monitor{background:transparent!important}
`;
  document.head.append(effects);
  if (p.has('editor')) document.documentElement.classList.add('editor-render');
  function assign(el, l, index, geometry = true) {
    delete el.dataset.customHidden;
    el.classList.toggle('theme-hidden', !l.visible);
    el.style.opacity = l.opacity;
    el.style.zIndex = 10 + index;
    el.style.mixBlendMode = l.blend;
    el.style.transform = `rotate(${l.rotation}deg)`;
    el.style.filter = `brightness(${l.brightness})${l.shadow ? ' drop-shadow(0 2px ' + l.shadow + 'px #000b)' : ''}`;
    if (geometry)
      Object.assign(el.style, {
        left: l.x + 'px',
        top: l.y + 'px',
        right: 'auto',
        bottom: 'auto',
        width: l.w + 'px',
        height: l.h + 'px',
      });
    el.dataset.themeLayer = l.id;
  }
  function media(el, l) {
    el.crossOrigin = 'anonymous';
    el.onerror = () => {
      if (!el.getAttribute('src')) return;
      el.dataset.mediaError = 'true';
      if (p.has('editor'))
        parent.postMessage(
          {
            channel: 'theme-media-error',
            message: '素材无法读取：' + l.name + '。可导入本地文件，或使用支持跨域读取的素材地址。',
          },
          location.origin,
        );
    };
    el.onload = el.onloadeddata = () => delete el.dataset.mediaError;
    if (el.getAttribute('src') !== l.src) {
      delete el.dataset.mediaError;
      if (l.src) el.setAttribute('src', l.src);
      else el.removeAttribute('src');
    }
    el.style.objectFit = l.fit;
    if (el.tagName === 'VIDEO') {
      el.muted = true;
      el.loop = l.loop;
      el.autoplay = true;
      el.playsInline = true;
      el.playbackRate = l.speed;
      if (l.visible && l.src && !paused) el.play().catch(() => {});
      else el.pause();
    }
  }
  const templates = Object.fromEntries(
    Object.entries(native).map(([key, el]) => [key, el.cloneNode(true)]),
  );
  function gameApertures(background, games) {
    if (background.avoidGame === false) return 'none';
    const holes = games
      .map(
        (g) =>
          '<polygon points="' +
          [
            [0, 0],
            [g.w, 0],
            [g.w, g.h],
            [0, g.h],
          ]
            .map(([x, y]) => ThemeGeometry.unprojectPoint(background, ThemeGeometry.point(g, x, y)))
            .map((p) => p.x.toFixed(3) + ',' + p.y.toFixed(3))
            .join(' ') +
          '" fill="black"/>',
      )
      .join('');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      background.w +
      '" height="' +
      background.h +
      '"><defs><mask id="holes"><rect width="100%" height="100%" fill="white"/>' +
      holes +
      '</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#holes)"/></svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }
  function nativeCopy(type, id) {
    const el = templates[type].cloneNode(true);
    el.classList.remove('theme-hidden', 'theme-component-hidden');
    el.hidden = false;
    const ids = new Map();
    for (const node of [el, ...el.querySelectorAll('[id]')])
      if (node.id) {
        const before = node.id;
        node.dataset.nativeId = before;
        node.id = before + '--' + id;
        ids.set(before, node.id);
      }
    for (const node of [el, ...el.querySelectorAll('*')])
      for (const attr of [...node.attributes]) {
        let value = attr.value;
        for (const [before, after] of ids) {
          value = value.replaceAll('url(#' + before + ')', 'url(#' + after + ')');
          if ((attr.name === 'href' || attr.name === 'xlink:href') && value === '#' + before)
            value = '#' + after;
        }
        if (value !== attr.value) node.setAttribute(attr.name, value);
      }
    if (type === 'chat') el.querySelectorAll('iframe,.fleet-interlude').forEach((f) => f.remove());
    if (type === 'music') {
      el.replaceChildren();
      const f = document.createElement('iframe');
      f.title = '正在播放音乐';
      f.src = 'now-playing.html?obs=1&embedded=1&fps=' + (window.FrameRate?.fps || 60);
      el.append(f);
    }
    scene.append(el);
    return el;
  }
  const instances = ThemeInstanceRuntime.create({
    scene,
    nodes,
    getProject: () => project,
    drawLayer,
    paintChatDecorations,
    mainFrame: $('chatFrame'),
  });
  function apply(value) {
    project = window.ThemeOutput ? ThemeOutput.apply(value) : M.normalize(value);
    scene.dataset.editorTheme = 'true';
    scene.dataset.composition = project.composition;
    const custom = M.custom(ThemeInstances.project(project)),
      signature = JSON.stringify(custom);
    if (signature !== lastCustom) {
      lastCustom = signature;
      window.CustomLayout.setValue(custom);
      LiveLayout.change('custom', false, false);
      LiveLayoutConfig.setCustom(custom);
      LiveLayout.refreshCustom();
    }
    const alive = new Set();
    for (const [i, raw] of project.layers.entries()) {
      const l = M.effective(project, raw);
      alive.add(l.id);
      if (l.type === 'group') continue;
      let el = nodes.get(l.id);
      if (el && el.dataset.themeType !== l.type) {
        if (Object.values(native).includes(el)) el.classList.add('theme-hidden');
        else el.remove();
        nodes.delete(l.id);
        el = null;
      }
      if (!el) {
        el =
          (['host', 'topic', 'status'].includes(l.type)
            ? nativeCopy('header', l.id)
            : native[l.type]
            ? [...nodes.values()].includes(native[l.type])
              ? nativeCopy(l.type, l.id)
              : native[l.type]
            : null) ||
          document.createElement(
            ['normal', 'gift', 'sc', 'fleet', 'resonance', 'border'].includes(l.type)
              ? 'canvas'
              : l.type === 'image'
                ? 'img'
                : l.type === 'video'
                  ? 'video'
                  : 'div',
          );
        if (!native[l.type] && !['host', 'topic', 'status'].includes(l.type)) {
          el.className = 'theme-layer';
          scene.append(el);
        }
        nodes.set(l.id, el);
      }
      el.dataset.themeType = l.type;
      assign(el, l, i);
      if (l.type === 'hiss') {
        Object.assign(el.style, {
          width: '1920px',
          height: '1080px',
          transformOrigin: '0 0',
          transform: `translate(0,0) rotate(${l.rotation}deg) scale(${l.w / 1920},${l.h / 1080})`,
        });
      }
      if (l.type === 'background') {
        const mode = l.mode;
        let surface = el.firstElementChild;
        if (mode === 'theme') {
          if (surface?.tagName.toLowerCase() !== 'svg') {
            surface = nativeBackground.cloneNode(true);
            el.replaceChildren(surface);
          }
          surface.querySelector('path').setAttribute('d', `M0 0H1920V1080H0Z`);
          el.style.background = 'none';
        } else if (mode === 'image' || mode === 'video') {
          if (surface?.tagName.toLowerCase() !== (mode === 'image' ? 'img' : 'video')) {
            surface = document.createElement(mode === 'image' ? 'img' : 'video');
            el.replaceChildren(surface);
          }
          media(surface, l);
          el.style.background = 'none';
        } else {
          el.replaceChildren();
          el.style.background = mode === 'transparent' ? 'transparent' : l.fill;
        }
        // The game aperture stays transparent in OBS, including imported backgrounds.
        const games = project.layers.filter(
          (x) => x.type === 'game' && M.effective(project, x).visible,
        );
        el.style.clipPath = games.length < 2 ? ThemeGeometry.aperturePolygon(l, games[0]) : 'none';
        el.style.maskImage = games.length > 1 ? gameApertures(l, games) : 'none';
      } else if (l.type === 'chat') {
        const rgb = [1, 3, 5].map((i) => parseInt(l.fill.slice(i, i + 2), 16));
        el.style.setProperty('--panel-fill', `rgba(${rgb.join(',')},${l.panelOpacity})`);
        el.style.setProperty('--panel-grain', String(l.panelGrain * l.panelOpacity));
        el.style.setProperty('--panel-base-opacity', String(l.panelOpacity));
        el.style.borderRadius = l.radius + 'px';
        el.style.boxShadow = l.panelOpacity
          ? `inset 1px 0 0 rgba(217,222,197,${0.07 * l.panelOpacity}),inset -1px 0 0 rgba(0,0,0,${0.53 * l.panelOpacity})`
          : 'none';
      } else if (l.type === 'game') {
        media(el.querySelector('img'), l);
        el.dataset.frameVisible = String(l.frameVisible);
        el.style.border = `${l.frameVisible ? l.strokeWidth : 0}px solid ${l.stroke}`;
        el.querySelectorAll('.corner').forEach((n) => (n.style.borderColor = l.stroke));
      } else if (l.type === 'hiss') {
        LiveMaterial.setIntensity(l.intensity);
      } else if (l.type === 'resonance') {
        let field = flowFields.get(l.id),
          phase = { time: 0, last: null };
        if (field && (field.box.w !== Math.round(l.w) || field.box.h !== Math.round(l.h)))
          field.effect?.resize(Math.round(l.w), Math.round(l.h));
        if (!field) {
          const box = {
            x: l.x,
            y: l.y,
            w: Math.round(l.w),
            h: Math.round(l.h),
            ax: l.x + l.anchorX,
            ay: l.y + l.anchorY,
            variant: l.variant,
          };
          field = { box, style: { ...l, free: true }, ...phase };
          field.effect = LiveMaterial.makeField(el, box, () => field.style);
          flowFields.set(l.id, field);
        }
        field.style = { ...l, free: true };
        Object.assign(field.box, {
          x: l.x,
          y: l.y,
          ax: l.x + l.anchorX,
          ay: l.y + l.anchorY,
          variant: l.variant,
        });
      } else if (l.type === 'border') {
        ThemeFrame.draw(el, l, lastClock);
      } else if (l.type === 'logos') {
        el.style.setProperty('--logo-scale', Math.min(l.w / 1350, l.h / 90));
      } else if (l.type === 'timer') {
        el.style.color = l.color;
      } else if (l.type === 'header') {
        el.style.color = l.color;
      } else if (l.type === 'text') {
        el.textContent = l.text;
        Object.assign(el.style, {
          fontFamily: M.fonts[l.font],
          fontSize: l.size + 'px',
          fontWeight: l.weight,
          lineHeight: l.lineHeight,
          letterSpacing: l.spacing + 'px',
          textAlign: l.align,
          color: l.color,
          overflow: 'hidden',
        });
      } else if (['image', 'video'].includes(l.type)) media(el, l);
      else if (['shape', 'line'].includes(l.type))
        Object.assign(el.style, {
          background: l.type === 'border' ? 'transparent' : l.fill,
          border: `${l.strokeWidth}px ${l.borderStyle === 'corners' ? 'solid' : l.borderStyle} ${l.stroke}`,
          borderRadius: l.radius + 'px',
        });
    }
    for (const [id, el] of nodes) {
      if (!alive.has(id)) {
        if (flowFields.has(id)) {
          flowFields.get(id).effect?.dispose();
          flowFields.delete(id);
        }
        if (Object.values(native).includes(el)) el.classList.add('theme-hidden');
        else el.remove();
        nodes.delete(id);
      }
    }
    for (const [type, el] of Object.entries(native))
      if (!project.layers.some((l) => l.type === type)) el.classList.add('theme-hidden');
    for (const [id, value] of Object.entries(project.settings)) {
      if (['nowPlayingEnabled', 'resonanceStrength'].includes(id)) continue;
      const el = $(id);
      if (!el || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.type === 'file')
        continue;
      const check = el.type === 'checkbox',
        current = check ? el.checked : el.value;
      if (String(current) === String(value)) continue;
      if (check) el.checked = !!value;
      else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const timerStamp = JSON.stringify([
      project.settings.timerElapsed,
      project.settings.timerStarted,
    ]);
    if (project.settings.timerElapsed !== undefined && timerStamp !== lastTimer) {
      lastTimer = timerStamp;
      window.ThemeLiveBridge.setTimer({
        elapsedMs: Number(project.settings.timerElapsed),
        startedAt:
          project.settings.timerStarted === 'paused' ? null : Number(project.settings.timerStarted),
      });
    }
    const bands = JSON.stringify(
      Object.entries(project.settings).filter(([key]) => key.startsWith('band')),
    );
    if (project.settings.audioApply && bands !== lastBands) {
      lastBands = bands;
      $('bandApply').click();
    }
    const music = project.layers.find((x) => x.type === 'music');
    if (music) {
      const toggle = $('nowPlayingEnabled');
      const on = project.layers.some((l) => l.type === 'music' && M.effective(project, l).visible);
      if (toggle.checked !== on) {
        toggle.checked = on;
        toggle.dispatchEvent(new Event('change'));
      }
    }
    // Native controls may relayout DOM nodes. Reapply only geometry and appearance.
    for (const [i, raw] of project.layers.entries()) {
      const el = nodes.get(raw.id);
      if (el) {
        const l = M.effective(project, raw);
        assign(el, l, i);
        ThemeSceneComponents.apply(el, l);
        if (l.type === 'hiss')
          Object.assign(el.style, {
            width: '1920px',
            height: '1080px',
            transformOrigin: '0 0',
            transform: `rotate(${l.rotation}deg) scale(${l.w / 1920},${l.h / 1080})`,
          });
      }
    }
    const combined = project.composition === 'feed',
      chat = project.layers.find((l) => l.type === 'chat');
    for (const l of project.layers) {
      const el = nodes.get(l.id);
      if (el)
        el.classList.toggle(
          'theme-component-hidden',
          ThemeInstances.feed(project, l) ||
            (!combined && l.type === 'chat' && !l.chatId && l === chat),
        );
    }
    if (chat && combined) {
      const feed = nodes.get(chat.id).querySelector('.chat-feed'),
        frame = $('chatFrame');
      Object.assign(feed.style, {
        left: '0px',
        right: '0px',
        top: chat.paddingTop + 'px',
        bottom: chat.paddingBottom + 'px',
      });
      Object.assign(frame.style, {
        left: '-56px',
        top: '0px',
        width: chat.w + 112 + 'px',
        height: '100%',
      });
    }
    instances.sync();
    configureChatSignal();
    scene.dataset.themeReady = 'true';
    window.dispatchEvent(new CustomEvent('theme-applied'));
  }
  function drawLayer(
    kind,
    surface,
    { r, x, y, width, height, entry = 1, full = false },
    viewKey = '',
  ) {
    if (!project) return false;
    const l = instances.scoped(viewKey).value.layers.find((x) => x.type === kind),
      el = l && nodes.get(l.id);
    if (!el || !M.effective(project, l).visible) return true;
    // A short independent gift lane must keep the complete dossier in view.
    // Fit the finished card uniformly; never stretch its paper or typography.
    const displayScale = !full && kind === 'gift' && l.fit === 'contain'
      ? Math.min(1, r.h / Math.max(1, height)) : 1;
    const displayOffsetX = (full ? 0 : r.w - r.w * displayScale) *
      (l.align === 'center' ? 0.5 : l.align === 'right' ? 1 : 0);
    el.dataset.editorMessages = JSON.stringify(
      JSON.parse(surface.dataset.editorMessages || '[]').map(m => ({
        ...m, displayScale, displayOffsetX,
      })),
    );
    const W = full ? 1920 : Math.ceil(r.w * 1.5),
      H = full ? 1080 : Math.ceil(r.h * 1.5);
    if (el.width !== W || el.height !== H) {
      el.width = W;
      el.height = H;
    }
    const c = el.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.globalAlpha = entry;
    if (full) {
      Object.assign(el.style, {
        left: '0px',
        top: '0px',
        width: '1920px',
        height: '1080px',
        transformOrigin: `${l.x + l.w / 2}px ${l.y + l.h / 2}px`,
      });
      c.drawImage(surface, 0, 0);
    } else {
      c.scale(W / r.w, H / r.h);
      c.translate(displayOffsetX, 0);
      c.scale(displayScale, displayScale);
      c.drawImage(surface, x - r.x, y - r.y, width, height);
    }
    return true;
  }
  function paintChatDecorations(c, viewDoc = ThemeInstances.project(project)) {
    if (!viewDoc || viewDoc.composition !== 'feed') return false;
    const chat = viewDoc.layers.find((l) => l.type === 'chat');
    if (!chat) return false;
    for (const raw of viewDoc.layers) {
      const l = M.effective(project, raw);
      if (
        !l.visible ||
        l.type === 'chat' ||
        l.scope !== 'chat' ||
        ['normal', 'sc', 'gift', 'fleet'].includes(l.type)
      )
        continue;
      const el = nodes.get(l.id);
      if (!el) continue;
      c.save();
      c.translate(l.x - chat.x, l.y - chat.y);
      c.globalAlpha = l.opacity;
      c.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : l.blend;
      c.filter = `brightness(${l.brightness})${l.shadow ? ' drop-shadow(0 2px ' + l.shadow + 'px #000b)' : ''}`;
      if (l.rotation) {
        c.translate(l.w / 2, l.h / 2);
        c.rotate((l.rotation * Math.PI) / 180);
        c.translate(-l.w / 2, -l.h / 2);
      }
      if (l.type === 'text') {
        c.font = `${l.weight} ${l.size}px ${M.fonts[l.font]}`;
        c.letterSpacing = l.spacing + 'px';
        c.beginPath();
        c.rect(0, 0, l.w, l.h);
        c.clip();
        c.textBaseline = 'alphabetic';
        c.textAlign = l.align;
        const x = l.align === 'center' ? l.w / 2 : l.align === 'right' ? l.w : 0;
        c.fillStyle = l.color;
        const metrics = c.measureText('国Ag'),
          ascent = metrics.fontBoundingBoxAscent ?? l.size * 0.9,
          descent = metrics.fontBoundingBoxDescent ?? l.size * 0.2,
          step = l.size * l.lineHeight,
          baseline = (step - ascent - descent) / 2 + ascent,
          lines = [];
        for (const paragraph of String(l.text).split('\n')) {
          let row = '';
          for (const ch of paragraph) {
            if (row && c.measureText(row + ch).width > l.w) {
              lines.push(row);
              row = ch;
            } else row += ch;
          }
          lines.push(row);
        }
        lines.forEach((line, i) => c.fillText(line, x, baseline + i * step));
      } else ThemeDecorationPaint.draw(c, el, l);
      c.restore();
    }
    return true;
  }
  function chatSignalMask(active, region) {
    const primary = ThemeInstances.project(project);
    const chat = primary?.composition === 'feed' && primary.layers.find((l) => l.type === 'chat');
    if (!active || !chat || (chat.panelOpacity >= 1 && M.effective(project, chat).opacity >= 1)) {
      window.ThemePanelMask?.clear();
      return false;
    }
    const entries = ThemeInstances.project(project)
      .layers.filter(
        (l) =>
          l.type === 'chat' ||
          (l.scope === 'chat' && !['normal', 'sc', 'gift', 'fleet'].includes(l.type)),
      )
      .map((l) => [nodes.get(l.id), l])
      .filter(([el]) => el);
    window.ThemePanelMask?.apply(entries, chat, region);
    return true;
  }
  function configureChatSignal() {
    const plate =
        window.FleetMainInterlude?.primaryCanvas || scene.querySelector('.fleet-interlude'),
      chat = project?.layers.find((l) => l.type === 'chat');
    if (!plate || !chat) return;
    scene.append(plate);
    Object.assign(plate.style, {
      left: chat.x + 'px',
      top: chat.y + 'px',
      right: 'auto',
      bottom: 'auto',
      width: chat.w + 'px',
      height: chat.h + 'px',
      zIndex: '1000',
    });
  }
  function drawFields(time, audio) {
    for (const [id, f] of flowFields) {
      const raw = project?.layers.find((l) => l.id === id);
      if (!raw) continue;
      const rest = M.effective(project, raw);
      f.started ??= time;
      const at = f.trackAt ?? Math.max(0, time - f.started),
        l = { ...rest, ...ThemeKeyframes.sample(rest, at) };
      f.trackTime = at;
      f.style = { ...l, free: true };
      Object.assign(f.box, { ax: l.x + l.anchorX, ay: l.y + l.anchorY });
      f.time += f.last === null ? 0 : Math.max(0, Math.min(100, time - f.last)) * l.speed;
      f.last = time;
      const driven = Object.fromEntries(
        Object.entries(audio).map(([k, v]) => [k, typeof v === 'number' ? v * l.audioGain : v]),
      );
      f.effect?.draw(f.time, l.visible ? l.intensity / 60 : 0, driven);
      const surface = nodes.get(id);
      if (surface) {
        surface.dataset.motionTime = String(Math.round(f.trackTime));
        surface.dataset.flowTime = String(Math.round(f.time));
        surface.dataset.emitter = [f.box.ax, f.box.ay].join(',');
      }
    }
    for (const l of project?.layers || [])
      if (l.type === 'border' && M.effective(project, l).visible)
        ThemeFrame.draw(nodes.get(l.id), l, time);
  }
  window.ThemeRenderer = {
    forInstance: instances.scoped,
    broadcast: instances.broadcast,
    audioSample(value) {
      if (!paused) heldAudio = { ...value };
      return heldAudio;
    },
    scPreset(tier) {
      return $('chatFrame').contentWindow.SCNativePresets?.get(tier);
    },
    chatSignalMask,
    fieldState(id) {
      return flowFields.get(id)?.effect?.state;
    },
    fieldTime(id) {
      return flowFields.get(id)?.trackTime || 0;
    },
    fieldValues(id) {
      return flowFields.get(id)?.style;
    },
    seekField(id, time, playing = false) {
      const f = flowFields.get(id);
      if (!f) return;
      f.started = lastClock - time;
      f.trackAt = playing ? null : time;
    },
    paintChatDecorations,
    preview(command, data) {
      if (p.has('editor')) instances.preview(command, data);
    },
    previewState() {
      return instances.records();
    },
    drawFields,
    clock(t) {
      if (paused) return lastClock;
      lastClock = t - clockOffset;
      return lastClock;
    },
    pause(on) {
      if (on && !paused) {
        pauseAt = performance.now();
        paused = true;
      } else if (!on && paused) {
        clockOffset += performance.now() - pauseAt;
        paused = false;
        for (const f of flowFields.values())
          if (f.trackAt !== null && f.trackAt !== undefined) {
            f.started = lastClock - f.trackAt;
            f.trackAt = null;
          }
      }
      for (const [id, el] of nodes) {
        const l = project?.layers.find((x) => x.id === id);
        if (!l) continue;
        const video =
          el.tagName === 'VIDEO' ? el : l.type === 'background' ? el.querySelector('video') : null;
        if (video) {
          if (paused || !M.effective(project, l).visible || !l.src) video.pause();
          else video.play().catch(() => {});
        }
      }
    },
    apply,
    drawLayer,
    get value() {
      return project;
    },
    get active() {
      return !!project;
    },
    clear() {
      for (const l of project?.layers || []) {
        const el = nodes.get(l.id);
        if (['normal', 'sc', 'gift', 'fleet'].includes(l.type) && el?.tagName === 'CANVAS')
          el.getContext('2d').clearRect(0, 0, el.width, el.height);
      }
    },
  };
  function syncNativeCopies() {
    if (!project) return;
    for (const l of project.layers) {
      const el = nodes.get(l.id);
      if (!el || el === native[l.type]) continue;
      for (const id of l.type === 'timer'
        ? ['timerH', 'timerM', 'timerS']
        : ThemeSceneComponents.isHeader(l.type)
          ? ['hostText', 'topicText']
          : []) {
        const target = el.querySelector('[data-native-id="' + id + '"]'),
          source = $(id);
        if (target && source && target.textContent !== source.textContent)
          target.textContent = source.textContent;
        if (target && source && id === 'topicText') target.hidden = !source.textContent.trim();
      }
      if (l.type === 'grain') {
        const source = native.grain;
        if (el.width !== source.width || el.height !== source.height) {
          el.width = source.width;
          el.height = source.height;
        }
        const c = el.getContext('2d');
        c.clearRect(0, 0, el.width, el.height);
        c.drawImage(source, 0, 0);
      }
    }
  }
  const mirrorObserver = new MutationObserver(syncNativeCopies);
  for (const el of [native.header, native.timer])
    mirrorObserver.observe(el, { subtree: true, childList: true, characterData: true });
  setInterval(syncNativeCopies, 100);
  if (p.has('theme') || hash.has('theme')) {
    try {
      let value;
      if (p.has('theme')) {
        const id = p.get('theme');
        if (!/^[a-f0-9]{24}$/.test(id)) throw Error('主题编号无效');
        const response = await fetch('theme-projects/' + id + '.json');
        if (!response.ok) throw Error('找不到保存的主题文件');
        value = await response.json();
      } else value = JSON.parse(hash.get('theme'));
      apply(value);
    } catch (e) {
      $('previewStatus').textContent = '主题文件无法读取：' + e.message;
    }
  }
})();
