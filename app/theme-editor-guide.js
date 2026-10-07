/* Navigation for the existing native controls; guide actions never rewrite a theme. */
(() => {
  'use strict';
  let openGuide = () => {};
  const tasks = [
    {
      id: 'crop', types: ['image', 'video'], label: '裁剪图片与视频',
      detail: '调整取景范围，保留原素材和图层框；随时恢复完整画面。', section: '裁剪',
    },
    {
      id: 'effects', types: ['image', 'video', 'text', 'shape', 'border', 'logos'], label: '编辑图层样式',
      detail: '描边、发光、叠色、投影可排序和单独关闭，整体开关比较前后效果。', section: '图层样式',
    },
    {
      id: 'logos',
      types: ['logos'],
      label: '编排中英双 Logo',
      detail: '中英文字标分别调整尺寸与间距，支持左右或上下排列，保持官方图形比例。',
      section: '双 Logo 内部排版',
    },
    {
      id: 'header',
      types: ['header'],
      label: '编辑主播栏',
      detail: '主播名、标题白框、直播状态和装饰可分别调整字号、留白与显示。',
      section: '标题栏内部排版',
    },
    {
      id: 'timer',
      types: ['timer'],
      label: '编排直播计时',
      detail: '时钟、标签和数字独立设置尺寸，支持横向与纵向排列。',
      section: '计时组件内部排版',
    },
    {
      id: 'chat',
      types: ['chat'],
      label: '弹幕比例与间距',
      detail: '容器宽度、留白和消息间距独立修改，字号保持不变。',
      section: '变换',
    },
    {
      id: 'fleet',
      types: ['fleet'],
      label: '搭建上舰提示',
      detail: '分别选择徽记、标题、用户名和碎光发射器。每个部件可单独锁定，固定已完成的排版。',
      part: 'badge',
    },
    {
      id: 'scope',
      types: ['fleet'],
      label: '设置特效影响范围',
      detail: '限制在组件、整个弹幕区，或在画布拖出自定义区域。',
      section: '特效影响区域',
    },
    {
      id: 'sc',
      types: ['sc'],
      label: '调整 SC 流纹',
      detail: '继承当前档位，独立调整扭曲、范围、色散和流速。',
      section: '希斯特效',
    },
    {
      id: 'flow',
      types: ['resonance', 'hiss'],
      label: '移动希斯发射点',
      detail: '独立流场用十字移动源头；旧版共振可先拆出两个流场。',
      section: '流场发射点',
    },
    {
      id: 'frame',
      types: ['border', 'game'],
      label: '编辑独立框线',
      detail: '独立边框可改变宽高；描边和角线保持像素尺寸。',
      section: '外观',
    },
    {
      id: 'motion',
      types: ['fleet', 'sc', 'gift', 'normal'],
      label: '修改动画曲线',
      detail: '原生入场节奏、部件显现延迟和属性关键帧分别编辑。',
      section: '原生演变动画',
    },
    {
      id: 'gift',
      types: ['gift'],
      label: '编辑礼物档案',
      detail: '纸张、照片和字段可分别设置位置、尺寸与动态文案。',
      section: '档案版式',
    },
  ];
  function available(t, project, chatMode) {
    return project.layers.some(
      (l) =>
        t.types.includes(l.type) &&
        (!chatMode ||
          l.scope === 'chat' ||
          ['chat', 'fleet', 'gift', 'normal', 'sc'].includes(l.type)),
    );
  }
  function buttons(root, { project, chatMode, jump }, compact = false) {
    for (const t of tasks) {
      if (compact && !['chat', 'fleet', 'sc', 'flow', 'scope', 'frame'].includes(t.id)) continue;
      const b = document.createElement('button');
      b.className = 'guide-task';
      b.dataset.guideTask = t.id;
      b.disabled = !available(t, project, chatMode);
      b.title = b.disabled ? '当前画布没有此组件' : t.detail;
      const title = document.createElement('strong');
      title.textContent = t.label;
      b.append(title);
      if (!compact) {
        const p = document.createElement('span');
        p.textContent = t.detail;
        b.append(p);
      }
      b.onclick = () => {
        document.getElementById('helpDialog').close();
        jump(t);
      };
      root.append(b);
    }
  }
  function start(root, options) {
    const intro = document.createElement('div');
    intro.className = 'guide-start';
    const h = document.createElement('h3');
    h.textContent = '从原版效果开始定制';
    const p = document.createElement('p');
    p.textContent = '选择组件，再拆到内部部件或动画参数。';
    const list = document.createElement('div');
    list.className = 'guide-task-grid compact';
    buttons(list, options, true);
    const help = document.createElement('button');
    help.className = 'guide-more';
    help.textContent = '查看完整操作指南 →';
    help.onclick = options.help;
    intro.append(h, p, list, help);
    root.append(intro);
  }
  function install({ jump, getProject, chatMode }) {
    const dialog = document.getElementById('helpDialog');
    dialog.classList.add('guide-dialog');
    dialog.querySelector('h2').textContent = '编辑器操作指南';
    const shortcuts = dialog.querySelector('.shortcuts'),
      details = document.createElement('details');
    details.className = 'guide-shortcuts';
    const summary = document.createElement('summary');
    summary.textContent = '画布快捷键';
    shortcuts.replaceChildren();
    for (const [key, description] of [
      ['V / H', '选择 / 抓手'], ['空格 / 中键拖动', '平移工作区'],
      ['Ctrl/Cmd + 滚轮', '围绕指针缩放'], ['F / Shift F / 0', '聚焦所选 / 显示全部 / 返回输出画面'],
      ['Shift + 单击', '增减选择'], ['方向键 / Shift + 方向键', '移动 1 / 10 像素'],
      ['图层列表：↑ ↓ / ← →', '上下导航选择 / 展开折叠，Esc 回画布再微移'],
      ['图层列表：F2 / Shift F10', '改名 / 打开操作菜单'],
      ['Ctrl/Cmd Z / Ctrl/Cmd Shift Z', '撤销 / 重做'], ['Ctrl/Cmd D / Delete', '复制图层 / 删除'],
      ['Ctrl/Cmd C / Ctrl/Cmd V', '复制到剪贴板 / 粘贴图层；可跨项目使用'],
      ['Ctrl/Cmd G / Ctrl/Cmd Shift G', '编组 / 解组'], ['双击文字', '直接编辑；Ctrl/Cmd Enter 完成，Esc 取消'],
      ['Ctrl/Cmd S / Ctrl/Cmd Shift S', '保存命名项目 / 另存副本'], ['G / Escape', '切换网格 / 取消选择'],
    ]) { const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=description;shortcuts.append(dt,dd); }
    details.append(summary, shortcuts);
    dialog.append(details);
    const content = document.createElement('div');
    content.className = 'guide-content';
    const intro = document.createElement('p');
    intro.className = 'guide-lead';
    intro.textContent =
      '所有调整都使用原主题的实际渲染器。排版、部件外观、影响范围和时间曲线可以分别修改。';
    content.append(intro);
    const modes = document.createElement('div');
    modes.className = 'guide-modes';
    for (const [title, text] of [
      [
        '组合弹幕区',
        '消息共用容器，按顺序排队并推动上下文。进入弹幕区编辑器，可单独搭建整块区域；对齐以这块画布为边界，框选和全选只作用于当前可见的画布图层。',
      ],
      [
        '独立消息图层',
        '普通弹幕、SC、礼物和上舰分别占位。每个组件的内部部件和原生动画仍然可编辑。',
      ],
    ]) {
      const box = document.createElement('div'),
        h = document.createElement('h3'),
        p = document.createElement('p');
      h.textContent = title;
      p.textContent = text;
      box.append(h, p);
      modes.append(box);
    }
    content.append(modes);
    const grid = document.createElement('div');
    grid.className = 'guide-task-grid';
    content.append(grid);
    const notes = document.createElement('div');
    notes.className = 'guide-notes';
    for (const [title, text] of [
      [
        '编辑空间',
        '左侧切换图层与组件，右侧专注所选物件的属性；拖动两侧边缘调整宽度，双击边缘恢复默认。画布周围可暂放物件，框外不进入完整直播输出。使用“侧栏”按钮可给工作区更多空间。',
      ],
      [
        '比例与字号',
        '改变容器或组件占位宽度时，文字重新换行。图片、视频、背景、形状和边框可在变换中锁定宽高比，数字输入与拖角都会联动；Shift 拖角临时保持比例。修改徽记和文字大小请进入对应内部部件。回放消息后切换“跟随排版 / 自由定位”，会保留部件当前位置并换算整条位置轨道。',
      ],
      [
        '动画的三个层次',
        '原生演变控制整体入场；部件延迟控制谁先出现；属性关键帧可按时间改变位置、不透明度或特效参数。退场轨道的 0 秒是开始消散。参数旁的空心菱形记录当前时刻，实心菱形删除当前帧；有轨道时修改数值会写入当前时刻。“调整整段时序”可一次改变轨道起点或时长，保留各帧数值和曲线。复制关键帧后，可以在另一部件或编辑器粘贴；只覆盖兼容的同名轨道，循环设置保持不变。',
      ],
      [
        '共同样式与等级',
        '组件上方选择通用样式，或独立编辑舰长、提督、总督与 SC 档位。独立档位只修改本档外观，位置仍共用。',
      ],
      [
        '预览与正式使用',
        '展开“动画预览”，发送消息或逐帧检查；测试默认只在编辑器显示。按“保存项目”留档，再用“应用到直播”更新直播预览与固定 OBS 地址。保存与应用是两个动作；后续再次应用无需更换固定地址。需要边改边播或向 OBS 发送测试消息时，在应用面板分别开启对应选项。',
      ],
    ]) {
      const h = document.createElement('h3'),
        p = document.createElement('p');
      h.textContent = title;
      p.textContent = text;
      notes.append(h, p);
    }
    content.append(notes);
    details.before(content);
    const open = () => {
      grid.replaceChildren();
      buttons(grid, { project: getProject(), chatMode, jump });
      dialog.showModal();
    };
    document.getElementById('helpOpen').onclick = open;
    openGuide = open;
    const toggle = document.createElement('button');
    toggle.id = 'assetPanelToggle';
    toggle.type = 'button';
    toggle.textContent = '素材';
    toggle.title = '收起或展开素材栏，给画布更多空间';
    toggle.setAttribute('aria-label', '切换素材栏');
    toggle.setAttribute('aria-expanded', 'true');
    document.querySelector('.toolbar-right').prepend(toggle);
    let collapsed = false;
    toggle.onclick = () => {
      collapsed = !collapsed;
      document.body.classList.toggle('assets-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };
  }
  window.ThemeEditorGuide = { start, install, open: () => openGuide() };
})();
