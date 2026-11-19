// 一次性探针（v2）: 精确数「值级占位符」需要重复几次。
//
// 上一版为什么错（§十二 #22 要求写清）:
//   v1 用 `'主角'` 当 playerName 的测试值，而 D9 的模板里本来就有「主角」这个词
//   （"【主角信息】"、"玩家/主角"），于是 `split('主角')` 命中 21 次 —— 那是**子串巧合**，
//   不是"这个值真的出现了 21 次"。同理 `'1'` 命中 61 次。
//
// 本版判据: 测试值一律用**不会自然出现**的标记串（如 `PNAME7Q`），
//   这样每一次命中都一定是"代码插入的那个值"，不是模板里的自然文字。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-values2.ts');
const 产物 = path.join(import.meta.dirname, '_probe-values2.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "// 每个值都用独一无二的标记串（不会与模板里的自然文字撞）",
  "const 标 = {",
  "  reply: 'REPLY7Q', replyCount: 3,",
  "  context: 'CTX7Q', timeJump: 'JUMP7Q',",
  "  tracked: ['TRK7Q'], inSceneHint: ['HINT7Q'],",
  "  currentCards: { CARD7Q: { 当前在做: 'x' } },",
  "  worldbook: 'WB7Q', currentStoryTime: 'CTIME7Q',",
  "  storyTimeHint: 'STIME7Q', storySpan: 'SPAN7Q', recentTrace: 'TRACE7Q',",
  "  playerName: 'PNAME7Q', playerDescription: 'PDESC7Q',",
  "};",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, 展开宏: (t) => t, ...标, ...额外,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造输入({})); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "const 零件们 = r.零件内容 ?? {};",
  "const 全 = Object.entries(零件们).map(([k, v]) => k + '\\u0000' + String(v)).join('\\u0001');",
  "",
  "console.log('=== 每个标记串在全部零件内容里出现几次（精确, 无子串巧合）===');",
  "const 行 = [];",
  "for (const [字段, v] of Object.entries(标)) {",
  "  if (Array.isArray(v)) {",
  "    for (const x of v) {",
  "      const n = 全.split(x).length - 1;",
  "      if (n > 0) 行.push([字段, x, n]);",
  "    }",
  "  } else if (typeof v !== 'object') {",
  "    const n = 全.split(String(v)).length - 1;",
  "    if (n > 0) 行.push([字段, String(v), n]);",
  "  } else {",
  "    const n = 全.split('CARD7Q').length - 1;",
  "    if (n > 0) 行.push([字段, 'CARD7Q', n]);",
  "  }",
  "}",
  "for (const [f, v, n] of 行) {",
  "  const 危 = n > 1 ? '  ← 出现 ' + n + ' 次（值级占位符需重复）' : '';",
  "  console.log(f.padEnd(18), v.padEnd(10), n + ' 次' + 危);",
  "}",
  "",
  "console.log('');",
  "console.log('=== 逐零件: 哪些标记出现几次（这才是搬包装的真实代价）===');",
  "const 归属 = {",
  "  'D1': ['REPLY7Q', '3'],",
  "  'D2': ['WB7Q'],",
  "  'D-T': ['STIME7Q', 'JUMP7Q', 'CTIME7Q', 'SPAN7Q'],",
  "  'D-N': ['TRK7Q', 'HINT7Q'],",
  "  'D9': ['PNAME7Q', 'PDESC7Q'],",
  "  'D10': ['CTIME7Q', 'CARD7Q'],",
  "  'D12': ['TRACE7Q'],",
  "  'D13': ['CTX7Q'],",
  "};",
  "let 有重复 = false;",
  "for (const [代, 标们] of Object.entries(归属)) {",
  "  const c = String(零件们[代] ?? '');",
  "  const 细 = 标们.map(m => {",
  "    const n = c.split(m).length - 1;",
  "    return n > 0 ? m + '×' + n : null;",
  "  }).filter(Boolean);",
  "  const 重 = 标们.filter(m => c.split(m).length - 1 > 1);",
  "  if (重.length) 有重复 = true;",
  "  console.log(代.padEnd(5), 'len=' + String(c.length).padStart(4), '|', (细.join(' ') || '(无)'), 重.length ? '  ⚠ 重复: ' + 重.join(' ') : '');",
  "}",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "console.log('存在「同一值在一个零件里出现多次」?', 有重复);",
  "console.log('→ 若是, 搬包装就得让同一个占位符出现多次, 而 C4 规定首处生效、其余忽略。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
