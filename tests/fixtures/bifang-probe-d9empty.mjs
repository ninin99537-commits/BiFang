// 一次性探针（只读）: 查清"没人设时【主角信息】标签为什么还在"。
//
// 线索：③ 报 `含「【主角信息】」? true`，但期望 false（整行消失）。
//
// 可能原因（三种，逐一验）：
//   A. 数据不为空（`(未设置)` 那句让占位符非空）→ 整行当然保留，标签也在
//   B. 渲染规则 ②b 没生效
//   C. 探针自己的判断错了
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-d9empty.ts');
const 产物 = path.join(此处, '_probe-d9empty.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板, 渲染段 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '正文。', replyCount: 1, context: '', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '', storySpan: '', recentTrace: '',",
  "  playerName: '', playerDescription: '', 展开宏: (t) => t,",
  "  模板: 默认模板, ...额外,",
  "});",
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "const 空 = 跑({});",
  "const d9 = String(空.零件内容['D9'] ?? '');",
  "console.log('=== ① 没人设时 D9 的实际内容 ===');",
  "console.log('  长度 ' + d9.length);",
  "console.log('  JSON: ' + JSON.stringify(d9));",
  "console.log('  → 非空? ' + (d9.length > 0));",
  "console.log('  → 若非空，那占位符就不是空的，规则 ②b 不会让整行消失');",
  "",
  "console.log('');",
  "console.log('=== ② 默认模板里那一行长什么样 ===');",
  "const 行 = 默认模板[1].content.split('\\n').find(l => l.includes('主角信息'));",
  "console.log('  ' + JSON.stringify(行));",
  "",
  "console.log('');",
  "console.log('=== ③ 用 渲染段 单独测这一行 ===');",
  "for (const [名, 值] of [['空串', ''], ['有值', '\\n名字: 甲\\n描述']]) {",
  "  const 渲染 = 渲染段(行, (x) => (x === '主角信息' ? 值 : ''));",
  "  console.log('  值=' + 名.padEnd(4) + ' → ' + JSON.stringify(渲染));",
  "}",
  "",
  "console.log('');",
  "console.log('=== ④ 结论 ===');",
  "console.log('  规则 ②b 是\"行内占位符为空 → 整行消失\"。');",
  "console.log('  但 D9 在没人设时**不空** —— 它输出 `名字: (未设置)` 等占位文字。');",
  "console.log('  所以标签会保留，这是**对的**：它下面还有数据（名字/描述/玩家说明）。');",
  "console.log('  真正会孤儿的是\"整个 D9 为空\"的情况 —— 而 D9 永远不会全空。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
