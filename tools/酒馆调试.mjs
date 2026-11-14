// 酒馆调试 CLI（2026-11-13）
//
// 为什么有它：三方协同要"看见真机"，但面板/悬浮球在 iframe 里、要人眼看，
// 光靠 `vueSource.includes(...)` 这种读码断言验不出真机行为。
//
// ★ 关键：走**常驻桥**，不自己开 CDP 连接。
//   Chrome 只在**新建 CDP 连接**的那一刻问一次「要允许远程调试吗？」。
//   每次跑命令都新连一次 = 每次都弹窗（用户点烦了）。
//   `tmp/cdp/bridge.mjs` 是昨天就连上并已获授权的长连接（127.0.0.1:9333），
//   所以本工具默认把命令转给它；只有桥没起时才自己连一次（那时会弹一次窗）。
//
// 前置（本机已经起好的服务，缺一个都不行）：
//   1. SillyTavern         http://127.0.0.1:8000        ← 用户自己开的
//   2. 静态服务器           http://127.0.0.1:5500        ← `pnpm serve`（tools/static-server.mjs）
//   3. webpack --watch      构建到 dist/，改 src 自动重编 + 通过 6621 推送酒馆热重载
//      → 酒馆里的脚本条目内容就一句：import 'http://localhost:5500/dist/剧情导演/index.js'
//   4. CDP 桥               node tmp/cdp/bridge.mjs     ← 起一次，之后一直用
//
// 用法：
//   node tools/酒馆调试.mjs ping                    连没连上、盯的是哪个页
//   node tools/酒馆调试.mjs pages                   列出所有 target
//   node tools/酒馆调试.mjs eval "<js>"             在酒馆页面（顶层）里求值
//   node tools/酒馆调试.mjs eval -f 脚本.js          同上，表达式从文件读（长表达式别跟引号打架）
//   node tools/酒馆调试.mjs iframe "<js>"           在「剧情导演」脚本 iframe 里求值
//   node tools/酒馆调试.mjs orb                     悬浮球/面板状态摘要（壳 iframe / .dj-root / .dj-orb）
//   node tools/酒馆调试.mjs shot [文件.png]          截图（默认 tmp/cdp/shot.png）
//   node tools/酒馆调试.mjs logs [毫秒]              抓酒馆控制台（含 iframe 的 console.*）
//   node tools/酒馆调试.mjs reload                  刷新酒馆页面
//
// 约定：所有求值都 `returnByValue: true`，所以只能返回 JSON 可序列化的东西。
// 用 IIFE 包一层，返回值就是你要的数据：`(() => ({a:1}))()`。
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const 用户数据 = `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`;
const 目标URL片段 = process.env.TAVERN_URL || '127.0.0.1:8000';
const 导演脚本名 = '剧情导演';
const 桥 = process.env.CDP_BRIDGE || 'http://127.0.0.1:9333';

// ---------------------------------------------------------------------------
// 通道 A：常驻桥（首选，不弹窗）
// ---------------------------------------------------------------------------
async function 桥请求(路径, 体) {
  const r = await fetch(`${桥}${路径}`, {
    method: 体 === undefined ? 'GET' : 'POST',
    headers: 体 === undefined ? undefined : { 'content-type': 'application/json' },
    body: 体 === undefined ? undefined : JSON.stringify(体),
  });
  const 文本 = await r.text();
  let j;
  try {
    j = JSON.parse(文本);
  } catch {
    throw new Error(`桥返回的不是 JSON（HTTP ${r.status}）: ${文本.slice(0, 200)}`);
  }
  if (!j.ok) throw new Error(`桥报错: ${j.error || 文本.slice(0, 300)}`);
  return j;
}

async function 桥在() {
  try {
    await 桥请求('/ping');
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 通道 B：自己连（只在桥没起时用；会触发 Chrome 的一次授权弹窗）
// ---------------------------------------------------------------------------
function 连WS(url) {
  return new Promise((resolve, reject) => {
    const m = url.match(/^ws:\/\/([^/:]+):(\d+)(\/.*)$/);
    if (!m) return reject(new Error(`不是 ws 地址: ${url}`));
    const sock = net.connect(Number(m[2]), m[1], () => {
      sock.write(
        `GET ${m[3]} HTTP/1.1\r\nHost: ${m[1]}:${m[2]}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let 握手 = '';
    let 已握手 = false;
    let 缓冲 = Buffer.alloc(0);
    let id = 0;
    const 等待 = new Map();
    const 监听 = [];

    function 发(obj) {
      const 数据 = Buffer.from(JSON.stringify(obj));
      const 掩 = Buffer.from([1, 2, 3, 4]);
      const 头 = [0x81];
      if (数据.length < 126) 头.push(0x80 | 数据.length);
      else if (数据.length < 65536) 头.push(0x80 | 126, 数据.length >> 8, 数据.length & 255);
      else 头.push(0x80 | 127, 0, 0, 0, 0, (数据.length >>> 24) & 255, (数据.length >>> 16) & 255, (数据.length >>> 8) & 255, 数据.length & 255);
      const 载荷 = Buffer.alloc(数据.length);
      for (let i = 0; i < 数据.length; i++) 载荷[i] = 数据[i] ^ 掩[i % 4];
      sock.write(Buffer.concat([Buffer.from(头), 掩, 载荷]));
    }

    function 处理帧() {
      while (true) {
        if (缓冲.length < 2) return;
        const op = 缓冲[0] & 0x0f;
        const 有掩 = (缓冲[1] & 0x80) !== 0;
        let len = 缓冲[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (缓冲.length < 4) return;
          len = 缓冲.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (缓冲.length < 10) return;
          len = Number(缓冲.readBigUInt64BE(2));
          off = 10;
        }
        const 掩键 = 有掩 ? 缓冲.subarray(off, off + 4) : null;
        if (有掩) off += 4;
        if (缓冲.length < off + len) return;
        const 载荷 = Buffer.from(缓冲.subarray(off, off + len));
        if (掩键) for (let i = 0; i < 载荷.length; i++) 载荷[i] ^= 掩键[i % 4];
        缓冲 = 缓冲.subarray(off + len);
        if (op === 0x8) {
          sock.destroy();
          return;
        }
        if (op !== 0x1) continue;
        let 对象;
        try {
          对象 = JSON.parse(载荷.toString('utf8'));
        } catch {
          continue;
        }
        if (对象.id && 等待.has(对象.id)) {
          等待.get(对象.id)(对象);
          等待.delete(对象.id);
        } else for (const f of 监听) f(对象);
      }
    }

    sock.on('data', chunk => {
      if (!已握手) {
        握手 += chunk.toString('latin1');
        const idx = 握手.indexOf('\r\n\r\n');
        if (idx < 0) return;
        if (!/101/.test(握手.split('\r\n')[0])) {
          reject(new Error(`握手失败: ${握手.split('\r\n')[0]}`));
          sock.destroy();
          return;
        }
        已握手 = true;
        const rest = Buffer.from(握手.slice(idx + 4), 'latin1');
        握手 = '';
        缓冲 = Buffer.concat([缓冲, rest]);
        处理帧();
        resolve({
          命令: (method, params = {}, sessionId) =>
            new Promise((ok, no) => {
              const myId = ++id;
              等待.set(myId, msg => (msg.error ? no(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)));
              const 包 = { id: myId, method, params };
              if (sessionId) 包.sessionId = sessionId;
              发(包);
              const 定时 = setTimeout(() => {
                if (等待.has(myId)) {
                  等待.delete(myId);
                  no(new Error(`${method} 超时`));
                }
              }, 60000);
              定时.unref?.();
            }),
          监听: f => 监听.push(f),
          关闭: () => sock.destroy(),
        });
        return;
      }
      缓冲 = Buffer.concat([缓冲, chunk]);
      处理帧();
    });
    sock.on('error', reject);
  });
}

async function 直连() {
  const 文件 = path.join(用户数据, 'DevToolsActivePort');
  if (!fs.existsSync(文件)) throw new Error(`找不到 ${文件} —— 用户的 Chrome 没开调试端口`);
  const [端口, ws路径] = fs.readFileSync(文件, 'utf8').trim().split(/\r?\n/);
  const b = await 连WS(`ws://127.0.0.1:${端口}${ws路径}`);
  const { targetInfos } = await b.命令('Target.getTargets');
  const 页们 = targetInfos.filter(t => t.type === 'page');
  const 页 = 页们.find(t => t.url.includes(目标URL片段)) ?? 页们[0];
  if (!页) throw new Error('没有可用的 page target');
  const { sessionId } = await b.命令('Target.attachToTarget', { targetId: 页.targetId, flatten: true });
  return { b, 页, sessionId };
}

// ---------------------------------------------------------------------------
// 统一门面：桥在就走桥，否则直连（并且只连一次，复用给所有命令）
// ---------------------------------------------------------------------------
let 直连缓存 = null;

async function 造通道() {
  if (await 桥在()) {
    const ping = await 桥请求('/ping');
    return {
      方式: '桥',
      页: ping.页,
      求值: async 表达式 => {
        const r = await 桥请求('/eval', { expression: 表达式, awaitPromise: true });
        const 结果 = r.result || {};
        if (结果.subtype === 'error') throw new Error(结果.description || '求值抛错');
        return 结果.value;
      },
      命令: async (method, params = {}, session = false) => {
        const r = await 桥请求('/cmd', { method, params, session });
        return r.result;
      },
      关闭: () => {},
    };
  }
  if (!直连缓存) 直连缓存 = await 直连();
  const { b, 页, sessionId } = 直连缓存;
  return {
    方式: '直连（会弹一次授权窗；建议先起 tmp/cdp/bridge.mjs）',
    页,
    求值: async 表达式 => {
      const r = await b.命令('Runtime.evaluate', { expression: 表达式, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || '求值抛错');
      return r.result?.value;
    },
    命令: async (method, params = {}, session = false) => b.命令(method, params, session ? sessionId : undefined),
    关闭: () => b.关闭(),
  };
}

/**
 * 找到「剧情导演」那个脚本 iframe。
 * 酒馆给脚本 iframe 的 id 形如 `TH-script--剧情导演-测试--<uuid>`，
 * 而 id 里的名字取决于用户在酒馆里怎么命名那个脚本 —— 所以按「包含」找，不写死。
 */
const 找导演iframe = `([...document.querySelectorAll('iframe')].find(f => (f.id||'').includes(${JSON.stringify(导演脚本名)})) || null)`;

/** 悬浮球壳：挂在**酒馆顶层页** body 上，script_id = 脚本 iframe id 里的 uuid。 */
const orb摘要表达式 = `(() => {
  const f = ${找导演iframe};
  if (!f) return { 找到: false };
  const 脚本id = (f.id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/) || [])[1];
  const 壳们 = [...document.querySelectorAll('iframe[script_id]')].filter(x => x.getAttribute('script_id') === 脚本id);
  const 壳 = 壳们[0];
  const 球内 = 壳 && 壳.contentDocument;
  const 面板 = 球内 && 球内.querySelector('.dj-panel');
  const 球 = 球内 && 球内.querySelector('.dj-orb');
  const 盒子 = e => e ? (r => ({ left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }))(e.getBoundingClientRect()) : null;
  return {
    脚本iframe: f.id,
    壳iframe: 壳 ? { 位置: { left: 壳.style.left, top: 壳.style.top }, 尺寸: 壳.style.width + 'x' + 壳.style.height, 吃指针: 壳.style.pointerEvents } : null,
    壳数量: 壳们.length,
    脚本载入: !!(球内 && 球内.querySelector('.dj-root')),
    面板打开: !!(面板 && 面板.offsetParent !== null),
    球: 盒子(球),
    球态: 球 && 球.getAttribute('data-态'),
    面板: 盒子(面板),
  };
})()`;

function 打印(v) {
  if (v === undefined) return console.log('(undefined)');
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

// ---------------------------------------------------------------------------
const [命令 = 'ping', ...余下] = process.argv.slice(2);

try {
  const 通道 = await 造通道();
  try {
    if (命令 === 'ping') {
      打印({ 连上: true, 方式: 通道.方式, 页: { url: 通道.页?.url, title: 通道.页?.title, id: 通道.页?.targetId || 通道.页?.id }, 提示: '这是用户自己的 Chrome' });
    } else if (命令 === 'pages') {
      const r = await 通道.命令('Target.getTargets');
      打印((r.targetInfos || []).filter(t => t.type === 'page').map(t => ({ id: t.targetId, url: t.url, title: t.title })));
    } else if (命令 === 'eval') {
      const 表达式 = 余下[0] === '-f' ? fs.readFileSync(余下[1], 'utf8') : 余下.join(' ');
      if (!表达式) throw new Error('用法: eval "<js>" 或 eval -f 文件.js');
      打印(await 通道.求值(表达式));
    } else if (命令 === 'iframe') {
      const 表达式 = 余下[0] === '-f' ? fs.readFileSync(余下[1], 'utf8') : 余下.join(' ');
      if (!表达式) throw new Error('用法: iframe "<js>" 或 iframe -f 文件.js');
      const 包装 = `(() => {
        const f = ${找导演iframe};
        if (!f) return { 找到: false };
        return f.contentWindow.eval(${JSON.stringify(表达式)});
      })()`;
      打印(await 通道.求值(包装));
    } else if (命令 === 'orb') {
      打印(await 通道.求值(orb摘要表达式));
    } else if (命令 === 'shot') {
      const 出 = 余下[0] || path.join('tmp', 'cdp', 'shot.png');
      const r = await 通道.命令('Page.captureScreenshot', { format: 'png' }, true);
      fs.mkdirSync(path.dirname(path.resolve(出)), { recursive: true });
      fs.writeFileSync(出, Buffer.from(r.data, 'base64'));
      console.log(`已保存 ${path.resolve(出)}`);
    } else if (命令 === 'logs') {
      // 桥不支持 CDP 事件流，所以这里改成"在页面里挂个钩子把 console 存进数组，再读出来"。
      // 好处是走桥也不弹窗；坏处是只能拿到挂了钩子之后的输出。
      const 毫秒 = Number(余下[0] || 5000);
      const 装钩 = `(() => {
        if (window.__djlog) return { 已装: true, 旧条数: window.__djlog.length };
        window.__djlog = [];
        const 记 = (层) => {
          const 原 = console[层].bind(console);
          console[层] = (...a) => {
            try {
              window.__djlog.push(层 + ': ' + a.map(x => {
                try { return typeof x === 'object' ? JSON.stringify(x) : String(x); } catch { return String(x); }
              }).join(' '));
              if (window.__djlog.length > 400) window.__djlog.splice(0, 200);
            } catch {}
            原(...a);
          };
        };
        ['log','warn','error','info'].forEach(记);
        return { 已装: false };
      })()`;
      const 装好 = await 通道.求值(装钩);
      await new Promise(r => setTimeout(r, 毫秒));
      const 收 = await 通道.求值(`(window.__djlog || []).slice(-200)`);
      打印({ 钩子: 装好, 毫秒, 条数: 收?.length ?? 0, 行: 收 ?? [] });
    } else if (命令 === 'reload') {
      await 通道.命令('Page.reload', { ignoreCache: true }, true);
      console.log('已刷新');
    } else {
      console.error(`未知命令: ${命令}\n看文件头部的用法。`);
      process.exitCode = 2;
    }
  } finally {
    通道.关闭();
  }
} catch (e) {
  console.error(`[酒馆调试] ${e.message}`);
  process.exitCode = 1;
}
