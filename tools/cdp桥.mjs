// CDP 桥守护（2026-11-13）
//
// 为什么有它：Chrome 只在**新建 CDP 连接**时问一次「要允许远程调试吗？」。
// 桥进程一挂，下次命令就得重连 → 用户又得点一次允许。
// 所以桥必须一直活着：这个守护进程负责「桥崩了立刻拉起来」，
// 拉起来的那一次会重连浏览器（那时会弹一次），除此之外全程不弹。
//
// 用法：
//   node tools/cdp桥.mjs          前台跑（Ctrl+C 停）
//   node tools/cdp桥.mjs --check  只报告桥在不在，不起进程
//
// 日志：tmp/cdp/bridge.log（追加）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const 根 = process.cwd();
const 桥脚本 = path.join(根, 'tmp', 'cdp', 'bridge.mjs');
const 日志 = path.join(根, 'tmp', 'cdp', 'bridge.log');
const 桥地址 = process.env.CDP_BRIDGE || 'http://127.0.0.1:9333';

async function 桥在() {
  try {
    const r = await fetch(`${桥地址}/ping`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    return !!j.ok;
  } catch {
    return false;
  }
}

if (process.argv.includes('--check')) {
  const 在 = await 桥在();
  console.log(JSON.stringify({ 桥在: 在, 地址: 桥地址 }));
  process.exitCode = 在 ? 0 : 1;
} else {
  if (!fs.existsSync(桥脚本)) {
    console.error(`找不到 ${桥脚本}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(日志), { recursive: true });

  if (await 桥在()) {
    console.log(`[守护] 桥已经在跑（${桥地址}），不重复起。`);
    process.exit(0);
  }

  let 子 = null;
  let 停 = false;
  let 连续失败 = 0;

  function 起() {
    const 流 = fs.createWriteStream(日志, { flags: 'a' });
    流.write(`\n=== ${new Date().toISOString()} 起桥 ===\n`);
    子 = spawn(process.execPath, [桥脚本], { cwd: 根, stdio: ['ignore', 'pipe', 'pipe'] });
    子.stdout.pipe(流, { end: false });
    子.stderr.pipe(流, { end: false });
    子.stdout.on('data', d => process.stdout.write(d));
    子.stderr.on('data', d => process.stderr.write(d));
    子.on('exit', 码 => {
      流.write(`=== ${new Date().toISOString()} 桥退出 code=${码} ===\n`);
      流.end();
      if (停) return;
      连续失败 = 码 === 0 ? 0 : 连续失败 + 1;
      const 等 = Math.min(1000 * 2 ** Math.min(连续失败, 5), 30000);
      console.error(`[守护] 桥退出（code=${码}），${等}ms 后重启`);
      setTimeout(() => {
        if (!停) 起();
      }, 等);
    });
  }

  process.on('SIGINT', () => {
    停 = true;
    子?.kill();
    process.exit(0);
  });

  起();
  console.log(`[守护] 已启动，日志 → ${日志}`);
}
