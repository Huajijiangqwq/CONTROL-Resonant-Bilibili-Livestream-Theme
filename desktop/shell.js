'use strict';
const titles = {
  live: '直播预览', music: '音乐皮肤',
  theme: '主题编辑器', chat: '弹幕编辑器', about: '关于与许可',
};
const pages = {
  live: 'live.html', music: 'now-playing.html',
  theme: 'theme-editor.html', chat: 'chat-editor.html',
};
let current = 'live', state = { status: 'starting' }, toastTimer;
const $ = id => document.getElementById(id);
function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3000);
}
function select(page, destination) {
  if (!Object.hasOwn(titles, page)) return;
  current = page;
  const isPage = Object.hasOwn(pages, page), ready = state.status === 'ready';
  document.body.classList.toggle('workspace-ready', isPage && ready);
  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
    button.setAttribute('aria-current', button.dataset.page === page ? 'page' : 'false');
  });
  $('sectionTitle').textContent = titles[page];
  $('sectionEyebrow').textContent = page === 'about' ? '关于项目' : 'CONTROL RESONANT';
  $('about').hidden = page !== 'about';
  $('serviceScreen').hidden = !isPage || ready;
  $('editors').hidden = !isPage || !ready;
  $('openBrowser').hidden = !isPage || !ready;
  document.querySelectorAll('#editors iframe').forEach(frame => frame.hidden = frame.id !== 'frame-' + page);
  if (!isPage || !ready) return;
  if (!$('frame-' + page)) {
    const frame = document.createElement('iframe');
    frame.id = 'frame-' + page; frame.title = titles[page];
    frame.src = new URL(pages[page], state.base).href;
    frame.addEventListener('load', () => frame.contentWindow?.postMessage({channel:'control-workspace-host',ready:true}, new URL(state.base).origin));
    $('editors').append(frame);
  }
  const frame = $('frame-' + page);
  if (destination && frame.src !== destination) {
    delete frame.dataset.loadedPage;
    frame.src = destination;
    return;
  }
  if (frame.dataset.loadedPage && frame.dataset.loadedPage !== pages[page]) {
    // Ordinary tab switches keep the existing renderer, music and draft state.
    delete frame.dataset.loadedPage;
    frame.src = new URL(pages[page], state.base).href;
  }
}
window.addEventListener('message', event => {
  if (!state.base || event.origin !== new URL(state.base).origin) return;
  if (event.data?.channel === 'control-workspace-navigate') {
    const source = [...document.querySelectorAll('#editors iframe')].find(f=>f.contentWindow===event.source);
    if (!source) return;
    try {
      const url = new URL(event.data.url), destination = Object.keys(pages).find(key=>'/'+pages[key]===url.pathname);
      if (url.origin !== new URL(state.base).origin || !destination) return;
      select(destination,url.href);
    } catch {}
    return;
  }
  if (event.data?.channel !== 'control-workspace-page') return;
  if (!Object.values(pages).includes(event.data.page)) return;
  const frame = [...document.querySelectorAll('#editors iframe')].find(frame => frame.contentWindow === event.source);
  if (!frame) return;
  frame.contentWindow?.postMessage({channel:'control-workspace-host',ready:true},new URL(state.base).origin);
  frame.dataset.loadedPage = event.data.page;
  if (frame.id === 'frame-' + current && pages[current] !== event.data.page) {
    const destination = Object.keys(pages).find(key => pages[key] === event.data.page);
    delete frame.dataset.loadedPage;
    frame.src = new URL(pages[current], state.base).href;
    select(destination);
  }
});
function update(next) {
  const previous = state; state = next;
  $('statusDot').className = state.status;
  $('serviceLabel').textContent = state.status === 'ready' ? '本地服务运行中' : state.status === 'error' ? '服务需要处理' : '服务准备中';
  $('serviceTitle').textContent = state.message;
  $('version').textContent = state.version || '';
  $('serviceDetail').textContent = state.status === 'error'
    ? '处理提示中的问题后点击重试。保存的 OBS 地址不会自动更换。'
    : '正在启动本地服务，就绪后自动打开所选页面。';
  $('retry').hidden = state.status !== 'error';
  if (previous.base && state.base && previous.base !== state.base) $('editors').replaceChildren();
  select(current);
}
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => select(button.dataset.page)));
const navPaths={live:'M3 4h18v13H3zM8 21h8M12 17v4',music:'M9 18V5l11-2v13M9 7l11-2M6 15a3 3 0 100 6 3 3 0 000-6M17 13a3 3 0 100 6 3 3 0 000-6',theme:'M3 3h18v18H3zM3 8h18M8 8v13',chat:'M3 4h18v13H9l-5 4v-4H3zM9 7v7M15 7v7',about:'M12 3a9 9 0 100 18 9 9 0 000-18M12 10v7M12 7h.01'};
for(const button of document.querySelectorAll('[data-page]')){
  const page=button.dataset.page;button.title=titles[page];button.setAttribute('aria-label',titles[page]);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('nav-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',navPaths[page]);svg.append(p);
  const number=button.querySelector('.nav-number');if(number)number.replaceWith(svg);else button.prepend(svg);
}
document.querySelector('.rail-bottom').prepend($('openBrowser'));
$('openBrowser').setAttribute('aria-label','在浏览器打开当前页面');
let railCollapsed=false;
try { railCollapsed=localStorage.getItem('control-navigation-collapsed')==='true'; } catch {}
function setRailCollapsed(value) {
  railCollapsed=!!value;
  document.body.classList.toggle('rail-collapsed',railCollapsed);
  const toggle=$('railToggle');
  if(toggle){toggle.setAttribute('aria-expanded',String(!railCollapsed));toggle.setAttribute('aria-label',railCollapsed?'展开导航':'收起导航');toggle.title=railCollapsed?'展开导航':'收起导航';}
  try { localStorage.setItem('control-navigation-collapsed',String(railCollapsed)); } catch {}
}
if($('railToggle'))$('railToggle').onclick=()=>setRailCollapsed(!railCollapsed);
setRailCollapsed(railCollapsed);
document.querySelectorAll('[data-doc]').forEach(button => button.addEventListener('click', async () => {
  try { const error = await desktop.openDocs(button.dataset.doc); if (error) toast(error); }
  catch (error) { toast(error.message); }
}));
$('openBrowser').onclick = () => desktop.openPage(current).catch(error => toast(error.message));
$('dataFolder').onclick = () => desktop.dataFolder();
$('retry').onclick = () => desktop.retry();
$('quit').onclick = () => desktop.quit();
desktop.onState(update);
desktop.state().then(update).catch(() => update({ status: 'error', message: '本地服务状态无法读取，请重新打开客户端。' }));
