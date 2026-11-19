// 一次性探针（只读）: 验「发现9」—— 导入时每个 NPC 的值也必须是对象。
//
// ── 这个 bug 是什么 ──
//  原来只校验 `载荷.NPC` 是对象，不校验它的**每个值**。于是
//  `{"NPC": {"甲": "一段字符串"}}` 能通过校验并写进快照 ——
//  之后选中「甲」时面板按 `card['字段']` 取值全是 undefined，**人物页空白**，
//  **畸形数据常驻**，而且没有任何提示说明它是怎么来的。
//
// ── 判据 ──
//  ① `{"NPC": {"甲": "字符串"}}` → 整份拒绝 + 说清是哪一条
//  ② 自证：合法数据照常导入（防判据误伤）
//  ③ 自证：旧实现会放行（证明那个 bug 是真的）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-found9.ts');
const 产物 = path.join(此处, '_probe-found9.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { 导入数据 } from '../../src/彼方_NPC幕后生命状态系统/数据变更';",
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
  "/** 假环境: 记录是否真的落盘了 */",
  "function 造环境() {",
  "  const 记 = { 保存了几次: 0, 同步了几次: 0 };",
  "  const 环境 = {",
  "    世界书写入: '角色卡主世界书', // ⚠ 不能是 '关闭' —— 那会让 同步世界书 直接 return",
  "    保存: (数据) => { 记.保存了几次++; return true; },",
  "    清空: () => ({ 成功: true, 清空层: 0 }),",
  "    同步世界书: () => { 记.同步了几次++; },",
  "    现在: () => 1,",
  "  };",
  "  return { 环境, 记 };",
  "}",
  "",
  "const 原数据 = { NPC: { 旧人: { 位置: '家' } }, 名单: ['旧人'], 统计: { 更新次数: 1, 最后更新: 1 }, 剧情时间: '', 清空层: 0, 锚点楼层: 0, 处理到楼层: 0 };",
  "",
  "try {",
  "  console.log('=== ① NPC 的值是字符串 → 整份拒绝 ===');",
  "  {",
  "    const { 环境, 记 } = 造环境();",
  "    const 文本 = JSON.stringify({ 名单: ['甲'], NPC: { 甲: '一段字符串' } });",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = 导入数据(文本, 原数据, 环境); } finally { 恢复(); }",
  "    console.log('    说明: ' + 结果.说明);",
  "    断言('返回了失败', typeof 结果.失败, 'string');",
  "    断言('★ 没有落盘', 记.保存了几次, 0);",
  "    断言('★ 没有同步世界书', 记.同步了几次, 0);",
  "    断言('数据没被替换（还是原来那份）', 结果.数据, 原数据);",
  "    断言('说明里指出了是哪一条', /甲/.test(结果.说明), true);",
  "    断言('说明里说了它是什么类型', /string/.test(结果.说明), true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ② NPC 的值是 null / 数组 / 数字 → 也要拒绝 ===');",
  "  for (const [名, 值, 该出现] of [['null', null, 'null'], ['数组', [1, 2], '数组'], ['数字', 42, 'number']]) {",
  "    const { 环境, 记 } = 造环境();",
  "    const 文本 = JSON.stringify({ 名单: ['甲'], NPC: { 甲: 值 } });",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = 导入数据(文本, 原数据, 环境); } finally { 恢复(); }",
  "    断言('值是 ' + 名 + ' → 拒绝', typeof 结果.失败, 'string');",
  "    断言('值是 ' + 名 + ' → 没落盘', 记.保存了几次, 0);",
  "    断言('说明里写了类型「' + 该出现 + '」', 结果.说明.includes(该出现), true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ③ 自证：合法数据照常导入（防判据误伤）===');",
  "  {",
  "    const { 环境, 记 } = 造环境();",
  "    const 文本 = JSON.stringify({ 名单: ['甲', '乙'], NPC: { 甲: { 位置: '家' }, 乙: { 位置: '店' } } });",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = 导入数据(文本, 原数据, 环境); } finally { 恢复(); }",
  "    断言('[自证] 合法数据导入成功', 结果.失败, undefined);",
  "    断言('[自证] 真的落盘了', 记.保存了几次, 1);",
  "    断言('[自证] 真的同步世界书了', 记.同步了几次, 1);",
  "    断言('[自证] 名单是 2 个人', 结果.数据.名单, ['甲', '乙']);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ④ 自证：旧校验会放行畸形数据（证明 bug 是真的）===');",
  "  {",
  "    // 复刻旧校验：只判 NPC 是对象，不判每个值",
  "    const 旧校验通过 = (载荷) => Array.isArray(载荷.名单) && !!载荷.NPC && typeof 载荷.NPC === 'object' && !Array.isArray(载荷.NPC);",
  "    const 畸形 = { 名单: ['甲'], NPC: { 甲: '一段字符串' } };",
  "    const 合法 = { 名单: ['甲'], NPC: { 甲: { 位置: '家' } } };",
  "    断言('[自证] 旧校验放行畸形数据（这就是那个 bug）', 旧校验通过(畸形), true);",
  "    断言('[自证] 旧校验也放行合法数据', 旧校验通过(合法), true);",
  "    断言('[自证] 旧校验分不出这两者（所以它没用）', 旧校验通过(畸形) === 旧校验通过(合法), true);",
  "  }",
  "",
  "  console.log('');",
  "  console.log('=== ⑤ 多条坏数据时，说清有几条 ===');",
  "  {",
  "    const { 环境 } = 造环境();",
  "    const 文本 = JSON.stringify({ 名单: ['甲', '乙', '丙'], NPC: { 甲: 'x', 乙: 1, 丙: { 位置: '家' } } });",
  "    静默();",
  "    let 结果;",
  "    try { 结果 = 导入数据(文本, 原数据, 环境); } finally { 恢复(); }",
  "    console.log('    说明: ' + 结果.说明);",
  "    断言('说清有 2 个坏条目', /有 2 个 NPC/.test(结果.说明), true);",
  "    断言('点名了甲', /甲/.test(结果.说明), true);",
  "    断言('点名了乙', /乙/.test(结果.说明), true);",
  "    断言('没把好的丙说成坏的', /丙（/.test(结果.说明), false);",
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
