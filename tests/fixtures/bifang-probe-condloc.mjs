// 一次性探针: R1–R5 / D14 里的**条件段**（生理/恋爱）嵌在哪些位置?
//
// 为什么要量这个（#210 的前提冲突）:
//   需求方要求「身份句/核心原则/NPC判定/字段规格/输出要求/任务指令 → 改成默认提示词里的普通文字」。
//   但 R2/R3/R5 的正文里**嵌着** `physioEnabled ? PHYSIO_xxx : ''` —— 那是条件段。
//   若整块变成模板固定文字，用户关掉生理监测时那几段**还在** —— 正是上一批修过的 bug。
//
// 所以要量: 生理开/关时, R2/R3/R5 的内容差异区间在哪、有多长。
// 恋爱同理（R7 只在 D14 尾部, 应该好办）。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-condloc.ts');
const 产物 = path.join(import.meta.dirname, '_probe-condloc.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师', 恋爱对象: '是' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造输入(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "/** 找两段文本的差异区间（最长公共前缀 + 最长公共后缀） */",
  "function 差异区间(a, b) {",
  "  let 前 = 0;",
  "  while (前 < a.length && 前 < b.length && a[前] === b[前]) 前++;",
  "  let 后 = 0;",
  "  while (后 < a.length - 前 && 后 < b.length - 前 && a[a.length-1-后] === b[b.length-1-后]) 后++;",
  "  return { 前, a中: a.slice(前, a.length - 后), b中: b.slice(前, b.length - 后), 后 };",
  "}",
  "",
  "const 关 = 跑({ physioEnabled: false, 恋爱对象名单: [] });",
  "const 开 = 跑({ physioEnabled: true, 恋爱对象名单: ['甲'] });",
  "",
  "for (const 代 of ['R1','R2','R3','R4','R5','D13','D14']) {",
  "  const a = String(关.零件内容?.[代] ?? '');",
  "  const b = String(开.零件内容?.[代] ?? '');",
  "  if (a === b) { console.log(代.padEnd(4), '开/关完全相同', 'len=' + a.length); continue; }",
  "  const d = 差异区间(a, b);",
  "  console.log('');",
  "  console.log('=== ' + 代 + ' 差异 ===');",
  "  console.log('  关时 len=' + a.length + ' | 开时 len=' + b.length + ' | 差 ' + (b.length - a.length));",
  "  console.log('  公共前缀 ' + d.前 + ' 字, 公共后缀 ' + d.后 + ' 字');",
  "  console.log('  关时该区间:', JSON.stringify(d.a中.slice(0, 120)), d.a中.length > 120 ? '…(' + d.a中.length + '字)' : '');",
  "  console.log('  开时该区间:', JSON.stringify(d.b中.slice(0, 120)), d.b中.length > 120 ? '…(' + d.b中.length + '字)' : '');",
  "  console.log('  区间前 40 字上下文:', JSON.stringify(a.slice(Math.max(0, d.前 - 40), d.前)));",
  "  console.log('  区间后 40 字上下文:', JSON.stringify(a.slice(a.length - d.后, a.length - d.后 + 40)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== 汇总: 条件段占了多少 ===');",
  "let 总关 = 0, 总开 = 0;",
  "for (const m of 关.messages) 总关 += String(m.content).length;",
  "for (const m of 开.messages) 总开 += String(m.content).length;",
  "console.log('全关时全文', 总关, '| 全开时全文', 总开, '| 生理+恋爱带来', 总开 - 总关, '字');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
