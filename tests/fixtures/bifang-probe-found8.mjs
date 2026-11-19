// 一次性探针（只读）: 验「发现8」—— 清空时元数据写失败，一份快照都不许删。
//
// ── 这个 bug 是什么 ──
//  原来是**先删快照，最后写元数据**。失败时：
//    · `saveMeta` 失败 → 返回 `{成功:false}` → 界面提示"未清空"、**仍显示旧 NPC 列表**
//    · 而**磁盘上快照已经全删了** → 刷新后是空状态
//
//  **"提示未清空"和"实际已删"同时成立** —— 用户看到的是前者，真相是后者。
//
// ── 判据 ──
//  ① 元数据写失败 → 断言**一份快照都没被删**
//  ② 自证：元数据写成功时，快照必须被删（否则是"干脆什么都不做"）
//  ③ 自证：删快照失败时，仍算成功（孤儿无害）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-found8.ts');
const 产物 = path.join(此处, '_probe-found8.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { clearAllData, STORAGE_KEY } from '../../src/彼方_NPC幕后生命状态系统/快照';",
  "",
  "let 通过 = 0, 失败 = 0;",
  "const 断言 = (名, 实际, 期望) => {",
  "  const ok = JSON.stringify(实际) === JSON.stringify(期望);",
  "  if (ok) 通过++; else 失败++;",
  "  console.log('  ' + (ok ? '✅' : '★ ') + '  ' + 名 + (ok ? '' : '  实际=' + JSON.stringify(实际) + ' 期望=' + JSON.stringify(期望)));",
  "};",
  "",
  "const 原I = console.info, 原W = console.warn, 原E = console.error, 原T = console.table;",
  "const 静默 = () => { console.info = () => {}; console.warn = () => {}; console.error = () => {}; console.table = () => {}; };",
  "const 恢复 = () => { console.info = 原I; console.warn = 原W; console.error = 原E; console.table = 原T; };",
  "",
  "/**",
  " * 造一个有 3 份快照的聊天。",
  " * @param 选项.meta写失败  让 chat 作用域写入抛错（= saveMeta 失败）",
  " * @param 选项.删快照失败  让 message 作用域的 del 抛错（= 删不掉，留孤儿）",
  " */",
  "function 造聊天(选项 = {}) {",
  "  const 存 = { global: {}, chat: {}, message: {}, script: undefined };",
  "  存.chat['彼方'] = { 版本: 3, 快照楼层: [3, 5, 7], 清空层: 0 };",
  "  for (const id of [3, 5, 7]) {",
  "    存.message[id] = { [STORAGE_KEY]: { 版本: 3, 楼层: id, 原编号: id, NPC: { ['人' + id]: {} }, 名单: ['人' + id], 剧情时间: '' } };",
  "  }",
  "  const host = {",
  "    vars: {",
  "      get: (arg) => (arg?.type === 'chat' ? 存.chat : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global)),",
  "      update: (fn, arg) => {",
  "        if (arg?.type === 'chat' && 选项.meta写失败) throw new Error('模拟：元数据写入失败');",
  "        const 新 = fn(arg?.type === 'chat' ? 存.chat : 存.global);",
  "        if (arg?.type === 'chat') 存.chat = 新; else 存.global = 新;",
  "      },",
  "      del: (key, arg) => {",
  "        if (arg?.type === 'message') {",
  "          if (选项.删快照失败) throw new Error('模拟：快照删不掉');",
  "          delete 存.message[arg.message_id]?.[key];",
  "        } else delete (arg?.type === 'chat' ? 存.chat : 存.global)[key];",
  "      },",
  "      insertOrAssign: () => {},",
  "      scriptId: () => 't',",
  "    },",
  "    chat: { lastMessageId: () => 9, messages: (id) => (存.message[id] ? [{ message_id: id, role: 'assistant', message: 'x' }] : []) },",
  "  };",
  "  return { host, 存 };",
  "}",
  "",
  "/** 数一下还有几份快照本体 */",
  "const 数快照 = (存) => Object.keys(存.message).filter(id => 存.message[id]?.[STORAGE_KEY]).length;",
  "",
  "try {",
  "  console.log('=== ① 元数据写失败 → 一份快照都不许删 ===');",
  "  {",
  "    const { host, 存 } = 造聊天({ meta写失败: true });",
  "    断言('[前置] 开始有 3 份快照', 数快照(存), 3);",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = clearAllData(host); } finally { 恢复(); }",
  "    断言('返回 失败', 结果.成功, false);",
  "    断言('★ 一份快照都没被删', 数快照(存), 3);",
  "    断言('清空层没被改（仍是 0）', 结果.清空层, 0);",
  "    断言('失败原因里说明了一份都没删', /一份快照都没删/.test(结果.失败原因 ?? ''), true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ② 自证：元数据写成功时，快照必须被删 ===');",
  "  {",
  "    const { host, 存 } = 造聊天();",
  "    断言('[前置] 开始有 3 份快照', 数快照(存), 3);",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = clearAllData(host); } finally { 恢复(); }",
  "    断言('[自证] 返回成功', 结果.成功, true);",
  "    断言('[自证] 3 份快照全被删了', 数快照(存), 0);",
  "    断言('[自证] 清空层记成了 9', 结果.清空层, 9);",
  "    断言('[自证] 索引被重置成空', 存.chat['彼方'].快照楼层, []);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ③ 自证：删快照失败时，仍算成功（孤儿无害）===');",
  "  {",
  "    const { host, 存 } = 造聊天({ 删快照失败: true });",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = clearAllData(host); } finally { 恢复(); }",
  "    断言('[自证] 仍返回成功（索引已重置，孤儿读侧看不见）', 结果.成功, true);",
  "    断言('[自证] 快照本体还在（孤儿）', 数快照(存), 3);",
  "    断言('[自证] 但索引已空（读侧看不到它们）', 存.chat['彼方'].快照楼层, []);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ④ 读不到当前楼层时，一份快照都不许删（既有行为）===');",
  "  {",
  "    const { host, 存 } = 造聊天();",
  "    host.chat.lastMessageId = () => { throw new Error('模拟：读不到楼层'); };",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = clearAllData(host); } finally { 恢复(); }",
  "    断言('返回 失败', 结果.成功, false);",
  "    断言('一份快照都没被删', 数快照(存), 3);",
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
