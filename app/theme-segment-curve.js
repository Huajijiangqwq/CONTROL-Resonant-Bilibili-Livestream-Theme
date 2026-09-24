/* Per-segment timing handles change native property sampling, not rendered pixels. */
(() => {
  'use strict';
  const K = ThemeKeyframes,
    ui = new Map();
  const defaults = (type) =>
    type === 'linear'
      ? [0, 0, 1, 1]
      : type === 'in'
        ? [1 / 3, 0, 2 / 3, 0]
        : type === 'out'
          ? [1 / 3, 1, 2 / 3, 1]
          : [1 / 3, 0, 2 / 3, 1];
  function mount(parent, { id, property, owner, start, live, end, change, refresh }) {
    const get = () => owner().tracks.find((t) => t.property === property),
      keys = get()?.keys;
    if (!keys || keys.length < 2) return;
    const state = ui.get(id) || {
      index: Math.max(
        0,
        keys.findIndex((k) => k.ease === 'bezier'),
      ),
      open: keys.some((k) => k.ease === 'bezier'),
    };
    ui.set(id, state);
    state.index = Math.min(state.index, keys.length - 2);
    const details = document.createElement('details');
    details.className = 'segment-curve';
    details.open = state.open;
    details.ontoggle = () => (state.open = details.open);
    const summary = document.createElement('summary');
    summary.textContent = '逐段编辑运动曲线';
    details.append(summary);
    parent.append(details);
    const segment = document.createElement('select');
    segment.setAttribute('aria-label', K.labels[property] + '曲线段');
    for (let i = 0; i < keys.length - 1; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent =
        '第 ' +
        (i + 1) +
        ' → ' +
        (i + 2) +
        ' 帧 · ' +
        (keys[i].time / 1000).toFixed(2) +
        ' – ' +
        (keys[i + 1].time / 1000).toFixed(2) +
        ' s';
      segment.append(option);
    }
    segment.value = state.index;
    details.append(segment);
    const plot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    plot.setAttribute('viewBox', '0 0 240 150');
    plot.setAttribute('aria-label', K.labels[property] + '分段速度曲线');
    plot.classList.add('segment-plot');
    details.append(plot);
    const make = (tag, attrs) => {
      const n = document.createElementNS(plot.namespaceURI, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      plot.append(n);
      return n;
    };
    make('path', { d: 'M24 18V126H220', class: 'curve-axis' });
    const arms = make('path', { class: 'segment-arms' }),
      path = make('path', { class: 'curve-path' });
    const dots = [0, 1].map((i) =>
      make('circle', {
        r: 5,
        tabindex: '0',
        role: 'slider',
        'aria-label': K.labels[property] + '第 ' + (i + 1) + ' 个曲线手柄',
        'aria-valuemin': '0',
        'aria-valuemax': '1',
      }),
    );
    const label = make('text', { x: 24, y: 144, 'font-size': 9, fill: '#a3aaa9' });
    label.textContent = '时间 →';
    make('text', { x: 24, y: 13, 'font-size': 9, fill: '#a3aaa9' }).textContent = '完成比例';
    const controls = document.createElement('div');
    controls.className = 'segment-values';
    details.append(controls);
    const inputs = ['出发时间', '出发进度', '到达时间', '到达进度'].map((name, i) => {
      const label = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'number';
      input.min = 0;
      input.max = 1;
      input.step = 0.01;
      input.setAttribute('aria-label', K.labels[property] + '曲线' + name);
      label.append(name, input);
      controls.append(label);
      return input;
    });
    const info = document.createElement('p');
    info.className = 'property-note';
    info.textContent = '拖动手柄或输入数值，调整这一段的加速、减速；保留两端关键帧的位置和值。';
    details.append(info);
    const read = () => {
      const k = get()?.keys[state.index];
      return k?.ease === 'bezier' ? K.normalizeCurve(k.curve) : defaults(k?.ease);
    };
    const write = (curve) => {
      live((o) => {
        const key = o.tracks.find((t) => t.property === property)?.keys[state.index];
        if (key) {
          key.ease = 'bezier';
          key.curve = K.normalizeCurve(curve);
        }
      });
      draw();
      refresh();
    };
    function draw() {
      const curve = read(),
        [x1, y1, x2, y2] = curve,
        x = (v) => 24 + 196 * v,
        y = (v) => 126 - 108 * v,
        held = get()?.keys[state.index]?.ease === 'hold';
      arms.setAttribute('d', `M24 126L${x(x1)} ${y(y1)}M220 18L${x(x2)} ${y(y2)}`);
      path.setAttribute(
        'd',
        held ? 'M24 126H220V18' : `M24 126C${x(x1)} ${y(y1)} ${x(x2)} ${y(y2)} 220 18`,
      );
      info.textContent = held
        ? '当前为定格。拖动手柄或输入数值，会把这一段改为自定义运动曲线。'
        : '拖动手柄或输入数值，调整这一段的加速、减速；保留两端关键帧的位置和值。';
      dots.forEach((d, i) => {
        d.setAttribute('cx', x(curve[i * 2]));
        d.setAttribute('cy', y(curve[i * 2 + 1]));
        d.setAttribute(
          'aria-valuetext',
          curve
            .slice(i * 2, i * 2 + 2)
            .map((v) => v.toFixed(2))
            .join(', '),
        );
      });
      inputs.forEach((input, i) => {
        if (document.activeElement !== input) input.value = +curve[i].toFixed(3);
      });
    }
    segment.onchange = () => {
      state.index = +segment.value;
      draw();
    };
    let drag = null;
    dots.forEach((dot, i) => {
      dot.onpointerdown = (e) => {
        e.preventDefault();
        const inverse = plot.getScreenCTM().inverse(),
          point = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse),
          curve = read();
        start();
        drag = { index: i, inverse, point, curve };
        plot.setPointerCapture(e.pointerId);
      };
      dot.onkeydown = (e) => {
        if (!e.key.startsWith('Arrow')) return;
        e.preventDefault();
        const c = read(),
          axis = ['ArrowLeft', 'ArrowRight'].includes(e.key) ? 0 : 1,
          delta = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 0.01 : -0.01;
        c[i * 2 + axis] += delta;
        change((o) => {
          const key = o.tracks.find((t) => t.property === property).keys[state.index];
          key.ease = 'bezier';
          key.curve = K.normalizeCurve(c);
        });
      };
    });
    plot.onpointermove = (e) => {
      if (!drag) return;
      const c = [...drag.curve],
        point = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.inverse);
      c[drag.index * 2] += (point.x - drag.point.x) / 196;
      c[drag.index * 2 + 1] -= (point.y - drag.point.y) / 108;
      write(c);
    };
    plot.onpointerup = plot.onpointercancel = () => {
      if (drag) {
        drag = null;
        end();
      }
    };
    inputs.forEach((input, i) => {
      let editing = false;
      input.oninput = () => {
        if (!input.value.trim() || !Number.isFinite(+input.value)) return;
        if (!editing) {
          start();
          editing = true;
        }
        const c = read();
        c[i] = +input.value;
        write(c);
      };
      const commit = () => {
        if (editing) {
          editing = false;
          end();
        }
      };
      input.onchange = input.onblur = commit;
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      };
    });
    draw();
  }
  window.ThemeSegmentCurve = {
    mount,
    activate(id, index) {
      ui.set(id, { index, open: true });
    },
  };
})();
