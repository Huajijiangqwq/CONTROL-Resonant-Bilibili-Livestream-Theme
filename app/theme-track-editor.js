/* Author real scalar property tracks. All changes go through editor history. */
(() => {
  'use strict';
  const K = ThemeKeyframes;
  function mount(container, options) {
    const { owner, properties, change, live, start, end, time, seek, play } = options,
      section = document.createElement('section');
    section.className = 'property-section track-editor';
    const heading = document.createElement('h3');
    heading.textContent = '属性关键帧';
    section.append(heading);
    container.append(section);
    const isExit = options.phase === 'exit',
      baseDuration = isExit ? options.exitDuration : 2000;
    if (options.allowExit) {
      const phase = document.createElement('select');
      phase.setAttribute('aria-label', '关键帧阶段');
      phase.className = 'track-phase';
      for (const [value, label] of [
        ['entry', '消息播放 · 从出现开始'],
        ['exit', '退场 · 从消散开始'],
      ]) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        phase.append(o);
      }
      phase.value = options.phase || 'entry';
      phase.onchange = () => options.setPhase(phase.value);
      section.append(phase);
    }
    const toolbar = document.createElement('div');
    toolbar.className = 'track-toolbar';
    const property = document.createElement('select');
    property.setAttribute('aria-label', '关键帧属性');
    for (const key of properties) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = K.labels[key];
      property.append(o);
    }
    const add = document.createElement('button');
    add.textContent = '＋ 轨道';
    add.onclick = () =>
      change((o) => {
        if (o.tracks.some((t) => t.property === property.value)) return;
        const value = options.baseValue?.(property.value) ?? o[property.value] ?? 0;
        o.tracks.push({
          property: property.value,
          keys: [
            { time: 0, value, ease: 'smooth' },
            { time: baseDuration, value, ease: 'smooth' },
          ],
        });
      });
    toolbar.append(property, add);
    section.append(toolbar);
    const note = document.createElement('p');
    note.className = 'property-note';
    note.textContent = isExit
      ? '0 秒表示退场开始；只影响这一段，保留原生消散。当前退场时长 ' +
        (baseDuration / 1000).toFixed(2) +
        ' 秒。'
      : properties.some((p) => p.startsWith('sc') || p === 'effectGain')
        ? '参数按每条消息的播放时间变化，保留原生演变和材质。拖动关键帧或输入时间和值。'
        : '拖动关键帧，或输入时间和值。位置关键帧保留消息原有占位。';
    section.append(note);
    ThemeTrackClipboard.mount(section, { owner, properties, change });
    if (!owner().tracks?.length) return;
    if (isExit && K.duration(owner()) > baseDuration) {
      const warning = document.createElement('p');
      warning.className = 'property-note';
      warning.textContent = '部分关键帧超出退场时长，消息消失后不会显示；可调整关键帧或延长退场。';
      section.append(warning);
    }
    const controls = document.createElement('div');
    controls.className = 'track-toolbar';
    const loop = document.createElement('label'),
      check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = owner().motionLoop;
    check.onchange = () => change((o) => (o.motionLoop = check.checked));
    loop.append(check, '循环');
    const replay = document.createElement('button');
    replay.textContent = '回放参数';
    replay.onclick = play;
    const elapsed = document.createElement('output');
    elapsed.className = 'track-time';
    if (!isExit) controls.append(loop);
    controls.append(replay, elapsed);
    section.append(controls);
    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.min = 0;
    scrub.max = Math.max(baseDuration, K.duration(owner()));
    scrub.step = 10;
    scrub.className = 'track-scrub';
    scrub.setAttribute('aria-label', '属性关键帧时间');
    scrub.value = Math.min(+scrub.max, time());
    scrub.oninput = () => seek(+scrub.value);
    section.append(scrub);
    section.refreshTime = () => {
      const duration = K.duration(owner()),
        t = owner().motionLoop && duration > 0 ? time() % duration : time();
      elapsed.textContent = (t / 1000).toFixed(2) + ' s';
      if (document.activeElement !== scrub) scrub.value = t;
      for (const line of section.querySelectorAll('[data-playhead]')) {
        const end = +line.dataset.end,
          x = 16 + Math.max(0, Math.min(1, t / end)) * 208;
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        line.style.opacity = t <= end ? '.85' : '.35';
      }
    };
    for (const initial of owner().tracks) {
      const prop = initial.property,
        block = document.createElement('div');
      block.className = 'track-block' + (initial.enabled === false ? ' track-muted' : '');
      block.dataset.trackProperty = prop;
      const label = document.createElement('div');
      label.className = 'track-label';
      const title = document.createElement('strong');
      title.textContent = K.labels[prop];
      const remove = document.createElement('button');
      remove.textContent = '删除轨道';
      remove.onclick = () =>
        change((o) => (o.tracks = o.tracks.filter((t) => t.property !== prop)));
      const active = document.createElement('label');
      active.className = 'track-enable';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = initial.enabled !== false;
      toggle.setAttribute('aria-label', K.labels[prop] + '作用于画面');
      toggle.onchange = () =>
        change((o) => (o.tracks.find((t) => t.property === prop).enabled = toggle.checked));
      active.append(toggle, '作用于画面');
      label.append(title, active, remove);
      block.append(label);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('track-graph');
      svg.setAttribute('viewBox', '0 0 240 120');
      svg.setAttribute('aria-label', K.labels[prop] + '关键帧曲线');
      svg.setAttribute('role', 'img');
      block.append(svg);
      section.append(block);
      const get = () => owner().tracks.find((t) => t.property === prop),
        range = () => {
          const values = get()?.keys.map((k) => k.value) || [0, 1],
            low = Math.min(...values),
            high = Math.max(...values),
            span = Math.max(prop === 'opacity' ? 0.1 : 1, high - low);
          return [
            Math.max(K.ranges[prop][0], low - span * 0.18),
            Math.min(K.ranges[prop][1], high + span * 0.18),
          ];
        };
      let drag = null;
      function graph() {
        const track = get();
        if (!track) return;
        const extent = drag?.extent || range(),
          min = extent[0],
          max = extent[1],
          last = Math.max(baseDuration, track.keys.at(-1).time),
          x = (t) => 16 + (t / last) * 208,
          y = (v) => 103 - ((v - min) / Math.max(0.0001, max - min)) * 84;
        svg.replaceChildren();
        const el = (name, attrs) => {
          const n = document.createElementNS(svg.namespaceURI, name);
          for (const [key, val] of Object.entries(attrs)) n.setAttribute(key, val);
          svg.append(n);
          return n;
        };
        el('path', { d: 'M16 19V103H224', class: 'curve-axis' });
        const points = Array.from({ length: 81 }, (_, i) => {
          const t = (i / 80) * last,
            value = K.sample({ tracks: [{ ...track, enabled: true }] }, t)[prop];
          return (i ? 'L' : 'M') + x(t) + ',' + y(value);
        }).join('');
        el('path', { d: points, class: 'curve-path' });
        el('line', {
          'data-playhead': '',
          'data-end': last,
          x1: x(Math.min(last, time())),
          x2: x(Math.min(last, time())),
          y1: 15,
          y2: 103,
          stroke: '#91c9b8',
          'stroke-width': 1,
          'pointer-events': 'none',
        });
        svg.dataset.duration = last;
        for (const [i, key] of track.keys.entries()) {
          const dot = el('circle', { cx: x(key.time), cy: y(key.value), r: 4, 'data-key': i });
          dot.onpointerdown = (e) => {
            e.preventDefault();
            const inverse = svg.getScreenCTM().inverse(),
              point = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
            start();
            drag = { index: i, keys: structuredClone(track.keys), extent, last, inverse, point };
            svg.setPointerCapture(e.pointerId);
          };
        }
        el('text', { x: 16, y: 115, 'font-size': 8, fill: '#9399a3' }).textContent = '0 s';
        el('text', { x: 206, y: 115, 'font-size': 8, fill: '#9399a3' }).textContent =
          (last / 1000).toFixed(1) + ' s';
      }
      svg.onpointerdown = (e) => {
        if (e.button !== 0 || e.target.closest('circle')) return;
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            svg.getScreenCTM().inverse(),
          ),
          t = Math.max(0, Math.min(1, (point.x - 16) / 208)) * +svg.dataset.duration;
        seek(Math.round(t / 10) * 10);
        section.refreshTime?.();
      };
      svg.onpointermove = (e) => {
        if (!drag) return;
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.inverse),
          dx = point.x - drag.point.x,
          dy = point.y - drag.point.y,
          keys = structuredClone(drag.keys),
          key = keys[drag.index];
        key.time = K.availableTime(
          keys,
          drag.index,
          key.time + Math.round(((dx / 208) * drag.last) / 10) * 10,
        );
        key.value = Math.max(
          K.ranges[prop][0],
          Math.min(K.ranges[prop][1], key.value - (dy / 84) * (drag.extent[1] - drag.extent[0])),
        );
        live((o) => (o.tracks.find((t) => t.property === prop).keys = keys));
        graph();
      };
      svg.onpointerup = svg.onpointercancel = () => {
        if (!drag) return;
        drag = null;
        end();
      };
      graph();
      const timing = document.createElement('details');
      timing.className = 'track-timing';
      const summary = document.createElement('summary');
      summary.textContent = '调整整段时序';
      timing.append(summary);
      const timingFields = document.createElement('div');
      timingFields.className = 'track-timing-fields';
      const first = initial.keys[0].time,
        span = initial.keys.at(-1).time - first;
      for (const [key, text, current] of [
        ['start', '起点 ms', first],
        ['duration', '时长 ms', span],
      ]) {
        const label = document.createElement('label');
        label.textContent = text;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.max = 30000;
        input.step = 10;
        input.value = current;
        input.disabled = key === 'duration' && initial.keys.length < 2;
        input.setAttribute('aria-label', K.labels[prop] + '整段' + text);
        let last = String(current);
        const commit = () => {
          if (!input.value.trim() || !Number.isFinite(+input.value) || input.value === last) return;
          last = input.value;
          const track = get(),
            retimed = K.retime(
              track,
              key === 'start' ? +input.value : track.keys[0].time,
              key === 'duration' ? +input.value : track.keys.at(-1).time - track.keys[0].time,
            );
          change((o) => (o.tracks = o.tracks.map((t) => (t.property === prop ? retimed : t))));
          seek(retimed.keys[0].time);
        };
        input.onchange = input.onblur = commit;
        input.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        };
        label.append(input);
        timingFields.append(label);
      }
      timing.append(timingFields);
      const timingNote = document.createElement('p');
      timingNote.className = 'property-note';
      timingNote.textContent = '保持各帧数值和曲线，只调整这一条属性轨道。';
      timing.append(timingNote);
      block.append(timing);
      const table = document.createElement('div');
      table.className = 'track-keys';
      const labels = document.createElement('div');
      labels.className = 'track-table-head';
      for (const text of ['时间 ms', '数值', '到下一帧', '']) {
        const label = document.createElement('span');
        label.textContent = text;
        labels.append(label);
      }
      table.append(labels);
      for (const [index, key] of initial.keys.entries()) {
        const row = document.createElement('div');
        const ms = document.createElement('input');
        ms.type = 'number';
        ms.value = key.time;
        ms.min = 0;
        ms.max = 30000;
        ms.step = 10;
        ms.setAttribute('aria-label', K.labels[prop] + '第 ' + (index + 1) + ' 帧时间毫秒');
        let savedTime = String(key.time);
        const commitTime = () => {
          if (!ms.value.trim() || !Number.isFinite(+ms.value) || ms.value === savedTime) return;
          const at = Math.max(0, Math.min(30000, Math.round(+ms.value)));
          if (get().keys.some((key, i) => i !== index && key.time === at)) {
            ms.value = savedTime;
            options.toast?.('这个时刻已有关键帧。请调整现有帧，或输入不同时间。');
            return;
          }
          savedTime = String(at);
          change((o) => (o.tracks.find((t) => t.property === prop).keys[index].time = at));
        };
        ms.onchange = ms.onblur = commitTime;
        ms.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTime();
          }
        };
        const value = document.createElement('input');
        value.type = 'number';
        value.value = +key.value.toFixed(3);
        value.min = K.ranges[prop][0];
        value.max = K.ranges[prop][1];
        value.step = prop === 'opacity' ? 0.05 : K.ranges[prop][1] <= 3 ? 0.1 : 1;
        value.setAttribute('aria-label', K.labels[prop] + '第 ' + (index + 1) + ' 帧值');
        let valueEditing = false;
        value.oninput = () => {
          if (!value.value.trim() || !Number.isFinite(+value.value)) return;
          if (!valueEditing) {
            start();
            valueEditing = true;
          }
          live((o) => (o.tracks.find((t) => t.property === prop).keys[index].value = +value.value));
          graph();
        };
        const commitValue = () => {
          if (!valueEditing) return;
          valueEditing = false;
          end();
        };
        value.onchange = value.onblur = commitValue;
        value.onkeydown = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitValue();
          }
        };
        const curve = document.createElement('select');
        curve.setAttribute('aria-label', '到下一帧的运动曲线');
        for (const [v, text] of [
          ['linear', '线性'],
          ['smooth', '缓入缓出'],
          ['in', '加速'],
          ['out', '减速'],
          ['hold', '定格'],
          ['bezier', '自定义曲线'],
        ]) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = text;
          curve.append(o);
        }
        curve.value = key.ease;
        curve.disabled = index === initial.keys.length - 1;
        if (curve.disabled) curve.title = '最后一帧没有后续区间';
        curve.onchange = () => {
          if (curve.value === 'bezier')
            ThemeSegmentCurve.activate((options.id || '') + ':' + prop, index);
          change((o) => {
            const key = o.tracks.find((t) => t.property === prop).keys[index];
            key.ease = curve.value;
            if (key.ease === 'bezier') key.curve = K.normalizeCurve(key.curve);
          });
        };
        const del = document.createElement('button');
        del.textContent = '−';
        del.setAttribute('aria-label', '删除' + K.labels[prop] + '第 ' + (index + 1) + ' 帧');
        del.onclick = () =>
          change((o) => o.tracks.find((t) => t.property === prop).keys.splice(index, 1));
        row.append(ms, value, curve, del);
        table.append(row);
      }
      block.append(table);
      ThemeSegmentCurve.mount(block, {
        id: (options.id || '') + ':' + prop,
        property: prop,
        owner,
        start,
        live,
        end,
        change,
        refresh: graph,
      });
      const newKey = document.createElement('button');
      newKey.className = 'wide';
      newKey.textContent = '在当前时间添加一帧';
      newKey.onclick = () => {
        const o = owner(),
          track = o.tracks.find((t) => t.property === prop),
          length = K.duration(o),
          at = Math.round(o.motionLoop && length > 0 ? time() % length : Math.min(30000, time()));
        if (track.keys.some((k) => k.time === at)) {
          options.toast?.('这个时刻已有关键帧，已保留它的数值和运动曲线。');
          return;
        }
        if (track.keys.length >= K.maxKeys) {
          options.toast?.('这条轨道已达 ' + K.maxKeys + ' 帧，请先删除不需要的帧。');
          return;
        }
        const value = K.sample({ tracks: [{ ...track, enabled: true }] }, at)[prop] ?? o[prop] ?? 0;
        change((target) =>
          K.putKey(
            target.tracks.find((t) => t.property === prop),
            at,
            value,
          ),
        );
      };
      block.append(newKey);
    }
  }
  window.ThemeTrackEditor = {
    mount,
    refresh(container) {
      container.querySelectorAll('.track-editor').forEach((el) => el.refreshTime?.());
    },
  };
})();
