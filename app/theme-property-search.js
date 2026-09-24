/* Search exposes existing native controls; it never changes authored values. */
(() => {
  'use strict';
  let current = null;
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[\s·\/]+/g, '');
  const aliases = {
    希斯特效: 'SC 扭曲 色散 红光 文字折射 影响范围 流动速度 光学重影',
    原生演变动画: '入场时长 启动延迟 缓动曲线',
    特效影响区域: '自定义区域位置 区域宽度 区域高度',
  };
  function clear() {
    if (current) {
      current.query = '';
      if (current.input) current.input.value = '';
    }
  }
  function mount(root, { id, tabs, parts = [], choosePart }) {
    current?.observer?.disconnect();
    if (!current || current.id !== id) current = { id, query: '' };
    const state = current,
      box = document.createElement('div');
    box.className = 'property-search';
    const row = document.createElement('div'),
      input = document.createElement('input'),
      reset = document.createElement('button');
    row.className = 'property-search-row';
    input.type = 'search';
    input.placeholder = '搜索参数或内部部件';
    input.setAttribute('aria-label', '搜索当前图层属性');
    input.value = state.query;
    state.input = input;
    reset.type = 'button';
    reset.textContent = '×';
    reset.setAttribute('aria-label', '清除属性搜索');
    row.append(input, reset);
    box.append(row);
    const status = document.createElement('output');
    status.className = 'property-search-status';
    status.setAttribute('aria-live', 'polite');
    box.append(status);
    const links = document.createElement('div');
    links.className = 'property-search-parts';
    box.append(links);
    tabs.after(box);
    const sections = [...root.querySelectorAll(':scope>.property-section')].map((el) => ({
      el,
      hidden: el.hidden,
      closed: el.classList.contains('section-closed'),
      button: el.querySelector(':scope>h3>button'),
      text: normalize(
        el.textContent +
          ' ' +
          (aliases[el.querySelector(':scope>h3')?.textContent] || '') +
          ' ' +
          [...el.querySelectorAll('[aria-label]')]
            .map((n) => n.getAttribute('aria-label'))
            .join(' '),
      ),
    }));
    const navs = [
        ...root.querySelectorAll(':scope>.part-shortcuts,:scope>.part-shortcuts-compact'),
      ],
      tabButtons = [...tabs.querySelectorAll('button')].map((b) => [
        b,
        b.getAttribute('aria-selected'),
      ]);
    function apply() {
      state.query = input.value;
      const terms = input.value.trim().toLowerCase().split(/\s+/).map(normalize).filter(Boolean),
        active = !!terms.length;
      let count = 0;
      box.classList.toggle('searching', active);
      reset.hidden = !active;
      for (const item of sections) {
        const match = active && terms.every((t) => item.text.includes(t));
        item.el.hidden = active ? !match : item.hidden;
        item.el.classList.toggle('section-closed', active ? false : item.closed);
        item.el.classList.toggle('property-search-match', match);
        if (item.button) {
          item.button.disabled = active;
          item.button.setAttribute('aria-expanded', active || !item.closed);
        }
        if (match) count++;
      }
      for (const n of navs) n.hidden = active;
      for (const [b, selected] of tabButtons)
        b.setAttribute('aria-selected', active ? 'false' : selected);
      links.replaceChildren();
      let partCount = 0;
      if (active)
        for (const part of parts) {
          if (!terms.every((t) => normalize(part.name).includes(t))) continue;
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = '进入部件 · ' + part.name;
          b.onclick = () => {
            clear();
            choosePart(part.id);
          };
          links.append(b);
          partCount++;
        }
      status.textContent = active
        ? count || partCount
          ? '全部属性 · ' + count + ' 组设置' + (partCount ? ' / ' + partCount + ' 个部件' : '')
          : '未找到。可尝试“范围”“字号”“延迟”或选择其他图层。'
        : '';
      status.hidden = !active;
      links.hidden = !partCount;
    }
    input.oninput = apply;
    input.onsearch = apply;
    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        apply();
      }
    };
    reset.onclick = () => {
      input.value = '';
      apply();
      input.focus();
    };
    apply();
    state.observer = new ResizeObserver(() => {
      const tabHeight = tabs.getBoundingClientRect().height;
      box.style.top = Math.max(0, tabHeight - 14) + 'px';
      root.style.setProperty(
        '--property-tools-height',
        tabHeight + box.getBoundingClientRect().height + 14 + 'px',
      );
    });
    state.observer.observe(tabs);
    state.observer.observe(box);
  }
  window.ThemePropertySearch = {
    mount,
    clear,
    reset() {
      current?.observer?.disconnect();
      current = null;
    },
  };
})();
