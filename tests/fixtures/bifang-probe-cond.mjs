// 一次性探针: 把包装搬进模板后, **条件零件为空时**会怎样?
//
// 背景(#208): 占位符只产出数据, 包装文字搬进默认模板。
// 但有些零件是**条件性的** —— 数据为空时, 现在连包装一起消失(整段空串)。
// 若包装变成模板里的字, 数据为空时包装还在 → 产物多出一行孤立标签 → 破 I3。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-cond.ts');
const 产物 = path.join(import.meta.dirname, '_probe-cond.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },",
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
  "// 各种空值组合下, 条件零件的内容是什么(判据: 空串 = 连包装一起消失)",
  "const 情形们 = [",
  "  ['全部为空', {}],",
  "  ['世界书有内容', { worldbook: 'WB' }],",
  "  ['有场景判断', { context: '玩家走进广场' }],",
  "  ['有轨迹', { recentTrace: '轨迹' }],",
  "  ['生理开', { physioEnabled: true }],",
  "  ['有恋爱对象', { 恋爱对象名单: ['甲'] }],",
  "];",
  "",
  "const 看 = ['D2', 'D13', 'D12', 'D11', 'R6', 'R7'];",
  "console.log('零件'.padEnd(6), 情形们.map(x => x[0].padEnd(12)).join(''));",
  "for (const 代 of 看) {",
  "  const 列 = 情形们.map(([, 额外]) => {",
  "    const c = String(跑(额外).零件内容?.[代] ?? '');",
  "    return (c ? 'len=' + c.length : '空串').padEnd(12);",
  "  });",
  "  console.log(代.padEnd(6), 列.join(''));",
  "}",
  "",
  "console.log('');",
  "console.log('=== 关键: 世界书为空时, 现在整段是空串(连标签一起消失) ===');",
  "const 空世界书 = String(跑({}).零件内容?.D2 ?? '');",
  "console.log('D2 内容:', JSON.stringify(空世界书), '| 是空串?', 空世界书 === '');",
  "const 有世界书 = String(跑({ worldbook: 'WB' }).零件内容?.D2 ?? '');",
  "console.log('D2 有内容时前 40 字:', JSON.stringify(有世界书.slice(0, 40)));",
  "console.log('→ 说明: 标签与数据**同生共死**。标签搬进模板后, 数据为空时标签会孤零零留下。');",
  "",
  "console.log('');",
  "console.log('=== 同理: 场景判断 / 轨迹 / 台账 ===');",
  "for (const [代, 空额外, 有额外] of [",
  "  ['D13', {}, { context: '玩家走进广场' }],",
  "  ['D12', {}, { recentTrace: '轨迹' }],",
  "]) {",
  "  const 空 = String(跑(空额外).零件内容?.[代] ?? '');",
  "  const 有 = String(跑(有额外).零件内容?.[代] ?? '');",
  "  console.log(代, '空时:', 空 === '' ? '空串' : 'len=' + 空.length, '| 有内容时: len=' + 有.length);",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
