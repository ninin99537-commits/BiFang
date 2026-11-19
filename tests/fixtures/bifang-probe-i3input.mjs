// 一次性探针: 从快照反推"生成它时的输入"，逐项比对
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-i3input.ts');
const 产物 = path.join(此处, '_probe-i3input.mjs');

const 源码 = [
  "import 快照文本 from './bifang-prompt-去伪装后.json?raw';",
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 快照 = JSON.parse(快照文本);",
  "const 期望 = 快照['默认'];",
  "const 期望用户 = String(期望.messages[期望.messages.length - 1].content);",
  "",
  "// 从快照里把每个零件的实际内容切出来，反推输入",
  "console.log('=== 快照用户段全文（前 600 字）===');",
  "console.log(JSON.stringify(期望用户.slice(0, 600)));",
  "console.log('');",
  "console.log('=== 快照用户段全文（后 700 字）===');",
  "console.log(JSON.stringify(期望用户.slice(-700)));",
  "",
  "// 用不同的输入试，看哪个能对上",
  "const 候选 = [",
  "  { 名: 'A', 输入: {} },",
  "  { 名: 'B', 输入: { playerDescription: '主角描述' } },",
  "  { 名: 'C', 输入: { worldbook: '世界书内容' } },",
  "  { 名: 'D', 输入: { recentTrace: '轨迹内容' } },",
  "  { 名: 'E', 输入: { context: '主角走进广场。' } },",
  "];",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t,",
  "  模板: 默认模板, ...额外,",
  "});",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "console.log('');",
  "console.log('=== 各候选与快照的差异位置 ===');",
  "for (const { 名, 输入 } of 候选) {",
  "  const r = 跑(输入);",
  "  const 实 = String(r.messages[r.messages.length - 1].content);",
  "  if (实 === 期望用户) { console.log(名, '✓ 完全一致'); continue; }",
  "  let 差 = -1;",
  "  for (let i = 0; i < Math.max(实.length, 期望用户.length); i++) {",
  "    if (实[i] !== 期望用户[i]) { 差 = i; break; }",
  "  }",
  "  console.log(名, 'len=' + 实.length, '(期望 ' + 期望用户.length + ') 首差 @' + 差);",
  "  if (差 >= 0) {",
  "    console.log('   实:', JSON.stringify(实.slice(Math.max(0,差-40), 差+60)));",
  "    console.log('   期:', JSON.stringify(期望用户.slice(Math.max(0,差-40), 差+60)));",
  "  }",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
