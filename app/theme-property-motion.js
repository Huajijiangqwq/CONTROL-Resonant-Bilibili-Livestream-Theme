/* Property values follow the rendered timeline. Diamonds edit real track data. */
(() => {
  'use strict';
  const K = ThemeKeyframes;
  function mount(root, { owner, properties, time, value, change, seek, toast, locked = false }) {
    for (const input of root.querySelectorAll('[data-prop],[data-part-prop]')) {
      const property = input.dataset.partProp || input.dataset.prop;
      if (!properties.includes(property) || !['number', 'range'].includes(input.type)) continue;
      const label = input.closest('label');
      if (!label) continue;
      const heading = document.createElement('span');
      heading.className = 'motion-property-label';
      for (const node of [...label.childNodes])
        if (node.nodeType === Node.TEXT_NODE) heading.append(node);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'property-keyframe';
      button.disabled = locked;
      button.dataset.keyframeProperty = property;
      heading.append(button);
      label.prepend(heading);
      label.classList.add('motion-property');
      const at = () => {
        const o = owner(),
          length = K.duration(o),
          ms = time();
        return Math.round(
          o.motionLoop && length > 0
            ? ((ms % length) + length) % length
            : Math.max(0, Math.min(30000, ms)),
        );
      };
      const read = () => {
        const track = owner()?.tracks?.find((t) => t.property === property),
          ms = at();
        return { track, ms, key: track?.keys.find((k) => k.time === ms) };
      };
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (locked) return;
        const { track, ms, key } = read(),
          current = value(property);
        if (track?.enabled !== false && !key && track?.keys.length >= K.maxKeys) {
          toast?.('这条轨道已达 ' + K.maxKeys + ' 帧，请先删除不需要的帧。');
          return;
        }
        seek(ms);
        change((o) => {
          let target = o.tracks.find((t) => t.property === property);
          if (target?.enabled === false) {
            delete target.enabled;
            return;
          }
          if (key && target) {
            target.keys = target.keys.filter((k) => k.time !== key.time);
            if (!target.keys.length) o.tracks = o.tracks.filter((t) => t !== target);
            return;
          }
          if (!target) {
            target = {
              property,
              keys: ms > 0 ? [{ time: 0, value: current, ease: 'smooth' }] : [],
            };
            o.tracks.push(target);
          }
          K.putKey(target, ms, current);
        });
      };
      label.refreshMotion = () => {
        const { track, ms, key } = read(),
          active = track && track.enabled !== false,
          recorded = active && key;
        button.textContent = recorded ? '◆' : '◇';
        button.classList.toggle('animated', !!active);
        button.classList.toggle('recorded', !!recorded);
        const action =
            track?.enabled === false
              ? '启用动画轨道'
              : recorded
                ? '删除当前关键帧'
                : '添加当前关键帧',
          name = K.labels[property] || property;
        button.title = action + ' · ' + name + ' · ' + (ms / 1000).toFixed(2) + ' s';
        button.setAttribute('aria-label', name + ' · ' + action);
        button.setAttribute('aria-description', (ms / 1000).toFixed(2) + ' 秒');
        if (!active || label.contains(document.activeElement)) return;
        const current = value(property);
        if (!Number.isFinite(current)) return;
        input.value = +current.toFixed(2);
        const peer = label.querySelector('[data-property-peer]');
        if (peer) peer.value = +current.toFixed(2);
      };
      label.refreshMotion();
    }
  }
  window.ThemePropertyMotion = {
    mount,
    refresh(root) {
      root.querySelectorAll('.motion-property').forEach((label) => label.refreshMotion?.());
    },
  };
})();
