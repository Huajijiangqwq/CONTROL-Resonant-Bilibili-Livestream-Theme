(async () => {
  'use strict';
  const M = ThemeEditorModel,
    $ = (id) => document.getElementById(id),
    key = 'hiss-theme-editor-v92' + (new URLSearchParams(location.search).has('qa') ? '-qa' : ''),
    legacyKey =
      'hiss-theme-editor-v76' + (new URLSearchParams(location.search).has('qa') ? '-qa' : ''),
    snapKey = key + '-snapshots',
    frame = $('renderFrame');
  const chatMode = location.pathname.endsWith('chat-editor.html'),
    componentTypes = ['normal', 'sc', 'gift', 'fleet'];
  let activeChatId = new URLSearchParams(location.search).get('chat') || '';
  const viewport = () =>
    chatMode
      ? project.layers.find((l) => l.type === 'chat' && l.id === activeChatId) ||
        project.layers.find((l) => l.type === 'chat') || { x: 1444, y: 72, w: 458, h: 908 }
      : { x: 0, y: 0, w: 1920, h: 1080 };
  document.body.classList.toggle('chat-editor', chatMode);
  const paths = {
    cursor: 'M4 3l15 9-7 1-3 7z',
    hand: 'M8 12V6a1.5 1.5 0 013 0v5-7a1.5 1.5 0 013 0v7-5a1.5 1.5 0 013 0v6-3a1.5 1.5 0 013 0v7c0 4-3 6-7 6-3 0-4-2-6-5l-2-3c-1-2 1-3 2-2z',
    type: 'M4 5V3h16v2M12 3v18m-4 0h8',
    image: 'M3 4h18v16H3zM3 16l6-7 6 7 3-4 3 4M17 7h.01',
    video: 'M3 5h13v14H3zM16 9l5-3v12l-5-3',
    square: 'M4 4h16v16H4z',
    line: 'M3 19L21 5',
    grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    help: 'M12 3a9 9 0 100 18 9 9 0 000-18M9 9a3 3 0 016 0c0 2-3 2-3 5M12 17h.01',
    plus: 'M12 4v16M4 12h16',
    search: 'M10 3a7 7 0 100 14 7 7 0 000-14M15 15l6 6',
    folder: 'M3 6h7l2 3h9v11H3z',
    copy: 'M8 8h13v13H8zM16 5V3H3v13h2',
    trash: 'M3 6h18M9 3h6M5 6l1 15h12l1-15M10 10v7M14 10v7',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 100 6 3 3 0 000-6',
    hidden: 'M3 3l18 18M8 6c6-4 12 4 14 6l-4 4M5 8l-3 4c3 4 7 8 13 6',
    lock: 'M6 10h12v11H6zM8 10V6a4 4 0 018 0v4',
    unlock: 'M6 10h12v11H6zM8 10V6a4 4 0 017-2',
    anchor: 'M12 7v14M7 11h10M4 14v3c4 7 12 7 16 0v-3M12 3a2 2 0 100 4 2 2 0 000-4',
    chat: 'M3 4h18v13H9l-5 4v-4H3zM7 8h10M7 12h7',
    clock: 'M12 3a9 9 0 100 18 9 9 0 000-18M12 6v6l4 3',
    music: 'M9 18V5l11-2v13M9 7l11-2M6 15a3 3 0 100 6 3 3 0 000-6M17 13a3 3 0 100 6 3 3 0 000-6',
    bolt: 'M13 2L4 14h7l-1 8 10-13h-7z',
    alignLeft: 'M4 3v18M8 6h12v4H8zM8 14h8v4H8z',
    alignRight: 'M20 3v18M4 6h12v4H4zM8 14h8v4H8z',
    alignCenter: 'M12 3v18M4 6h16v4H4zM7 14h10v4H7z',
    alignTop: 'M3 4h18M6 8h4v12H6zM14 8h4v8h-4z',
    alignBottom: 'M3 20h18M6 4h4v12H6zM14 8h4v8h-4z',
    alignMiddle: 'M3 12h18M6 4h4v16H6zM14 7h4v10h-4z',
  };
  const icons = {
    chat: 'chat',
    resonance: 'bolt',
    background: 'square',
    grain: 'grid',
    hiss: 'bolt',
    game: 'image',
    normal: 'chat',
    sc: 'bolt',
    gift: 'folder',
    fleet: 'anchor',
    header: 'type',
    host: 'type',
    topic: 'type',
    status: 'eye',
    logos: 'type',
    timer: 'clock',
    music: 'music',
    text: 'type',
    image: 'image',
    video: 'video',
    shape: 'square',
    border: 'square',
    line: 'line',
    group: 'folder',
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.classList.add('icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', paths[name] || paths.square);
    svg.append(path);
    return svg;
  }
  document.querySelectorAll('[data-icon]').forEach((n) => n.append(icon(n.dataset.icon)));
  let stored, initialDraft;
  try {
    initialDraft = await ThemeEditorStorage.draft(key);
    stored = initialDraft?.document || (await ThemeEditorStorage.get(legacyKey));
  } catch {}
  let project;
  try {
    const raw = stored || JSON.parse(localStorage.getItem(key) || localStorage.getItem(legacyKey));
    if (raw?.format !== 'control-theme' || !Array.isArray(raw.layers)) throw Error();
    project = M.normalize(raw);
    if (raw.editorVersion === undefined && raw.layers.length) {
      const combined = /完整主题|游戏优先/.test(raw.name || ''),
        template = M.create(/游戏优先/.test(raw.name || '') ? 'game' : 'classic');
      project.composition = combined ? 'feed' : 'layers';
      for (const layer of template.layers)
        if (
          !project.layers.some((l) => l.id === layer.id) &&
          ['chat', 'chat-border'].includes(layer.id)
        )
          project.layers.push(layer);
      for (const l of project.layers)
        if (componentTypes.includes(l.type) || ['chat-title', 'chat-rule'].includes(l.id)) {
          l.scope = 'chat';
          if (!componentTypes.includes(l.type)) l.attach = 'chat';
        }
      if (combined)
        for (const l of project.layers)
          if (componentTypes.includes(l.type)) {
            l.contentWidth = 0;
            l.fontSize = 28;
            l.effectScope = 'chat';
          }
    }
  } catch {
    project = M.create('classic');
  }
  function chatSlots(doc) {
    return doc.layers.some((l) => l.type === 'chat')
      ? 0
      : 1 +
          ['chat-border', 'chat-title', 'chat-rule'].filter(
            (id) => !doc.layers.some((l) => l.id === id),
          ).length;
  }
  function roomForLayers(count, doc = project) {
    const available = M.limits.layers - doc.layers.length;
    if (count <= available) return true;
    toast(
      '这项操作需要 ' +
        count +
        ' 个图层位置，目前剩余 ' +
        available +
        ' 个；请先删除不需要的图层（上限 ' +
        M.limits.layers +
        ' 个）。',
    );
    return false;
  }
  function roomForPart(l) {
    if (l.parts.length < M.limits.parts) return true;
    toast('当前组件已达 ' + M.limits.parts + ' 个部件；请先删除不需要的自定义部件。');
    return false;
  }
  function ensureChatContainer(doc, point, show = false) {
    let chat = doc.layers.find((l) => l.type === 'chat');
    const fresh = !chat;
    if (fresh && doc.layers.length + chatSlots(doc) > M.limits.layers) return null;
    if (fresh) {
      const template = M.create('classic'),
        base = template.layers.find((l) => l.type === 'chat');
      chat = M.layer({
        ...base,
        id: doc.layers.some((l) => l.id === base.id) ? 'chat-' + crypto.randomUUID() : base.id,
        ...(point || {}),
      });
      doc.layers.push(chat);
      for (const child of template.layers.filter((l) =>
        ['chat-border', 'chat-title', 'chat-rule'].includes(l.id),
      )) {
        const old = doc.layers.find((l) => l.id === child.id);
        if (old?.visible) continue;
        const placement = {
          x: chat.x + child.x - base.x,
          y: chat.y + child.y - base.y,
          w: child.w,
          h: child.h,
          scope: 'chat',
          attach: 'chat',
          visible: true,
        };
        if (old) Object.assign(old, placement);
        else doc.layers.push({ ...child, ...placement });
      }
    } else if (point) {
      chat.x = M.num(point.x, 0, 1920 - chat.w, chat.x);
      chat.y = M.num(point.y, 0, 1080 - chat.h, chat.y);
    }
    if (show) chat.visible = true;
    return chat;
  }
  function prepareProject(value) {
    const doc = M.normalize(value);
    if (chatMode && !ensureChatContainer(doc))
      queueMicrotask(() =>
        toast('当前图层已满，无法补入完整弹幕容器。请返回直播画布精简图层后再添加弹幕区。'),
      );
    return doc;
  }
  const syncBase = M.normalize(project);
  project = prepareProject(project);
  const editingFeed = () => chatMode || project.composition === 'feed';
  const renderDocument = () => {
    if (!chatMode) return project;
    const doc = ThemeInstances.project(project, viewport().id);
    return {
      ...doc,
      layers: [
        ...doc.layers,
        ...project.layers.filter((l) => l.standalone && !doc.layers.some((x) => x.id === l.id)),
      ],
    };
  };
  let attachmentState = ThemeAttachments.snapshot(project);
  function resetAttachments() {
    attachmentState = ThemeAttachments.snapshot(project);
  }
  function reflowAttachments() {
    ThemeAttachments.reflow(project, attachmentState);
  }
  const activeVariant = {};
  let selectedPart = null,
    trackPhase = 'entry';
  const openParts = new Set(),
    openGroups = new Set(),
    sectionState = new Map();
  let layerQuery = '',
    propertyTab = 'all';
  const undoStore = ThemeEditorHistory.create(60);
  let documentEpoch = 0,
    gestureView = null;
  let selected = new Set(),
    zoom = 'fit',
    scale = 0.5,
    pan = { x: 0, y: 0 },
    tool = 'select',
    space = false,
    gesture = null,
    ready = false,
    renderPending = false,
    saveTimer,
    toastTimer,
    category = 'all',
    paused = false,
    dragLayer = null,
    inlineId = null;
  function styleLayer(l) {
    if (!l) return l;
    const key = activeVariant[l.id],
      v = l.variants?.[key];
    if (!v) return l;
    return new Proxy(l, {
      get(t, p) {
        return M.variantKeys.includes(p) ? v[p] : t[p];
      },
      set(t, p, value) {
        if (M.variantKeys.includes(p)) v[p] = value;
        else t[p] = value;
        return true;
      },
    });
  }
  const selectedLayers = () => project.layers.filter((l) => selected.has(l.id)).map(styleLayer),
    editable = () =>
      selectedLayers().filter((l) => !M.effective(project, l).locked && l.type !== 'group');
  const propertyTargets = (key) =>
    selectedLayers().filter(
      (l) =>
        !selected.has(l.parent) &&
        (['locked', 'name'].includes(key) || !M.effective(project, l).locked),
    );
  function expanded(ids = selected) {
    return project.layers.filter((l) => ids.has(l.id) || ids.has(l.parent));
  }
  function toast(t) {
    $('toast').textContent = t;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), 3300);
  }
  function rememberSetting(id) {
    if (/^live[A-Z]/.test(id) || id === 'messageSource') return;
    if (Object.hasOwn(project.settings, id)) return;
    const source = frame.contentDocument?.getElementById(id);
    if (
      source &&
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(source.tagName) &&
      source.type !== 'file'
    )
      project.settings[id] = source.type === 'checkbox' ? source.checked : source.value;
  }
  function checkpoint() {
    undoStore.checkpoint(project);
    syncUndo();
  }
  function syncUndo() {
    $('undo').disabled = !undoStore.canUndo;
    $('redo').disabled = !undoStore.canRedo;
  }
  let syncNotice,
    timelineOverview = null;
  function showDraftConflicts(items) {
    if (!items.length) {
      if (syncNotice) syncNotice.hidden = true;
      return;
    }
    if (!syncNotice) {
      syncNotice = document.createElement('div');
      syncNotice.className = 'draft-conflict';
      syncNotice.setAttribute('role', 'status');
      document.body.append(syncNotice);
    }
    syncNotice.hidden = false;
    syncNotice.replaceChildren();
    const text = document.createElement('span');
    text.textContent = items.some((c) => c.reason === 'capacity')
      ? '两页新增内容合并后超过容量。请选择保留哪一页的该组图层或部件；双方版本已留在文件菜单的恢复稿中。'
      : '另一编辑器也修改了 ' + items.length + ' 处相同参数。当前修改已留在文件菜单的恢复稿中。';
    syncNotice.append(text);
    for (const [preference, label] of [
      ['local', '保留本页冲突项'],
      ['remote', '采用另一页冲突项'],
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => draftSync.resolve(preference).catch((e) => toast(e.message));
      syncNotice.append(b);
    }
  }
  const draftSync = ThemeEditorSync.create({
    key,
    initial: initialDraft,
    base: syncBase,
    get: () => project,
    apply(value) {
      checkpoint();
      project = M.normalize(value);
      resetAttachments();
      update();
    },
    status(text) {
      $('saveState').textContent = text;
    },
    conflict: showDraftConflicts,
  });
  async function save() {
    clearTimeout(saveTimer);
    undoStore.commit(project);
    syncUndo();
    return draftSync.save();
  }

  let syncLayoutDuration = 0;
  function sendRender() {
    if (renderPending || !ready) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      try {
        frame.contentWindow.ThemeRenderer.apply(renderDocument());
        window.dispatchEvent(
          new CustomEvent('theme-document-change', {
            detail: { document: project, duration: syncLayoutDuration },
          }),
        );
        syncLayoutDuration = 0;
      } catch (e) {
        $('saveState').textContent = '渲染异常';
        toast(e.message);
      }
    });
  }
  function update({ fields = true, layers = true } = {}) {
    syncChatPicker();
    reflowAttachments();
    project = M.normalize(project);
    undoStore.commit(project);
    resetAttachments();
    for (const l of project.layers)
      if (activeVariant[l.id] && !l.variants?.[activeVariant[l.id]]) activeVariant[l.id] = '';
    if (chatMode && !gesture && !partGesture && !effectGesture) fit();
    $('compositionMode').value = project.composition;
    selected = new Set([...selected].filter((id) => project.layers.some((l) => l.id === id)));
    sendRender();
    selectionUI();
    if (layers) layersUI();
    if (fields) propertiesUI();
    $('projectName').value = project.name;
    $('saveState').textContent = '保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
    syncUndo();
  }
  function transact(fn) {
    checkpoint();
    const before = project;
    fn();
    if (before !== project) {
      documentEpoch++;
      project = prepareProject(project);
      resetAttachments();
    }
    update();
  }
  function undo(redo = false) {
    const previous = undoStore.undo(project, redo);
    if (!previous) {
      syncUndo();
      return;
    }
    documentEpoch++;
    project = M.normalize(previous);
    resetAttachments();
    update();
  }
  function select(ids) {
    if (project.layers.find((l) => l.id === ids[0])?.type !== selectedLayers()[0]?.type)
      propertyTab = 'all';
    selectedPart = null;
    for (const id of ids) {
      const l = project.layers.find((x) => x.id === id);
      if (l?.parent) openGroups.add(l.parent);
    }
    selected = new Set(ids);
    selectionUI();
    layersUI();
    propertiesUI();
  }
  function patch(values, { live = false } = {}) {
    if (!live) checkpoint();
    for (const l of expanded()) if (!M.effective(project, l).locked) Object.assign(l, values);
    update({ fields: !live, layers: !live });
  }
  function group() {
    const items = expanded().filter((l) => l.type !== 'group');
    if (items.length < 2) {
      toast('先选中两个或更多图层。');
      return;
    }
    const chosen = new Set(items.map((l) => l.id)),
      removed = project.layers.filter(
        (l) =>
          l.type === 'group' && !project.layers.some((c) => c.parent === l.id && !chosen.has(c.id)),
      ).length;
    if (!roomForLayers(1 - removed)) return;
    transact(() => {
      const id = 'group-' + Date.now().toString(36),
        r = M.bounds(items),
        g = M.layer({ id, type: 'group', name: '新图层组', ...r });
      project.layers.push(g);
      for (const l of items) {
        const visual = M.effective(project, l);
        Object.assign(l, {
          opacity: visual.opacity,
          visible: visual.visible,
          locked: visual.locked,
          parent: id,
        });
      }
      project.layers = project.layers.filter(
        (l) => l.type !== 'group' || l.id === id || project.layers.some((c) => c.parent === l.id),
      );
      selected = new Set([id]);
    });
  }
  function ungroup() {
    const parents = new Set(
      selectedLayers()
        .map((l) => (l.type === 'group' ? l.id : l.parent))
        .filter(Boolean),
    );
    if (!parents.size) return;
    transact(() => {
      for (const l of project.layers)
        if (parents.has(l.parent)) {
          const visual = M.effective(project, l);
          Object.assign(l, {
            opacity: visual.opacity,
            visible: visual.visible,
            locked: visual.locked,
            parent: '',
          });
          selected.add(l.id);
        }
      project.layers = project.layers.filter((l) => !parents.has(l.id));
    });
  }
  function remove() {
    if (selectedPart) {
      deletePart();
      return;
    }
    const ids = new Set(
      expanded()
        .filter((l) => !M.effective(project, l).locked)
        .map((l) => l.id),
    );
    for (const l of project.layers)
      if (l.type !== 'chat' && ids.has(ThemeInstances.owner(project, l)?.id)) ids.add(l.id);
    if (!ids.size) {
      toast('先选择一个未锁定的图层。');
      return;
    }
    transact(() => (project.layers = project.layers.filter((l) => !ids.has(l.id))));
  }
  function duplicate() {
    if (selectedPart) {
      duplicatePart();
      return;
    }
    const source = expanded().filter((l) => l.type !== 'group'),
      result = ThemeInstances.clone(project, source, () => 'layer-' + crypto.randomUUID());
    if (!source.length || !roomForLayers(result.items.length)) return;
    transact(() => {
      project.layers.push(...result.items);
      selected = new Set(result.selection);
    });
  }

  function order(direction) {
    if (selectedPart) {
      orderPart(direction);
      return;
    }
    transact(() => {
      const ids = new Set(expanded().map((l) => l.id));
      if (direction > 0) {
        for (let i = project.layers.length - 2; i >= 0; i--)
          if (ids.has(project.layers[i].id) && !ids.has(project.layers[i + 1].id))
            [project.layers[i], project.layers[i + 1]] = [project.layers[i + 1], project.layers[i]];
      } else
        for (let i = 1; i < project.layers.length; i++)
          if (ids.has(project.layers[i].id) && !ids.has(project.layers[i - 1].id))
            [project.layers[i], project.layers[i - 1]] = [project.layers[i - 1], project.layers[i]];
    });
  }
  function toggle(prop) {
    const items = selectedLayers();
    if (!items.length) return;
    transact(() => {
      const target = !items.every((l) => l[prop]);
      items.forEach((l) => (l[prop] = target));
    });
  }
  function add(type, point) {
    const existing = project.layers.find((l) => l.type === type);
    if (M.builtin.includes(type) && existing) {
      const result = ThemeInstances.clone(
        project,
        [existing],
        () => 'layer-' + crypto.randomUUID(),
      );
      if (!roomForLayers(result.items.length)) return;
      transact(() => {
        const root = result.items.find((l) => l.id === result.selection[0]),
          dx = point ? point.x - root.x : 0,
          dy = point ? point.y - root.y : 0;
        for (const l of result.items) {
          l.x += dx;
          l.y += dy;
          l.visible = true;
        }
        project.layers.push(...result.items);
        selected = new Set(result.selection);
      });
      return;
    }
    if (type === 'chat') {
      if (!roomForLayers(chatSlots(project))) return;
      transact(() => {
        const chat = ensureChatContainer(project, point, true);
        chat.locked = false;
        if (!chatMode) project.composition = 'feed';
        selected = new Set([chat.id]);
      });
      return;
    }
    if (chatMode && !point && !M.builtin.includes(type)) {
      const v = viewport();
      point = { x: v.x + 24, y: v.y + v.h * 0.4 };
    }
    if (!roomForLayers(1)) return;
    transact(() => {
      let l;
      if (M.builtin.includes(type)) l = M.create('classic').layers.find((x) => x.type === type);
      else
        l = M.layer({
          id: 'layer-' + crypto.randomUUID(),
          type,
          name: M.labels[type],
          x: point?.x ?? 380,
          y: point?.y ?? 320,
          w: ['image', 'video', 'shape'].includes(type) ? 400 : type === 'line' ? 320 : 520,
          h: ['image', 'video', 'shape'].includes(type)
            ? 240
            : type === 'line'
              ? 3
              : type === 'border'
                ? 280
                : 90,
          fill: type === 'line' ? '#ce5146' : '#171b19',
          strokeWidth: type === 'border' ? 1.5 : 0,
          text: '新的通讯',
          size: 40,
        });
      if (point) {
        l.x = point.x;
        l.y = point.y;
      }
      if (type === 'resonance')
        Object.assign(l, {
          x: point?.x ?? 950,
          y: point?.y ?? 0,
          w: 710,
          h: 420,
          anchorX: 483,
          anchorY: 73,
          flowColor: '#b80504',
        });
      l.visible = true;
      if (chatMode && type !== 'chat') {
        l.scope = 'chat';
        l.chatId = viewport().id;
        if (!M.builtin.includes(type)) {
          const v = viewport();
          l.w = Math.min(l.w, v.w - 48);
          l.h = Math.min(l.h, v.h * 0.6);
          l.attach = 'chat';
          if (type === 'resonance') {
            l.anchorX = l.w * 0.5;
            l.anchorY = l.h * 0.5;
            l.avoidGame = false;
          }
        }
      }
      project.layers.push(l);
      selected = new Set([l.id]);
    });
  }
  function detachGameFrame(id) {
    const l = project.layers.find((x) => x.id === id);
    if (!l || l.type !== 'game' || M.effective(project, l).locked) return;
    if (!roomForLayers(2)) return;
    transact(() => {
      const common = {
        type: 'border',
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        parent: l.parent,
        stroke: l.stroke,
        opacity: l.opacity,
        brightness: l.brightness,
        blend: l.blend,
      };
      const outline = M.layer({
          ...common,
          id: 'game-outline-' + crypto.randomUUID(),
          name: '游戏外框',
          strokeWidth: l.strokeWidth,
          grainAmount: 0.12,
          traceAmount: 0.3,
        }),
        corners = M.layer({
          ...common,
          id: 'game-corners-' + crypto.randomUUID(),
          name: '游戏四角',
          borderStyle: 'corners',
          cornerLength: 20,
          cornerInset: 16,
          strokeWidth: 1,
          grainAmount: 0,
          opacity: l.opacity * 0.9,
        });
      project.layers.splice(project.layers.indexOf(l) + 1, 0, outline, corners);
      l.frameVisible = false;
      selectedPart = null;
      selected = new Set([outline.id]);
    });
  }
  function assetsUI() {
    const items = [
      'chat',
      'resonance',
      'background',
      'grain',
      'hiss',
      'logos',
      'normal',
      'sc',
      'gift',
      'fleet',
      'host',
      'topic',
      'status',
      'timer',
      'music',
      'game',
      'text',
      'image',
      'video',
      'shape',
      'line',
      'border',
    ];
    $('assets').replaceChildren();
    for (const type of items) {
      if (
        chatMode &&
        ![
          'chat',
          'resonance',
          'normal',
          'sc',
          'gift',
          'fleet',
          'text',
          'image',
          'video',
          'shape',
          'line',
          'border',
        ].includes(type)
      )
        continue;
      if (
        (category === 'theme' && !M.builtin.includes(type)) ||
        (category === 'basic' && M.builtin.includes(type)) ||
        !M.labels[type].toLowerCase().includes($('assetSearch').value.toLowerCase())
      )
        continue;
      const b = document.createElement('button');
      b.className = 'asset';
      b.draggable = true;
      b.setAttribute('aria-label', '添加素材 ' + M.labels[type]);
      const p = document.createElement('span');
      p.className = 'asset-preview';
      p.dataset.type = type;
      if (type === 'logos') p.textContent = 'CONTROL 共振';
      else if (type === 'text') p.textContent = 'Aa';
      else p.append(icon(icons[type]));
      const title = document.createElement('span');
      title.className = 'asset-title';
      title.textContent = M.labels[type];
      b.append(p, title);
      b.onclick = () => add(type);
      b.ondragstart = (e) => {
        e.dataTransfer.setData('application/x-control-asset', type);
        e.dataTransfer.effectAllowed = 'copy';
      };
      $('assets').append(b);
    }
  }
  function layersUI() {
    const list = $('layers');
    list.replaceChildren();
    const roots = [...project.layers].reverse().filter((l) => !l.parent),
      ordered = roots.flatMap((l) => [
        l,
        ...[...project.layers].reverse().filter((c) => c.parent === l.id),
      ]);
    for (const base of ordered) {
      const l = styleLayer(base);
      if (
        chatMode &&
        !l.standalone &&
        l.id !== viewport().id &&
        ThemeInstances.owner(project, l)?.id !== viewport().id
      )
        continue;
      if (l.parent && !openGroups.has(l.parent) && !layerQuery) continue;
      const match = l.name.toLowerCase().includes(layerQuery),
        partMatch = l.parts?.some((p) => p.name.toLowerCase().includes(layerQuery));
      if (layerQuery && !match && !partMatch) continue;
      const eff = M.effective(project, l),
        row = document.createElement('div');
      row.className = 'layer-row' + (l.parent ? ' child' : '') + (!eff.visible ? ' dim' : '');
      row.dataset.layer = l.id;
      row.role = 'option';
      row.setAttribute('aria-selected', selected.has(l.id));
      row.setAttribute('aria-label', l.name);
      row.draggable = true;
      row.tabIndex = 0;
      const mark = document.createElement('span');
      mark.className = 'layer-icon';
      mark.append(icon(icons[l.type]));
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = l.name;
      if (l.parts?.length || l.type === 'group') {
        const toggle = document.createElement('button'),
          opened = (l.type === 'group' ? openGroups : openParts).has(l.id);
        toggle.className = 'tree-toggle';
        toggle.textContent = opened ? '⌄' : '›';
        toggle.setAttribute('aria-label', (opened ? '折叠' : '展开') + ' ' + l.name);
        toggle.setAttribute('aria-expanded', opened);
        toggle.onclick = (e) => {
          e.stopPropagation();
          const set = l.type === 'group' ? openGroups : openParts;
          set.has(l.id) ? set.delete(l.id) : set.add(l.id);
          layersUI();
        };
        row.append(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'tree-spacer';
        row.append(spacer);
      }
      row.append(mark, name);
      for (const [prop, label, graphic] of [
        ['locked', l.locked ? '解锁' : '锁定', l.locked ? 'lock' : 'unlock'],
        ['visible', l.visible ? '隐藏' : '显示', l.visible ? 'eye' : 'hidden'],
      ]) {
        const b = document.createElement('button');
        b.title = label;
        b.setAttribute('aria-label', label + ' ' + l.name);
        b.append(icon(graphic));
        b.onclick = (e) => {
          e.stopPropagation();
          transact(() => {
            const current = project.layers.find((x) => x.id === l.id);
            current[prop] = !current[prop];
          });
        };
        row.append(b);
      }
      row.onclick = (e) => {
        const next = e.shiftKey || e.ctrlKey ? new Set(selected) : new Set();
        if (next.has(l.id)) next.delete(l.id);
        else next.add(l.id);
        select([...next]);
      };
      row.ondblclick = () => {
        select([l.id]);
        $('propertyFields').querySelector('[data-prop=name]')?.focus();
      };
      row.onkeydown = (e) => {
        if (e.key === 'Enter') row.click();
      };
      row.ondragstart = (e) => {
        dragLayer = l.id;
        e.dataTransfer.setData('text/x-control-layer', l.id);
      };
      row.ondragover = (e) => {
        e.preventDefault();
        row.classList.add('drag-target');
      };
      row.ondragleave = () => row.classList.remove('drag-target');
      row.ondrop = (e) => {
        e.preventDefault();
        row.classList.remove('drag-target');
        const id = e.dataTransfer.getData('text/x-control-layer');
        if (id && id !== l.id)
          transact(() => {
            const block = project.layers.filter((x) => x.id === id || x.parent === id);
            if (!block.length || block.some((x) => x.id === l.id)) return;
            const ids = new Set(block.map((x) => x.id));
            project.layers = project.layers.filter((x) => !ids.has(x.id));
            let at = -1;
            project.layers.forEach((x, i) => {
              if (x.id === l.id || x.parent === l.id) at = i;
            });
            project.layers.splice(at + 1, 0, ...block);
          });
      };
      row.oncontextmenu = (e) => {
        e.preventDefault();
        if (selectedPart || !selected.has(l.id)) select([l.id]);
        context(e.clientX, e.clientY);
      };
      list.append(row);
      if (l.parts?.length && (openParts.has(l.id) || (layerQuery && partMatch))) partRows(list, l);
    }
  }
  function field(
    container,
    {
      key,
      label,
      type = 'number',
      options,
      min,
      max,
      step = 1,
      full = false,
      value,
      setting = false,
      toStored = (v) => v,
    },
  ) {
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.className = (full ? 'full ' : '') + (type === 'checkbox' ? 'boolean' : '');
    let input = document.createElement(
      type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input',
    );
    if (type === 'select')
      for (const [v, n] of options) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = n;
        input.append(o);
      }
    else if (type === 'textarea') input.rows = 3;
    else input.type = type;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.step = step;
    input.dataset.prop = key;
    input.setAttribute('aria-label', label);
    if (type === 'checkbox') input.checked = value;
    else
      input.value =
        key === 'src' && String(value).startsWith('data:')
          ? ''
          : typeof value === 'number'
            ? +value.toFixed(2)
            : (value ?? '');
    if (key === 'src')
      input.placeholder = String(value).startsWith('data:')
        ? '素材已嵌入，可输入网址替换'
        : '网址或主题文件夹内的相对路径';
    input.disabled =
      !setting &&
      key !== 'locked' &&
      key !== 'name' &&
      selectedLayers().length > 0 &&
      selectedLayers().every((l) => M.effective(project, l).locked);
    lab.append(input);
    container.append(lab);
    let dirty = false;
    input.addEventListener('focus', () => (dirty = false));
    const commit = () => {
      if (!dirty) {
        if (setting) rememberSetting(key);
        checkpoint();
        for (const l of selectedLayers())
          if (trackList(l, l)?.some((t) => t.property === key && t.enabled !== false))
            seekTracks(l, trackTime(l));
        dirty = true;
      }
      const v = toStored(
        type === 'checkbox'
          ? input.checked
          : type === 'number' || type === 'range'
            ? Number(input.value)
            : input.value,
      );
      if (type === 'number' && (!input.value.trim() || !Number.isFinite(v))) return;
      if (setting) project.settings[key] = v;
      else
        for (const l of propertyTargets(key)) {
          if (l.type === 'group') {
            const children = project.layers.filter(
              (x) => x.parent === l.id && !M.effective(project, x).locked,
            );
            if (key === 'x' || key === 'y') {
              const d = v - l[key];
              for (const child of children) child[key] += d;
            }
            if (key === 'w' || key === 'h') {
              const axis = key === 'w' ? 'x' : 'y',
                ratio = v / l[key];
              for (const child of children) {
                child[axis] = l[axis] + (child[axis] - l[axis]) * ratio;
                child[key] *= ratio;
              }
            }
            if (key === 'rotation') {
              const a = ((v - l.rotation) * Math.PI) / 180,
                cx = l.x + l.w / 2,
                cy = l.y + l.h / 2;
              for (const child of children) {
                const x = child.x + child.w / 2 - cx,
                  y = child.y + child.h / 2 - cy;
                child.x = cx + x * Math.cos(a) - y * Math.sin(a) - child.w / 2;
                child.y = cy + x * Math.sin(a) + y * Math.cos(a) - child.h / 2;
                child.rotation += v - l.rotation;
              }
            }
          }
          if (l.type === 'sc' && key === 'fxCustom' && v && !l.fxSeeded) {
            const fx = scBaseFX(l);
            if (fx) {
              for (const [prop, native] of Object.entries(ThemeKeyframes.scMap))
                l[prop] = fx[native];
              l.fxSeeded = true;
            }
          }
          setAnimated(l, key, v, l);
          if (['game', 'music'].includes(l.type) && key === 'h')
            l.w = v * (l.type === 'game' ? 16 / 9 : 24 / 7);
        }
      update({ fields: false, layers: key === 'name' || key === 'visible' || key === 'locked' });
    };
    input.addEventListener('input', (e) => {
      if (!e.isComposing) commit();
    });
    input.addEventListener('compositionend', commit);
    input.addEventListener('change', () => {
      commit();
      dirty = false;
      if (!['text', 'name', 'src'].includes(key)) propertiesUI();
    });
    return input;
  }

  function propertiesUI() {
    return inspectFrame(renderPropertiesUI);
  }
  function renderPropertiesUI() {
    buildPropertiesUI();
    ThemePropertyInputs.decorate($('propertyFields'));
    const root = $('propertyFields'),
      l = selectedLayers()[0];
    if (!l) {
      ThemePropertySearch.reset();
      return;
    }
    if (selectedLayers().length === 1) mountPropertyMotion(root, l);
    const sections = [...root.querySelectorAll(':scope>.property-section')];
    for (const section of sections) {
      const h = section.querySelector(':scope>h3');
      if (!h) continue;
      const title = h.textContent,
        kind = /关键帧|演变|退场|节奏|曲线|特效|干扰|流场|流体|共振材质/.test(title)
          ? 'motion'
          : /外观|质感|样式|颜色|素材|背景/.test(title)
            ? 'style'
            : 'layout';
      section.dataset.category = kind;
      section.hidden = propertyTab !== 'all' && propertyTab !== kind;
      const id = (selectedPart ? 'part:' : l.type + ':') + title,
        closed = sectionState.get(id) ?? ['更多设置', '质感'].includes(title);
      section.classList.toggle('section-closed', closed);
      const b = document.createElement('button');
      b.className = 'section-toggle';
      b.setAttribute('aria-expanded', !closed);
      b.textContent = title;
      h.replaceChildren(b);
      b.onclick = () => {
        const next = !section.classList.contains('section-closed');
        section.classList.toggle('section-closed', next);
        b.setAttribute('aria-expanded', !next);
        sectionState.set(id, next);
      };
    }
    const tabs = document.createElement('div');
    tabs.className = 'property-tabs';
    tabs.setAttribute('role', 'tablist');
    for (const [value, label] of [
      ['all', '全部'],
      ['layout', '排版'],
      ['style', '外观'],
      ['motion', '动画 / 特效'],
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', propertyTab === value);
      b.onclick = () => {
        ThemePropertySearch.clear();
        propertyTab = value;
        propertiesUI();
      };
      tabs.append(b);
    }
    root.prepend(tabs);
    variantToolbar(root, l, tabs);
    if (l.parts?.length && !selectedPart) {
      const nav = document.createElement('div');
      nav.className = 'part-shortcuts';
      const note = document.createElement('p');
      note.textContent = '编辑内部部件';
      nav.append(note);
      for (const part of l.parts) {
        const b = document.createElement('button');
        b.textContent = part.name;
        b.className = part.visible ? '' : 'muted';
        b.setAttribute('aria-label', '编辑部件 ' + part.name);
        b.onclick = () => choosePart(l.id, part.id);
        nav.append(b);
      }
      if (propertyTab === 'motion' || propertyTab === 'style') {
        const compact = document.createElement('details');
        compact.className = 'part-shortcuts-compact';
        const summary = document.createElement('summary');
        summary.textContent = '编辑内部部件 · ' + l.parts.length + ' 项';
        compact.append(summary, nav);
        tabs.after(compact);
      } else tabs.after(nav);
    }
    if (propertyTab !== 'all' && !sections.some((s) => !s.hidden)) {
      const note = document.createElement('p');
      note.className = 'property-note';
      note.textContent = '这个图层没有此类属性。';
      root.append(note);
    }
    ThemePropertySearch.mount(root, {
      id: l.id + ':' + (selectedPart || ''),
      tabs,
      parts: selectedPart ? [] : l.parts,
      choosePart: (id) => choosePart(l.id, id),
    });
  }

  function variantToolbar(root, l, tabs) {
    if (!M.variantNames(l.type).length) return;
    const strip = document.createElement('div');
    strip.className = 'variant-toolbar';
    const title = document.createElement('label');
    title.textContent = '正在编辑';
    const choose = document.createElement('select');
    choose.setAttribute('aria-label', '组件样式档位');
    const opts =
      l.type === 'fleet'
        ? [
            ['', '通用样式'],
            ['captain', '舰长'],
            ['admiral', '提督'],
            ['governor', '总督'],
          ]
        : [
            ['', '通用样式'],
            ...['2', '30', '50', '100', '500', '1000', '2000'].map((v, i) => [
              String(i),
              'SC ¥ ' + v,
            ]),
          ];
    for (const [key, name] of opts) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name + (key && l.variants?.[key] ? ' · 独立' : '');
      choose.append(option);
    }
    choose.value = activeVariant[l.id] || '';
    choose.disabled = M.effective(project, l).locked;
    choose.onchange = () => {
      const key = choose.value,
        base = project.layers.find((x) => x.id === l.id);
      if (key && !base.variants[key])
        transact(() => (base.variants[key] = M.componentSnapshot(base)));
      activeVariant[l.id] = key;
      selectedPart = null;
      update();
      $('testKind').value = l.type;
      if (l.type === 'fleet' && key) $('testRank').value = key;
      if (l.type === 'sc' && key) $('testTier').value = key;
      $('testKind').onchange();
      startTimeline();
    };
    title.append(choose);
    strip.append(title);
    if (activeVariant[l.id]) {
      const restore = document.createElement('button');
      restore.textContent = '恢复通用';
      restore.disabled = M.effective(project, l).locked;
      restore.onclick = () =>
        transact(() => {
          const base = project.layers.find((x) => x.id === l.id);
          delete base.variants[activeVariant[l.id]];
          activeVariant[l.id] = '';
        });
      strip.append(restore);
    }
    const hint = document.createElement('p');
    hint.textContent = activeVariant[l.id]
      ? '此档位独立保存；位置与画布尺寸仍共用。'
      : '未独立设置的等级使用通用样式。';
    strip.append(hint);
    tabs.after(strip);
  }
  let guideRequest = 0;
  async function jumpGuide(task) {
    const request = ++guideRequest,
      epoch = documentEpoch,
      allowed = (l) =>
        !chatMode || l.scope === 'chat' || l.type === 'chat' || componentTypes.includes(l.type);
    let layer =
      task.types
        .flatMap((type) => project.layers.filter((l) => l.type === type && allowed(l)))
        .find((l) => l.visible) ||
      task.types.flatMap((type) => project.layers.filter((l) => l.type === type && allowed(l)))[0];
    if (!layer) {
      toast('当前画布没有此组件，可从素材栏添加。');
      return;
    }
    const valid = () => request === guideRequest && epoch === documentEpoch,
      wait = () => new Promise((r) => setTimeout(r, 30)),
      targetSection = layer.type === 'hiss' && task.id === 'flow' ? '共振材质' : task.section;
    if (componentTypes.includes(layer.type) && ready && layer.visible) {
      const oldId = trackMessage(layer)?.id;
      $('testKind').value = layer.type;
      $('testKind').onchange();
      startTimeline();
      for (
        let i = 0;
        i < 60 && valid() && (!trackMessage(layer) || trackMessage(layer).id === oldId);
        i++
      )
        await wait();
      if (!valid() || !selected.has(layer.id)) return;
      const message = trackMessage(layer);
      if (message && message.id !== oldId) {
        const target = Math.max(
          0,
          Math.min(
            30000,
            message.entryMs + 120,
            message.exitAt > message.entryMs ? message.exitAt - 1 : 30000,
          ),
        );
        seekTracks(layer, target);
        for (
          let i = 0;
          i < 60 && valid() && Math.abs((trackMessage(layer)?.age ?? -1) - target) > 2;
          i++
        )
          await wait();
      }
    }
    if (
      !valid() ||
      (componentTypes.includes(layer.type) && ready && layer.visible && !selected.has(layer.id))
    )
      return;
    layer = project.layers.find((l) => l.id === layer.id);
    if (!layer) return;
    selectedPart = null;
    propertyTab = 'all';
    select([layer.id]);
    if (task.part) choosePart(layer.id, task.part);
    if (targetSection) {
      sectionState.set((selectedPart ? 'part:' : layer.type + ':') + targetSection, false);
      propertiesUI();
    }
    requestAnimationFrame(() => {
      if (!valid() || !selected.has(layer.id)) return;
      const section = [...$('propertyFields').querySelectorAll('.property-section')].find(
        (s) => s.querySelector('h3')?.textContent === targetSection,
      );
      if (section) section.scrollIntoView({ block: 'start' });
      else $('propertyFields').scrollTop = 0;
      const current = styleLayer(project.layers.find((l) => l.id === layer.id)),
        chat = project.layers.find((l) => l.type === 'chat'),
        region = task.id === 'scope' && guideGeometry();
      if (region?.type === 'region') focusBounds(region);
      else if (task.id === 'scope' && current.effectScope !== 'component')
        focusBounds(editingFeed() && chat ? chat : viewport());
      else focusSelection();
    });
    if (!layer.visible) toast('这个图层目前隐藏，可在属性中勾选显示。');
    else if (M.effective(project, layer).locked) toast('这个图层已锁定，解锁后即可修改。');
  }
  function buildPropertiesUI() {
    const area = $('propertyFields');
    area.replaceChildren();
    const items = selectedLayers(),
      l = items[0];
    $('selectionLabel').textContent =
      items.length > 1 ? items.length + ' 个图层' : l?.name || '画布';
    $('propertyType').textContent = items.length > 1 ? '多选' : M.labels[l?.type] || '1920 × 1080';
    if (!l) {
      const p = document.createElement('p');
      p.className = 'property-note';
      p.textContent = '点击画布或图层开始编辑。可拖入左侧素材；背景、颗粒与希斯共振也是独立图层。';
      area.append(p);
      const b = document.createElement('button');
      b.className = 'wide';
      b.textContent = '编辑画布背景';
      b.onclick = () => {
        const bg = project.layers.find((x) => x.type === 'background');
        bg ? select([bg.id]) : add('background');
      };
      area.append(b);
      ThemeEditorGuide.start(area, {
        project,
        chatMode,
        jump: jumpGuide,
        help: () => ThemeEditorGuide.open(),
      });
      return;
    }
    if (selectedPart && items.length === 1 && l.parts?.some((p) => p.id === selectedPart)) {
      partProperties(area, l);
      return;
    }
    selectedPart = null;
    const section = (name) => {
      const s = document.createElement('section');
      s.className = 'property-section';
      const h = document.createElement('h3');
      h.textContent = name;
      const grid = document.createElement('div');
      grid.className = 'fields';
      s.append(h, grid);
      area.append(s);
      return grid;
    };
    const f = (grid, key, label, type = 'number', extra = {}) => {
      const input = field(grid, {
          key,
          label,
          type,
          value: trackList(l, l)?.some((t) => t.property === key && t.enabled !== false)
            ? trackValue(l, key, l)
            : l[key],
          ...extra,
        }),
        targets = propertyTargets(key);
      if (items.length > 1 && targets.length) {
        const values = targets.map((item) => item[key]);
        if (values.some((v) => v !== values[0])) {
          input.dataset.mixed = 'true';
          if (type === 'checkbox') input.indeterminate = true;
          else {
            if (type === 'select') {
              const option = document.createElement('option');
              option.value = '';
              option.textContent = '多个值';
              option.disabled = true;
              input.prepend(option);
            }
            input.value = '';
            input.placeholder = '多个值';
          }
        } else if (!Object.hasOwn(extra, 'value')) {
          if (type === 'checkbox') input.checked = values[0];
          else input.value = values[0] ?? '';
        }
      }
      overrideInfo(grid, l, key);
      return input;
    };
    let grid = section(items.length > 1 ? '共同属性' : l.name);
    f(grid, 'name', '图层名称', 'text', { full: true });
    f(grid, 'visible', '显示', 'checkbox');
    f(grid, 'locked', '锁定', 'checkbox');
    const virtual = ThemeInstances.feed(project, l);
    if (!virtual) {
      grid = section('变换');
      for (const [key, label, max] of [
        ['x', 'X', 1920],
        ['y', 'Y', 1080],
        ['w', '宽度', 1920],
        ['h', '高度', 1080],
      ])
        f(grid, key, label, 'number', {
          min: l.type === 'resonance' && ['x', 'y'].includes(key) ? -max : 0,
          max,
          step: 1,
        });
      if (!expanded().some((x) => ['game', 'chat'].includes(x.type)))
        f(grid, 'rotation', '旋转 °', 'number', { min: -180, max: 180 });
      f(grid, 'opacity', '不透明度', 'number', { min: 0, max: 1, step: 0.05 });
      if (l.type !== 'group')
        f(grid, 'blend', '混合模式', 'select', {
          full: true,
          options: [
            ['normal', '正常'],
            ['screen', '滤色'],
            ['multiply', '正片叠底'],
            ['overlay', '叠加'],
            ['lighten', '变亮'],
          ],
        });
    }
    if (items.length > 1 || l.type === 'group') {
      const note = document.createElement('p');
      note.className = 'property-note';
      note.textContent =
        items.length > 1
          ? '多个值表示各图层参数不同；输入后统一修改未锁定的图层。选中单个图层可编辑文字与特效。'
          : '分组变换作用于未锁定成员；锁定成员保持位置与尺寸。组的不透明度作为整体叠加。';
      area.append(note);
      return;
    }
    if (l.type === 'chat') {
      grid = section('弹幕区背景');
      f(grid, 'fill', '底色', 'color', { full: true });
      f(grid, 'panelOpacity', '底色不透明度', 'range', { min: 0, max: 1, step: 0.05, full: true });
      f(grid, 'panelGrain', '纸面颗粒', 'range', { min: 0, max: 2, step: 0.05, full: true });
      f(grid, 'radius', '容器圆角', 'number', { min: 0, max: 200, full: true });
      const tip = document.createElement('p');
      tip.className = 'property-note full';
      tip.textContent = '只改变弹幕区底板，文字和特效保持独立。设为 0 可直接叠在游戏画面上。';
      grid.append(tip);
      grid = section('消息流容器');
      f(grid, 'paddingX', '左右内边距', 'number', { min: 0, max: 120 });
      f(grid, 'paddingTop', '顶部留白', 'number', { min: 0, max: 300 });
      f(grid, 'paddingBottom', '底部留白', 'number', { min: 0, max: 160 });
      f(grid, 'messageGap', '消息间距', 'number', { min: 0, max: 120 });
      const b = document.createElement('button');
      b.className = 'wide full';
      b.textContent = chatMode ? '返回直播画布' : '进入弹幕区编辑器';
      b.onclick = () => navigateEditor(!chatMode);
      grid.append(b);
    }
    if (
      !M.builtin.includes(l.type) &&
      l.type !== 'group' &&
      project.layers.some((x) => x.type === 'chat')
    ) {
      grid = section('弹幕区跟随');
      const label = document.createElement('label');
      label.className = 'full';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = l.attach === 'chat';
      input.disabled = M.effective(project, l).locked;
      label.append(input, '跟随弹幕区移动和排版');
      grid.append(label);
      input.onchange = () =>
        transact(() => {
          l.attach = input.checked ? 'chat' : '';
          if (input.checked) l.scope = 'chat';
        });
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent = '边框随容器改变宽高；文字重新换行。关闭后可独立调整。';
      grid.append(note);
    }
    if (componentTypes.includes(l.type)) {
      grid = section('消息显示');
      const host = ThemeInstances.owner(project, l);
      const instanceNote = document.createElement('p');
      instanceNote.className = 'property-note full';
      instanceNote.textContent = ThemeInstances.feed(project, l)
        ? '排列在「' + host.name + '」内，收到消息后按此模板显示。'
        : '独立显示组件。与其他实例共享消息来源，排版、动画和特效分别设置。';
      grid.append(instanceNote);
      if (l.type === 'fleet')
        f(grid, 'messageFilter', '接收等级', 'select', {
          options: [
            ['all', '全部上舰'],
            ['captain', '仅舰长'],
            ['admiral', '仅提督'],
            ['governor', '仅总督'],
          ],
          full: true,
        });
      if (l.type === 'sc')
        f(grid, 'messageFilter', '接收档位', 'select', {
          options: [
            ['all', '全部 SC'],
            ...['2', '30', '50', '100', '500', '1000', '2000'].map((a, i) => [
              String(i),
              '仅 ¥' + a,
            ]),
          ],
          full: true,
        });
      grid = section('组件尺寸与排版');
      f(grid, 'contentWidth', '组件占位宽度 · 0 跟随容器', 'number', {
        min: 0,
        max: 1800,
        full: true,
      });
      f(grid, 'align', '内容对齐', 'select', {
        options: [
          ['left', '左对齐'],
          ['center', '居中'],
          ['right', '右对齐'],
        ],
      });
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent = '占位宽度包含左右留白。文字、卡片和徽记可在内部部件中单独调整。';
      grid.append(note);
      const info = document.createElement('output');
      info.className = 'part-measure full';
      info.dataset.componentMeasure = '';
      grid.append(info);
      refreshComponentMeasure();
    }
    if (componentTypes.includes(l.type)) {
      grid = section('原生演变动画');
      f(grid, 'animationEnabled', '播放入场', 'checkbox');
      f(grid, 'animationCustom', '自定义节奏', 'checkbox');
      if (l.animationCustom) {
        f(grid, 'entranceMs', '入场时长 ms · 0 原版', 'number', {
          min: 0,
          max: 20000,
          step: 50,
          full: true,
        });
        f(grid, 'entranceDelay', '启动延迟 ms', 'number', {
          min: 0,
          max: 5000,
          step: 50,
          full: true,
        });
        curveEditor(grid, l);
      }
      const b = document.createElement('button');
      b.className = 'wide full';
      b.textContent = '在时间轴回放此组件';
      b.onclick = () => {
        $('testKind').value = l.type;
        $('testKind').onchange();
        startTimeline();
      };
      grid.append(b);
    }
    if (l.type === 'text') {
      grid = section('文字');
      f(grid, 'text', '内容', 'textarea', { full: true });
      f(grid, 'font', '字体', 'select', {
        full: true,
        options: [
          ['sans', '无衬线 · 中文 / 多语言'],
          ['serif', '衬线 · 档案正文'],
          ['condensed', '窄体 · 英文标题'],
          ['mono', '等宽 · 计时 / 编号'],
        ],
      });
      f(grid, 'size', '字号', 'number', { min: 8, max: 240 });
      f(grid, 'weight', '字重', 'select', {
        options: [300, 400, 500, 600, 700, 800, 900].map((v) => [v, v]),
      });
      f(grid, 'lineHeight', '行高', 'number', { min: 0.7, max: 3, step: 0.05 });
      f(grid, 'spacing', '字距', 'number', { min: -5, max: 30, step: 0.5 });
      f(grid, 'align', '对齐', 'select', {
        options: [
          ['left', '左对齐'],
          ['center', '居中'],
          ['right', '右对齐'],
        ],
      });
      f(grid, 'color', '颜色', 'color');
    }
    if (l.type === 'background') {
      grid = section('画布背景');
      f(grid, 'mode', '背景类型', 'select', {
        full: true,
        options: [
          ['theme', '原主题 · 深色底'],
          ['color', '纯色'],
          ['image', '图片'],
          ['video', '视频'],
          ['transparent', '透明'],
        ],
      });
      f(grid, 'fill', '底色', 'color', { full: true });
      f(grid, 'avoidGame', '避让游戏画面', 'checkbox', { full: true });
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent =
        '开启后，游戏窗口保持透明；移动、改变比例或旋转背景，透明区域仍与游戏对齐。';
      grid.append(note);
    }
    if (['image', 'video', 'background', 'game'].includes(l.type)) {
      grid = section('素材');
      f(grid, 'src', '素材地址', 'text', { full: true });
      f(grid, 'fit', '填充方式', 'select', {
        full: true,
        options: [
          ['contain', '完整显示'],
          ['cover', '填满并裁切'],
          ['fill', '拉伸填满'],
        ],
      });
      const b = document.createElement('button');
      b.textContent = '替换本地素材';
      b.className = 'wide full';
      b.disabled = M.effective(project, l).locked;
      b.onclick = () => openAssetPicker({ layer: l.id });
      grid.append(b);
      if (l.type === 'video' || (l.type === 'background' && l.mode === 'video')) {
        f(grid, 'loop', '循环播放', 'checkbox');
        f(grid, 'speed', '播放速度', 'number', { min: 0.1, max: 3, step: 0.1 });
      }
    }
    if (['shape', 'line', 'border', 'game'].includes(l.type)) {
      grid = section('外观');
      if (l.type === 'border') {
        if (l.borderStyle !== 'corners')
          f(grid, 'grainAmount', '边缘磨损', 'range', { min: 0, max: 1, step: 0.05, full: true });
        if (l.borderStyle !== 'corners') {
          f(grid, 'traceAmount', '沿框微光', 'range', { min: 0, max: 1, step: 0.05, full: true });
          if (l.traceAmount)
            f(grid, 'traceSpeed', '微光游动速度', 'number', {
              min: 0.1,
              max: 3,
              step: 0.1,
              full: true,
            });
        }
      }
      if (l.type === 'game') {
        f(grid, 'frameVisible', '显示自带框线', 'checkbox', { full: true });
        const b = document.createElement('button');
        b.textContent = '拆出游戏外框和四角';
        b.className = 'wide full';
        b.disabled = !l.frameVisible || M.effective(project, l).locked;
        b.onclick = () => detachGameFrame(l.id);
        grid.append(b);
      }
      if (l.type === 'border')
        f(grid, 'borderStyle', '边框样式', 'select', {
          full: true,
          options: [
            ['solid', '实线'],
            ['dashed', '虚线'],
            ['double', '双线'],
            ['corners', '四角定位线'],
          ],
        });
      if (l.type === 'border' && l.borderStyle === 'corners') {
        f(grid, 'cornerLength', '角线长度', 'number', { min: 0, max: 120 });
        f(grid, 'cornerInset', '角线内缩', 'number', { min: 0, max: 60 });
      }
      if (!['game', 'border'].includes(l.type)) f(grid, 'fill', '填充', 'color');
      f(grid, 'stroke', '描边', 'color');
      f(grid, 'strokeWidth', '描边宽度', 'number', { min: 0, max: 24, step: 0.5 });
      if (l.type !== 'game') f(grid, 'radius', '圆角', 'number', { min: 0, max: 200 });
    }
    if (['normal', 'sc'].includes(l.type)) {
      grid = section('消息排版');
      f(grid, 'fontSize', '正文字号', 'number', { min: 12, max: 60 });
      f(grid, 'linePercent', '行高 %', 'number', { min: 100, max: 220 });
    }
    if (l.type === 'gift') {
      grid = section('内部积木');
      partAddControls(grid, l);
      grid = section('档案版式');
      if (!ThemeInstances.feed(project, l))
        f(grid, 'fit', '内容超出区域时', 'select', {
          full: true,
          options: [['contain', '完整显示（等比适应）'], ['fill', '保持字号（裁切溢出）']],
        });
      f(grid, 'titleSize', '礼物标题字号', 'number', { min: 16, max: 60 });
      f(grid, 'fontSize', '字段字号', 'number', { min: 12, max: 48 });
      f(grid, 'photoSize', '物证照片尺寸', 'number', { min: 48, max: 300 });
      f(grid, 'paperPadding', '纸张内边距', 'number', { min: 4, max: 80 });
      f(grid, 'paperColor', '纸张颜色', 'color');
    }
    if (l.type === 'normal') {
      grid = section('内部积木');
      partAddControls(grid, l);
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent = '在图层树展开的部件中选择，也可进入弹幕区编辑器直接拖动。';
      grid.append(note);
      grid = section('消息文字');
      f(grid, 'bodyWeight', '字重', 'select', {
        options: [400, 500, 600, 700, 800, 900].map((v) => [v, v]),
      });
      f(grid, 'nameColor', '用户名颜色', 'color');
      f(grid, 'bodyColor', '正文颜色', 'color');
    }
    if (l.type === 'fleet') {
      grid = section('内部积木');
      partAddControls(grid, l);
      grid = section('上舰排版');
      f(grid, 'iconSize', '默认徽记宽度 px', 'number', {
        min: 24,
        max: 300,
        value: l.iconSize / 2,
        toStored: (v) => v * 2,
      });
      f(grid, 'titleSize', '开通标题字号', 'number', { min: 20, max: 80 });
      f(grid, 'nameSize', '用户名字号', 'number', { min: 18, max: 64 });
      f(grid, 'nameWidth', '用户名宽度', 'number', { min: 160, max: 800 });
    }
    if (l.type === 'fleet') {
      grid = section('特效影响区域');
      f(grid, 'effectScope', '影响范围', 'select', {
        full: true,
        options: [
          ['component', '当前上舰组件'],
          ['chat', ThemeInstances.feed(project, l) ? '所属弹幕区（含标题）' : '整个画布'],
          ['custom', '自定义区域'],
        ],
      });
      if (l.effectScope === 'custom')
        for (const [key, label, max] of [
          ['effectX', '区域 X', 1920],
          ['effectY', '区域 Y', 1080],
          ['effectW', '区域宽度', 1920],
          ['effectH', '区域高度', 1080],
        ])
          f(grid, key, label, 'number', {
            min: key === 'effectX' ? -1920 : key === 'effectY' ? -1080 : 32,
            max,
          });
      if (l.effectScope === 'custom') {
        const note = document.createElement('p');
        note.className = 'property-note full';
        note.textContent = ThemeInstances.feed(project, l)
          ? '坐标以弹幕区左上角为原点。拖动青色十字定位，右下角调整范围。'
          : '拖动青色十字定位，右下角调整范围。';
        grid.append(note);
      }
      grid = section('上舰材质与干扰');
      f(grid, 'effectGain', '闪现 / 干扰强度', 'range', { min: 0, max: 3, step: 0.05, full: true });
      f(grid, 'vhsAmount', 'VHS 强度', 'range', { min: 0, max: 3, step: 0.05, full: true });
      f(grid, 'particleAmount', '碎光数量', 'range', { min: 0, max: 2, step: 0.05, full: true });
      f(grid, 'particleSpread', '碎光扩散范围', 'range', {
        min: 0.2,
        max: 3,
        step: 0.05,
        full: true,
      });
    }
    if (['fleet', 'gift'].includes(l.type)) {
      grid = section('停留与退场');
      for (const [suffix, label, d] of [
        ['Hold', '停留（秒）', l.type === 'fleet' ? 8 : 6],
        ['Exit', '退场（秒）', l.type === 'fleet' ? 0.7 : 0.6],
      ]) {
        const id = l.type + suffix;
        field(grid, {
          key: id,
          label,
          type: 'number',
          value: project.settings[id] ?? d,
          min: suffix === 'Hold' ? 0 : 0.2,
          max: suffix === 'Hold' ? 3600 : 4,
          step: 0.1,
          setting: true,
        });
      }
    }
    if (l.type === 'sc') {
      grid = section('内部积木');
      partAddControls(grid, l);
      grid = section('希斯特效');
      f(grid, 'fxCustom', '自定义特效（覆盖档位预设）', 'checkbox', { full: true });
      const fxNote = document.createElement('p');
      fxNote.className = 'property-note full';
      fxNote.textContent = l.fxSeeded
        ? '关闭只旁路自定义数值；再次开启会恢复已保存的参数。属性关键帧保持独立。'
        : '首次开启会从当前预览档位继承数值，保持原有特效。通用样式会影响所有未独立设置的档位。';
      grid.append(fxNote);
      if (l.fxCustom) {
        for (const [key, label, max] of [
          ['scStrength', '扭曲强度', 100],
          ['scReach', '影响范围', 140],
          ['scWarp', '文字折射', 100],
          ['scRed', '红光', 100],
          ['scDispersion', '边缘色散', 100],
          ['scGhost', '光学重影', 100],
          ['scSpeed', '流动速度', 100],
        ])
          f(grid, key, label, 'range', { min: key === 'scReach' ? 12 : 0, max, full: true });
      }
    }
    if (['sc', 'fleet'].includes(l.type)) mountTracks(area, l);
    if (l.type === 'resonance') {
      grid = section('流场发射点');
      f(grid, 'avoidGame', '避开游戏采集区域', 'checkbox', { full: true });
      f(grid, 'anchorX', '发射点 X', 'number', { min: 0, max: l.w });
      f(grid, 'anchorY', '发射点 Y', 'number', { min: 0, max: l.h });
      f(grid, 'variant', '流动方向', 'select', {
        options: [
          [0, '向外展开'],
          [1, '反向卷入'],
        ],
      });
      grid = section('流体材质');
      f(grid, 'intensity', '强度', 'range', { min: 0, max: 100, full: true });
      f(grid, 'flowDensity', '密度', 'number', { min: 0.1, max: 3, step: 0.1 });
      f(grid, 'flowWarp', '光学扭曲', 'number', { min: 0, max: 3, step: 0.1 });
      f(grid, 'flowSpread', '扩散尺度', 'number', { min: 0.2, max: 3, step: 0.1 });
      f(grid, 'speed', '流速', 'number', { min: 0.1, max: 3, step: 0.1 });
      f(grid, 'audioGain', '音频响应', 'number', { min: 0, max: 3, step: 0.1 });
      f(grid, 'flowColor', '流纹颜色', 'color');
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent = '流场可以伸出画布，画布只显示其中可见部分。调整范围不会拉伸流纹。';
      grid.append(note);
      mountTracks(area, l);
    }
    if (l.type === 'hiss') {
      grid = section('共振材质');
      f(grid, 'intensity', '基础共振强度', 'range', { min: 0, max: 100, full: true });
      const b = document.createElement('button');
      b.className = 'wide full';
      b.textContent = '拆成两个独立流场';
      b.disabled = M.effective(project, l).locked;
      b.onclick = () => {
        if (!roomForLayers(2)) return;
        transact(() => {
          const generated = M.splitHiss(project, l);
          for (const field of generated) field.id = 'flow-' + crypto.randomUUID();
          project.layers.splice(project.layers.indexOf(l) + 1, 0, ...generated);
          l.visible = false;
          selected = new Set([generated[0].id]);
        });
      };
      grid.append(b);
      const note = document.createElement('p');
      note.className = 'property-note full';
      note.textContent =
        '按当前游戏位置和图层变换拆出发射点，保留亮度、混合与分组。拆出后可分别调节范围与材质，流纹按实际像素生成。';
      grid.append(note);
    }
    if (ThemeSceneComponents.schema[l.type]) {
      grid = section(
        ThemeSceneComponents.isHeader(l.type)
          ? '标题栏内部排版'
          : l.type === 'logos'
            ? '双 Logo 内部排版'
            : '计时组件内部排版',
      );
      for (const spec of ThemeSceneComponents.schema[l.type])
        f(grid, spec.key, spec.label, spec.type, {
          min: spec.min,
          max: spec.max,
          step: spec.step || 1,
          options: spec.options,
          full: spec.type === 'text',
        });
      const tip = document.createElement('p');
      tip.className = 'property-note full';
      tip.textContent =
        l.type === 'logos'
          ? '中英文尺寸和间距分别设置。调整容器不拉伸字标，保留官方比例和原有显现动效。'
          : '内部字号、留白和显示项独立调整。改变容器宽高不会缩放文字；原有计时和动效继续运行。';
      grid.append(tip);
      if (l.type === 'logos') {
        const metrics = ThemeSceneComponents.logoMetrics(l),
          measure = document.createElement('p');
        measure.className = 'property-note full';
        measure.textContent =
          '内容尺寸 ' +
          Math.round(metrics.w) +
          ' × ' +
          Math.round(metrics.h) +
          ' px' +
          (metrics.w > l.w + 0.5 || metrics.h > l.h + 0.5
            ? ' · 已超出容器，可扩大容器或缩小字标。'
            : '');
        grid.append(measure);
      }
    }
    if (l.type === 'header') {
      const button = document.createElement('button');
      button.className = 'wide full';
      button.textContent = '拆分为独立组件';
      button.disabled = M.effective(project, l).locked;
      button.onclick = () => {
        const doc = frame.contentDocument;
        const el = [...(doc?.querySelectorAll('[data-theme-layer]') || [])]
          .find(node => node.dataset.themeLayer === l.id);
        if (!el) { toast('画布正在载入，请稍后重试。'); return; }
        const boxes = {};
        for (const [type, selectors] of Object.entries({
          host: ['#hostText,[data-native-id=hostText]', '.header-triangle'],
          topic: ['#topicText,[data-native-id=topicText]'], status: ['.on-air'],
          rule: ['.header-rule'], divider: ['.header-separator'],
        })) {
          const nodes = selectors.map(s => el.querySelector(s)).filter(n => n && n.getClientRects().length);
          if (!nodes.length) continue;
          const rect = M.bounds(nodes.map(n => ({ x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight })));
          if (!rect.w || !rect.h) continue;
          boxes[type] = ThemeGeometry.project({ ...rect, x: rect.x + l.x, y: rect.y + l.y }, l);
          const text = nodes[0], cs = frame.contentWindow.getComputedStyle(text);
          if (type === 'host') boxes[type].headerHostSize = parseFloat(cs.fontSize);
          if (type === 'topic') boxes[type].headerTopicSize = parseFloat(cs.fontSize);
          if (type === 'status') boxes[type].headerStatusSize = parseFloat(cs.fontSize);
          boxes[type].headerWeight = parseInt(cs.fontWeight, 10) || l.headerWeight;
        }
        const generated = M.detachHeader(l, boxes);
        if (!roomForLayers(generated.length - 1)) return;
        transact(() => {
          for (const child of generated) child.id = 'hud-' + crypto.randomUUID();
          project.layers.splice(project.layers.indexOf(l), 1, ...generated);
          selected = new Set([generated[0].id]);
        });
        toast('已拆为独立图层，可以分别移动、调节和隐藏；支持撤销。');
      };
      area.append(button);
    }
    if (ThemeSceneComponents.isHeader(l.type) && l.type !== 'status') {
      grid = section('主播与标题');
      for (const [id, label] of [
        ['hostInput', '主播名称'],
        ['topicInput', '直播标题'],
      ].filter(([id]) => l.type === 'header' || (l.type === 'host' ? id === 'hostInput' : id === 'topicInput')))
        field(grid, {
          key: id,
          label,
          type: 'text',
          value: project.settings[id] ?? frame.contentDocument?.getElementById(id)?.value,
          setting: true,
          full: true,
        });
    }
    if (componentTypes.includes(l.type))
      ThemeStyleLibrary.mount(area, {
        owner: () => styleLayer(project.layers.find((x) => x.id === l.id)),
        change: (fn) => transact(() => fn(styleLayer(project.layers.find((x) => x.id === l.id)))),
        toast,
        locked: M.effective(project, l).locked,
      });
    grid = section(virtual ? '更多设置' : '质感');
    if (!virtual) {
      f(grid, 'brightness', '亮度', 'number', { min: 0.2, max: 2, step: 0.05 });
      f(grid, 'shadow', '阴影柔度', 'number', { min: 0, max: 40 });
    }
    if (['fleet', 'gift', 'sc', 'hiss', 'music', 'timer', 'normal'].includes(l.type)) {
      const b = document.createElement('button');
      b.textContent = {
        fleet: '停留、退场与全局动效',
        gift: '停留与淡出时间',
        sc: 'SC 与弹幕设置',
        hiss: '音频来源与分频响应',
        music: '音乐皮肤设置',
        timer: '计时与偏移',
        normal: '弹幕来源与模拟',
      }[l.type];
      b.className = 'wide full';
      b.onclick = () =>
        l.type === 'music' ? window.open('now-playing.html', '_blank') : openSettings(l.type);
      grid.append(b);
    }
    if (l.type === 'game') {
      const p = document.createElement('p');
      p.className = 'property-note';
      p.textContent =
        '游戏画面保持 16:9。拆出的外框和四角可自由改变比例，线宽和角线长度保持不变。示例图在 OBS 中自动隐藏。';
      area.append(p);
    }
  }
  function curveEditor(grid, l) {
    const current = () => styleLayer(project.layers.find((x) => x.id === l.id)),
      locked = () => !current() || M.effective(project, current()).locked;
    const presets = [
      ['原版节奏', [0, 0, 1, 1]],
      ['缓入缓出', [0.42, 0, 0.58, 1]],
      ['蓄势后释放', [0.75, 0.05, 0.25, 1]],
      ['快速响应', [0.15, 0.7, 0.2, 1]],
    ];
    const choices = document.createElement('div');
    choices.className = 'curve-presets full';
    for (const [label, value] of presets) {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = locked();
      b.onclick = () => {
        if (!locked())
          transact(() => {
            current().curve = [...value];
          });
      };
      choices.append(b);
    }
    grid.append(choices);
    const ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.classList.add('curve-editor', 'full');
    svg.setAttribute('viewBox', '0 0 220 154');
    svg.setAttribute('aria-label', '入场速度曲线，拖动两个控制点调整');
    const node = (name, attrs) => {
      const n = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.append(n);
      return n;
    };
    for (let i = 0; i < 5; i++) {
      node('path', { d: `M20 ${130 - i * 28}H204M${20 + i * 46} 18V130`, class: 'curve-grid' });
    }
    node('path', { d: 'M20 130H204M20 130V18', class: 'curve-axis' });
    const arm = node('path', { class: 'curve-arm' }),
      path = node('path', { class: 'curve-path' }),
      handles = [
        node('circle', { r: 5.5, tabindex: 0, role: 'slider', 'aria-label': '起点速度控制点' }),
        node('circle', { r: 5.5, tabindex: 0, role: 'slider', 'aria-label': '终点速度控制点' }),
      ];
    const label = node('text', { x: 20, y: 150 });
    label.textContent = '开始';
    node('text', { x: 179, y: 150 }).textContent = '落定';
    const draw = () => {
      const [a, b, c, d] = l.curve;
      arm.setAttribute(
        'd',
        `M20 130L${20 + a * 184} ${130 - b * 112}M204 18L${20 + c * 184} ${130 - d * 112}`,
      );
      path.setAttribute(
        'd',
        `M20 130C${20 + a * 184} ${130 - b * 112} ${20 + c * 184} ${130 - d * 112} 204 18`,
      );
      handles.forEach((h, i) => {
        h.setAttribute('cx', 20 + l.curve[i * 2] * 184);
        h.setAttribute('cy', 130 - l.curve[i * 2 + 1] * 112);
        h.setAttribute(
          'aria-valuetext',
          l.curve
            .slice(i * 2, i * 2 + 2)
            .map((v) => v.toFixed(2))
            .join(', '),
        );
      });
    };
    let drag = null;
    handles.forEach((h, i) => {
      h.setAttribute('aria-disabled', String(locked()));
      h.setAttribute('tabindex', locked() ? -1 : 0);
      h.onpointerdown = (e) => {
        if (e.button !== 0 || locked()) return;
        e.preventDefault();
        const inverse = svg.getScreenCTM().inverse(),
          point = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
        checkpoint();
        drag = { index: i, inverse, point, curve: [...current().curve] };
        svg.setPointerCapture(e.pointerId);
      };
      h.onkeydown = (e) => {
        if (!e.key.startsWith('Arrow')) return;
        e.preventDefault();
        e.stopPropagation();
        if (locked()) return;
        checkpoint();
        const target = current(),
          axis = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 0 : 1,
          delta = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -0.02 : 0.02;
        target.curve[i * 2 + axis] = M.num(target.curve[i * 2 + axis] + delta, 0, 1, 0);
        l.curve = [...target.curve];
        draw();
        update({ fields: false, layers: false });
      };
    });
    svg.onpointermove = (e) => {
      if (!drag || locked()) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.inverse),
        curve = [...drag.curve],
        i = drag.index;
      curve[i * 2] = M.num(curve[i * 2] + (point.x - drag.point.x) / 184, 0, 1, 0);
      curve[i * 2 + 1] = M.num(curve[i * 2 + 1] - (point.y - drag.point.y) / 112, 0, 1, 0);
      current().curve = curve;
      l.curve = [...curve];
      draw();
      update({ fields: false, layers: false });
    };
    svg.onpointerup = svg.onpointercancel = () => {
      if (drag) {
        drag = null;
        propertiesUI();
      }
    };
    grid.append(svg);
    draw();
  }

  let inspectionDepth = 0,
    inspectionRecords = null;
  function previewRecords() {
    if (!ready) return [];
    if (inspectionDepth)
      return (inspectionRecords ??= frame.contentWindow.ThemeRenderer.previewState());
    return frame.contentWindow.ThemeRenderer.previewState();
  }
  function inspectFrame(fn) {
    inspectionDepth++;
    try {
      return fn();
    } finally {
      if (--inspectionDepth === 0) inspectionRecords = null;
    }
  }
  function trackMessage(l) {
    return (
      previewRecords().findLast((m) => m.kind === l.type && (!m.layerId || m.layerId === l.id)) ||
      null
    );
  }
  function phaseFor(l) {
    return ['fleet', 'gift', 'sc'].includes(l.type) ? trackPhase : 'entry';
  }
  function trackList(o, l) {
    return phaseFor(l) === 'exit' ? o.exitTracks : o.tracks;
  }
  function trackTime(l) {
    if (!ready) return 0;
    const R = frame.contentWindow.ThemeRenderer;
    if (l.type === 'resonance') return R.fieldTime(l.id);
    const m = trackMessage(l);
    return phaseFor(l) === 'exit' ? Math.max(0, m?.exitAge ?? -1) : m?.age || 0;
  }
  function trackSample(o, l) {
    if (l.type === 'resonance') return ThemeKeyframes.sample(o, trackTime(l));
    const m = trackMessage(l);
    return ThemeKeyframes.sample(o, m?.age || 0, m?.exitAge ?? -1);
  }
  function exitDuration(l) {
    return l.type === 'sc'
      ? 1100
      : (Number(project.settings[l.type + 'Exit']) || (l.type === 'fleet' ? 0.7 : 0.6)) * 1000;
  }
  function phaseOwner(o, l) {
    if (phaseFor(l) !== 'exit') return o;
    return new Proxy(o, {
      get(t, k) {
        return k === 'tracks' ? t.exitTracks : k === 'motionLoop' ? false : t[k];
      },
      set(t, k, v) {
        if (k === 'motionLoop') return true;
        t[k === 'tracks' ? 'exitTracks' : k] = v;
        return true;
      },
    });
  }
  function scBaseFX(l) {
    const m = trackMessage(l),
      key = activeVariant[l.id] || '',
      tier = key !== '' ? +key : (m?.tier ?? +$('testTier').value);
    return frame.contentWindow.ThemeRenderer?.scPreset(tier);
  }
  function trackValue(o, key, l) {
    const sampled = trackSample(o, l)[key];
    if (sampled !== undefined) return sampled;
    if (o.type === 'sc' && !o.fxCustom && ThemeKeyframes.scMap[key])
      return scBaseFX(l)?.[ThemeKeyframes.scMap[key]] ?? o[key];
    return o[key];
  }
  function setAnimated(o, key, value, l, time = trackTime(l)) {
    const target = phaseOwner(o, l),
      track = target.tracks?.find((t) => t.property === key && t.enabled !== false);
    if (!track) {
      o[key] = value;
      return;
    }
    const length = ThemeKeyframes.duration(target),
      at = Math.round(target.motionLoop && length > 0 ? time % length : Math.min(30000, time)),
      accepted = ThemeKeyframes.putKey(track, at, value);
    if (!accepted)
      toast(
        '这条轨道已达 ' + ThemeKeyframes.maxKeys + ' 帧，请先删除不需要的帧，或调整已有关键帧。',
      );
  }
  function setPreviewPaused(on) {
    if (!on) timelineCursor = null;
    paused = !!on;
    frame.contentWindow.ThemeRenderer.pause(paused);
    frame.contentWindow.ThemeRenderer.preview('pause', paused);
    $('testPause').textContent = paused ? '继续动效' : '暂停动效';
  }
  function seekTracks(l, ms) {
    timelineCursor = null;
    const R = frame.contentWindow.ThemeRenderer;
    setPreviewPaused(true);
    if (l.type === 'resonance') {
      R.seekField(l.id, ms);
      return;
    }
    timelineActive = true;
    timelineSeen = true;
    timelineExit = phaseFor(l) === 'exit';
    $('testKind').value = l.type;
    $('testKind').onchange();
    R.preview('editor-seek', {
      layerId: l.id,
      kind: l.type,
      ms,
      phase: phaseFor(l),
      styleKey: activeVariant[l.id] || 'base',
      rank: $('testRank').value,
      tier: +$('testTier').value,
      sender: $('testName').value,
      body: $('testBody').value,
    });
    $('testPause').textContent = '继续动效';
    $('timelineState').textContent = '逐帧检查';
  }
  function mountTracks(area, l, p) {
    if (partLocked(l, p)) return;
    const owner = () => {
      const layer = styleLayer(project.layers.find((x) => x.id === l.id));
      return phaseOwner(p ? layer.parts.find((x) => x.id === p.id) : layer, layer);
    };
    ThemeTrackEditor.mount(area, {
      toast,
      id: l.id + ':' + (p?.id || 'component') + ':' + phaseFor(l),
      owner,
      phase: phaseFor(l),
      exitDuration: exitDuration(l),
      allowExit: ['fleet', 'gift', 'sc'].includes(l.type),
      baseValue: (key) => {
        const layer = styleLayer(project.layers.find((x) => x.id === l.id)),
          raw = p ? layer.parts.find((x) => x.id === p.id) : layer;
        return trackValue(raw, key, layer);
      },
      setPhase: (value) => {
        trackPhase = value;
        seekTracks(l, 0);
        propertiesUI();
        selectionUI();
      },
      properties: p ? ThemeKeyframes.partProperties : ThemeKeyframes.componentProperties(l.type),
      time: () => trackTime(l),
      seek: (ms) => seekTracks(l, ms),
      change: (fn) => transact(() => fn(owner())),
      live: (fn) => {
        fn(owner());
        update({ fields: false, layers: false });
      },
      start: () => {
        checkpoint();
        seekTracks(l, trackTime(l));
      },
      end: () => update(),
      play: () => {
        if (l.type !== 'resonance') {
          $('testKind').value = l.type;
          $('testKind').onchange();
          startTimeline(phaseFor(l) === 'exit');
          if (p) choosePart(l.id, p.id);
        } else {
          setPreviewPaused(false);
          frame.contentWindow.ThemeRenderer.seekField(l.id, 0, true);
        }
      },
    });
  }
  function mountPropertyMotion(root, l) {
    const partId = selectedPart,
      resolve = () => {
        const layer = styleLayer(project.layers.find((x) => x.id === l.id));
        return { layer, raw: partId ? layer.parts.find((x) => x.id === partId) : layer };
      };
    ThemePropertyMotion.mount(root, {
      toast,
      owner: () => {
        const { layer, raw } = resolve();
        return phaseOwner(raw, layer);
      },
      properties: partId
        ? ThemeKeyframes.partProperties
        : ThemeKeyframes.componentProperties(l.type),
      time: () => trackTime(l),
      value: (key) => {
        const { layer, raw } = resolve();
        return trackValue(raw, key, layer);
      },
      change: (fn) =>
        transact(() => {
          const { layer, raw } = resolve();
          fn(phaseOwner(raw, layer));
        }),
      seek: (ms) => seekTracks(l, ms),
      locked: partLocked(l, partId ? selectedPartData() : null),
    });
  }
  function overviewLayer() {
    const selectedLayer = selectedLayers()[0];
    return selectedLayer && [...componentTypes, 'resonance'].includes(selectedLayer.type)
      ? selectedLayer
      : styleLayer(project.layers.find((l) => l.type === $('testKind').value));
  }
  function overviewContext() {
    return inspectFrame(() => {
      const l = overviewLayer();
      if (!l) return null;
      const phase = phaseFor(l),
        variant = activeVariant[l.id] || '',
        rows = [],
        ref = (part) => ({
          layer: l.id,
          part: part?.id || '',
          variant,
          phase,
          epoch: documentEpoch,
        });
      for (const part of [null, ...(l.parts || [])]) {
        const owner = phaseOwner(part || l, l),
          period = ThemeKeyframes.duration(owner);
        for (const track of owner.tracks || [])
          rows.push({
            ref: { ...ref(part), property: track.property },
            name:
              (part?.name || '整体特效') +
              ' · ' +
              ThemeKeyframes.labels[track.property] +
              (part?.visible === false ? '（隐藏）' : ''),
            keys: track.keys,
            locked: partLocked(l, part),
            disabled: track.enabled === false,
            selected: selectedLayers()[0]?.id === l.id && selectedPart === (part?.id || null),
            loop: owner.motionLoop,
            period,
          });
      }
      const minimum =
          phase === 'exit' ? exitDuration(l) : Math.max(2000, trackMessage(l)?.entryMs || 0),
        duration = Math.min(30000, Math.max(minimum, ...rows.map((r) => r.keys.at(-1)?.time || 0)));
      return {
        layer: l.id,
        variant,
        phase,
        epoch: documentEpoch,
        name:
          l.name +
          (variant
            ? ' · ' +
              (l.type === 'fleet'
                ? { captain: '舰长', admiral: '提督', governor: '总督' }[variant]
                : '¥ ' + [2, 30, 50, 100, 500, 1000, 2000][Number(variant)])
            : ''),
        allowExit: ['sc', 'gift', 'fleet'].includes(l.type),
        time: trackTime(l),
        duration,
        rows,
        fps: frame.contentWindow.FrameRate?.fps || 60,
      };
    });
  }
  function overviewTarget(ref) {
    if (ref.epoch !== documentEpoch) return null;
    const base = project.layers.find((l) => l.id === ref.layer);
    if (!base || (activeVariant[base.id] || '') !== ref.variant) return null;
    const l = styleLayer(base),
      part = ref.part ? l.parts.find((p) => p.id === ref.part) : null;
    if ((ref.part && !part) || partLocked(l, part) || phaseFor(l) !== ref.phase) return null;
    const track = phaseOwner(part || l, l).tracks.find((t) => t.property === ref.property);
    return track ? { layer: l, part, track } : null;
  }
  function installOverview() {
    timelineOverview = ThemeTimelineOverview.install(document.querySelector('.test-dock'), {
      context: overviewContext,
      select(ref) {
        const base = project.layers.find((l) => l.id === ref.layer);
        if (!base) return;
        ThemePropertySearch.clear();
        sectionState.set((ref.part ? 'part:' : base.type + ':') + '属性关键帧', false);
        if (ref.part) choosePart(ref.layer, ref.part);
        else select([ref.layer]);
        requestAnimationFrame(() =>
          $('propertyFields')
            .querySelector('[data-track-property="' + ref.property + '"]')
            ?.scrollIntoView({ block: 'start' }),
        );
      },
      seek(ms) {
        const l = overviewLayer();
        if (l) seekTracks(l, ms);
      },
      setPhase(value) {
        const l = overviewLayer();
        if (!l) return;
        trackPhase = value;
        seekTracks(l, 0);
        propertiesUI();
        selectionUI();
      },
      begin(ref) {
        const target = overviewTarget(ref);
        if (!target) return false;
        checkpoint();
        seekTracks(target.layer, trackTime(target.layer));
        return true;
      },
      change(ref, fn) {
        const target = overviewTarget(ref);
        if (!target) return false;
        transact(() => fn(target.track));
        return true;
      },
      live(ref, keys) {
        const target = overviewTarget(ref);
        if (!target) return false;
        target.track.keys = keys;
        update({ fields: false, layers: false });
        return true;
      },
      end() {
        update();
      },
    });
  }
  function partLocked(l, p) {
    return M.effective(project, l).locked || p?.locked === true;
  }
  function selectedPartData() {
    const l = selectedLayers()[0];
    return l?.parts?.find((p) => p.id === selectedPart);
  }
  function choosePart(layerId, partId) {
    openParts.add(layerId);
    propertyTab = 'all';
    select([layerId]);
    selectedPart = partId;
    layersUI();
    propertiesUI();
    selectionUI();
  }
  function partRows(list, l) {
    for (const p of l.parts || []) {
      if (
        layerQuery &&
        !l.name.toLowerCase().includes(layerQuery) &&
        !p.name.toLowerCase().includes(layerQuery)
      )
        continue;
      const row = document.createElement('div');
      row.className = 'part-row' + (p.visible ? '' : ' dim');
      row.dataset.part = p.id;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-label', l.name + ' / ' + p.name);
      row.setAttribute('aria-selected', selected.has(l.id) && selectedPart === p.id);
      const mark = document.createElement('span');
      mark.textContent =
        p.kind === 'paper'
          ? '▤'
          : ['photo', 'image'].includes(p.kind)
            ? '▧'
            : p.kind === 'badge'
              ? '⚓'
              : p.kind === 'particles'
                ? '✧'
                : p.kind === 'signal'
                  ? '▽'
                  : p.kind === 'line' || p.kind === 'divider'
                    ? '—'
                    : p.kind === 'shape'
                      ? '□'
                      : 'T';
      const name = document.createElement('span');
      name.textContent = p.name;
      const b = document.createElement('button');
      b.setAttribute('aria-label', (p.visible ? '隐藏' : '显示') + '部件 ' + p.name);
      b.append(icon(p.visible ? 'eye' : 'hidden'));
      b.onclick = (e) => {
        e.stopPropagation();
        transact(() => {
          const part = styleLayer(project.layers.find((x) => x.id === l.id)).parts.find(
            (x) => x.id === p.id,
          );
          part.visible = !part.visible;
        });
      };
      const lock = document.createElement('button');
      lock.className = 'part-lock';
      lock.setAttribute('aria-label', (p.locked ? '解锁' : '锁定') + '部件 ' + p.name);
      lock.disabled = M.effective(project, l).locked;
      lock.append(icon(p.locked ? 'lock' : 'unlock'));
      lock.onclick = (e) => {
        e.stopPropagation();
        transact(() => {
          const part = styleLayer(project.layers.find((x) => x.id === l.id)).parts.find(
            (x) => x.id === p.id,
          );
          part.locked = !part.locked;
        });
      };
      row.classList.toggle('part-locked', p.locked);
      row.append(mark, name, lock, b);
      row.onclick = () => choosePart(l.id, p.id);
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        choosePart(l.id, p.id);
        context(e.clientX, e.clientY);
      };
      row.draggable = !partLocked(l, p);
      row.ondragstart = (e) =>
        e.dataTransfer.setData('application/x-control-part', JSON.stringify([l.id, p.id]));
      row.ondragover = (e) => e.preventDefault();
      row.ondrop = (e) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/x-control-part');
        if (!data) return;
        try {
          const [layerId, partId] = JSON.parse(data);
          if (
            layerId !== l.id ||
            partId === p.id ||
            partLocked(
              l,
              l.parts.find((x) => x.id === partId),
            )
          )
            return;
          transact(() => {
            const current = styleLayer(project.layers.find((x) => x.id === l.id)),
              from = current.parts.findIndex((x) => x.id === partId),
              to = current.parts.findIndex((x) => x.id === p.id);
            const [moving] = current.parts.splice(from, 1);
            current.parts.splice(to, 0, moving);
          });
        } catch {}
      };
      list.append(row);
    }
  }
  function addPart(l, kind) {
    if (M.effective(project, l).locked || !roomForPart(l)) return;
    transact(() => {
      const current = styleLayer(project.layers.find((x) => x.id === l.id)),
        id = 'part-' + crypto.randomUUID();
      current.parts.push({
        id,
        kind,
        name: M.partLabels[kind],
        placement: 'free',
        x: 0,
        y: 125,
        w: kind === 'image' ? 160 : kind === 'text' ? 200 : 160,
        h: kind === 'image' ? 100 : kind === 'shape' ? 32 : 20,
        src: kind === 'image' ? 'live-game.jpg' : '',
        text: '{用户名} · 信号已收到',
        size: 18,
        color: kind === 'text' ? '#93c5b6' : '#6b8177',
      });
      selectedPart = id;
    });
  }
  function partAddControls(grid, l) {
    for (const [kind, label] of [
      ['text', '＋ 文字'],
      ['image', '＋ 图片'],
      ['line', '＋ 线条'],
      ['shape', '＋ 色块'],
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = 'part-add';
      b.onclick = () => addPart(l, kind);
      grid.append(b);
    }
  }
  function orderPart(direction) {
    const l = selectedLayers()[0];
    if (!l || partLocked(l, selectedPartData())) return;
    const i = l.parts.findIndex((p) => p.id === selectedPart),
      next = i + direction;
    if (i < 0 || next < 0 || next >= l.parts.length) return;
    transact(() => {
      [l.parts[i], l.parts[next]] = [l.parts[next], l.parts[i]];
    });
  }
  function alignPart(kind) {
    const l = selectedLayers()[0],
      part = selectedPartData(),
      m = previewRecords().findLast(
        (m) => m.kind === l?.type && (!m.layerId || m.layerId === l.id),
      ),
      r = m?.parts?.find((p) => p.id === part?.id);
    if (!r || partLocked(l, part)) return;
    const at = trackTime(l);
    if (trackList(part, l)?.length) seekTracks(l, at);
    transact(() => {
      const avail = m.width - 54,
        axis = ['left', 'center', 'right'].includes(kind) ? 'x' : 'y',
        delta =
          kind === 'left'
            ? -r.x
            : kind === 'center'
              ? (avail - r.w) / 2 - r.x
              : kind === 'right'
                ? avail - r.w - r.x
                : kind === 'top'
                  ? -r.y
                  : kind === 'middle'
                    ? (m.height - r.h) / 2 - r.y
                    : m.height - 14 - r.h - r.y;
      setAnimated(part, axis, trackValue(part, axis, l) + delta, l, at);
    });
  }
  function duplicatePart() {
    const l = selectedLayers()[0],
      part = selectedPartData();
    if (!l || !part || partLocked(l, part)) return;
    if (['badge', 'particles', 'photo', 'progress'].includes(part.kind)) {
      toast('该动态素材保留一个实例，可独立编辑位置与尺寸。');
      return;
    }
    if (!roomForPart(l)) return;
    transact(() => {
      const source = previewRecords()
          .findLast((m) => m.kind === l.type && (!m.layerId || m.layerId === l.id))
          ?.parts?.find((p) => p.id === part.id),
        copy = {
          ...part,
          id: 'part-' + crypto.randomUUID(),
          name: part.name + ' 副本',
          placement: 'free',
          x: (source?.x ?? part.x) + 12,
          y: (source?.y ?? part.y) + 12,
        };
      if (
        [
          'name',
          'body',
          'title',
          'quantity',
          'value',
          'note',
          'label',
          'amount',
          'timer',
          'page',
        ].includes(part.kind)
      ) {
        copy.kind = 'text';
        copy.text =
          part.template ?? ThemeBindings.defaults[l.type]?.[part.kind] ?? part.text ?? '{消息}';
        copy.template = null;
        copy.size = source?.size || l.fontSize;
        if (source?.weight > 0) copy.weight = source.weight;
        if (/^#[0-9a-f]{6}$/i.test(source?.color || '')) copy.color = source.color;
        if (source?.lineH > 0 && source?.size > 0)
          copy.linePercent = (source.lineH / source.size) * 100;
        copy.w = part.w || source?.w || 0;
        if (source?.lineLimit > 0) copy.maxLines = source.lineLimit;
      }
      if (part.kind === 'divider') copy.kind = 'line';
      if (['paper', 'card'].includes(part.kind)) {
        copy.kind = 'shape';
        copy.color = part.color || (l.type === 'sc' ? '#141614' : l.paperColor);
        copy.w = source?.w || l.w;
        copy.h = source?.h || l.h;
      }
      const motion = ThemeGeometry.duplicatePartMotion(part, source, trackSample(part, l));
      Object.assign(copy, motion.value);
      l.parts.push(copy);
      selectedPart = copy.id;
      if (motion.adjusted) toast('副本已调整到可编辑范围内，完整运动轨迹已保留。');
    });
  }
  function deletePart() {
    const l = selectedLayers()[0],
      part = selectedPartData();
    if (!l || !part || partLocked(l, part)) return;
    transact(() => {
      if (
        [
          'signal',
          'name',
          'body',
          'divider',
          'badge',
          'particles',
          'title',
          'paper',
          'photo',
          'quantity',
          'value',
          'note',
          'card',
          'label',
          'amount',
          'progress',
          'timer',
          'page',
        ].includes(part.id)
      )
        part.visible = false;
      else {
        l.parts = l.parts.filter((p) => p.id !== part.id);
        selectedPart = null;
      }
    });
  }
  function resolvedPartColor(l, p) {
    if (p.color) return p.color;
    if (l.type === 'gift') return p.kind === 'paper' ? l.paperColor : l.inkColor;
    if (l.type === 'fleet')
      return p.kind === 'title' ? '#15151b' : p.kind === 'name' ? '#e4e3ec' : '#e7e7f2';
    if (l.type === 'sc')
      return (
        {
          card: '#141614',
          signal: '#ee4d41',
          label: '#f05245',
          name: '#eff0e7',
          amount: '#f3f1e8',
          body: '#f0f0e6',
          progress: '#f1493c',
          timer: '#ef5145',
          page: '#a5a999',
        }[p.kind] || '#9caaa1'
      );
    return p.kind === 'name'
      ? l.nameColor
      : ['body', 'text'].includes(p.kind)
        ? l.bodyColor
        : p.kind === 'shape'
          ? '#253129'
          : p.kind === 'signal'
            ? '#8ed4c4'
            : p.kind === 'divider'
              ? '#73786d'
              : '#73877d';
  }
  function overrideInfo(grid, l, key) {
    for (const item of ThemeInheritance.overrides(l, key)) {
      const box = document.createElement('div');
      box.className = 'inheritance-note full';
      box.dataset.inheritance = key + ':' + item.id;
      const note = document.createElement('span');
      note.textContent = item.name + '已独立设置' + item.label + ' ' + item.value;
      const edit = document.createElement('button');
      edit.textContent = '编辑部件';
      edit.onclick = () => choosePart(l.id, item.id);
      const reset = document.createElement('button');
      reset.textContent = '恢复继承';
      reset.disabled = partLocked(
        l,
        l.parts.find((p) => p.id === item.id),
      );
      reset.setAttribute('aria-label', item.name + '恢复继承' + item.label);
      reset.onclick = () =>
        transact(() =>
          ThemeInheritance.reset(
            styleLayer(project.layers.find((x) => x.id === l.id)),
            key,
            item.id,
          ),
        );
      box.append(note, edit, reset);
      grid.append(box);
    }
  }
  function refreshComponentMeasure() {
    const out = $('propertyFields').querySelector('[data-component-measure]'),
      l = selectedLayers()[0];
    if (!out || !l) return;
    const m = trackMessage(l);
    if (!m) {
      out.textContent = '回放消息后显示实际占位与排版尺寸。';
      return;
    }
    const parts = m.parts || [],
      card = parts.find((p) => p.id === 'card' || p.id === 'paper'),
      body = parts.find((p) => p.id === 'body'),
      badge = parts.find((p) => p.id === 'badge');
    const detail = card
      ? ' · 卡片 ' + +card.w.toFixed(1) + ' px'
      : body
        ? ' · 正文区域 ' + +body.w.toFixed(1) + ' px'
        : badge
          ? ' · 徽记 ' + +badge.w.toFixed(1) + ' px'
          : '';
    out.textContent = '最近预览占位 ' + +m.width.toFixed(1) + ' px' + detail;
    if (l.contentWidth > m.width + 0.5)
      out.textContent += '。已受容器宽度限制，扩大容器后可继续展开。';
  }
  function refreshPartMeasure() {
    const out = $('propertyFields').querySelector('[data-part-measure]'),
      l = selectedLayers()[0];
    if (!out || !l) return;
    const m = trackMessage(l),
      p = m?.parts?.find((p) => p.id === selectedPart);
    out.textContent = p
      ? '当前排版范围 ' +
        +p.w.toFixed(1) +
        ' × ' +
        +p.h.toFixed(1) +
        ' px' +
        (p.size &&
        [
          'name',
          'title',
          'body',
          'text',
          'quantity',
          'value',
          'note',
          'label',
          'amount',
          'timer',
          'page',
        ].includes(p.kind)
          ? ' · 字号 ' + +p.size.toFixed(1) + ' px'
          : '')
      : '发送或回放一条消息，即可查看实际排版尺寸。';
  }
  function partProperties(area, l) {
    const p = selectedPartData();
    if (!p) {
      selectedPart = null;
      return;
    }
    const head = document.createElement('section');
    head.className = 'property-section';
    head.innerHTML = '<h3>组件内部 · 独立部件</h3>';
    let grid = document.createElement('div');
    grid.className = 'fields';
    head.append(grid);
    area.append(head);
    const section = (title) => {
      const box = document.createElement('section');
      box.className = 'property-section';
      const h = document.createElement('h3');
      h.textContent = title;
      grid = document.createElement('div');
      grid.className = 'fields';
      box.append(h, grid);
      area.append(box);
    };
    $('selectionLabel').textContent = l.name + ' / ' + p.name;
    $('propertyType').textContent = p.name;
    const input = (key, label, type = 'number', options = {}) => {
      const lab = document.createElement('label');
      lab.textContent = label;
      lab.className = options.full ? 'full' : '';
      const el = document.createElement(
        type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input',
      );
      el.disabled =
        (M.effective(project, l).locked && key !== 'visible') ||
        (p.locked && !['visible', 'locked'].includes(key));
      el.dataset.partProp = key;
      el.setAttribute('aria-label', label);
      if (type === 'select') {
        for (const [v, name] of options.values) {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = name;
          el.append(o);
        }
      } else if (type !== 'textarea') el.type = type;
      if (type === 'checkbox') el.checked = p[key];
      else {
        const val = trackList(p, l)?.some((t) => t.property === key && t.enabled !== false)
          ? trackValue(p, key, l)
          : p[key];
        el.value =
          key === 'src' && String(val).startsWith('data:')
            ? ''
            : typeof val === 'number'
              ? +val.toFixed(2)
              : val || (type === 'color' ? resolvedPartColor(l, p) : val);
        if (key === 'src')
          el.placeholder = String(val).startsWith('data:')
            ? '已嵌入图片，输入地址可替换'
            : '图片网址或本地相对路径';
      }
      for (const key of ['min', 'max', 'step'])
        if (options[key] !== undefined) el[key] = options[key];
      lab.append(el);
      grid.append(lab);
      let dirty = false;
      el.onfocus = () => (dirty = false);
      el.oninput = () => {
        if (type === 'number' && !el.value.trim()) return;
        if (!dirty) {
          checkpoint();
          if (trackList(p, l)?.some((t) => t.property === key && t.enabled !== false))
            seekTracks(l, trackTime(l));
          dirty = true;
        }
        const part = selectedPartData();
        if (!part) return;
        if (key === 'placement') {
          const measured = trackMessage(l)?.parts?.find((r) => r.id === part.id),
            next = ThemeGeometry.rebasePart(part, el.value, measured);
          if (!next) {
            el.value = part.placement;
            dirty = false;
            toast('换算后的位置超出可编辑范围，请先调整位置或关键帧。');
            return;
          }
          Object.assign(part, next);
        } else
          setAnimated(
            part,
            key,
            type === 'checkbox' ? el.checked : type === 'number' ? +el.value : el.value,
            l,
          );
        update({ fields: false, layers: ['name', 'visible', 'locked'].includes(key) });
        if (key === 'color') {
          const reset = area.querySelector('.part-color-reset');
          if (reset) {
            reset.textContent = selectedPartData().color ? '恢复继承颜色' : '当前继承组件颜色';
            reset.disabled = !selectedPartData().color || partLocked(l, selectedPartData());
          }
        }
      };
      el.onchange = () => {
        dirty = false;
        if (['color', 'placement', 'locked'].includes(key)) propertiesUI();
      };
      return el;
    };
    input('name', '部件名称', 'text', { full: true });
    input('visible', '显示部件', 'checkbox');
    input('locked', '锁定部件', 'checkbox');
    input('placement', '定位方式', 'select', {
      full: true,
      values: [
        ['flow', '跟随内容排版 + 偏移'],
        ['free', '自由定位'],
      ],
    });
    input('x', 'X 偏移 / 位置', 'number', { min: -600, max: 1920 });
    input('y', 'Y 偏移 / 位置', 'number', { min: -600, max: 1080 });
    const measure = document.createElement('output');
    measure.dataset.partMeasure = '';
    measure.className = 'part-measure full';
    grid.append(measure);
    const inspect = document.createElement('button');
    inspect.className = 'wide full';
    inspect.textContent = '回放此部件所在消息';
    inspect.onclick = () => {
      $('testKind').value = l.type;
      $('testKind').onchange();
      startTimeline();
      choosePart(l.id, p.id);
    };
    grid.append(inspect);
    refreshPartMeasure();
    if (
      !['signal', 'badge', 'particles', 'photo'].includes(p.kind) &&
      !(p.kind === 'title' && l.type === 'fleet')
    )
      input('w', '宽度 · 0 自动', 'number', { min: 0, max: 1920, full: true });
    if (['image', 'shape', 'paper', 'card'].includes(p.kind))
      input('h', ['paper', 'card'].includes(p.kind) ? '高度 · 0 包含内容' : '高度', 'number', {
        min: ['paper', 'card'].includes(p.kind) ? 0 : 1,
        max: 1080,
      });
    section('部件外观');
    if (
      [
        'signal',
        'badge',
        'particles',
        'photo',
        'name',
        'title',
        'body',
        'text',
        'quantity',
        'value',
        'note',
        'label',
        'amount',
        'timer',
        'page',
      ].includes(p.kind)
    )
      input(
        'size',
        p.kind === 'signal'
          ? '三角宽度 · 0 原版'
          : p.kind === 'badge'
            ? '稳定轮廓宽度 · 0 跟随组件'
            : p.kind === 'particles'
              ? '发射区域宽度 · 0 原版'
              : p.kind === 'photo'
                ? '照片尺寸 · 0 跟随组件'
                : '字号 · 0 跟随组件',
        'number',
        { min: 0, max: ['badge', 'particles', 'photo'].includes(p.kind) ? 600 : 120, full: true },
      );
    if (
      [
        'name',
        'title',
        'body',
        'text',
        'quantity',
        'value',
        'note',
        'label',
        'amount',
        'timer',
        'page',
      ].includes(p.kind)
    ) {
      input('font', '字体', 'select', {
        full: true,
        values: [
          ['native', '原版字体'],
          ['sans', '无衬线 · 多语言'],
          ['serif', '衬线 · 档案'],
          ['condensed', 'Roboto Condensed · 窄体'],
          ['mono', '等宽 · 编号'],
        ],
      });
      if (!(l.type === 'fleet' && p.kind === 'title')) {
        input('linePercent', '行高 % · 0 原版', 'number', {
          min: 0,
          max: 250,
          step: 5,
          full: true,
        });
      }
      if (!(l.type === 'fleet' && p.kind === 'title') && !(l.type === 'sc' && p.kind === 'body')) {
        input('maxLines', '最大行数 · 0 原版', 'number', { min: 0, max: 20, step: 1, full: true });
        input('overflow', '超出行数', 'select', {
          full: true,
          values: [
            ['ellipsis', '末行省略号'],
            ['clip', '直接截断'],
          ],
        });
        const tip = document.createElement('p');
        tip.className = 'property-note full';
        tip.textContent = '0 保持原版行数；新增文字不限制行数。调整宽度会重新换行，字号保持不变。';
        grid.append(tip);
      }
      if (!(l.type === 'fleet' && ['title', 'name'].includes(p.kind)))
        input('align', '文字对齐', 'select', {
          full: true,
          values: [
            ['left', '左对齐'],
            ['center', '居中'],
            ['right', '右对齐'],
          ],
        });
    }
    if (
      [
        'name',
        'title',
        'body',
        'text',
        'quantity',
        'value',
        'note',
        'label',
        'amount',
        'timer',
        'page',
      ].includes(p.kind)
    )
      input('weight', '字重 · 0 跟随组件', 'number', { min: 0, max: 900, step: 100, full: true });
    if (['signal', 'divider', 'line', 'progress'].includes(p.kind))
      input('strokeWidth', '线宽', 'number', { min: 0, max: 12, step: 0.1 });
    if (!['particles', 'photo', 'image'].includes(p.kind)) {
      input('color', '颜色', 'color');
      const resetColor = document.createElement('button');
      resetColor.textContent = p.color ? '恢复继承颜色' : '当前继承组件颜色';
      resetColor.className = 'part-color-reset';
      resetColor.disabled = !p.color || partLocked(l, p);
      resetColor.onclick = () => transact(() => (selectedPartData().color = ''));
      grid.append(resetColor);
    }
    if (p.kind === 'title' && l.type === 'fleet') input('fill', '标题底色', 'color');
    input('opacity', '不透明度', 'number', { min: 0, max: 1, step: 0.05 });
    if (['image', 'photo'].includes(p.kind)) {
      section('图片素材');
      input('src', '图片地址', 'text', { full: true });
      input('fit', '图片填充', 'select', {
        full: true,
        values: [
          ['contain', '完整显示'],
          ['cover', '填满并裁切'],
          ['fill', '自由比例'],
        ],
      });
      if (p.kind === 'image') {
        input('imageMode', '显现方式', 'select', {
          full: true,
          values: [
            ['reveal', '横向显影'],
            ['evidence', '档案物证显影'],
            ['plain', '直接显示'],
          ],
        });
        input('grayscale', '去色', 'number', { min: 0, max: 1, step: 0.1 });
      }
      const upload = document.createElement('button');
      upload.textContent = '选择本地图片';
      upload.className = 'wide full';
      upload.disabled = partLocked(l, p);
      upload.onclick = () => openAssetPicker({ layer: l.id, part: p.id });
      grid.append(upload);
      if (p.kind === 'photo') {
        const resetPhoto = document.createElement('button');
        resetPhoto.textContent = '恢复原版物证';
        resetPhoto.className = 'wide full';
        resetPhoto.disabled = partLocked(l, p);
        resetPhoto.onclick = () => transact(() => (selectedPartData().src = ''));
        grid.append(resetPhoto);
      }
    }
    section('显现节奏');
    input('delay', '额外显现延迟 ms', 'number', { min: 0, max: 5000, step: 10, full: true });
    if (p.kind === 'text') {
      section('动态文字');
      input('text', '文字 / 动态字段', 'textarea', { full: true });
      const n = document.createElement('p');
      n.className = 'property-note full';
      n.textContent = '插入字段后，每条真实消息会自动填入对应内容。';
      grid.append(n);
      const chips = document.createElement('div');
      chips.className = 'binding-chips full';
      for (const token of ThemeBindings.available(l.type)) {
        const b = document.createElement('button');
        b.textContent = '{' + token + '}';
        b.disabled = partLocked(l, p);
        b.onclick = () => {
          const el = area.querySelector('[data-part-prop=text]'),
            from = el.selectionStart,
            to = el.selectionEnd,
            old = el.value;
          transact(
            () =>
              (selectedPartData().text = old.slice(0, from) + '{' + token + '}' + old.slice(to)),
          );
          area.querySelector('[data-part-prop=text]')?.focus();
        };
        chips.append(b);
      }
      grid.append(chips);
    }
    if (ThemeBindings.defaults[l.type]?.[p.kind] !== undefined) {
      section('文字内容');
      const lab = document.createElement('label');
      lab.className = 'full';
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = p.template !== null;
      enabled.disabled = partLocked(l, p);
      lab.append(enabled, '自定义显示文字');
      grid.append(lab);
      enabled.onchange = () =>
        transact(() => {
          selectedPartData().template = enabled.checked
            ? ThemeBindings.defaults[l.type][p.kind]
            : null;
        });
      if (p.template !== null) {
        input('template', '显示模板', 'textarea', { full: true });
        const chips = document.createElement('div');
        chips.className = 'binding-chips full';
        for (const token of ThemeBindings.available(l.type)) {
          const b = document.createElement('button');
          b.textContent = '{' + token + '}';
          b.title = ThemeBindings.fields[token];
          b.disabled = partLocked(l, p);
          b.onclick = () => {
            const el = area.querySelector('[data-part-prop=template]'),
              from = el.selectionStart,
              to = el.selectionEnd,
              old = el.value;
            transact(
              () =>
                (selectedPartData().template =
                  old.slice(0, from) + '{' + token + '}' + old.slice(to)),
            );
            const next = area.querySelector('[data-part-prop=template]');
            next?.focus();
          };
          chips.append(b);
        }
        grid.append(chips);
        const note = document.createElement('p');
        note.className = 'property-note full';
        note.textContent =
          '字段随真实消息更新，文字仍使用本组件原有的显影和退场。关闭自定义可恢复原版文案。';
        grid.append(note);
      }
    }
    section('部件操作');
    const reset = document.createElement('button');
    reset.textContent = '恢复此部件默认样式';
    reset.title = '恢复排版、外观和动画；保留文字内容与导入素材';
    reset.className = 'wide full';
    reset.disabled = partLocked(l, p);
    reset.onclick = () =>
      transact(() => {
        const current = selectedPartData();
        Object.assign(current, M.resetPartStyle(current, l.type));
      });
    grid.append(reset);
    const back = document.createElement('button');
    back.className = 'wide full';
    back.textContent = '返回组件属性';
    back.onclick = () => {
      selectedPart = null;
      propertiesUI();
      selectionUI();
    };
    grid.append(back);
    partAddControls(grid, l);
    mountTracks(area, l, p);
  }
  function partRects(l) {
    if (!ready || !l) return [];
    const records = previewRecords(),
      msg = records.findLast(
        (m) =>
          m.kind === l.type &&
          (!m.layerId || m.layerId === l.id) &&
          m.visible &&
          m.y + m.height > 0,
      ),
      chat = ThemeInstances.owner(project, l);
    if (!msg?.parts) return [];
    const feed = ThemeInstances.feed(project, l) && chat,
      displayScale = feed ? 1 : msg.displayScale || 1,
      displayOffsetX = feed ? 0 : msg.displayOffsetX || 0;
    return msg.parts
      .filter((p) => p.visible)
      .map((p) =>
        ThemeGeometry.project(
          {
            ...p,
            x: (feed ? chat.x : l.x) + displayOffsetX + (27 + (msg.x || 0) + p.x) * displayScale,
            y: (feed ? chat.y + chat.paddingTop : l.y) + (msg.y + p.y) * displayScale,
            w: p.w * displayScale,
            h: p.h * displayScale,
            displayScale,
            layerId: l.id,
          },
          feed ? chat : l,
        ),
      );
  }
  function partSelection(root) {
    const l = selectedLayers()[0],
      r = partRects(l).find((p) => p.id === selectedPart);
    if (!r) return;
    const box = document.createElement('div');
    box.className = 'selection-box part-selection';
    Object.assign(box.style, {
      left: r.x + 'px',
      top: r.y + 'px',
      width: Math.max(6, r.w) + 'px',
      height: Math.max(6, r.h) + 'px',
      transform: `rotate(${r.rotation || 0}deg)`,
    });
    const label = document.createElement('span');
    label.className = 'name';
    label.textContent = r.name;
    box.append(label);
    if (!partLocked(l, selectedPartData()) && !(r.kind === 'title' && l.type === 'fleet')) {
      const handle = document.createElement('i');
      handle.className = 'handle br';
      box.append(handle);
    }
    root.append(box);
  }
  setInterval(() => {
    if (!ready || document.hidden) return;
    inspectFrame(() => {
      ThemeTrackEditor.refresh($('propertyFields'));
      ThemePropertyMotion.refresh($('propertyFields'));
      timelineOverview?.refresh();
      refreshPartMeasure();
      refreshComponentMeasure();
      const l = selectedLayers()[0];
      if (
        (selectedPart ||
          l?.type === 'resonance' ||
          (l?.type === 'fleet' && l.effectScope === 'custom')) &&
        !gesture &&
        !effectGesture &&
        !partGesture
      )
        selectionUI();
    });
  }, 100);
  function guideGeometry() {
    const l = selectedLayers()[0];
    if (!l || selectedPart || M.effective(project, l).locked) return null;
    const chat = ThemeInstances.owner(project, l);
    if (l.type === 'resonance') {
      const sample = frame.contentWindow.ThemeRenderer.fieldValues(l.id) || l,
        ax = sample.anchorX,
        ay = sample.anchorY;
      const a = (l.rotation * Math.PI) / 180,
        dx = ax - l.w / 2,
        dy = ay - l.h / 2;
      return {
        type: 'source',
        x: l.x + l.w / 2 + dx * Math.cos(a) - dy * Math.sin(a),
        y: l.y + l.h / 2 + dx * Math.sin(a) + dy * Math.cos(a),
        layer: { ...l, anchorX: ax, anchorY: ay },
      };
    }
    if (l.type === 'fleet' && l.effectScope === 'custom') {
      const base =
        ThemeInstances.feed(project, l) && chat ? { x: chat.x, y: chat.y } : { x: 0, y: 0 };
      const value = { ...l, ...trackSample(l, l) };
      return {
        type: 'region',
        x: base.x + value.effectX,
        y: base.y + value.effectY,
        w: value.effectW,
        h: value.effectH,
        layer: { ...value },
      };
    }
    return null;
  }
  function effectGuides(root) {
    const g = guideGeometry();
    if (!g) return;
    const box = document.createElement('div');
    box.className = 'effect-guide ' + g.type;
    box.dataset.effectGuide = g.type;
    Object.assign(box.style, {
      left: g.x + 'px',
      top: g.y + 'px',
      width: (g.w || 0) + 'px',
      height: (g.h || 0) + 'px',
      '--handle-size': 18 / scale + 'px',
      '--guide-stroke': 1 / scale + 'px',
    });
    const label = document.createElement('span');
    label.textContent = g.type === 'source' ? '✛ 发射点' : '✛ 干扰区域';
    label.style.fontSize = 11 / scale + 'px';
    box.append(label);
    if (g.type === 'region') {
      const h = document.createElement('i');
      h.className = 'region-resize';
      box.append(h);
    }
    root.append(box);
  }
  function selectionUI() {
    const root = $('selection');
    root.replaceChildren();
    if (selectedPart) {
      partSelection(root);
      return;
    }
    effectGuides(root);
    for (const l of expanded().filter(canvasLayer)) {
      const box = document.createElement('div');
      box.className = 'selection-box';
      Object.assign(box.style, {
        left: l.x + 'px',
        top: l.y + 'px',
        width: l.w + 'px',
        height: l.h + 'px',
        transform: `rotate(${l.rotation}deg)`,
      });
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = l.name;
      box.append(label);
      if (expanded().filter(canvasLayer).length === 1 && !M.effective(project, l).locked)
        for (const corner of ['tl', 'tr', 'bl', 'br']) {
          const h = document.createElement('i');
          h.className = 'handle ' + corner;
          box.append(h);
        }
      root.append(box);
    }
    const many = expanded().filter(canvasLayer);
    if (many.length > 1) {
      const r = M.bounds(many),
        box = document.createElement('div');
      box.className = 'selection-box';
      Object.assign(box.style, {
        left: r.x + 'px',
        top: r.y + 'px',
        width: r.w + 'px',
        height: r.h + 'px',
      });
      for (const corner of ['tl', 'tr', 'bl', 'br']) {
        const h = document.createElement('i');
        h.className = 'handle ' + corner;
        box.append(h);
      }
      root.append(box);
    }
  }
  function fit() {
    const r = $('canvasArea').getBoundingClientRect(),
      v = viewport();
    $('artboard').style.width = v.w + 'px';
    $('artboard').style.height = v.h + 'px';
    frame.style.left = -v.x + 'px';
    frame.style.top = -v.y + 'px';
    for (const el of [$('selection'), $('guides')])
      el.style.transform = `translate(${-v.x}px,${-v.y}px)`;
    scale =
      zoom === 'fit'
        ? Math.max(0.05, Math.min((r.width - 90) / v.w, (r.height - 94) / v.h))
        : +zoom;
    const x = (r.width - v.w * scale) / 2 + pan.x + 10,
      y = (r.height - v.h * scale) / 2 + pan.y + 10;
    $('artboard').style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    $('zoomLabel').textContent =
      Math.round(scale * 100) + '% · ' + Math.round(v.w) + ' × ' + Math.round(v.h);
    for (const [id, limit, offset] of [
      ['rulerX', v.w, x - 22],
      ['rulerY', v.h, y - 22],
    ]) {
      const root = $(id);
      root.replaceChildren();
      for (let n = 0; n <= limit; n += 100) {
        const tick = document.createElement('span');
        tick.className = 'ruler-tick';
        tick.style[id === 'rulerX' ? 'left' : 'top'] = offset + n * scale + 'px';
        if (n % 200 === 0) {
          const b = document.createElement('b');
          b.textContent = n;
          tick.append(b);
        }
        root.append(tick);
      }
    }
  }
  function point(e) {
    const r = gestureView || $('artboard').getBoundingClientRect(),
      v = gestureView || viewport(),
      unit = gestureView?.scale || scale;
    return { x: v.x + (e.clientX - r.left) / unit, y: v.y + (e.clientY - r.top) / unit };
  }
  function inside(l, p) {
    const a = (-l.rotation * Math.PI) / 180,
      cx = l.x + l.w / 2,
      cy = l.y + l.h / 2,
      x = (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a) + cx,
      y = (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) + cy;
    return x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h;
  }
  function canvasLayer(l) {
    return (
      l.type !== 'group' &&
      !ThemeInstances.feed(project, l) &&
      (!chatMode ||
        l.standalone ||
        l.id === viewport().id ||
        ThemeInstances.owner(project, l)?.id === viewport().id)
    );
  }
  function hit(p) {
    return [...project.layers]
      .reverse()
      .find(
        (l) =>
          canvasLayer(l) &&
          M.effective(project, l).visible &&
          !M.effective(project, l).locked &&
          inside(l, p),
      );
  }
  function snapMove(x, y, w, h, skip) {
    const threshold = 7 / scale,
      v = viewport(),
      tx = [v.x, v.x + v.w / 2, v.x + v.w],
      ty = [v.y, v.y + v.h / 2, v.y + v.h];
    for (const l of project.layers)
      if (!skip.has(l.id) && canvasLayer(l) && M.effective(project, l).visible) {
        tx.push(l.x, l.x + l.w / 2, l.x + l.w);
        ty.push(l.y, l.y + l.h / 2, l.y + l.h);
      }
    const lines = [];
    function axis(v, size, targets, kind) {
      let best = threshold,
        delta = 0,
        at = null;
      for (const target of targets)
        for (const edge of [v, v + size / 2, v + size])
          if (Math.abs(target - edge) < best) {
            best = Math.abs(target - edge);
            delta = target - edge;
            at = target;
          }
      if (at !== null) lines.push({ kind, at });
      return v + delta;
    }
    const result = { x: axis(x, w, tx, 'x'), y: axis(y, h, ty, 'y') };
    $('guides').replaceChildren();
    for (const { kind, at } of lines) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      for (const [k, v] of Object.entries(
        kind === 'x' ? { x1: at, x2: at, y1: 0, y2: 1080 } : { y1: at, y2: at, x1: 0, x2: 1920 },
      ))
        line.setAttribute(k, v);
      line.setAttribute('stroke', '#db9083');
      line.setAttribute('stroke-width', 1 / scale);
      line.setAttribute('stroke-dasharray', '8 8');
      $('guides').append(line);
    }
    return result;
  }
  const hitArea = $('hitArea');
  let partGesture = null;
  // Keep the pointer origin fixed while the focused chat viewport is resized.
  hitArea.addEventListener(
    'pointerdown',
    () => {
      const r = $('artboard').getBoundingClientRect();
      gestureView = { ...viewport(), left: r.left, top: r.top, scale };
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'])
    window.addEventListener(type, () => (gestureView = null), true);
  let effectGesture = null;
  hitArea.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || tool === 'hand' || space) return;
      const g = guideGeometry();
      if (!g) return;
      const p = point(e),
        near = (x, y) => Math.hypot(p.x - x, p.y - y) < 18 / scale,
        resize = g.type === 'region' && near(g.x + g.w, g.y + g.h);
      if (!resize && !near(g.x, g.y)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      checkpoint();
      const at = trackTime(g.layer);
      if (trackList(g.layer, g.layer)?.length) seekTracks(g.layer, at);
      effectGesture = { start: p, source: structuredClone(g), resize, at };
      hitArea.setPointerCapture(e.pointerId);
    },
    true,
  );
  hitArea.addEventListener(
    'pointermove',
    (e) => {
      if (!effectGesture) return;
      e.stopImmediatePropagation();
      const g = effectGesture,
        p = point(e),
        l = selectedLayers()[0],
        dx = p.x - g.start.x,
        dy = p.y - g.start.y,
        old = g.source.layer;
      if (g.source.type === 'source') {
        const a = (-old.rotation * Math.PI) / 180;
        setAnimated(
          l,
          'anchorX',
          M.num(old.anchorX + dx * Math.cos(a) - dy * Math.sin(a), 0, l.w, old.anchorX),
          l,
          g.at,
        );
        setAnimated(
          l,
          'anchorY',
          M.num(old.anchorY + dx * Math.sin(a) + dy * Math.cos(a), 0, l.h, old.anchorY),
          l,
          g.at,
        );
      } else if (g.resize) {
        setAnimated(l, 'effectW', Math.max(32, old.effectW + dx), l, g.at);
        setAnimated(l, 'effectH', Math.max(32, old.effectH + dy), l, g.at);
      } else {
        setAnimated(l, 'effectX', old.effectX + dx, l, g.at);
        setAnimated(l, 'effectY', old.effectY + dy, l, g.at);
      }
      update({ fields: false, layers: false });
    },
    true,
  );
  for (const event of ['pointerup', 'pointercancel'])
    hitArea.addEventListener(
      event,
      (e) => {
        if (!effectGesture) return;
        e.stopImmediatePropagation();
        effectGesture = null;
        update();
      },
      true,
    );

  hitArea.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || tool === 'hand' || space) return;
      const candidates = project.layers.filter((l) => l.parts?.length),
        selectedComponent = selectedLayers()[0],
        layer = selectedComponent?.parts?.length
          ? selectedComponent
          : candidates.find((l) =>
              partRects(l).some((r) => {
                const p = point(e);
                return ThemeGeometry.contains(r, p);
              }),
            );
      if (
        !layer ||
        !M.effective(project, layer).visible ||
        M.effective(project, layer).locked ||
        (!chatMode && !selected.has(layer.id))
      )
        return;
      const pos = point(e),
        rects = partRects(layer),
        chosen = rects.find((r) => r.id === selectedPart),
        corner =
          chosen &&
          !(chosen.kind === 'title' && layer.type === 'fleet') &&
          Math.hypot(
            pos.x - ThemeGeometry.point(chosen, chosen.w, chosen.h).x,
            pos.y - ThemeGeometry.point(chosen, chosen.w, chosen.h).y,
          ) <
            12 / scale,
        r = corner
          ? chosen
          : [...rects].reverse().find((r) => ThemeGeometry.contains(r, pos, 4 / scale));
      if (!r) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      hitArea.focus();
      choosePart(layer.id, r.id);
      if (partLocked(layer, selectedPartData())) return;
      checkpoint();
      const part = selectedPartData(),
        at = trackTime(layer),
        sample = trackSample(part, layer);
      if (trackList(part, layer)?.length) seekTracks(layer, at);
      partGesture = {
        start: pos,
        part: { ...structuredClone(part), x: sample.x ?? part.x, y: sample.y ?? part.y },
        rect: r,
        resize: corner,
        at,
      };
      hitArea.setPointerCapture(e.pointerId);
    },
    true,
  );
  hitArea.addEventListener(
    'pointermove',
    (e) => {
      if (!partGesture) return;
      e.stopImmediatePropagation();
      const g = partGesture,
        pos = point(e),
        part = selectedPartData(),
        delta = ThemeGeometry.vector(pos.x - g.start.x, pos.y - g.start.y, -(g.rect.rotation || 0)),
        dx = delta.x / (g.rect.displayScale || 1),
        dy = delta.y / (g.rect.displayScale || 1);
      if (g.resize) {
        if (['signal', 'badge', 'particles', 'photo'].includes(part.kind))
          part.size = Math.max(4, g.rect.w / (g.rect.displayScale || 1) + dx);
        else part.w = Math.max(12, g.rect.w / (g.rect.displayScale || 1) + dx);
        if (['image', 'shape', 'paper', 'card'].includes(part.kind))
          part.h = Math.max(1, g.rect.h / (g.rect.displayScale || 1) + dy);
      } else {
        setAnimated(part, 'x', g.part.x + dx, selectedLayers()[0], g.at);
        setAnimated(part, 'y', g.part.y + dy, selectedLayers()[0], g.at);
      }
      update({ fields: false, layers: false });
    },
    true,
  );
  for (const event of ['pointerup', 'pointercancel'])
    hitArea.addEventListener(
      event,
      (e) => {
        if (!partGesture) return;
        e.stopImmediatePropagation();
        partGesture = null;
        update();
      },
      true,
    );
  hitArea.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    $('contextMenu').hidden = true;
    if (inlineId) return;
    const p = point(e);
    if (tool === 'hand' || space) {
      gesture = { type: 'pan', start: { x: e.clientX, y: e.clientY }, pan: { ...pan } };
    } else {
      let corner = null;
      const one = expanded().filter(canvasLayer);
      if (one.length > 0 && one.every((l) => !M.effective(project, l).locked)) {
        const l = one.length === 1 ? one[0] : { ...M.bounds(one), rotation: 0 };
        for (const [name, x, y] of [
          ['tl', l.x, l.y],
          ['tr', l.x + l.w, l.y],
          ['bl', l.x, l.y + l.h],
          ['br', l.x + l.w, l.y + l.h],
        ]) {
          const a = (l.rotation * Math.PI) / 180,
            cx = l.x + l.w / 2,
            cy = l.y + l.h / 2,
            px = cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
            py = cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
          if (Math.hypot(p.x - px, p.y - py) < 12 / scale) corner = name;
        }
      }
      const target = corner ? one[0] : hit(p);
      if (target) {
        if (!selected.has(target.id) && !selected.has(target.parent)) {
          select(e.shiftKey ? [...selected, target.id] : [target.id]);
        }
        checkpoint();
        gesture = {
          type: corner ? 'resize' : 'move',
          corner,
          start: p,
          layers: structuredClone(
            expanded().filter((l) => canvasLayer(l) && !M.effective(project, l).locked),
          ),
          bounds: M.bounds(expanded().filter(canvasLayer)),
        };
      } else {
        if (!e.shiftKey) select([]);
        gesture = { type: 'marquee', start: p, previous: [...selected] };
      }
    }
    hitArea.setPointerCapture(e.pointerId);
    hitArea.focus();
    e.preventDefault();
  });
  hitArea.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const g = gesture,
      p = point(e);
    if (g.type === 'pan') {
      pan = { x: g.pan.x + e.clientX - g.start.x, y: g.pan.y + e.clientY - g.start.y };
      fit();
      return;
    }
    const dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (g.type === 'marquee') {
      const r = {
        x: Math.min(p.x, g.start.x),
        y: Math.min(p.y, g.start.y),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };
      selected = new Set([
        ...g.previous,
        ...project.layers
          .filter(
            (l) =>
              canvasLayer(l) &&
              !M.effective(project, l).locked &&
              M.effective(project, l).visible &&
              l.x >= r.x &&
              l.y >= r.y &&
              l.x + l.w <= r.x + r.w &&
              l.y + l.h <= r.y + r.h,
          )
          .map((l) => l.id),
      ]);
      selectionUI();
      const box = document.createElement('div');
      box.className = 'marquee';
      Object.assign(box.style, {
        left: r.x + 'px',
        top: r.y + 'px',
        width: r.w + 'px',
        height: r.h + 'px',
      });
      $('selection').append(box);
      return;
    }
    if (g.type === 'move') {
      let x = g.bounds.x + dx,
        y = g.bounds.y + dy;
      if ($('snap').checked && !e.altKey) {
        const s = snapMove(x, y, g.bounds.w, g.bounds.h, new Set(g.layers.map((l) => l.id)));
        x = s.x;
        y = s.y;
      }
      for (const axis of ['x', 'y']) {
        const lo = Math.max(...g.layers.map((l) => M.positionRange(l, axis)[0] - l[axis])),
          hi = Math.min(...g.layers.map((l) => M.positionRange(l, axis)[1] - l[axis])),
          delta = M.num((axis === 'x' ? x : y) - g.bounds[axis], lo, hi, 0);
        if (axis === 'x') x = g.bounds.x + delta;
        else y = g.bounds.y + delta;
      }
      for (const original of g.layers) {
        const l = project.layers.find((l) => l.id === original.id);
        l.x = original.x + x - g.bounds.x;
        l.y = original.y + y - g.bounds.y;
      }
    } else {
      const original = g.layers.length === 1 ? g.layers[0] : { ...g.bounds, rotation: 0 },
        left = g.corner.includes('l'),
        top = g.corner.includes('t'),
        a = (original.rotation * Math.PI) / 180,
        lx = dx * Math.cos(a) + dy * Math.sin(a),
        ly = -dx * Math.sin(a) + dy * Math.cos(a);
      let w = Math.max(8, original.w + (left ? -lx : lx)),
        h = Math.max(8, original.h + (top ? -ly : ly));
      if (e.shiftKey || g.layers.some((l) => l.type === 'game' || l.type === 'music'))
        h = w / (original.w / original.h);
      const sx = left ? 1 : -1,
        sy = top ? 1 : -1,
        cx = original.x + original.w / 2,
        cy = original.y + original.h / 2,
        ax = cx + ((sx * original.w) / 2) * Math.cos(a) - ((sy * original.h) / 2) * Math.sin(a),
        ay = cy + ((sx * original.w) / 2) * Math.sin(a) + ((sy * original.h) / 2) * Math.cos(a),
        x = ax - ((sx * w) / 2) * Math.cos(a) + ((sy * h) / 2) * Math.sin(a) - w / 2,
        y = ay - ((sx * w) / 2) * Math.sin(a) - ((sy * h) / 2) * Math.cos(a) - h / 2;
      for (const item of g.layers) {
        const l = project.layers.find((l) => l.id === item.id);
        if (g.layers.length === 1) Object.assign(l, { w, h, x, y });
        else
          Object.assign(l, {
            x: x + ((item.x - g.bounds.x) * w) / g.bounds.w,
            y: y + ((item.y - g.bounds.y) * h) / g.bounds.h,
            w: (item.w * w) / g.bounds.w,
            h: (item.h * h) / g.bounds.h,
          });
      }
    }
    update({ fields: false, layers: false });
  });
  function endGesture() {
    if (!gesture) return;
    gesture = null;
    $('guides').replaceChildren();
    update();
  }
  hitArea.addEventListener('pointerup', endGesture);
  hitArea.addEventListener('pointercancel', endGesture);
  hitArea.addEventListener('dblclick', (e) => {
    const l = hit(point(e));
    if (l?.type === 'text') editText(l);
  });
  hitArea.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const pos = point(e),
      current = selectedLayers()[0],
      candidates = chatMode
        ? project.layers.filter((l) => componentTypes.includes(l.type))
        : current?.parts?.length
          ? [current]
          : [];
    let found;
    for (const raw of [...candidates].reverse()) {
      if (!M.effective(project, raw).visible) continue;
      const r = [...partRects(raw)]
        .reverse()
        .find((r) => ThemeGeometry.contains(r, pos, 2 / scale));
      if (r) {
        found = { layer: raw.id, part: r.id };
        break;
      }
    }
    if (found) choosePart(found.layer, found.part);
    else {
      const l = hit(pos);
      if (l) {
        if (selectedPart || !selected.has(l.id)) select([l.id]);
      } else select([]);
    }
    context(e.clientX, e.clientY);
  });
  let contextSession = null;
  function context(x, y) {
    const m = $('contextMenu'),
      items = selectedLayers(),
      l = items[0],
      part = selectedPartData(),
      locked = part && partLocked(l, part),
      all = expanded(),
      copyable = part
        ? !locked && !['badge', 'particles', 'photo', 'progress'].includes(part.kind)
        : all.some((x) => x.type !== 'group'),
      at = part ? l.parts.findIndex((p) => p.id === part.id) : -1;
    contextSession = {
      epoch: documentEpoch,
      selection: [...selected].join('|'),
      part: selectedPart,
    };
    m.setAttribute('role', 'menu');
    let title = m.querySelector('.context-title');
    if (!title) {
      title = document.createElement('div');
      title.className = 'context-title';
      m.prepend(title);
    }
    title.textContent = part
      ? part.name + ' · 内部部件'
      : items.length > 1
        ? items.length + ' 个图层'
        : l?.name || '画布';
    const labels = {
      duplicate: part ? '复制部件' : '复制图层',
      group: '编组',
      lock: part
        ? part.locked
          ? '解锁部件'
          : '锁定部件'
        : items.length && items.every((l) => l.locked)
          ? '解锁图层'
          : '锁定图层',
      hide: part
        ? part.visible
          ? '隐藏部件'
          : '显示部件'
        : items.length && items.every((l) => l.visible)
          ? '隐藏图层'
          : '显示图层',
      up: part ? '上移部件' : '上移一层',
      down: part ? '下移部件' : '下移一层',
      delete: part ? '移除部件' : '删除图层',
    };
    const disabled = {
      duplicate: !copyable,
      group: !!part || all.filter((l) => l.type !== 'group').length < 2,
      lock: !l || (!!part && M.effective(project, l).locked),
      hide: !l,
      up: !l || (!!part && (locked || at >= l.parts.length - 1)),
      down: !l || (!!part && (locked || at <= 0)),
      delete: part ? locked : !all.some((l) => !M.effective(project, l).locked),
    };
    for (const b of m.querySelectorAll('[data-context]')) {
      const action = b.dataset.context,
        kbd = b.querySelector('kbd');
      b.replaceChildren(document.createTextNode(labels[action]));
      if (kbd) b.append(kbd);
      b.disabled = !!disabled[action];
      b.setAttribute('role', 'menuitem');
    }
    m.hidden = false;
    const r = m.getBoundingClientRect();
    Object.assign(m.style, {
      left: Math.max(8, Math.min(innerWidth - r.width - 8, x)) + 'px',
      top: Math.max(8, Math.min(innerHeight - r.height - 8, y)) + 'px',
    });
    m.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }
  function contextToggle(key) {
    const l = selectedLayers()[0],
      part = selectedPartData();
    if (!part) {
      toggle(key);
      return;
    }
    if (!l || (key === 'locked' && M.effective(project, l).locked)) return;
    transact(() => {
      part[key] = !part[key];
    });
  }
  $('contextMenu').onkeydown = (e) => {
    const m = $('contextMenu'),
      buttons = [...m.querySelectorAll('button:not(:disabled)')],
      at = buttons.indexOf(document.activeElement);
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'Tab', ' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab') {
        m.hidden = true;
        hitArea.focus({ preventScroll: true });
      } else if (e.key === ' ' || e.key === 'Enter') document.activeElement?.click();
      else
        buttons[
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : (at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus({ preventScroll: true });
    }
  };

  function editText(l) {
    inlineId = l.id;
    const t = $('inlineText');
    t.hidden = false;
    t.value = l.text;
    Object.assign(t.style, {
      left: l.x + 'px',
      top: l.y + 'px',
      width: l.w + 'px',
      height: l.h + 'px',
      fontSize: l.size + 'px',
      fontWeight: l.weight,
      lineHeight: l.lineHeight,
      fontFamily: M.fonts[l.font],
      color: l.color,
      transform: `rotate(${l.rotation}deg)`,
    });
    t.focus();
    t.select();
  }
  $('inlineText').addEventListener('blur', () => {
    if (!inlineId) return;
    const l = project.layers.find((l) => l.id === inlineId);
    if (l && l.text !== $('inlineText').value) transact(() => (l.text = $('inlineText').value));
    inlineId = null;
    $('inlineText').hidden = true;
  });
  $('canvasArea').addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = $('canvasArea').getBoundingClientRect(),
          mx = e.clientX - r.left - r.width / 2 - 10,
          my = e.clientY - r.top - r.height / 2 - 10,
          old = scale,
          next = M.num(scale * Math.exp(-e.deltaY * 0.002), 0.1, 2, scale);
        pan = { x: mx - ((mx - pan.x) * next) / old, y: my - ((my - pan.y) * next) / old };
        zoom = next;
        $('zoom').value = '';
        fit();
      } else if (tool === 'hand') {
        e.preventDefault();
        pan.x -= e.deltaX;
        pan.y -= e.deltaY;
        fit();
      }
    },
    { passive: false },
  );
  function setTool(value) {
    tool = value;
    document
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.classList.toggle('active', b.dataset.tool === value));
    hitArea.style.cursor = value === 'hand' ? 'grab' : 'default';
  }
  document
    .querySelectorAll('[data-tool]')
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => add(b.dataset.add)));
  document.querySelectorAll('[data-category]').forEach(
    (b) =>
      (b.onclick = () => {
        category = b.dataset.category;
        document
          .querySelectorAll('[data-category]')
          .forEach((x) => x.classList.toggle('active', x === b));
        assetsUI();
      }),
  );
  $('assetSearch').oninput = assetsUI;
  $('canvasArea').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('dropHint').hidden = false;
  });
  $('canvasArea').addEventListener('dragleave', (e) => {
    if (!$('canvasArea').contains(e.relatedTarget)) $('dropHint').hidden = true;
  });
  $('canvasArea').addEventListener('drop', async (e) => {
    e.preventDefault();
    $('dropHint').hidden = true;
    const type = e.dataTransfer.getData('application/x-control-asset'),
      p = point(e);
    if (type) add(type, p);
    else if (e.dataTransfer.files.length) await importAssets(e.dataTransfer.files, p);
  });
  let pendingAssetTarget = null,
    assetRequest = 0;
  const assetRequests = new Map();
  function resolveAssetTarget(target) {
    const base = project.layers.find((l) => l.id === target.layer);
    if (!base) throw Error('目标图层已删除，未写入素材。');
    if (M.effective(project, base).locked) throw Error('目标图层已锁定，未替换素材。');
    const style = target.variant ? base.variants?.[target.variant] : base;
    if (!style) throw Error('目标档位已移除，未写入素材。');
    const item = target.part ? style.parts?.find((p) => p.id === target.part) : base;
    if (!item) throw Error('目标部件已删除，未写入素材。');
    if (target.part && item.locked) throw Error('目标部件已锁定，未替换素材。');
    return { base, item };
  }
  function openAssetPicker(target = null) {
    const input = $('assetFile');
    if (target) {
      const base = project.layers.find((l) => l.id === target.layer);
      if (!base || M.effective(project, base).locked) {
        toast('先解锁图层，再替换素材。');
        return;
      }
      target = { ...target, variant: target.part ? activeVariant[base.id] || '' : '' };
    }
    pendingAssetTarget = target;
    input.value = '';
    input.multiple = !target;
    const kind = target ? project.layers.find((l) => l.id === target.layer)?.type : null;
    input.accept =
      target?.part || ['image', 'game'].includes(kind)
        ? 'image/png,image/jpeg,image/webp,image/gif'
        : kind === 'video'
          ? 'video/mp4,video/webm'
          : 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';
    input.click();
  }
  async function importAssets(files, point, target = null) {
    const list = [...files];
    if (!target && !roomForLayers(list.length)) return;
    const epoch = documentEpoch,
      request = ++assetRequest,
      targetKey = target ? JSON.stringify(target) : null;
    if (targetKey) assetRequests.set(targetKey, request);
    let index = 0;
    try {
      for (const file of target ? list.slice(0, 1) : list) {
        try {
          ThemeEditorImports.validate(file);
          if (target) {
            const { base } = resolveAssetTarget(target);
            if (
              (target.part || ['image', 'game'].includes(base.type)) &&
              !file.type.startsWith('image/')
            )
              throw Error('这个位置请使用图片文件。');
            if (base.type === 'video' && !file.type.startsWith('video/'))
              throw Error('这个图层请使用视频文件。');
          }
          const asset = await ThemeEditorImports.read(file);
          if (epoch !== documentEpoch) {
            toast('主题已经切换，本次素材未写入。');
            return;
          }
          if (!target && !roomForLayers(1)) return;
          if (target) {
            if (assetRequests.get(targetKey) !== request) return;
            const { base, item } = resolveAssetTarget(target);
            transact(() => {
              item.src = asset.src;
              if (base.type === 'background') base.mode = asset.type;
            });
            toast('已替换 ' + asset.name + (list.length > 1 ? '（采用第一个文件）' : ''));
          } else {
            let at = point;
            if (chatMode && !at) {
              const v = viewport();
              at = { x: v.x + 24, y: v.y + v.h * 0.4 };
            }
            const v = viewport(),
              factor = Math.min(
                1,
                (chatMode ? Math.max(2, v.w - 48) : 400) / asset.width,
                Math.min(540, chatMode ? Math.max(2, v.h - 48) : 540) / asset.height,
              );
            transact(() => {
              const l = M.layer({
                id: 'layer-' + crypto.randomUUID(),
                type: asset.type,
                name: asset.name,
                src: asset.src,
                x: (at?.x ?? 380) + index * 24,
                y: (at?.y ?? 320) + index * 24,
                w: asset.width * factor,
                h: asset.height * factor,
              });
              if (chatMode) {
                l.scope = 'chat';
                l.attach = 'chat';
              }
              project.layers.push(l);
              selected = new Set([l.id]);
            });
            toast('已嵌入 ' + asset.name);
          }
          index++;
        } catch (error) {
          toast(file.name + '：' + error.message);
        }
      }
    } finally {
      if (targetKey && assetRequests.get(targetKey) === request) assetRequests.delete(targetKey);
    }
  }
  $('assetFile').onchange = async (e) => {
    const files = [...e.target.files],
      target = pendingAssetTarget;
    pendingAssetTarget = null;
    e.target.value = '';
    await importAssets(files, undefined, target);
  };
  $('assetFile').oncancel = () => (pendingAssetTarget = null);
  $('importAsset').onclick = () => openAssetPicker();
  $('assetFile').closest('label').onclick = (e) => {
    if (e.target === $('assetFile')) return;
    e.preventDefault();
    openAssetPicker();
  };
  function align(which) {
    if (selectedPart) {
      alignPart(which);
      return;
    }
    const items = expanded().filter((l) => canvasLayer(l) && !M.effective(project, l).locked);
    if (!items.length) return;
    const b = items.length === 1 ? viewport() : M.bounds(items);
    transact(() => {
      for (const l of items) {
        if (which === 'left') l.x = b.x;
        if (which === 'center') l.x = b.x + (b.w - l.w) / 2;
        if (which === 'right') l.x = b.x + b.w - l.w;
        if (which === 'top') l.y = b.y;
        if (which === 'middle') l.y = b.y + (b.h - l.h) / 2;
        if (which === 'bottom') l.y = b.y + b.h - l.h;
      }
    });
  }
  document
    .querySelectorAll('[data-align]')
    .forEach((b) => (b.onclick = () => align(b.dataset.align)));
  $('undo').onclick = () => undo();
  $('redo').onclick = () => undo(true);
  $('group').onclick = group;
  $('ungroup').onclick = ungroup;
  $('delete').onclick = remove;
  $('duplicate').onclick = duplicate;
  $('layerUp').onclick = () => order(1);
  $('layerDown').onclick = () => order(-1);
  $('zoom').onchange = (e) => {
    zoom = e.target.value;
    pan = { x: 0, y: 0 };
    fit();
  };
  $('zoomIn').onclick = () => {
    zoom = Math.min(2, scale * 1.2);
    $('zoom').value = '';
    fit();
  };
  $('zoomOut').onclick = () => {
    zoom = Math.max(0.1, scale / 1.2);
    $('zoom').value = '';
    fit();
  };
  $('gridToggle').onclick = () => {
    $('canvasGrid').hidden = !$('canvasGrid').hidden;
    $('gridToggle').classList.toggle('active', !$('canvasGrid').hidden);
  };
  $('projectName').onchange = (e) => transact(() => (project.name = e.target.value));
  document
    .querySelectorAll('[data-close]')
    .forEach((b) => (b.onclick = () => b.closest('dialog').close()));
  $('projectMenu').onclick = () => {
    snapshotsUI();
    $('fileDialog').showModal();
  };
  $('chooseTemplate').onclick = () => $('templateDialog').showModal();
  $('helpOpen').onclick = () => $('helpDialog').showModal();
  document.querySelectorAll('[data-template]').forEach(
    (b) =>
      (b.onclick = () => {
        let old;
        try {
          old =
            b.dataset.template === 'custom'
              ? JSON.parse(localStorage.getItem('hiss-custom-layout-v1'))
              : null;
        } catch {}
        transact(() => {
          const settings = project.settings;
          syncLayoutDuration = 900;
          project = M.create(b.dataset.template, old);
          project.settings = settings;
          selected.clear();
        });
        $('templateDialog').close();
        zoom = 'fit';
        pan = { x: 0, y: 0 };
        fit();
      }),
  );
  function download(name, value) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  $('exportProject').onclick = () =>
    download(project.name.replace(/[<>:"/\\|?*]/g, '-') + '.json', project);
  $('importProject').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 40 * 1024 * 1024) throw Error();
      const raw = JSON.parse(await file.text());
      if (raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers))
        throw Error();
      const issue = M.capacityIssue(raw);
      if (issue) {
        toast(issue);
        return;
      }
      transact(() => {
        project = M.normalize(raw);
        selected.clear();
      });
      $('fileDialog').close();
      toast('主题已导入。');
    } catch {
      toast('请选择有效的控制主题 JSON 文件。');
    }
  };
  async function readSnapshots() {
    try {
      return (
        (await ThemeEditorStorage.get(snapKey)) ||
        (await ThemeEditorStorage.get(legacyKey + '-snapshots')) ||
        JSON.parse(localStorage.getItem(legacyKey + '-snapshots')) ||
        []
      );
    } catch {
      return [];
    }
  }
  $('snapshot').onclick = async () => {
    const snapshots = await readSnapshots();
    snapshots.unshift({
      time: new Date().toLocaleString('zh-CN'),
      project: structuredClone(project),
    });
    try {
      await ThemeEditorStorage.put(snapKey, snapshots.slice(0, 5));
      snapshotsUI();
      toast('已保存独立快照。');
    } catch {
      toast('快照空间不足，请导出主题文件留档。');
    }
  };
  async function snapshotsUI() {
    $('snapshots').replaceChildren();
    const recovered = (await ThemeEditorStorage.entries(key + '-recovery-'))
        .sort((a, b) => b.stamp - a.stamp)
        .slice(0, 10),
      snapshots = [...(await readSnapshots()), ...recovered];
    snapshots.forEach((s, index) => {
      const row = document.createElement('div'),
        label = document.createElement('span'),
        b = document.createElement('button');
      label.textContent = (s.recovered ? '自动保留 · ' : '') + s.time + ' · ' + s.project.name;
      b.textContent = '恢复';
      b.onclick = () => {
        transact(() => (project = M.normalize(s.project)));
        $('fileDialog').close();
      };
      row.append(label, b);
      $('snapshots').append(row);
    });
  }
  function control(id, value) {
    const el = frame.contentDocument?.getElementById(id);
    if (!el) return;
    if (value === undefined) {
      el.click();
      return;
    }
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function settingChanged(id, value) {
    if (/^live[A-Z]/.test(id) || id === 'messageSource') return;
    project.settings[id] = value;
    if (id === 'nowPlayingEnabled') {
      const l = project.layers.find((l) => l.type === 'music');
      if (l) l.visible = !!value;
    }
    if (id === 'resonanceStrength') {
      const l = project.layers.find((l) => l.type === 'hiss');
      if (l) l.intensity = Number(value);
      delete project.settings[id];
    }
  }
  let nativeMirrors = [];
  function openSettings(focus) {
    if (!ready) return;
    nativeMirrors = [];
    const root = $('nativeSettings');
    root.replaceChildren();
    const doc = frame.contentDocument;
    for (const section of doc.querySelectorAll(
      '.editor-scroll>.control-section,[data-frame-rate]',
    )) {
      const title =
        section.querySelector('h1,h2')?.textContent ||
        (section.hasAttribute('data-frame-rate') ? '动画帧率' : '');
      if (!title || ['直播布局', '自定义画布'].includes(title)) continue;
      const details = document.createElement('details');
      details.className = 'native-section';
      const summary = document.createElement('summary');
      summary.textContent = title;
      const clone = section.cloneNode(true);
      const sources = [...section.querySelectorAll('p,output,meter')];
      [...clone.querySelectorAll('p,output,meter')].forEach((n, i) =>
        nativeMirrors.push([n, sources[i]]),
      );
      clone.querySelectorAll('h1,h2').forEach((n) => n.remove());
      if (!section.hasAttribute('data-frame-rate'))
        clone.querySelectorAll('[data-frame-rate]').forEach((n) => n.remove());
      details.append(summary, clone);
      root.append(details);
      if (
        (focus === 'hiss' && /音频|界面/.test(title)) ||
        (['fleet', 'gift'].includes(focus) && /提示/.test(title)) ||
        (focus === 'timer' && /计时/.test(title)) ||
        (!focus && /画面设置/.test(title))
      )
        details.open = true;
      for (const el of clone.querySelectorAll('[id]')) {
        const id = el.id,
          source = doc.getElementById(id);
        el.id = 'native-' + id;
        el.dataset.nativeId = id;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
          if (el.type === 'checkbox') el.checked = source.checked;
          else if (el.type !== 'file') el.value = source.value;
          let rangeEditing = false;
          el.addEventListener('pointerdown', () => {
            if (el.type === 'range') {
              rememberSetting(id);
              checkpoint();
              rangeEditing = true;
            }
          });
          el.addEventListener('change', () => {
            if (el.type === 'file') return;
            if (/^live[A-Z]/.test(id) || id === 'messageSource' || el.type === 'password') {
              control(id, el.type === 'checkbox' ? el.checked : el.value);
              return;
            }
            if (!rangeEditing) {
              rememberSetting(id);
              checkpoint();
            }
            rangeEditing = false;
            const value = el.type === 'checkbox' ? el.checked : el.value;
            settingChanged(id, value);
            control(id, value);
            update({ fields: false });
          });
          el.addEventListener('input', () => {
            if (el.type === 'range') {
              if (!rangeEditing) {
                rememberSetting(id);
                checkpoint();
                rangeEditing = true;
              }
              settingChanged(id, el.value);
              control(id, el.value);
              save();
            }
          });
        } else if (el.tagName === 'BUTTON')
          el.onclick = (e) => {
            e.preventDefault();
            if (id.startsWith('timer')) {
              const before = frame.contentWindow.ThemeLiveBridge.timer;
              project.settings.timerElapsed = before.elapsedMs;
              project.settings.timerStarted = before.startedAt ?? 'paused';
              checkpoint();
            }
            source.click();
            if (/^live(?:Connect|Disconnect|Qr)/.test(id))
              clone.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
            if (id.startsWith('timer')) {
              const time = frame.contentWindow.ThemeLiveBridge.timer;
              project.settings.timerElapsed = time.elapsedMs;
              project.settings.timerStarted = time.startedAt ?? 'paused';
              save();
            }
            if (id === 'bandApply' || id === 'bandReset') {
              project.settings.audioApply = true;
              save();
            }
            setTimeout(() => {
              el.textContent = source.textContent;
            }, 80);
          };
      }
      clone.querySelectorAll('label[for]').forEach((l) => (l.htmlFor = 'native-' + l.htmlFor));
      clone
        .querySelectorAll('form')
        .forEach((f) => f.addEventListener('submit', (e) => e.preventDefault()));
    }
    $('settingsDialog').showModal();
  }
  $('settingsOpen').onclick = () => openSettings();
  setInterval(() => {
    if (!$('settingsDialog').open) return;
    for (const [el, source] of nativeMirrors) {
      if (!el.isConnected) continue;
      if (el.tagName === 'METER') el.value = source.value;
      else el.textContent = source.textContent;
    }
    const doc = frame.contentDocument;
    for (const el of $('nativeSettings').querySelectorAll('[data-native-id]')) {
      const source = doc.getElementById(el.dataset.nativeId);
      if (!source) continue;
      el.hidden = source.hidden;
      if ('disabled' in source) el.disabled = source.disabled;
      if (el.tagName === 'IMG') {
        const src = source.getAttribute('src');
        if (src) { if (el.getAttribute('src') !== src) el.setAttribute('src', src); }
        else el.removeAttribute('src');
      }
      if (['BUTTON', 'OUTPUT', 'P'].includes(el.tagName)) el.textContent = source.textContent;
      if (el.tagName === 'METER') el.value = source.value;
      if (el !== document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
        if (el.type === 'checkbox') el.checked = source.checked;
        else if (el.type !== 'file') el.value = source.value;
      }
      if (el.matches('input,select,textarea')) {
        const label = el.closest('label'),
          original = source.closest('label');
        if (label && original) {
          label.hidden = original.hidden;
          label.style.display = original.style.display;
        }
      }
    }
  }, 250);
  function themeUrl(obs) {
    const u = new URL('live.html', location.href);
    u.searchParams.set('layout', 'custom');
    u.searchParams.set('v', 'editor87');
    if (obs) u.searchParams.set('obs', '1');
    else u.searchParams.set('pure', '1');
    u.hash = new URLSearchParams({ theme: JSON.stringify(project) }).toString();
    return u.href;
  }
  $('publishOutput').value = chatMode ? 'chat' : 'scene';
  function outputChat() {
    return chatMode
      ? project.layers.find((l) => l.id === viewport().id)
      : ThemeInstances.owner(project, selectedLayers()[0] || {}) ||
          project.layers.find((l) => l.type === 'chat');
  }
  function outputInfo() {
    const chat = outputChat(),
      only = $('publishOutput').value === 'chat';
    $('outputSize').textContent =
      only && chat ? Math.ceil(chat.w) + ' × ' + Math.ceil(chat.h) : '1920 × 1080';
    $('outputHint').textContent = only
      ? '只输出组合弹幕区和附属装饰，保留消息、材质与动画；场景里的其他元素仍保存在主题中。'
      : '游戏画面仍由 OBS 游戏采集提供。编辑器里的游戏示例只用于排版，OBS 中自动隐藏。';
    const game = project.layers.find((l) => l.type === 'game');
    $('captureInfo').textContent = only
      ? chat && !M.effective(project, chat).visible
        ? '弹幕容器目前隐藏，请先显示它再用于 OBS。'
        : '弹幕区按原始像素输出，背景透明度沿用容器设置。'
      : game
        ? `游戏源位置 ${Math.round(game.x)}, ${Math.round(game.y)}；尺寸 ${Math.round(game.w)} × ${Math.round(game.h)}。`
        : '当前主题没有游戏窗口。';
  }
  let publishedUrl = '';
  async function publishDocument() {
    const response = await fetch('/api/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!response.ok) throw Error('主题保存失败（' + response.status + '），可先导出主题文件。');
    const { id } = await response.json();
    const u = new URL('live.html', location.href);
    u.searchParams.set('layout', 'custom');
    u.searchParams.set('theme', id);
    u.searchParams.set('obs', '1');
    if ($('publishOutput').value === 'chat') {
      u.searchParams.set('output', 'chat');
      const chat = outputChat();
      if (chat) u.searchParams.set('chat', chat.id);
    }
    return u.href;
  }
  async function refreshOutput() {
    outputInfo();
    $('obsUrl').value = '正在保存主题文件…';
    publishedUrl = '';
    try {
      publishedUrl = await publishDocument();
      $('obsUrl').value = publishedUrl;
    } catch (e) {
      $('obsUrl').value = e.message;
      toast(e.message);
    }
  }
  async function publishing() {
    const option = $('publishOutput').querySelector('[value=chat]');
    option.disabled = !project.layers.some((l) => l.type === 'chat');
    if (option.disabled) $('publishOutput').value = 'scene';
    $('publishDialog').showModal();
    await refreshOutput();
  }
  $('publishOutput').onchange = refreshOutput;
  $('publish').onclick = publishing;
  $('copyUrl').onclick = async () => {
    try {
      publishedUrl = await publishDocument();
      $('obsUrl').value = publishedUrl;
    } catch (e) {
      toast(e.message);
      return;
    }
    try {
      await navigator.clipboard.writeText(publishedUrl);
      toast('已复制 OBS 地址。');
    } catch {
      $('obsUrl').focus();
      $('obsUrl').select();
      toast('请复制下方已选中的主题地址。');
    }
  };
  $('openLive').onclick = async () => {
    try {
      publishedUrl = await publishDocument();
      const url = new URL(publishedUrl);
      url.searchParams.delete('obs');
      url.searchParams.set('pure', '1');
      window.open(url, '_blank');
    } catch (e) {
      toast(e.message);
    }
  };
  $('preview').onclick = () => {
    document.body.classList.toggle('previewing');
    const on = document.body.classList.contains('previewing');
    $('selection').hidden = on;
    $('guides').hidden = on;
    hitArea.hidden = on;
    $('canvasGrid').hidden = true;
    $('preview').textContent = on ? '返回编辑' : '预览';
  };
  let timelineActive = false,
    timelineDragging = false,
    timelineExit = false,
    timelineSeen = false,
    timelineCursor = null;
  function timelineMessage(kind) {
    const target = selectedLayers().find((l) => l.type === kind);
    return previewRecords().findLast(
      (m) => m.kind === kind && (!target || !m.layerId || m.layerId === target.id),
    );
  }
  function previewData() {
    const kind = $('testKind').value;
    return {
      kind,
      layerId: selectedLayers().find((l) => l.type === kind)?.id,
      styleKey:
        activeVariant[
          (
            selectedLayers().find((l) => l.type === kind) ||
            project.layers.find((l) => l.type === kind)
          )?.id
        ] || 'base',
      rank: $('testRank').value,
      tier: +$('testTier').value,
      sender: $('testName').value,
      body: $('testBody').value,
    };
  }
  function startTimeline(exit = false) {
    if (!ready) return;
    timelineExit = exit === true;
    timelineSeen = false;
    const kind = $('testKind').value;
    trackPhase = timelineExit && ['fleet', 'gift', 'sc'].includes(kind) ? 'exit' : 'entry';
    timelineActive = true;
    setPreviewPaused(false);
    frame.contentWindow.ThemeRenderer.preview('editor-preview', {
      ...previewData(),
      exitPreview: timelineExit,
    });
    const l =
      selectedLayers().find((l) => l.type === kind) || project.layers.find((l) => l.type === kind);
    if (l) select([l.id]);
    $('timelineState').textContent = '正在播放';
  }
  $('timelineReplay').onclick = () => startTimeline();
  const exitReplay = document.createElement('button');
  exitReplay.id = 'timelineExit';
  exitReplay.textContent = '回放退场';
  exitReplay.onclick = () => startTimeline(true);
  $('timelineReplay').after(exitReplay);
  exitReplay.hidden = !['fleet', 'gift', 'sc'].includes($('testKind').value);
  $('timelineSeek').onpointerdown = () => (timelineDragging = true);
  $('timelineSeek').onpointerup = () => (timelineDragging = false);
  function seekTimeline(ms) {
    if (!ready) return;
    const kind = $('testKind').value,
      found = timelineMessage(kind);
    if (!found) {
      timelineExit = false;
      trackPhase = 'entry';
      timelineSeen = false;
    }
    timelineActive = true;
    const time = Math.max(0, Math.min(30000, +$('timelineSeek').max || 30000, ms));
    setPreviewPaused(true);
    timelineCursor = { kind, time };
    frame.contentWindow.ThemeRenderer.preview('editor-seek', { ...previewData(), ms: time });
    $('timelineSeek').value = time;
    $('timelineTime').textContent = (time / 1000).toFixed(2) + ' s';
    $('timelineState').textContent = '逐帧检查';
  }
  function stepTimeline(direction) {
    if (!ready) return;
    const fps = frame.contentWindow.FrameRate?.fps || 60,
      kind = $('testKind').value,
      current =
        paused && timelineCursor?.kind === kind
          ? timelineCursor.time
          : timelineMessage(kind)?.age || 0;
    seekTimeline(((Math.round((current * fps) / 1000) + direction) * 1000) / fps);
  }
  for (const [id, label, direction, symbol] of [
    ['timelinePrevious', '上一帧', -1, '‹|'],
    ['timelineNext', '下一帧', 1, '|›'],
  ]) {
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    b.className = 'timeline-step';
    b.textContent = symbol;
    b.setAttribute('aria-label', label);
    b.onclick = () => stepTimeline(direction);
    b.onpointerenter = b.onfocus = () => {
      const fps = frame.contentWindow.FrameRate?.fps || 60;
      b.title = label + ' · ' + fps + ' FPS · ' + (1000 / fps).toFixed(2) + ' ms';
    };
    $('timelineSeek').before(b);
  }
  $('timelineSeek').oninput = (e) => {
    if (!timelineActive && !timelineSeen) return;
    seekTimeline(+e.target.value);
  };
  setInterval(() => {
    if (!ready || !timelineActive) return;
    const messages = previewRecords(),
      m = timelineMessage($('testKind').value);
    if (!m) {
      if (timelineExit && timelineSeen) {
        timelineActive = false;
        $('timelineState').textContent = '退场完成';
        $('timelineSeek').value = $('timelineSeek').max;
        $('timelineTime').textContent = (+$('timelineSeek').max / 1000).toFixed(2) + ' s';
      }
      return;
    }
    timelineSeen = true;
    const range = $('timelineSeek');
    range.max = timelineExit
      ? m.exitAt + m.exitMs
      : Math.max(1500, m.entryMs + 1200, (m.motionEnd || 0) + 200);
    if (!timelineDragging && !paused) range.value = Math.min(+range.max, m.age);
    $('timelineTime').textContent =
      (Math.min(+range.max, Math.max(0, m.age)) / 1000).toFixed(2) + ' s';
    if (!paused)
      $('timelineState').textContent =
        m.exitAt >= 0 && m.age >= m.exitAt ? '退场中' : m.age < m.entryMs ? '演变中' : '稳定动效';
  }, 80);
  $('testKind').onchange = () => {
    const kind = $('testKind').value;
    exitReplay.hidden = !['fleet', 'gift', 'sc'].includes(kind);
    $('testRank').hidden = kind !== 'fleet';
    $('testTier').hidden = kind !== 'sc';
    $('testBody').hidden = kind === 'fleet';
    $('testBody').placeholder = kind === 'gift' ? '礼物名称' : '消息内容';
  };
  function previewRankChanged(kind, key) {
    const base =
      selectedLayers().find((l) => l.type === kind) || project.layers.find((l) => l.type === kind);
    if (activeVariant[base?.id]) activeVariant[base.id] = base?.variants?.[key] ? key : '';
    if (selectedLayers()[0]?.type === kind) {
      propertiesUI();
      selectionUI();
    }
  }
  $('testRank').onchange = () => previewRankChanged('fleet', $('testRank').value);
  $('testTier').onchange = () => previewRankChanged('sc', $('testTier').value);
  $('testForm').onsubmit = (e) => {
    e.preventDefault();
    if (!ready) return;
    setPreviewPaused(false);
    frame.contentWindow.ThemeRenderer.preview('editor-send', previewData());
  };
  $('testPause').onclick = () => setPreviewPaused(!paused);
  $('testClear').onclick = () => {
    timelineActive = false;
    timelineSeen = false;
    timelineCursor = null;
    timelineExit = false;
    trackPhase = 'entry';
    $('timelineSeek').value = 0;
    $('timelineTime').textContent = '0.00 s';
    $('timelineState').textContent = '拖动检查入场过程';
    control('clearButton');
    propertiesUI();
  };
  $('testDemo').onclick = () => {
    timelineActive = false;
    if (paused) $('testPause').click();
    frame.contentWindow.ThemeRenderer.preview('editor-demo');
  };
  $('gameExample').onchange = (e) => control('gamePreview', e.target.checked);
  document.querySelectorAll('[data-context]').forEach(
    (b) =>
      (b.onclick = () => {
        $('contextMenu').hidden = true;
        if (
          !contextSession ||
          contextSession.epoch !== documentEpoch ||
          contextSession.selection !== [...selected].join('|') ||
          contextSession.part !== selectedPart
        ) {
          toast('选择已变化，请重新打开菜单。');
          return;
        }
        ({
          duplicate,
          group,
          lock: () => contextToggle('locked'),
          hide: () => contextToggle('visible'),
          up: () => order(1),
          down: () => order(-1),
          delete: remove,
        })[b.dataset.context]();
        hitArea.focus({ preventScroll: true });
      }),
  );
  document.addEventListener('pointerdown', (e) => {
    if (!$('contextMenu').contains(e.target)) $('contextMenu').hidden = true;
  });
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.target.closest('input,textarea,select') || document.querySelector('dialog[open]')) return;
    const ctrl = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase();
    if (!ctrl && !e.altKey && (k === ',' || k === '.')) {
      e.preventDefault();
      stepTimeline(k === '.' ? 1 : -1);
      return;
    }
    if (k === ' ') {
      space = true;
      e.preventDefault();
    }
    if (ctrl && ['z', 'd', 'g', 's', 'a'].includes(k)) {
      e.preventDefault();
      if (k === 'z') undo(e.shiftKey);
      if (k === 'd') duplicate();
      if (k === 'g') e.shiftKey ? ungroup() : group();
      if (k === 's') {
        save();
        toast('草稿已保存。');
      }
      if (k === 'a')
        select(
          project.layers
            .filter(
              (l) =>
                canvasLayer(l) &&
                M.effective(project, l).visible &&
                !M.effective(project, l).locked,
            )
            .map((l) => l.id),
        );
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      remove();
    }
    if (e.key.startsWith('Arrow') && selectedPart) {
      e.preventDefault();
      const l = selectedLayers()[0];
      if (partLocked(l, selectedPartData())) return;
      const n = e.shiftKey ? 10 : 1,
        at = trackTime(l);
      seekTracks(l, at);
      transact(() => {
        const p = selectedPartData();
        setAnimated(
          p,
          'x',
          trackValue(p, 'x', l) + (e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0),
          l,
          at,
        );
        setAnimated(
          p,
          'y',
          trackValue(p, 'y', l) + (e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0),
          l,
          at,
        );
      });
      return;
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const n = e.shiftKey ? 10 : 1;
      transact(() => {
        for (const l of expanded())
          if (canvasLayer(l) && !M.effective(project, l).locked) {
            l.x += e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
            l.y += e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
          }
      });
    }
    if (k === 'f') {
      focusSelection();
      return;
    }
    if (k === 'v') setTool('select');
    if (k === 'h') setTool('hand');
    if (k === 't') add('text');
    if (k === 'g') $('gridToggle').click();
    if (k === '0') {
      zoom = 'fit';
      pan = { x: 0, y: 0 };
      $('zoom').value = 'fit';
      fit();
    }
    if (k === 'escape') {
      select([]);
      $('contextMenu').hidden = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') space = false;
  });
  window.addEventListener('blur', () => (space = false));
  window.addEventListener('message', (e) => {
    if (
      e.source === frame.contentWindow &&
      e.origin === location.origin &&
      e.data?.channel === 'theme-media-error'
    )
      toast(e.data.message);
  });
  async function navigateEditor(chat) {
    if (chat && !roomForLayers(chatSlots(project))) return;
    if ((await save()) === false) return;
    const url = new URL(chat ? 'chat-editor.html' : 'theme-editor.html', location.href);
    url.searchParams.set('v', String(project.editorVersion));
    if (chat) {
      const choice = selectedLayers()[0],
        host = choice && ThemeInstances.owner(project, choice);
      if (host) url.searchParams.set('chat', host.id);
    }
    if (new URLSearchParams(location.search).has('qa')) url.searchParams.set('qa', '1');
    location.href = url.href;
  }
  $('editChat').onclick = () => navigateEditor(!chatMode);
  $('editChat').textContent = chatMode ? '返回直播画布' : '编辑弹幕区';
  $('compositionMode').onchange = (e) => {
    if (e.target.value === 'feed' && !roomForLayers(chatSlots(project))) {
      e.target.value = project.composition;
      return;
    }
    transact(() => {
      project.composition = e.target.value;
      if (project.composition === 'feed') ensureChatContainer(project, undefined, true);
      selected.clear();
    });
  };
  if (chatMode) {
    $('compositionMode').hidden = true;
    document.title = '弹幕区编辑器 · CONTROL';
    document.querySelector('.app-name').firstChild.textContent = '弹幕区编辑器 ';
    document.querySelector('.doc-size').textContent = '组合组件';
  }

  function focusSelection() {
    const items = expanded().filter((l) => l.type !== 'group');
    if (!items.length) {
      toast('先选择一个图层或部件。');
      return;
    }
    let rects;
    if (selectedPart) {
      const part = partRects(items[0]).find((p) => p.id === selectedPart);
      if (part) rects = [part];
    }
    if (!rects && items.length === 1 && componentTypes.includes(items[0].type) && editingFeed()) {
      const parts = partRects(items[0]);
      if (parts.length) rects = parts;
    }
    focusBounds(ThemeGeometry.visualBounds(rects || items));
  }
  function focusBounds(bounds) {
    const r = $('canvasArea').getBoundingClientRect(),
      v = viewport();
    zoom = Math.min(
      2,
      Math.max(
        0.1,
        Math.min((r.width - 120) / (bounds.w + 70), (r.height - 120) / (bounds.h + 70)),
      ),
    );
    pan = {
      x: (v.w / 2 - (bounds.x + bounds.w / 2 - v.x)) * zoom,
      y: (v.h / 2 - (bounds.y + bounds.h / 2 - v.y)) * zoom,
    };
    let option = $('zoom').querySelector('option[data-focus]');
    if (!option) {
      option = document.createElement('option');
      option.dataset.focus = 'true';
      $('zoom').append(option);
    }
    option.value = zoom;
    option.textContent = '聚焦 ' + Math.round(zoom * 100) + '%';
    $('zoom').value = zoom;
    fit();
  }
  const focusButton = document.createElement('button');
  focusButton.id = 'focusSelection';
  focusButton.textContent = '聚焦';
  focusButton.title = '聚焦所选 · F';
  focusButton.onclick = focusSelection;
  $('zoomIn').after(focusButton);
  const search = document.createElement('input');
  search.id = 'layerSearch';
  search.type = 'search';
  search.placeholder = '搜索图层或部件';
  search.setAttribute('aria-label', '搜索图层或部件');
  search.oninput = () => {
    layerQuery = search.value.trim().toLowerCase();
    layersUI();
  };
  $('layers').before(search);
  const divider = document.createElement('div');
  divider.className = 'inspector-divider';
  divider.tabIndex = 0;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', '调整属性与图层面板高度');
  divider.setAttribute('aria-orientation', 'horizontal');
  let dividing = false;
  const propertyPanel = document.querySelector('.properties'),
    inspector = document.querySelector('.inspector');
  function sizePanel(y) {
    const r = inspector.getBoundingClientRect(),
      height = Math.max(190, Math.min(r.height - 130, y - r.top));
    propertyPanel.style.height = height + 'px';
    divider.setAttribute('aria-valuenow', Math.round(height));
  }
  divider.onpointerdown = (e) => {
    dividing = true;
    divider.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  divider.onpointermove = (e) => {
    if (dividing) sizePanel(e.clientY);
  };
  divider.onpointerup = divider.onpointercancel = () => (dividing = false);
  divider.onkeydown = (e) => {
    if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      sizePanel(propertyPanel.getBoundingClientRect().bottom + (e.key === 'ArrowUp' ? -30 : 30));
    }
  };
  propertyPanel.after(divider);
  function loaded() {
    ready = !!frame.contentWindow.ThemeRenderer;
    if (!ready) {
      $('saveState').textContent = '预览未就绪';
      return;
    }
    update();
    if (!new URLSearchParams(location.search).has('qa'))
      setTimeout(() => frame.contentWindow.ThemeRenderer.preview('editor-demo'), 900);
  }
  frame.addEventListener('load', loaded);
  if (frame.contentWindow.ThemeRenderer) loaded();
  new ResizeObserver(fit).observe($('canvasArea'));
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  ThemeEditorGuide.install({ jump: jumpGuide, getProject: () => project, chatMode });
  ThemeEditorWorkspace.install();
  installOverview();
  function syncChatPicker() {
    if (!chatMode) return;
    let picker = $('chatInstancePicker');
    if (!picker) {
      picker = document.createElement('select');
      picker.id = 'chatInstancePicker';
      picker.setAttribute('aria-label', '正在编辑的弹幕区');
      document.querySelector('.appbar-end').prepend(picker);
      picker.onchange = () => {
        activeChatId = picker.value;
        selected.clear();
        selectedPart = null;
        pan = { x: 0, y: 0 };
        zoom = 'fit';
        update();
      };
    }
    const current = viewport().id;
    picker.replaceChildren(
      ...project.layers
        .filter((l) => l.type === 'chat')
        .map((l) => {
          const o = document.createElement('option');
          o.value = l.id;
          o.textContent = l.name;
          return o;
        }),
    );
    picker.value = current;
  }
  syncChatPicker();
  window.ThemeEditor = {
    sync: draftSync,
    get historyStats() {
      return undoStore.stats;
    },
    get project() {
      return structuredClone(project);
    },
    get selection() {
      return [...selected];
    },
    partRects,
    select,
    choosePart,
    add,
    detachGameFrame,
    apply(value) {
      const issue = M.capacityIssue(value);
      if (issue) {
        toast(issue);
        return false;
      }
      transact(() => (project = M.normalize(value)));
      return true;
    },
    undo,
    group,
    ungroup,
    remove,
    duplicate,
    order,
    save,
    themeUrl,
    ready: () => ready,
  };
  assetsUI();
  layersUI();
  propertiesUI();
  syncUndo();
  fit();
})();
