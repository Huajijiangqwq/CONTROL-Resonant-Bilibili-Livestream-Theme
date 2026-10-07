/* Editor-only camera. Output geometry stays 1920 x 1080; the workspace does not. */
(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const minZoom = 0.05, maxZoom = 4;
  function camera(area, view, zoom, pan = { x: 0, y: 0 }) {
    const scale = zoom === 'fit'
      ? clamp(Math.min((area.width - 112) / view.w, (area.height - 112) / view.h), minZoom, maxZoom)
      : clamp(Number(zoom) || 1, minZoom, maxZoom);
    return { scale, x: (area.width - view.w * scale) / 2 + pan.x,
      y: (area.height - view.h * scale) / 2 + pan.y };
  }
  function zoomPan(area, point, oldScale, nextScale, pan) {
    const x = point.x - area.width / 2, y = point.y - area.height / 2;
    return { x: x - (x - pan.x) * nextScale / oldScale,
      y: y - (y - pan.y) * nextScale / oldScale };
  }
  function commonDelta(layers, axis, delta, range) {
    if (!layers.length) return 0;
    const low = Math.max(...layers.map(l => range(l, axis)[0] - l[axis])),
      high = Math.min(...layers.map(l => range(l, axis)[1] - l[axis]));
    return clamp(delta, low, high);
  }
  function rulerTicks(length, origin, scale) {
    const step = scale >= .55 ? 100 : scale >= .2 ? 200 : 500,
      low = Math.ceil((-origin + 22) / scale / step) * step,
      high = Math.floor((length - origin) / scale / step) * step;
    const ticks = [];
    for (let value = low; value <= high; value += step)
      ticks.push({ value, pixel: origin + value * scale });
    return ticks;
  }
  function mountFrame(frame) {
    const doc = frame.contentDocument;
    if (!doc?.documentElement?.classList.contains('editor-render') || !doc.head || !doc.body) return false;
    if (doc.getElementById('editor-workspace-camera')) return true;
    const style = doc.createElement('style');
    style.id = 'editor-workspace-camera';
    style.textContent = `
html.editor-render,html.editor-render body{width:100%;height:100%;overflow:hidden!important}
html.editor-render .studio,html.editor-render .monitor{display:block!important;position:static!important;width:100%!important;height:100%!important;padding:0!important;overflow:visible!important}
html.editor-render #sceneViewport{position:static!important;width:1920px!important;height:1080px!important;overflow:visible!important;box-shadow:none!important}
html.editor-render #scene{position:absolute!important;left:var(--editor-scene-x,0px)!important;top:var(--editor-scene-y,0px)!important;width:1920px!important;height:1080px!important;transform:scale(var(--editor-camera-scale,1))!important;transform-origin:0 0!important;overflow:visible!important}
`;
    doc.head.append(style);
    return true;
  }
  function renderFrame(frame, area, view, pose) {
    // Keep the iframe at screen resolution instead of allocating a 30,000px
    // browser surface when the user zooms out. Only its scene is transformed.
    Object.assign(frame.style, { left: -pose.x / pose.scale + 'px',
      top: -pose.y / pose.scale + 'px', width: area.width + 'px', height: area.height + 'px',
      transform: `scale(${1 / pose.scale})`, transformOrigin: '0 0' });
    if (!mountFrame(frame)) return;
    const style = frame.contentDocument.documentElement.style;
    style.setProperty('--editor-scene-x', pose.x - view.x * pose.scale + 'px');
    style.setProperty('--editor-scene-y', pose.y - view.y * pose.scale + 'px');
    style.setProperty('--editor-camera-scale', String(pose.scale));
  }
  const api = { minZoom, maxZoom, camera, zoomPan, commonDelta, rulerTicks, mountFrame, renderFrame };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThemeCanvasWorkspace = api;
})(globalThis);
