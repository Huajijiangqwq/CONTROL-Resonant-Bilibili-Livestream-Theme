/* Local named projects. Automatic drafts and the applied live theme are separate. */
(() => {
  'use strict';
  let mounted = false, editor, workingDocument = null, active = null, selected = null, projects = [], trash = false;
  let loadingList = false, listFailed = false;
  let busy = false, dirty = false, namingAction = null, statusTimeout, savedDocument = null, association = 0, resumeName = '';
  const $ = id => document.getElementById(id);
  const scope = location.pathname.endsWith('chat-editor.html') ? 'chat' : 'theme';
  const qaSuffix = new URLSearchParams(location.search).has('qa') ? '-qa' : '';
  const remembered = 'control-project-library-current-v2-' + scope + qaSuffix;
  const sharedKey = 'control-project-library-working-v2' + qaSuffix;
  const legacyRemembered = 'control-project-library-current-' + scope;
  const legacySharedKey = 'control-project-library-working' + qaSuffix;
  const writer = crypto.randomUUID();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(sharedKey) : null;
  let previewFrame = null, previewGeneration = 0, previewTimer = null, previewSizer = null, previewProject = null, previewPaused = false;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(label, action, className = '') {
    const node = el('button', className, label); node.type = 'button'; node.onclick = action; return node;
  }
  function status(message, bad = false) {
    clearTimeout(statusTimeout);
    $('projectLibraryStatus').textContent = message;
    $('projectLibraryStatus').classList.toggle('error', bad);
    const live = $('projectLibraryNotice'); live.textContent = message; live.classList.toggle('error', bad); live.hidden = false;
    statusTimeout = setTimeout(() => { live.hidden = true; }, bad ? 9000 : 4500);
  }
  function brief(record) {
    return { id: record.id, name: record.name, revision: record.revision, updatedAt: record.updatedAt };
  }
  const comparisonDocument = value => window.ThemeEditorModel.normalize(value);
  const sameDocument = (a, b) => window.ThemeDocumentCompare.same(a, b);
  function setActive(record, documentValue, event = 'control-project-opened', announce = true) {
    association++;
    const previousId = active?.id;
    active = record ? brief(record) : null;
    resumeName = '';
    if (documentValue) savedDocument = comparisonDocument(documentValue);
    else if (!active) savedDocument = null;
    dirty = !!active && !sameDocument(workingDocument || editor.project, savedDocument);
    try { active ? sessionStorage.setItem(remembered, JSON.stringify(active)) : sessionStorage.removeItem(remembered); } catch {}
    updateDraft();
    window.dispatchEvent(new CustomEvent(event, { detail: active ? { ...active } : null }));
    if (announce) {
      const state = { writer, id: active?.id || null, project: active ? { ...active } : null, at: Date.now() };
      try { localStorage.setItem(sharedKey, JSON.stringify(state)); } catch {}
      if (previousId !== active?.id || event === 'control-project-opened') channel?.postMessage(state);
    }
  }
  function detach() { if (mounted) setActive(null, null, 'control-project-opened'); }
  function remoteSwitch(state) {
    if (!state || state.writer === writer || !active || state.id === active.id) return;
    setActive(null, null, 'control-project-opened', false);
    status('另一窗口已切换项目，当前草稿已解除命名关联。请另存为项目后继续。');
  }
  function updateDraft() {
    const title = active ? active.name + (dirty ? ' · 有未存修改' : ' · 命名版本已保存') : resumeName ? '当前保留自动草稿 · 上次项目：' + resumeName : '当前自动草稿 · 尚未存为项目';
    $('projectDraftName').textContent = title;
    $('projectDraftName').title = title;
    $('projectSaveCopy').textContent = active ? '另存副本' : '保存当前草稿';
    const saveButton = $('saveProject');
    if (saveButton) { saveButton.title = active ? (dirty ? '保存修改到「' : '保存「') + active.name + '」 · Ctrl/Cmd+S' : '首次命名保存 · Ctrl/Cmd+S'; saveButton.dataset.unsaved = String(dirty || !active); }
    window.dispatchEvent(new CustomEvent('control-project-state', { detail: { current: active ? { ...active } : null, dirty } }));
  }
  async function request(path = '', method = 'GET', body) {
    let response;
    try { response = await fetch('/api/projects' + path, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new Error(e.name === 'TimeoutError' ? '项目服务响应超时。当前草稿仍在，请稍后重试。' : '无法连接本机项目服务，请确认桌面客户端正在运行。'); }
    let result;
    try { result = await response.json(); } catch { throw new Error('项目库服务未就绪，请启动新版客户端后重试。'); }
    if (!response.ok) throw Object.assign(new Error(result.error || '项目操作失败。'), { status: response.status, current: result.current });
    return result;
  }
  async function run(work) {
    if (busy) return;
    busy = true; $('projectLibraryDialog').classList.add('is-busy');
    $('projectLibraryDialog').setAttribute('aria-busy', 'true');
    try { return await work(); }
    catch (error) {
      if (error.status === 409) {
        $('projectConflict').hidden = false;
        if (!$('projectLibraryDialog').open) $('projectLibraryDialog').showModal();
        await refresh().catch(() => {});
      }
      status(error.message || '操作未完成；当前草稿已保留。', true);
    } finally { busy = false; $('projectLibraryDialog').classList.remove('is-busy'); $('projectLibraryDialog').removeAttribute('aria-busy'); }
  }
  async function retainDraft() {
    if ((await editor.save()) === false) throw new Error('当前草稿尚未保存，已取消切换。请先处理编辑器的保存冲突。');
  }
  const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const sizeLabel = bytes => bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  function miniature(project, large = false) {
    const canvas = el('canvas', large ? 'project-miniature large' : 'project-miniature');
    canvas.width = large ? 640 : 192;
    const aspect = Math.max(.25, Math.min(2, (project.height || 1080) / (project.width || 1920)));
    canvas.height = Math.round(canvas.width * aspect);
    canvas.setAttribute('aria-label', '布局示意缩略图');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101211'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = canvas.width / (project.width || 1920), sy = canvas.height / (project.height || 1080);
    const colors = { game: '#38423a', chat: '#292e2b', sc: '#873b34', fleet: '#a9aaa3', gift: '#b3b0a2', hiss: '#71382f', resonance: '#71382f', normal: '#5f7068', image: '#4e5a65', video: '#4e5a65', text: '#b8b8ad', logos: '#dadbd1', music: '#745947', border: '#797d70' };
    for (const layer of project.thumbnail || []) {
      if (layer.type === 'background') { ctx.fillStyle = layer.fill || '#101211'; ctx.fillRect(0, 0, canvas.width, canvas.height); continue; }
      if (['grain', 'group'].includes(layer.type)) continue;
      const x = (layer.x || 0) * sx, y = (layer.y || 0) * sy, w = Math.max(1, (layer.width || 30) * sx), h = Math.max(1, (layer.height || 20) * sy);
      ctx.fillStyle = colors[layer.type] || layer.fill || '#686c67';
      ctx.globalAlpha = (layer.opacity ?? 1) * (['hiss', 'resonance'].includes(layer.type) ? .25 : .8);
      if (['border', 'line'].includes(layer.type)) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); }
      else { ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#c3c5b033'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); }
      if (layer.type === 'game' && w > 15 && h > 10) {
        ctx.strokeStyle = '#829488'; ctx.lineWidth = Math.max(.5, sx * 2);
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      }
      if (layer.type === 'chat' && layer.feedKinds?.length) {
        const pad = Math.max(1, w * .08), inner = w - pad * 2;
        ctx.fillStyle = '#97a49a';
        for (let i = 0; i < 3; i++) ctx.fillRect(x + pad, y + h * (.12 + i * .1), inner * (.85 - i * .12), Math.max(1, h * .018));
        if (layer.feedKinds.includes('sc')) { ctx.fillStyle = '#813c35'; ctx.fillRect(x + pad, y + h * .48, inner, h * .19); }
        if (layer.feedKinds.includes('gift')) { ctx.fillStyle = '#bbbbae'; ctx.fillRect(x + pad, y + h * .74, inner, h * .14); }
      }
    }
    ctx.globalAlpha = 1; return canvas;
  }
  function renderList() {
    if (loadingList || listFailed) {
      const list = $('projectList'); list.replaceChildren();
      const empty = el('div', 'project-empty');
      empty.append(el('b', '', loadingList ? '正在读取项目…' : '暂时无法读取项目库'), el('p', '', loadingList ? '包含素材的项目可能需要稍等片刻。' : '请确认桌面客户端仍在运行。当前草稿与已保存项目没有被删除。'));
      if (listFailed) empty.append(button('重新读取', () => run(refresh), 'primary'));
      list.append(empty); $('projectLibraryCount').textContent = loadingList ? '正在读取…' : '读取失败';
      $('projectDetail').replaceChildren(el('p', 'project-detail-empty', loadingList ? '正在载入列表' : '重新连接后可查看项目'));
      return;
    }
    const query = $('projectSearch').value.trim().toLocaleLowerCase();
    const visible = projects.filter(p => p.name.toLocaleLowerCase().includes(query));
    if (!visible.some(project => project.id === selected)) selected = visible[0]?.id || null;
    const list = $('projectList'); list.replaceChildren();
    $('projectLibraryCount').textContent = visible.length + (trash ? ' 个可恢复项目' : ' 个项目');
    if (!visible.length) {
      const empty = el('div', 'project-empty');
      empty.append(el('b', '', query ? '没有匹配的项目' : trash ? '回收站为空' : '把当前草稿存为第一个项目'), el('p', '', query ? '试试其他关键词。' : trash ? '移除的项目会留在这里，可随时恢复。' : '命名版本保存在本机，可独立打开、复制或导出。自动草稿会继续保留。'));
      if (!query && !trash) empty.append(button('命名保存当前草稿', () => saveAs(), 'primary'));
      list.append(empty);
    }
    for (const project of visible) {
      const row = button('', () => { selected = project.id; renderList(); renderDetail(); }, 'project-row');
      row.setAttribute('aria-pressed', String(selected === project.id)); row.classList.toggle('selected', selected === project.id);
      row.ondblclick = () => { if (!trash) openProject(project.id); };
      const text = el('span', 'project-row-text');
      text.append(el('strong', '', project.name), el('small', '', `${project.width} × ${project.height} · ${project.composition === 'feed' ? '组合弹幕区' : '独立消息图层'}${active?.id === project.id ? ' · 当前项目' : ''}`));
      row.append(miniature(project), text, el('time', '', date(project.deletedAt || project.updatedAt)));
      list.append(row);
    }
    renderDetail();
  }
  function renderDetail() {
    const panel = $('projectDetail'); panel.replaceChildren(); panel.scrollTop = 0;
    const project = projects.find(p => p.id === selected);
    if (!project) { panel.append(el('p', 'project-detail-empty', '选择项目查看详情')); return; }
    panel.append(miniature(project, true), el('small', 'project-preview-note', '布局示意 · 下方可查看真实渲染'), el('h3', '', project.name), el('p', 'project-meta', `${project.width} × ${project.height} · ${project.layers} 个图层${project.bytes ? ' · ' + sizeLabel(project.bytes) : ''}\n${trash ? '移除' : '修改'}于 ${date(project.deletedAt || project.updatedAt)} · 版本 ${project.revision}`));
    const actions = el('div', 'project-actions');
    if (trash) actions.append(button('恢复项目', () => restoreProject(project), 'primary'));
    else {
      actions.append(button('打开项目', () => openProject(project.id), 'primary'));
      actions.append(button('查看真实预览', () => showPreview(project), 'project-preview-button'));
      actions.append(button('重命名', () => renameProject(project)), button('创建副本', () => copyProject(project)), button('导出 JSON', () => exportProject(project)), button('移入回收站', () => deleteProject(project), 'project-danger'));
    }
    panel.append(actions);
  }
  function stopPreview() {
    previewGeneration++; clearTimeout(previewTimer); previewTimer = null;
    previewSizer?.disconnect(); previewSizer = null;
    previewFrame?.remove(); previewFrame = null; previewProject = null; previewPaused = false;
    $('projectPreviewSurface')?.replaceChildren();
  }
  function previewCommand(command) {
    const renderer = previewFrame?.contentWindow?.ThemeRenderer;
    if (!renderer || !previewProject) return;
    if (command === 'replay') {
      previewPaused = false; renderer.pause(false); renderer.preview('pause', false);
      renderer.preview('clear'); renderer.preview('editor-demo');
    } else {
      previewPaused = !previewPaused; renderer.pause(previewPaused); renderer.preview('pause', previewPaused);
    }
    $('projectPreviewPause').textContent = previewPaused ? '继续播放' : '暂停检查';
    $('projectPreviewPause').setAttribute('aria-pressed', String(previewPaused));
  }
  async function showPreview(project) {
    if (busy) return;
    stopPreview(); const generation = previewGeneration;
    const dialog = $('projectPreviewDialog'), surface = $('projectPreviewSurface');
    $('projectPreviewTitle').textContent = project.name;
    $('projectPreviewStatus').textContent = '正在读取已保存的项目…';
    for (const id of ['projectPreviewReplay', 'projectPreviewPause', 'projectPreviewOpen']) $(id).disabled = true;
    if (!dialog.open) dialog.showModal();
    surface.append(el('p', 'project-preview-loading', '正在载入只读预览…'));
    try {
      const record = await request('/' + project.id);
      if (generation !== previewGeneration || !dialog.open) return;
      if (record.deletedAt) throw new Error('项目已移入回收站，请恢复后再预览。');
      previewProject = record;
      const frame = el('iframe', 'project-live-preview'); previewFrame = frame;
      frame.title = '已保存项目的只读真实预览'; frame.tabIndex = -1;
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.src = 'live.html?editor=1&obs=1&layout=custom&libraryPreview=1&fps=30';
      frame.style.visibility = 'hidden';
      const width = record.document.width || 1920, height = record.document.height || 1080;
      frame.style.width = width + 'px'; frame.style.height = height + 'px';
      function fitPreview() {
        if (generation !== previewGeneration || !previewFrame) return;
        const scale = Math.min(surface.clientWidth / width, surface.clientHeight / height);
        frame.style.transform = 'scale(' + scale + ')';
        frame.style.left = (surface.clientWidth - width * scale) / 2 + 'px';
        frame.style.top = (surface.clientHeight - height * scale) / 2 + 'px';
      }
      const deadline = Date.now() + 15000; let started = false;
      function start() {
        if (generation !== previewGeneration || !dialog.open || started) return;
        try {
          const renderer = frame.contentWindow?.ThemeRenderer;
          if (!renderer) {
            if (Date.now() >= deadline) throw new Error('预览加载超时。请关闭后重试；当前编辑与直播未改变。');
            previewTimer = setTimeout(start, 80); return;
          }
          started = true; clearTimeout(previewTimer); previewTimer = null;
          renderer.apply(record.document); renderer.preview('editor-demo');
          surface.querySelector('.project-preview-loading')?.remove();
          frame.style.visibility = 'visible'; fitPreview();
          $('projectPreviewTitle').textContent = record.name;
          $('projectPreviewStatus').textContent = '只读 · 已保存版本 · 使用模拟消息；音乐与媒体保持暂停。';
          $('projectPreviewPause').textContent = '暂停检查'; $('projectPreviewPause').setAttribute('aria-pressed', 'false');
          for (const id of ['projectPreviewReplay', 'projectPreviewPause', 'projectPreviewOpen']) $(id).disabled = false;
        } catch (error) {
          $('projectPreviewStatus').textContent = error.message || '这个项目暂时无法预览。';
          frame.remove(); previewFrame = null;
          surface.replaceChildren(el('p', 'project-preview-loading', '未能生成预览，原项目保持不变。'));
        }
      }
      frame.onload = start;
      surface.append(frame);
      previewSizer = new ResizeObserver(fitPreview); previewSizer.observe(surface);
      // A failed navigation can still dispatch load; the readiness timeout gives
      // a recoverable message instead of displaying an unrelated default theme.
      previewTimer = setTimeout(start, 120);
    } catch (error) {
      if (generation !== previewGeneration || !dialog.open) return;
      $('projectPreviewStatus').textContent = error.message;
      surface.replaceChildren(el('p', 'project-preview-loading', '无法读取这个项目。当前草稿与直播保持不变。'));
    }
  }
  async function refresh() {
    const previousSelection = selected;
    loadingList = true; listFailed = false; projects = []; selected = null; renderList();
    let result;
    try {
      result = await request(trash ? '?trash=1' : '');
      if (!Array.isArray(result.projects) || result.projects.some(project => !project || typeof project.id !== 'string' || typeof project.name !== 'string'))
        throw new Error('项目服务返回的列表不完整，请重启新版桌面客户端后重试。');
    }
    catch (error) { loadingList = false; listFailed = true; renderList(); throw error; }
    loadingList = false;
    projects = result.projects;
    selected = projects.some(p => p.id === previousSelection) ? previousSelection : projects.find(p => p.id === active?.id)?.id || projects[0]?.id || null;
    renderList();
    if (result.unreadable) status(`${result.unreadable} 个项目文件无法读取，原文件已保留。`, true);
    else if ($('projectLibraryStatus').classList.contains('error')) status('已重新连接项目库。当前草稿保持不变。');
  }
  function openLibrary() {
    if (!$('projectLibraryDialog').open) $('projectLibraryDialog').showModal();
    updateDraft(); run(refresh); setTimeout(() => $('projectSearch').focus(), 0);
  }
  function nameDialog(title, initial, action, submitLabel = '保存项目') {
    namingAction = action; $('projectNameTitle').textContent = title; $('projectNameInput').value = initial || '';
    $('projectNameSubmit').textContent = submitLabel; $('projectNameError').textContent = '';
    $('projectNameDialog').showModal(); setTimeout(() => { $('projectNameInput').focus(); $('projectNameInput').select(); }, 0);
  }
  async function saveProject(asCopy = false) {
    if (!mounted || busy) return;
    if (!active || asCopy) { saveAs(); return; }
    return run(async () => {
      const target = { ...active }, generation = association;
      status('正在保存「' + target.name + '」…');
      await retainDraft();
      if (association !== generation) throw new Error('另一窗口已切换项目。当前草稿未写入旧项目，请另存。');
      const snapshot = editor.project;
      const record = await request('/' + target.id, 'PUT', { revision: target.revision, name: snapshot.name, document: snapshot });
      if (association === generation) setActive(record, snapshot, 'control-project-saved');
      status('已保存「' + record.name + '」。直播画面保持已应用版本。');
      if ($('projectLibraryDialog').open) await refresh();
    });
  }
  function saveAs() {
    if (busy) return;
    let attempt = null;
    nameDialog(active ? '另存为副本' : '命名保存', (workingDocument || editor.project).name + (active ? ' 副本' : ''), async name => {
      // A durable named snapshot can also rescue a draft whose conflict is pending.
      await editor.save();
      const generation = association, snapshot = editor.project; snapshot.name = name;
      const serialized = JSON.stringify({ name, document: snapshot });
      if (!attempt || attempt.serialized !== serialized) attempt = { serialized, requestId: crypto.randomUUID() };
      const record = await request('', 'POST', { name, document: snapshot, requestId: attempt.requestId });
      if (association === generation) {
        setActive(null, null, 'control-project-opened');
        try {
          const current = editor.project;
          if (current.name !== name) {
            const renamed = { ...current, name };
            if (editor.apply(renamed) === false) throw new Error('apply');
            workingDocument = renamed;
          } else workingDocument = current;
        } catch { throw new Error('副本已保存到项目库，但当前草稿未能更新名称。可刷新项目库后重新打开。'); }
        setActive(record, snapshot, 'control-project-saved');
      }
      $('projectConflict').hidden = true;
      status('已保存为「' + name + '」。自动草稿继续保留。');
      if ($('projectLibraryDialog').open) await refresh();
    });
  }
  function openProject(id) {
    return run(async () => {
      status('正在保留草稿并打开项目…');
      await retainDraft();
      const record = await request('/' + id);
      if (record.deletedAt) throw new Error('项目已移入回收站，请先恢复。');
      // Preserve the unsaved working state in the existing recovery UI as well.
      if (window.ThemeEditorStorage) {
        const prefix = editor.draftKey || 'hiss-theme-editor-v92' + (new URLSearchParams(location.search).has('qa') ? '-qa' : '');
        await ThemeEditorStorage.put(prefix + '-recovery-project-open', { time: new Date().toLocaleString('zh-CN'), stamp: Date.now(), recovered: true, project: editor.project });
      }
      const ok = editor.loadProject ? await editor.loadProject(record.document) : editor.apply(record.document);
      if (ok === false) throw new Error('项目没有打开，当前草稿已保留。');
      workingDocument = editor.project;
      setActive(record, record.document);
      $('projectConflict').hidden = true;
      $('projectLibraryDialog').close(); status('已打开「' + record.name + '」。确认效果后再应用到直播。');
    });
  }
  function renameProject(project) {
    nameDialog('重命名项目', project.name, async name => {
      const generation = association;
      if (active?.id === project.id && active.revision !== project.revision)
        throw new Error('当前草稿基于较早的项目版本。请先另存副本，或重新打开最新项目，再重命名。');
      const record = await request('/' + project.id, 'PUT', { revision: project.revision, name });
      if (association === generation && active?.id === project.id) {
        active = brief(record);
        savedDocument = comparisonDocument(record.document);
        const renamed = { ...editor.project, name };
        editor.apply(renamed); workingDocument = renamed;
        dirty = !sameDocument(workingDocument, savedDocument);
        try { sessionStorage.setItem(remembered, JSON.stringify(active)); } catch {}
        updateDraft();
      }
      await refresh(); status('项目已重命名。');
    }, '确认名称');
  }
  function copyProject(project) {
    let attempt = null;
    nameDialog('创建项目副本', project.name + ' 副本', async name => {
      const source = await request('/' + project.id);
      const serialized = JSON.stringify({ name, document: source.document });
      if (!attempt || attempt.serialized !== serialized) attempt = { serialized, requestId: crypto.randomUUID() };
      const record = await request('', 'POST', { name, document: source.document, requestId: attempt.requestId });
      selected = record.id; await refresh(); status('副本已建立，当前工作草稿未切换。');
    }, '创建副本');
  }
  function download(documentValue, name) {
    const exported = window.ThemeDocumentValidation.serializeForExport(documentValue, window.ThemeEditorModel);
    const link = el('a'); const url = URL.createObjectURL(new Blob([exported.text], { type: 'application/json' }));
    link.href = url; link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80) + '.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    return exported;
  }
  function exportProject(project) { return run(async () => { const record = await request('/' + project.id); const result = download(record.document, record.name); status(result.warning || '已导出主题 JSON（含内嵌素材，不含登录信息）。', result.oversized); }); }
  function deleteProject(project) {
    return run(async () => {
      await request('/' + project.id, 'DELETE', { revision: project.revision });
      if (active?.id === project.id) setActive(null);
      await refresh(); status('已移入回收站。当前画布和直播画面均保留。');
    });
  }
  function restoreProject(project) { return run(async () => { await request('/' + project.id + '/restore', 'POST', { revision: project.revision }); await refresh(); status('已恢复，可在「我的项目」中打开。'); }); }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { status('文件超过 40 MB，请减少内嵌素材。', true); return; }
    await run(async () => {
      status('正在导入「' + String(file.name || '主题文件').slice(0, 80) + '」…');
      let raw; try { raw = JSON.parse(await file.text()); } catch { throw new Error('无法读取 JSON，请选择导出的 CONTROL 主题文件。'); }
      if (raw.format !== 'control-theme' || raw.version !== 1 || !Array.isArray(raw.layers)) throw new Error('这不是 CONTROL 主题文件。');
      window.ThemeDocumentValidation?.validate(raw, window.ThemeEditorModel);
      const record = await request('', 'POST', { name: raw.name || file.name.replace(/\.json$/i, ''), document: raw });
      trash = false; syncTabs(); selected = record.id; await refresh();
      status('已导入项目库；选择「打开项目」开始编辑，当前草稿未替换。');
    });
  }
  function syncTabs() {
    $('projectTabSaved').classList.toggle('active', !trash); $('projectTabTrash').classList.toggle('active', trash);
    $('projectTabSaved').setAttribute('aria-pressed', String(!trash)); $('projectTabTrash').setAttribute('aria-pressed', String(trash));
  }
  function mount(options = {}) {
    if (mounted) return api;
    editor = options.editor || window.ThemeEditor;
    if (!editor) return api;
    workingDocument = editor.project;
    mounted = true;
    const dialog = el('dialog', 'project-library'); dialog.id = 'projectLibraryDialog'; dialog.setAttribute('aria-labelledby', 'projectLibraryTitle');
    dialog.innerHTML = `<header class="project-library-head"><div><span class="project-eyebrow">本机主题</span><h2 id="projectLibraryTitle">项目库</h2></div><button type="button" id="projectLibraryClose" aria-label="关闭项目库">×</button></header><div class="project-draft"><span class="project-draft-dot"></span><div><b id="projectDraftName"></b><p>自动草稿用于继续编辑；命名项目用于留档。保存不会改变已应用的直播主题。</p></div><button type="button" id="projectSaveCopy">保存当前草稿</button></div><div class="project-library-toolbar"><div class="project-tabs"><button type="button" id="projectTabSaved" class="active">我的项目</button><button type="button" id="projectTabTrash">回收站</button></div><input id="projectSearch" type="search" placeholder="搜索项目名称" aria-label="搜索项目名称"><button type="button" id="projectLibraryRefresh">刷新</button><button type="button" id="projectImport">导入到项目库</button><input id="projectImportFile" type="file" accept=".json,application/json" hidden></div><div id="projectConflict" class="project-conflict" hidden><span>未覆盖其他窗口的修改。可以另存当前内容，或刷新后打开最新项目。</span><button type="button" id="projectConflictCopy">另存副本</button></div><div class="project-library-body"><section class="project-list-section"><div class="project-list-label"><span id="projectLibraryCount">正在读取…</span><span>最近修改</span></div><div id="projectList" class="project-list"></div></section><aside id="projectDetail" class="project-detail"></aside></div><footer id="projectLibraryStatus" class="project-library-status" role="status" aria-live="polite">项目只保存在当前电脑；导出 JSON 可备份或分享。</footer>`;
    const nameDialogNode = el('dialog', 'project-name-dialog'); nameDialogNode.id = 'projectNameDialog'; nameDialogNode.setAttribute('aria-labelledby', 'projectNameTitle');
    nameDialogNode.innerHTML = `<form id="projectNameForm"><h2 id="projectNameTitle">命名保存</h2><label for="projectNameInput">项目名称</label><input id="projectNameInput" maxlength="80" required autocomplete="off"><p id="projectNameError" role="alert"></p><div class="project-name-actions"><button type="button" id="projectNameCancel">取消</button><button type="submit" id="projectNameSubmit" class="primary">保存项目</button></div></form>`;
    const notice = el('div', 'project-library-notice'); notice.id = 'projectLibraryNotice'; notice.setAttribute('role', 'status'); notice.hidden = true;
    const previewDialog = el('dialog', 'project-preview-dialog'); previewDialog.id = 'projectPreviewDialog'; previewDialog.setAttribute('aria-labelledby', 'projectPreviewTitle');
    previewDialog.innerHTML = `<header class="project-preview-head"><div><span class="project-eyebrow">真实渲染 · 不切换编辑和直播</span><h2 id="projectPreviewTitle"></h2></div><button type="button" id="projectPreviewClose" aria-label="关闭真实预览">×</button></header><div id="projectPreviewSurface" class="project-preview-surface"></div><footer class="project-preview-footer"><p id="projectPreviewStatus" role="status"></p><div><button type="button" id="projectPreviewReplay">重播示例</button><button type="button" id="projectPreviewPause" aria-pressed="false">暂停检查</button><button type="button" id="projectPreviewOpen" class="primary">打开编辑</button></div></footer>`;
    document.body.append(dialog, nameDialogNode, notice, previewDialog);
    $('projectPreviewClose').onclick = () => previewDialog.close();
    previewDialog.addEventListener('close', stopPreview);
    dialog.addEventListener('close', () => { if (previewDialog.open) previewDialog.close(); else stopPreview(); });
    $('projectPreviewReplay').onclick = () => previewCommand('replay');
    $('projectPreviewPause').onclick = () => previewCommand('pause');
    $('projectPreviewOpen').onclick = () => { const id = previewProject?.id; previewDialog.close(); if (id) openProject(id); };
    $('projectLibraryClose').onclick = () => dialog.close();
    $('projectSaveCopy').onclick = saveAs;
    $('projectLibraryRefresh').onclick = () => run(refresh);
    $('projectConflictCopy').onclick = saveAs;
    $('projectImport').onclick = () => $('projectImportFile').click();
    $('projectImportFile').onchange = e => { importFile(e.target.files?.[0]); e.target.value = ''; };
    $('projectSearch').oninput = renderList;
    for (const [id, value] of [['projectTabSaved', false], ['projectTabTrash', true]]) $(id).onclick = () => { if (busy) return; trash = value; selected = null; syncTabs(); run(refresh); };
    $('projectNameCancel').onclick = () => { if (!busy) nameDialogNode.close(); };
    nameDialogNode.addEventListener('close', () => { namingAction = null; });
    nameDialogNode.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    $('projectNameForm').onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const name = $('projectNameInput').value.trim(); if (!name) return;
      const submitText = $('projectNameSubmit').textContent;
      busy = true; $('projectNameSubmit').disabled = true; $('projectNameCancel').disabled = true;
      $('projectNameInput').disabled = true; $('projectNameSubmit').textContent = '正在保存…';
      $('projectNameForm').setAttribute('aria-busy', 'true'); $('projectNameError').textContent = '';
      try { await namingAction(name); nameDialogNode.close(); }
      catch (error) { $('projectNameError').textContent = error.message || '保存失败，请重试。'; }
      finally {
        busy = false; $('projectNameSubmit').disabled = false; $('projectNameCancel').disabled = false;
        $('projectNameInput').disabled = false; $('projectNameSubmit').textContent = submitText;
        $('projectNameForm').removeAttribute('aria-busy');
      }
    };
    (options.openButton || $('projectLibraryOpen'))?.addEventListener('click', openLibrary);
    (options.saveButton || $('saveProject'))?.addEventListener('click', () => saveProject());
    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || event.altKey || document.querySelector('dialog[open]')) return;
      event.preventDefault(); event.stopPropagation(); document.activeElement?.blur(); saveProject(event.shiftKey);
    }, true);
    let changeTimer;
    window.addEventListener('theme-document-change', event => {
      if (event.detail?.document) workingDocument = event.detail.document;
      clearTimeout(changeTimer); changeTimer = setTimeout(() => {
        const next = active ? !sameDocument(workingDocument, savedDocument) : true;
        if (dirty !== next) { dirty = next; updateDraft(); }
      }, 200);
    });
    window.addEventListener('control-project-detach', detach);
    channel?.addEventListener('message', e => remoteSwitch(e.data));
    window.addEventListener('storage', e => { if (e.key === sharedKey && e.newValue) { try { remoteSwitch(JSON.parse(e.newValue)); } catch {} } });
    try { active = JSON.parse(sessionStorage.getItem(remembered)); } catch {}
    let previousWorking;
    try {
      previousWorking = JSON.parse(localStorage.getItem(sharedKey));
      if (active && previousWorking && previousWorking.id !== active.id) active = null;
      // Beta 2 associations have their own namespace. Legacy associations are
      // only candidates for the exact-content migration below, never authority
      // to attach a newer document to an old revision.
      if (!active && !previousWorking) {
        previousWorking = JSON.parse(localStorage.getItem(legacySharedKey));
        if (!previousWorking) {
          const old = JSON.parse(sessionStorage.getItem(legacyRemembered));
          if (old?.id) previousWorking = { id: old.id, project: old };
        }
      }
    } catch {}
    if (active) {
      const initialAssociation = association, initialId = active.id;
      request('/' + initialId).then(record => {
        if (association !== initialAssociation || active?.id !== initialId) return;
        if (record.deletedAt) { setActive(null); return; }
        // Keep the remembered revision: another window's newer save must conflict.
        savedDocument = comparisonDocument(record.document); dirty = !sameDocument(workingDocument, savedDocument); updateDraft();
      }).catch(error => {
        if (association !== initialAssociation || active?.id !== initialId) return;
        if (error.status === 404) setActive(null, null, 'control-project-opened', false);
        else status(error.message, true);
        updateDraft();
      });
    }
    else if (previousWorking?.id) {
      const initialAssociation = association, previousId = previousWorking.id;
      request('/' + previousId).then(record => {
        if (association !== initialAssociation || active || record.deletedAt) return;
        const current = workingDocument, saved = comparisonDocument(record.document);
        // A new tab may resume only when its loaded draft exactly matches the
        // named file. Different drafts stay unassociated rather than gaining a
        // newer revision that could overwrite another window's work.
        if (sameDocument(current, saved)) setActive(record, record.document, 'control-project-resumed', false);
        else { resumeName = record.name; updateDraft(); }
      }).catch(() => {});
    }
    syncTabs(); updateDraft();
    return api;
  }
  const api = { mount, open: openLibrary, save: saveProject, saveAs, importFile, detach, get current() { return active ? { ...active } : null; }, get dirty() { return dirty; } };
  window.ControlProjectLibrary = window.ThemeProjectLibrary = api;
})();

