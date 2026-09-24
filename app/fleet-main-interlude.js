(() => {
  'use strict';
  function create(frame, panel, viewKey = '') {
    const api = () => (viewKey ? window.ThemeRenderer?.forInstance(viewKey) : window.ThemeRenderer);
    if (!frame || !panel || !window.FleetSignal || !window.FleetInterlude) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'fleet-interlude';
    canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '6',
      pointerEvents: 'none',
    });
    panel.append(canvas);
    const c = canvas.getContext('2d');
    let current = null;
    const configure = (enabled) =>
      frame.contentWindow?.postMessage(
        { channel: 'hiss-main', command: 'fleet-effects', data: enabled },
        location.origin,
      );
    function geometry() {
      const p = panel.getBoundingClientRect(),
        style = getComputedStyle(panel),
        scale = p.width / parseFloat(style.width),
        left = parseFloat(style.borderLeftWidth),
        top = parseFloat(style.borderTopWidth);
      return (element) => {
        const r = element.getBoundingClientRect();
        return {
          x: (r.left - p.left) / scale - left,
          y: (r.top - p.top) / scale - top,
          w: r.width / scale,
          h: r.height / scale,
        };
      };
    }
    function header(rect) {
      if (api()?.paintChatDecorations(c)) return;
      const heading = panel.querySelector('.chat-heading,.heading');
      if (!heading || getComputedStyle(heading).display === 'none') return;
      const r = rect(heading),
        style = getComputedStyle(heading);
      c.save();
      window.FleetPanelSurface?.clip(c, style, r);
      c.save();
      c.globalAlpha = Number(style.opacity);
      c.fillStyle = style.color;
      c.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      c.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      const text = Array.from(heading.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('')
          .trim(),
        m = c.measureText(text),
        ascent = m.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.9,
        descent = m.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * 0.2;
      const line = parseFloat(style.lineHeight) || r.h,
        baseline = r.y + (line - ascent - descent) / 2 + ascent;
      const shadow =
        /(rgba?\([^)]*\)|#[\da-f]+)\s+([-\d.]+)px\s+([-\d.]+)px(?:\s+([\d.]+)px)?/i.exec(
          style.textShadow,
        );
      if (shadow) {
        c.shadowColor = shadow[1];
        c.shadowOffsetX = +shadow[2];
        c.shadowOffsetY = +shadow[3];
        c.shadowBlur = +(shadow[4] || 0);
      }
      c.fillText(text, r.x, baseline);
      c.restore();
      const rule = heading.querySelector('.chat-rule');
      if (!rule) {
        c.fillStyle = style.borderBottomColor;
        c.fillRect(r.x, r.y + r.h - 1, r.w, 1);
        c.restore();
        return;
      }
      const rr = rect(rule),
        rs = getComputedStyle(rule);
      window.FleetPanelSurface?.clip(c, rs, rr);
      if (window.FleetPanelSurface) FleetPanelSurface.background(c, rs, rr);
      else {
        c.fillStyle = rs.backgroundColor;
        c.fillRect(rr.x, rr.y, rr.w, rr.h);
      }
      const ps = getComputedStyle(rule, '::before'),
        pw = parseFloat(ps.width),
        ph = parseFloat(ps.height);
      if (pw > 0 && ph > 0) {
        c.save();
        c.beginPath();
        c.moveTo(rr.x + pw * 0.02, rr.y + rr.h - ph);
        c.lineTo(rr.x + pw, rr.y + rr.h - ph);
        c.lineTo(rr.x + pw, rr.y + rr.h);
        c.lineTo(rr.x, rr.y + rr.h);
        c.closePath();
        c.clip();
        if (window.FleetPanelSurface)
          FleetPanelSurface.background(c, ps, { x: rr.x, y: rr.y + rr.h - ph, w: pw, h: ph });
        else {
          c.fillStyle = ps.backgroundColor;
          c.fill();
        }
        c.restore();
      }
      for (const mark of rule.children) {
        const s = getComputedStyle(mark);
        if (s.display === 'none' || +s.opacity <= 0) continue;
        const r = rect(mark);
        c.save();
        c.globalAlpha = +s.opacity;
        window.FleetPanelSurface?.clip(c, s, r);
        if (window.FleetPanelSurface) FleetPanelSurface.background(c, s, r);
        else {
          c.fillStyle = s.backgroundColor;
          c.fillRect(r.x, r.y, r.w, r.h);
        }
        c.restore();
      }
      c.restore();
    }
    function paint() {
      const theme = api()?.value,
        chat = theme?.layers.find((l) => l.type === 'chat');
      if (
        theme &&
        (theme.composition !== 'feed' || !chat || !ThemeEditorModel.effective(theme, chat).visible)
      ) {
        api().chatSignalMask(false);
        canvas.hidden = true;
        return;
      }
      const { age, rank, signal } = current || {},
        cut = Number.isFinite(age) ? FleetInterlude.state(age, rank) : null;
      if (!cut?.active && !signal?.flash && !signal?.glitch && !signal?.vhs) {
        api()?.chatSignalMask(false);
        canvas.hidden = true;
        return;
      }
      const source = frame.contentDocument?.getElementById('stream'),
        sr = source?.getBoundingClientRect();
      // Match the feed's backing-pixel scale instead of resampling all its text
      // through a lower-resolution intermediate canvas when VHS switches on.
      const style = getComputedStyle(panel),
        w =
          parseFloat(style.width) -
          parseFloat(style.borderLeftWidth) -
          parseFloat(style.borderRightWidth),
        h =
          parseFloat(style.height) -
          parseFloat(style.borderTopWidth) -
          parseFloat(style.borderBottomWidth),
        q = Math.max(1.5, Math.min(2.5, source?.width / Math.max(1, sr?.width || 1) || 1.5));
      if (canvas.width !== Math.round(w * q) || canvas.height !== Math.round(h * q)) {
        canvas.width = Math.round(w * q);
        canvas.height = Math.round(h * q);
      }
      c.setTransform(q, 0, 0, q, 0, 0);
      c.clearRect(0, 0, w, h);
      c.save();
      const radius = parseFloat(style.borderTopLeftRadius) || 0;
      if (radius) {
        c.beginPath();
        c.roundRect(0, 0, w, h, radius);
        c.clip();
      }
      if (!cut?.plate) {
        const feed = panel.querySelector('.chat-feed,.feed');
        if (!source?.width || !feed) {
          c.restore();
          api()?.chatSignalMask(false);
          canvas.hidden = true;
          return;
        }
        const rect = geometry(),
          fr = rect(frame),
          clip = rect(feed);
        if (window.FleetPanelSurface) FleetPanelSurface.surface(c, panel, w, h);
        else {
          c.fillStyle = getComputedStyle(panel).backgroundColor;
          c.fillRect(0, 0, w, h);
        }
        c.save();
        c.beginPath();
        c.rect(clip.x, clip.y, clip.w, clip.h);
        c.clip();
        c.drawImage(source, fr.x + sr.left, fr.y + sr.top, sr.width, sr.height);
        window.FleetPanelSurface?.feed(c, feed, clip);
        c.restore();
        const panelAlpha = Number(style.opacity);
        if (panelAlpha < 1) {
          c.save();
          c.globalCompositeOperation = 'destination-in';
          c.globalAlpha = panelAlpha;
          c.fillStyle = '#000';
          c.fillRect(0, 0, w, h);
          c.restore();
        }
        header(rect);
        window.FleetPanelSurface?.fields(c, panel, rect);
      }
      const region = current?.region || { x: 0, y: 0, w, h };
      FleetSignal.draw(c, {
        x: region.x,
        y: region.y,
        width: region.w,
        height: region.h,
        quality: q,
        age,
        rank,
        signal,
      });
      if (current?.region) {
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000';
        c.beginPath();
        c.rect(0, 0, w, h);
        c.rect(region.x, region.y, region.w, region.h);
        c.fill('evenodd');
        c.restore();
      }
      canvas.dataset.effectRegion = JSON.stringify(region);
      // At zero signal the native surface remains authoritative. Sub-pixel text
      // rasterization must not switch renderers at an infinitesimal VHS value.
      const strength = Math.max(signal?.flash || 0, signal?.glitch || 0, signal?.vhs || 0);
      c.restore();
      const replacesTransparent = api()?.chatSignalMask(true, current?.region);
      canvas.style.opacity =
        cut?.active || replacesTransparent ? '1' : String(Math.min(1, strength / 0.06));
      canvas.hidden = false;
    }
    const receive = (event) => {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== location.origin ||
        event.data?.channel !== 'hiss-main-reply'
      )
        return;
      if (event.data.type === 'ready') {
        configure(true);
        return;
      }
      if (event.data.type !== 'fleet-signal') return;
      current = Number.isFinite(event.data.age) ? event.data : null;
      paint();
    };
    window.addEventListener('message', receive);
    const reload = () => {
      current = null;
      paint();
      configure(true);
    };
    frame.addEventListener('load', reload);
    FleetInterlude.loading.then(paint);
    configure(true);
    const hide = () => {
        configure(false);
        current = null;
        paint();
        api()?.chatSignalMask(false);
        window.FleetVHS?.dispose(c);
      },
      show = () => configure(true);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return {
      dispose() {
        hide();
        window.removeEventListener('message', receive);
        window.removeEventListener('pagehide', hide);
        window.removeEventListener('pageshow', show);
        frame.removeEventListener('load', reload);
        canvas.remove();
      },
      canvas,
    };
  }
  const frame = document.getElementById('chatFrame'),
    panel = document.querySelector('.chat-panel');
  let primary = create(frame, panel),
    currentPanel = panel;
  window.FleetMainInterlude = {
    get primaryCanvas() {
      return primary?.canvas;
    },
    create,
    rebind(next) {
      if (next === currentPanel) return;
      primary?.dispose();
      currentPanel = next;
      primary = next ? create(frame, next) : null;
    },
  };
})();
