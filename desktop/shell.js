'use strict';
const titles = {
  live: '直播预览', simulation: '消息模拟', music: '音乐皮肤', monitor: '组件监视面板',
  theme: '主题编辑器【实验功能】', chat: '弹幕编辑器【实验功能】', about: '关于与许可',
};
const pages = {
  live: 'live.html', simulation: 'simulation.html', music: 'now-playing.html',
  monitor: 'monitor.html', theme: 'theme-editor.html', chat: 'chat-editor.html',
};
let current = 'live', state = { status: 'starting' }, toastTimer;
const $ = id => document.getElementById(id);
function toast(text) {
  $('toast').textContent = text; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3000);
}
function select(page) {
  if (!Object.hasOwn(titles, page)) return;
  current = page;
  const isPage = Object.hasOwn(pages, page), ready = state.status === 'ready';
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $('sectionTitle').textContent = titles[page];
  $('sectionEyebrow').textContent = page === 'about' ? 'CREDITS & LICENSES' : ['theme', 'chat'].includes(page) ? 'EXPERIMENTAL EDITOR' : 'LOCAL WORKSPACE';
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
    $('editors').append(frame);
  }
  const frame = $('frame-' + page);
  if (frame.dataset.loadedPage && frame.dataset.loadedPage !== pages[page]) {
    // Ordinary tab switches keep the existing renderer, music and draft state.
    delete frame.dataset.loadedPage;
    frame.src = new URL(pages[page], state.base).href;
  }
}
window.addEventListener('message', event => {
  if (!state.base || event.origin !== new URL(state.base).origin || event.data?.channel !== 'control-workspace-page') return;
  if (!Object.values(pages).includes(event.data.page)) return;
  const frame = [...document.querySelectorAll('#editors iframe')].find(frame => frame.contentWindow === event.source);
  if (!frame) return;
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
