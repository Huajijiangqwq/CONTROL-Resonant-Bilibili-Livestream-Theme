/* Navigation for the existing native controls; guide actions never rewrite a theme. */
(() => {
  'use strict';
  let openGuide = () => {};
  const tasks = [
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
    dialog.querySelector('h2').textContent = '原版效果 · 自定义指南';
    const shortcuts = dialog.querySelector('.shortcuts'),
      details = document.createElement('details');
    details.className = 'guide-shortcuts';
    const summary = document.createElement('summary');
    summary.textContent = '画布快捷键';
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
        '拖动素材栏、属性栏边缘调整宽度，拖动中间分隔线分配属性与图层高度。双击恢复默认；这些调整只改变编辑器。',
      ],
      [
        '比例与字号',
        '改变容器或组件占位宽度时，文字重新换行。修改徽记和文字的大小，请进入对应内部部件。回放消息后切换“跟随排版 / 自由定位”，会保留部件当前位置并换算整条位置轨道。',
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
        '发送预览和单条回放都使用当前编辑样式；通用样式可切换不同等级检查。混合演示按正式消息档位展示。再暂停、拖动时间轴检查。上一帧 / 下一帧按当前帧率步进，也可按逗号 / 句号；输入文字时不会触发。从“应用 / OBS”选择完整场景或仅组合弹幕区，按面板给出的像素尺寸设置浏览器源。手动发布地址是快照，后续修改需要重新发布；启用 OBS 实时绑定后，修改会自动同步，无需刷新浏览器源。',
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
