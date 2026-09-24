(() => {
  'use strict';
  window.BilibiliLogin = {
    mount(root, { base, onChange = () => {} }) {
      root.innerHTML = `
        <div class="button-row tools"><button type="button" id="liveQrStart">扫码登录</button><button type="button" id="liveQrForget">清除已保存登录</button></div>
        <p class="hint" id="liveLoginSaved" role="status">正在读取本机登录状态…</p>
        <div id="liveQrPanel" hidden style="margin:12px 0;padding:16px;border:1px solid #5a5148;background:#171a17">
          <img id="liveQrImage" alt="哔哩哔哩登录二维码" width="216" height="216" hidden style="display:block;width:216px;height:216px;max-width:100%;background:white;padding:8px;box-sizing:border-box">
          <p id="liveQrStatus" class="hint" role="status"></p>
          <button type="button" id="liveQrCancel">取消扫码</button>
        </div>
        <label class="check"><input type="checkbox" id="liveGuest"> 本次使用访客模式</label>
        <p class="hint">扫码确认后自动获取 SESSDATA，并在当前 Windows 账户下加密保存。重启无需重新填写；登录过期时再扫码。</p>`;
      const $ = id => root.querySelector('#' + id);
      let token = '', id = '', timer, revision = 0, busy = false, disposed = false;
      function saved(info) {
        if (!info) return;
        $('liveLoginSaved').textContent = info.error || (info.saved ? '已保存登录。填写房间号后直接连接；留空 SESSDATA 会使用保存的登录。' : '尚未保存登录，可扫码一次后自动记住。');
        $('liveQrForget').disabled = busy || (!info.saved && !info.error);
        $('liveQrStart').textContent = info.saved ? '更新扫码登录' : '扫码登录';
        const input = document.getElementById('liveSession');
        if (input) input.placeholder = info.saved ? '已加密保存；留空使用保存的登录' : '可手动填写，仅用于本次连接';
        onChange(info);
      }
      async function health() {
        const r = await fetch(base + '/api/health', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        const d = await r.json();
        if (!r.ok || d.service !== 'hiss-bilibili') throw Error('请先启动本地接入服务。');
        if (d.version < 4) throw Error('请重新启动桌面客户端，启用扫码登录功能。');
        token = d.token; saved(d.login); return d;
      }
      async function action(path, body = {}) {
        if (!token) await health();
        const r = await fetch(base + '/api/login/' + path, { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Control-Token': token },
          body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
        const data = await r.json();
        if (!r.ok) { if (r.status === 403) token = ''; throw Error(data.error || '登录操作未完成，请重试。'); }
        saved(data.login); return data;
      }
      function terminal(qr) {
        $('liveQrStatus').textContent = qr.message;
        const waiting = ['waiting', 'scanned'].includes(qr.phase);
        if (!waiting) { $('liveQrImage').hidden = true; $('liveQrImage').removeAttribute('src'); $('liveQrCancel').textContent = '关闭'; }
        return !waiting;
      }
      async function poll(run) {
        if (disposed || revision !== run) return;
        try {
          const data = await action('poll', { id });
          if (revision !== run || disposed) return;
          if (terminal(data.qr)) {
            if (data.qr.phase === 'success') { $('liveGuest').checked = false; const input = document.getElementById('liveSession'); if (input) input.value = ''; }
            return;
          }
          timer = setTimeout(() => poll(run), 1800);
        } catch (e) { if (revision === run) { $('liveQrStatus').textContent = e.message; $('liveQrImage').hidden = true; } }
      }
      $('liveQrStart').onclick = async () => {
        if (busy) return;
        busy = true; $('liveQrStart').disabled = true; clearTimeout(timer);
        const run = ++revision;
        $('liveQrPanel').hidden = false; $('liveQrImage').hidden = true;
        $('liveQrStatus').textContent = '正在获取登录二维码…'; $('liveQrCancel').textContent = '取消扫码';
        try {
          await health();
          if (revision !== run || disposed) return;
          const data = await action('start');
          if (revision !== run || disposed) { action('cancel', { id: data.qr.id }).catch(() => {}); return; }
          id = data.qr.id; $('liveQrImage').src = data.qr.image; $('liveQrImage').hidden = false;
          $('liveQrStatus').textContent = data.qr.message;
          timer = setTimeout(() => poll(run), 1800);
        } catch (e) { if (revision === run) $('liveQrStatus').textContent = e.message; }
        finally { busy = false; $('liveQrStart').disabled = false; }
      };
      function close() {
        revision++; clearTimeout(timer); $('liveQrPanel').hidden = true;
        $('liveQrImage').removeAttribute('src');
        if (id) action('cancel', { id }).catch(() => {});
        id = '';
      }
      $('liveQrCancel').onclick = close;
      $('liveQrForget').onclick = async () => {
        close(); busy = true; $('liveQrForget').disabled = true;
        try { await health(); await action('forget'); }
        catch (e) { $('liveLoginSaved').textContent = e.message; }
        finally { busy = false; await health().catch(() => {}); }
      };
      window.addEventListener('pagehide', () => { disposed = true; revision++; clearTimeout(timer); clearInterval(refresh); });
      window.addEventListener('pageshow', () => { disposed = false; });
      const refresh = setInterval(() => { if (!disposed && !busy) health().catch(() => {}); }, 15000);
      health().catch(e => { $('liveLoginSaved').textContent = e.message; });
      return { apply: saved };
    },
  };
})();
