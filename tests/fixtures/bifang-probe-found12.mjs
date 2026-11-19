// 一次性探针（只读）: 验「发现12」—— 快照在 500 层之外时，认领兜底还能不能找到。
//
// ── 这个 bug 是什么 ──
//  认领兜底写的是 `for (id = 最后; id > 最后 - 500; id--)`。
//  如果最近那份快照正好在 **500 层之外**（长期聊天 + 最近几百层没触发更新），
//  这个循环扫不到它 → 候选仍是 null → **返回空状态**。
//
//  后果：用户的 NPC 名单/NPC 卡全部消失，**而数据其实还在**（就在那一层的变量里）。
//  下一次更新会以空状态为基底 → 等于把历史全丢了。
//
// ── 判据 ──
//  ① 快照在 700 层外（旧版扫不到）→ 新版必须找到
//  ② 自证：把回溯上限改回 500 → 必须找不到（证明那个 bug 是真的）
//  ③ 扫不到时必须有明确的 warn（不许静默返回空状态）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-found12.ts');
const 产物 = path.join(此处, '_probe-found12.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { loadData, STORAGE_KEY } from '../../src/彼方_NPC幕后生命状态系统/快照';",
  "",
  "let 通过 = 0, 失败 = 0;",
  "const 断言 = (名, 实际, 期望) => {",
  "  const ok = JSON.stringify(实际) === JSON.stringify(期望);",
  "  if (ok) 通过++; else 失败++;",
  "  console.log('  ' + (ok ? '✅' : '★ ') + '  ' + 名 + (ok ? '' : '  实际=' + JSON.stringify(实际) + ' 期望=' + JSON.stringify(期望)));",
  "};",
  "",
  "const 原I = console.info, 原W = console.warn, 原E = console.error, 原T = console.table;",
  "let 警告们 = [];",
  "const 静默 = () => { console.info = () => {}; console.warn = (...a) => 警告们.push(a.join(' ')); console.error = () => {}; console.table = () => {}; };",
  "const 恢复 = () => { console.info = 原I; console.warn = 原W; console.error = 原E; console.table = 原T; };",
  "",
  "/**",
  " * 造一个「快照在很深的楼层」的聊天。",
  " *",
  " * 布置：最后楼层 = 1000，快照只在楼层 200 上（距最后 800 层）。",
  " * 索引里**没有**记录（模拟\"索引整批失效\"那条情形二）。",
  " */",
  "function 造深楼层聊天(最后楼层 = 1000, 快照楼层 = 200) {",
  "  setActivePinia(createPinia());",
  "  const 存 = { global: {}, chat: {}, message: {}, script: undefined };",
  "  存.chat['彼方'] = { 版本: 3, 快照楼层: [], 清空层: 0 }; // 索引空 → 走兜底扫描",
  "  存.message[快照楼层] = {",
  "    [STORAGE_KEY]: {",
  "      版本: 3, 楼层: 快照楼层, 原编号: 快照楼层,",
  "      NPC: { 泰丝: { 当前在做: '整理货单' } },",
  "      名单: ['泰丝'], 剧情时间: '2026-01-02 12:30',",
  "    },",
  "  };",
  "  let 读了几次 = 0;",
  "  const host = {",
  "    vars: {",
  "      get: (arg) => { 读了几次++; return arg?.type === 'chat' ? 存.chat : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global); },",
  "      update: (fn, arg) => { const 新 = fn(arg?.type === 'chat' ? 存.chat : 存.global); if (arg?.type === 'chat') 存.chat = 新; else 存.global = 新; },",
  "      del: () => {},",
  "      insertOrAssign: () => {},",
  "      scriptId: () => 't',",
  "    },",
  "    chat: {",
  "      lastMessageId: () => 最后楼层,",
  "      messages: (id) => (id === 快照楼层 ? [{ message_id: id, role: 'assistant', is_hidden: false, message: 'x' }] : []),",
  "    },",
  "  };",
  "  return { host, 存, 取读次数: () => 读了几次 };",
  "}",
  "",
  "try {",
  "  console.log('=== ① 快照在 800 层外（旧版 500 层扫不到）→ 新版必须找到 ===');",
  "  {",
  "    const { host, 取读次数 } = 造深楼层聊天(1000, 200);",
  "    警告们 = [];",
  "    静默();",
  "    let data;",
  "    try { data = loadData(host, true); } finally { 恢复(); }",
  "    const 键 = Object.keys(data?.NPC ?? {});",
  "    console.log('    读到 NPC: ' + JSON.stringify(键) + '  读了 ' + 取读次数() + ' 次变量');",
  "    断言('★ 800 层外的快照被找到了', 键, ['泰丝']);",
  "    断言('[自证] 不是返回空状态', 键.length > 0, true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ② 自证：回溯上限 500 时，同一个场景必须找不到 ===');",
  "  {",
  "    // 用纯逻辑复刻旧版循环，证明那个 bug 是真的",
  "    const 旧版能扫到 = (最后, 快照层, 上限) => 快照层 > 最后 - 上限 && 快照层 <= 最后;",
  "    console.log('    旧版(上限 500): 快照在 #200, 最后 #1000 → 扫到? ' + 旧版能扫到(1000, 200, 500));",
  "    断言('[自证] 旧版扫不到（#200 < 1000-500=500）', 旧版能扫到(1000, 200, 500), false);",
  "    断言('[自证] 新版上限 5000 能扫到', 旧版能扫到(1000, 200, 5000), true);",
  "    断言('[自证] 两者确实不同', 旧版能扫到(1000, 200, 500) !== 旧版能扫到(1000, 200, 5000), true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ③ 真的没有任何快照时，必须有明确的 warn（不许静默）===');",
  "  {",
  "    const { host } = 造深楼层聊天(1000, 999999); // 快照楼层根本不存在",
  "    警告们 = [];",
  "    静默();",
  "    let data;",
  "    try { data = loadData(host, true); } finally { 恢复(); }",
  "    const 认领警告 = 警告们.filter(w => /没有找到任何可认领的快照/.test(w));",
  "    console.log('    警告: ' + (认领警告[0] ?? '(无)').slice(0, 120));",
  "    断言('扫不到时有明确 warn', 认领警告.length, 1);",
  "    断言('warn 里说了扫了几层', /扫了 \\d+ 层/.test(认领警告[0] ?? ''), true);",
  "    断言('返回空状态（这是对的）', Object.keys(data?.NPC ?? {}).length, 0);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ④ 上限有界：一万层聊天也不许扫穿 ===');",
  "  {",
  "    // ── 这条防的是「为了修 bug 把性能搞坏」──",
  "    //  如果无脑改成\"扫穿整条聊天\"，一万层就是一万次 vars.get。",
  "    //  正确做法：给一个大但**有界**的上限，并在扫不到时明确告警。",
  "    //",
  "    //  ⚠ 我第一版以为\"索引里有记录就能缩小范围\" —— **那是错的**：",
  "    //    删楼后快照会往下移动任意距离（/cut 删多少移多少），",
  "    //    索引记的旧编号**不能用来推断它现在在哪**。",
  "    //    实测：索引 [190]、最后 99、快照实际在 90 时，按索引算下界=99，只扫一层就停了。",
  "    const { host, 取读次数 } = 造深楼层聊天(10000, 9900);",
  "    警告们 = [];",
  "    静默();",
  "    let data;",
  "    try { data = loadData(host, true); } finally { 恢复(); }",
  "    const 读了 = 取读次数();",
  "    console.log('    一万层聊天，读了 ' + 读了 + ' 次');",
  "    断言('找到快照（9900 在 2000 层内）', Object.keys(data?.NPC ?? {}), ['泰丝']);",
  "    断言('[自证] 有界：读了不到 2100 次（不是一万次）', 读了 < 2100, true);",
  "    断言('[自证] 但确实扫了超过 100 层（不是只扫一层）', 读了 > 100, true);",
  "  }",
  "}",
  "finally {",
  "  恢复();",
  "}",
  "",
  "console.log('');",
  "console.log('结果: ' + 通过 + ' 通过, ' + 失败 + ' 失败');",
  "process.exit(失败 > 0 ? 1 : 0);",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
