/* One editable timing view over the existing component/part tracks. */
(() => {
  'use strict';
  const K = ThemeKeyframes,
    seconds = (ms) => (ms / 1000).toFixed(ms % 10 ? 3 : ms % 1000 ? 2 : 0) + ' s';
  function install(host, options) {
    const root = document.createElement('details');
    root.className = 'timeline-overview';
    root.id = 'multiTimeline';
    const summary = document.createElement('summary');
    summary.textContent = '多轨时间线';
    const contextName = document.createElement('span');
    summary.append(contextName);
    root.append(summary);
    const tools = document.createElement('div');
    tools.className = 'overview-tools';
    const phase = document.createElement('select');
    phase.setAttribute('aria-label', '多轨时间线阶段');
    for (const [value, text] of [
      ['entry', '出现与稳定'],
      ['exit', '退场'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      phase.append(option);
    }
    const zoomInput = document.createElement('select');
    zoomInput.setAttribute('aria-label', '时间线缩放');
    for (const n of [1, 2, 4, 8]) {
      const option = document.createElement('option');
      option.value = n;
      option.textContent = n === 1 ? '全长 · 1×' : n + '×';
      zoomInput.append(option);
    }
    const locate = document.createElement('button');
    locate.type = 'button';
    locate.textContent = '定位';
    locate.title = '定位当前播放头';
    locate.setAttribute('aria-label', '定位当前播放头');
    const clock = document.createElement('output');
    clock.className = 'overview-time';
    const hint = document.createElement('span');
    hint.textContent = '拖动调整时间 · 点击定位曲线';
    tools.append(phase, zoomInput, locate, hint, clock);
    root.append(tools);
    const scroll = document.createElement('div');
    scroll.className = 'overview-scroll';
    scroll.setAttribute('aria-label', '组件属性轨道');
    root.append(scroll);
    host.append(root);
    let context = null,
      stamp = '',
      gesture = null,
      suppressClickUntil = 0,
      zoom = 1,
      selectedKey = null;
    const labelWidth = () => (scroll.clientWidth < 500 ? 126 : 145),
      available = () => Math.max(230, scroll.clientWidth - labelWidth() - 24),
      laneWidth = () => available() * zoom;
    const centerPlayhead = () => {
      if (!context) return;
      const at = Math.min(context.duration, context.time);
      scroll.scrollLeft = Math.max(0, (at / context.duration) * laneWidth() - available() / 2);
    };
    const identity = (ref) =>
      [ref.layer, ref.variant, ref.phase, ref.part || 'component', ref.property].join(':');
    const contextIdentity = (ctx) =>
      ctx ? JSON.stringify([ctx.layer, ctx.variant, ctx.phase, ctx.epoch]) : '';
    function markSelection() {
      for (const key of scroll.querySelectorAll('.overview-key')) {
        const on =
          !!selectedKey &&
          key.closest('[data-row]').dataset.row === selectedKey.row &&
          +key.dataset.time === selectedKey.time;
        key.classList.toggle('selected-key', on);
        key.setAttribute('aria-pressed', String(on));
      }
    }
    function focusKey(ref, time, nearest = false) {
      const id = typeof ref === 'string' ? ref : identity(ref),
        row = [...scroll.querySelectorAll('[data-row]')].find((n) => n.dataset.row === id),
        keys = [...(row?.querySelectorAll('.overview-key:not(:disabled)') || [])];
      let key = keys.find((n) => +n.dataset.time === time);
      if (!key && nearest)
        key = keys.sort(
          (a, b) => Math.abs(+a.dataset.time - time) - Math.abs(+b.dataset.time - time),
        )[0];
      if (!key) {
        selectedKey = null;
        summary.focus({ preventScroll: true });
        markSelection();
        return;
      }
      selectedKey = { row: id, time: +key.dataset.time };
      key.focus({ preventScroll: true });
      markSelection();
      const r = key.getBoundingClientRect(),
        v = scroll.getBoundingClientRect(),
        left = v.left + labelWidth() + 12,
        right = v.right - 12,
        top = v.top + 29,
        bottom = v.bottom - 7;
      if (r.left < left) scroll.scrollLeft -= left - r.left;
      else if (r.right > right) scroll.scrollLeft += r.right - right;
      if (r.top < top) scroll.scrollTop -= top - r.top;
      else if (r.bottom > bottom) scroll.scrollTop += r.bottom - bottom;
    }
    function selectTime(ref, time) {
      options.select(ref);
      options.seek(time);
      refresh(true);
      focusKey(ref, time);
    }
    function keyAt(host, time, duration) {
      return Math.max(0, Math.min(100, (time / duration) * 100)) + '%';
    }
    function paintKeys(row, holder, keys, duration) {
      holder.querySelectorAll('.overview-key').forEach((n) => n.remove());
      keys.forEach((key, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'overview-key' + (key.ease === 'hold' ? ' held' : '');
        button.style.left = keyAt(holder, key.time, duration);
        button.disabled = row.locked;
        button.dataset.time = key.time;
        button.setAttribute(
          'aria-label',
          row.name + '，' + seconds(key.time) + '，数值 ' + Number(key.value.toFixed(3)),
        );
        button.title = seconds(key.time) + ' · ' + Number(key.value.toFixed(3));
        const mark = document.createElement('i');
        button.append(mark);
        holder.append(button);
        button.onfocus = () => {
          selectedKey = { row: identity(row.ref), time: key.time };
          markSelection();
        };
        button.onclick = () => {
          if (performance.now() < suppressClickUntil) return;
          selectTime(row.ref, key.time);
        };
        button.onpointerdown = (e) => {
          if (e.button !== 0 || row.locked) return;
          e.preventDefault();
          e.stopPropagation();
          options.select(row.ref);
          if (options.begin(row.ref) === false) return;
          gesture = {
            type: 'key',
            row,
            index,
            keys: structuredClone(keys),
            duration,
            startX: e.clientX,
            rect: holder.getBoundingClientRect(),
            holder,
            context: contextIdentity(context),
          };
          holder.setPointerCapture(e.pointerId);
          button.focus({ preventScroll: true });
        };
        button.onkeydown = (e) => {
          if (
            row.locked ||
            ![
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'Delete',
              'Backspace',
              ' ',
              'Enter',
            ].includes(e.key)
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          if ([' ', 'Enter', 'Home', 'End'].includes(e.key)) {
            selectTime(
              row.ref,
              e.key === 'Home' ? keys[0].time : e.key === 'End' ? keys.at(-1).time : key.time,
            );
            return;
          }
          if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
            const rows = context.rows.filter((r) => !r.locked),
              at = rows.findIndex((r) => identity(r.ref) === identity(row.ref)),
              next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
            if (next) {
              const nearest = next.keys.reduce((a, b) =>
                Math.abs(a.time - key.time) <= Math.abs(b.time - key.time) ? a : b,
              );
              selectTime(next.ref, nearest.time);
            }
            return;
          }
          options.select(row.ref);
          let targetTime = key.time;
          if (e.key === 'Delete' || e.key === 'Backspace')
            options.change(row.ref, (track) => track.keys.splice(index, 1));
          else {
            const delta =
              ((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1) * 1000) /
              (context.fps || 60);
            targetTime = K.availableTime(keys, index, key.time + delta);
            options.change(row.ref, (track) => (track.keys[index].time = targetTime));
            options.seek(targetTime);
          }
          refresh(true);
          focusKey(row.ref, targetTime, true);
        };
      });
    }
    function rebuild(ctx) {
      scroll.style.setProperty('--overview-label-width', labelWidth() + 'px');
      scroll.style.setProperty('--overview-row-width', labelWidth() + laneWidth() + 24 + 'px');
      scroll.replaceChildren();
      const ruler = document.createElement('div');
      ruler.className = 'overview-row overview-ruler';
      const label = document.createElement('span');
      label.textContent = ctx.rows.length + ' 条属性轨道';
      const lane = document.createElement('div');
      lane.className = 'overview-lane';
      const inner = document.createElement('div');
      inner.className = 'overview-inner';
      lane.append(inner);
      const desired = ctx.duration / Math.max(1, laneWidth() / 85),
        step =
          [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000].find(
            (n) => n >= desired,
          ) || 30000;
      scroll.style.setProperty('--overview-grid-size', (step / ctx.duration) * 100 + '%');
      for (let time = 0; time <= ctx.duration; time += step) {
        const n = document.createElement('span');
        n.className = 'overview-tick';
        n.style.left = (time / ctx.duration) * 100 + '%';
        n.textContent = seconds(time);
        inner.append(n);
      }
      ruler.append(label, lane);
      scroll.append(ruler);
      if (!ctx.rows.length) {
        const empty = document.createElement('p');
        empty.className = 'overview-empty';
        empty.textContent =
          '尚无自定义关键帧。选择部件后，在右侧添加属性轨道；原生入场与材质动效仍照常运行。';
        scroll.append(empty);
        return;
      }
      for (const row of ctx.rows) {
        const line = document.createElement('div');
        line.className =
          'overview-row' + (row.disabled ? ' muted' : '') + (row.selected ? ' selected' : '');
        line.dataset.row = identity(row.ref);
        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'overview-label';
        label.textContent = row.name;
        label.title = row.name + (row.locked ? ' · 已锁定' : '') + (row.loop ? ' · 循环' : '');
        label.setAttribute('aria-label', '编辑轨道 ' + row.name);
        label.onclick = () => {
          options.select(row.ref);
          refresh(true);
        };
        if (row.locked) {
          const lock = document.createElement('span');
          lock.textContent = '锁定';
          lock.className = 'overview-lock';
          label.append(lock);
        }
        const lane = document.createElement('div');
        lane.className = 'overview-lane';
        const holder = document.createElement('div');
        holder.className = 'overview-inner';
        lane.append(holder);
        const bar = document.createElement('span');
        bar.className = 'overview-span';
        const first = row.keys[0].time,
          last = row.keys.at(-1).time;
        bar.style.left = (first / ctx.duration) * 100 + '%';
        bar.style.width = ((last - first) / ctx.duration) * 100 + '%';
        holder.append(bar);
        const playhead = document.createElement('span');
        playhead.className = 'overview-playhead';
        holder.append(playhead);
        line._timing = { row, playhead };
        paintKeys(row, holder, row.keys, ctx.duration);
        holder.onpointerdown = (e) => {
          if (e.button !== 0 || e.target.closest('button')) return;
          e.preventDefault();
          const rect = holder.getBoundingClientRect();
          gesture = {
            type: 'seek',
            rect,
            holder,
            duration: ctx.duration,
            context: contextIdentity(context),
          };
          holder.setPointerCapture(e.pointerId);
          options.seek(
            Math.max(0, Math.min(ctx.duration, ((e.clientX - rect.x) / rect.width) * ctx.duration)),
          );
        };
        holder.onpointermove = (e) => {
          const g = gesture;
          if (!g || g.holder !== holder) return;
          if (contextIdentity(options.context()) !== g.context) {
            gesture = null;
            options.end();
            refresh(true);
            return;
          }
          if (g.type === 'seek') {
            options.seek(
              Math.max(
                0,
                Math.min(g.duration, ((e.clientX - g.rect.x) / g.rect.width) * g.duration),
              ),
            );
            refresh();
            return;
          }
          if (Math.abs(e.clientX - g.startX) < 1 && !g.moved) return;
          g.moved = true;
          suppressClickUntil = performance.now() + 200;
          const keys = structuredClone(g.keys),
            key = keys[g.index],
            wanted = key.time + ((e.clientX - g.startX) / g.rect.width) * g.duration;
          key.time = K.availableTime(keys, g.index, wanted);
          if (options.live(g.row.ref, keys) === false) {
            gesture = null;
            options.end();
            refresh(true);
            return;
          }
          g.lastTime = key.time;
          selectedKey = { row: identity(g.row.ref), time: key.time };
          paintKeys(g.row, holder, keys, g.duration);
          markSelection();
          options.seek(key.time);
        };
        holder.onpointerup = holder.onpointercancel = () => {
          if (!gesture || gesture.holder !== holder) return;
          const g = gesture;
          gesture = null;
          if (g.type === 'key') {
            if (!g.moved) options.seek(g.keys[g.index].time);
            options.end();
          }
          refresh(true);
          if (g.type === 'key') focusKey(g.row.ref, g.lastTime ?? g.keys[g.index].time);
        };
        line.append(label, lane);
        scroll.append(line);
      }
    }
    function refresh(force = false) {
      if (!root.open) return;
      const next = options.context();
      if (!next) {
        scroll.replaceChildren();
        contextName.textContent = '选择消息组件或流场';
        tools.hidden = true;
        return;
      }
      tools.hidden = false;
      const previous = contextIdentity(context);
      if (previous !== contextIdentity(next)) selectedKey = null;
      context = next;
      contextName.textContent = next.name;
      phase.hidden = !next.allowExit;
      phase.value = next.phase;
      clock.textContent = seconds(next.time);
      const value = JSON.stringify([
        zoom,
        scroll.clientWidth,
        next.epoch,
        next.layer,
        next.variant,
        next.phase,
        next.duration,
        next.rows.map((r) => [
          identity(r.ref),
          r.name,
          r.locked,
          r.disabled,
          r.selected,
          r.loop,
          r.keys,
        ]),
      ]);
      if (gesture && previous !== contextIdentity(next)) {
        gesture = null;
        options.end();
      }
      if (!gesture && (force || stamp !== value)) {
        const top = scroll.scrollTop,
          left = scroll.scrollLeft,
          active = document.activeElement,
          focus = active?.classList.contains('overview-key')
            ? { row: active.closest('[data-row]').dataset.row, time: +active.dataset.time }
            : null;
        stamp = value;
        rebuild(next);
        scroll.scrollTop = top;
        scroll.scrollLeft = left;
        markSelection();
        if (focus) focusKey(focus.row, focus.time, true);
      }
      for (const el of scroll.querySelectorAll('.overview-row')) {
        if (!el._timing) continue;
        const { row, playhead } = el._timing,
          t = row.loop && row.period > 0 ? next.time % row.period : next.time;
        playhead.style.left = keyAt(null, t, next.duration);
        playhead.classList.toggle('past', t > next.duration);
      }
    }
    zoomInput.onchange = () => {
      if (gesture) {
        gesture = null;
        options.end();
      }
      const center = (scroll.scrollLeft + available() / 2) / laneWidth();
      zoom = +zoomInput.value;
      refresh(true);
      scroll.scrollLeft = Math.max(0, center * laneWidth() - available() / 2);
    };
    locate.onclick = centerPlayhead;
    phase.onchange = () => {
      options.setPhase(phase.value);
      refresh(true);
    };
    root.ontoggle = () => {
      if (!root.open && gesture) {
        gesture = null;
        options.end();
      }
      if (root.open) refresh(true);
    };
    return { refresh };
  }
  window.ThemeTimelineOverview = { install };
})();
