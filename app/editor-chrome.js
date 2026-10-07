/* Editor UI preferences never alter the rendered broadcast theme. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  document.body.classList.add('editor-v2');
  function mount() {
    if (!window.ThemeEditor) { setTimeout(mount, 80); return; }
    const E = window.ThemeEditor, dock = document.querySelector('.test-dock'), toggle = $('testDockToggle');
    function organizePublication() {
      const dialog=$('publishDialog'), section=dialog?.querySelector('.publication-controls');
      if (!section || dialog.dataset.organized) return !!dialog?.dataset.organized;
      dialog.dataset.organized='true';
      const content=dialog.querySelector('.dialog-content'), output=$('publishOutput').closest('label');
      const apply=$('applyLiveTheme'), current=$('publicationState'), obs=dialog.querySelector('.publication-obs');
      const automatic=document.createElement('details'), autoTitle=document.createElement('summary');
      automatic.className='publication-advanced';autoTitle.textContent='实时联动与测试';automatic.append(autoTitle);
      for (const label of section.querySelectorAll('.publication-switch')) {
        const description=label.nextElementSibling?.matches('p')?label.nextElementSibling:null;
        automatic.append(label);if(description)automatic.append(description);
      }
      const chatTarget=$('publicationChatTarget');
      section.replaceChildren(current,output,...(chatTarget?[chatTarget]:[]),apply);
      const caption=document.createElement('p');caption.className='publication-explainer';caption.textContent='应用更新直播预览和固定 OBS 地址；保存项目用于留档。';section.append(caption);
      const actions=document.createElement('div');actions.className='publication-output-actions';
      actions.append($('copyUrl'),$('openLive'));
      const manual=document.createElement('details'), title=document.createElement('summary');
      manual.className='publication-manual';title.textContent='地址与采集信息';manual.append(title);
      const size=$('outputSize').closest('p');if(size)manual.append(size);
      manual.append($('obsUrl'),$('captureInfo'),$('outputHint'));
      const preview=[...content.querySelectorAll('button')].find(button=>button.textContent==='单独预览当前草稿');
      if(preview){preview.classList.add('publication-draft-preview');preview.title='独立预览当前草稿，不改变已应用直播版本';}
      section.after(actions);
      if(preview)actions.after(preview);
      content.append(manual,automatic);if(obs)content.append(obs);
      function labelState(){const active=$('publicationAuto').checked||$('publicationMessages').checked;autoTitle.textContent='实时联动与测试'+(active?' · 已开启':'');automatic.dataset.active=String(active);}
      new MutationObserver(labelState).observe(current,{childList:true,subtree:true});labelState();
      return true;
    }
    if (!organizePublication()) {
      const observer=new MutationObserver(()=>{if(organizePublication())observer.disconnect();});
      observer.observe($('publishDialog'),{childList:true,subtree:true});
    }
    window.ControlProjectLibrary?.mount({ editor: E });
    let navigating = false;
    document.querySelector('.appbar .brand')?.addEventListener('click', async event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
      event.preventDefault();
      if (navigating) return;
      const destination = event.currentTarget.href;
      navigating = true;
      try {
        if (await E.save() === false) { $('saveState').textContent = '请先处理草稿保存提示'; return; }
        location.assign(destination);
      } catch { $('saveState').textContent = '草稿尚未保存，请先导出备份'; }
      finally { navigating = false; }
    });
    let dockOpen = false;
    function setDock(open) {
      dockOpen = open; dock.classList.toggle('expanded', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '收起动画预览' : '动画预览';
    }
    toggle.onclick = () => setDock(!dockOpen); setDock(false);
    function selection() {
      const has = E.selection.length > 0, tools = document.querySelector('.toolbar-left');
      tools.classList.toggle('has-selection', has);
      for (const b of tools.querySelectorAll('[data-align]')) b.disabled = !has;
    }
    new MutationObserver(selection).observe($('selectionLabel'), { childList: true });
    window.addEventListener('theme-document-change', selection); selection();
    // Tutorials remain reachable, without filling the empty inspector with buttons.
    const compactGuide = () => {
      const guides = $('propertyFields').querySelector('.guide-start');
      if (guides && !guides.closest('details')) {
        const details = document.createElement('details'), title = document.createElement('summary');
        details.className = 'getting-started'; title.textContent = '操作指南';
        guides.before(details); details.append(title, guides);
      }
    };
    new MutationObserver(compactGuide).observe($('propertyFields'), { childList: true }); compactGuide();
    const settingsRoot = $('nativeSettings');
    const groups = [
      ['接入', /弹幕接入/], ['画面', /画面设置|Now Playing|界面动效/],
      ['音频', /音频共振/], ['计时与提示', /直播计时|停留|退场/], ['其他', /动画帧率|本地消息/],
    ];
    let active = 0;
    function organize() {
      const sections = [...settingsRoot.children].filter(n => n.classList.contains('native-section'));
      if (!sections.length) return;
      let nav = $('settingsNav');
      if (!nav) { nav = document.createElement('nav'); nav.id = 'settingsNav'; nav.setAttribute('aria-label', '设置类别'); settingsRoot.before(nav); }
      nav.replaceChildren();
      groups.forEach(([label, pattern], index) => {
        if (!sections.some(s => pattern.test(s.querySelector('summary')?.textContent || ''))) return;
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.setAttribute('aria-pressed', String(active === index));
        b.onclick = () => { active = index; organize(); nav.querySelector('[aria-pressed="true"]')?.focus(); }; nav.append(b);
      });
      for (const section of sections) {
        section.hidden = !groups[active][1].test(section.querySelector('summary')?.textContent || '');
        if (!section.hidden) section.open = true;
      }
    }
    new MutationObserver(organize).observe(settingsRoot, { childList: true });
    window.addEventListener('editor-settings-opened', event => {
      const focus = event.detail?.focus;
      active = focus === 'hiss' ? 2 : ['timer', 'fleet', 'gift'].includes(focus) ? 3 : 0;
      organize();
    });
    new MutationObserver(records => {
      if (records.some(r => r.target.matches('.timeline-overview[open]'))) setDock(true);
    }).observe(dock, { subtree: true, attributes: true, attributeFilter: ['open'] });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dockOpen && !document.querySelector('dialog[open]') &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) setDock(false);
    });
    document.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === 'theme'));
  }
  mount();
})();
