'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  identity = crypto.createHash('sha256').update(root).digest('hex').slice(0, 24),
  runtime = path.join(root, '.runtime');
(async () => {
  let count = 0;
  for (const file of fs.existsSync(runtime) ? fs.readdirSync(runtime) : []) {
    if (!/^service-\d+\.json$/.test(file)) continue;
    const saved = JSON.parse(fs.readFileSync(path.join(runtime, file), 'utf8'));
    if (saved.identity !== identity) continue;
    try {
      const base = `http://127.0.0.1:${saved.port}`;
      const health = await fetch(base + '/api/release-health', {
        signal: AbortSignal.timeout(1500),
      }).then((r) => r.json());
      if (health.identity !== identity || health.pid !== saved.pid) continue;
      const res = await fetch(base + '/api/release-stop', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + saved.stopToken },
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw Error('服务拒绝停止请求');
      count++;
    } catch (error) {
      console.log(`端口 ${saved.port}：${error.message}`);
    }
  }
  console.log(
    count ? `已请求停止此目录启动的 ${count} 组服务。` : '没有找到此目录启动的运行中服务。',
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
