// 一次性探针: R6/R7 的文字到底分散在几处?
//
// 这决定"把它们做成占位符"是否可行 —— 占位符只能插在一个位置,
// 而它们的文字散在 4 处, 拆开就是"同一个概念被切成 4 块放在模板不同地方"。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-r67loc.ts');
const 产物 = path.join(import.meta.dirname, '_probe-r67loc.mjs');

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
  "const 开 = 跑({ physioEnabled: true, 恋爱对象名单: ['甲'] });",
  "const 关 = 跑({ physioEnabled: false, 恋爱对象名单: [] });",
  "",
  "// 用几段特征串, 看它们分别落在哪条消息、哪个位置",
  "const 特征 = [",
  "  ['R6-权威段', '现有状态卡中的生理字段是彼方代码判定的权威数据'],",
  "  ['R6-增量条目', '生理周期: 彼方代码会按剧情时间自动推进'],",
  "  ['R6-自检段', '生理自检'],",
  "  ['R6-任务尾部', '【生理监测】(本次开启)'],",
  "  ['R7-恋爱段', '【恋爱监测】(本次开启)'],",
  "];",
  "",
  "console.log('=== 开着时, 各片段落在第几条消息 ===');",
  "for (const [名, 串] of 特征) {",
  "  const 条 = 开.messages.findIndex(m => String(m.content).includes(串));",
  "  const 在工具 = String(开.工具说明 ?? '').includes(串);",
  "  console.log(名.padEnd(14), 条 >= 0 ? '第 ' + (条+1) + ' 条 ' + 开.messages[条].role : (在工具 ? '工具说明' : '未找到'));",
  "}",
  "",
  "console.log('');",
  "console.log('=== 关着时这些片段还在不在 ===');",
  "for (const [名, 串] of 特征) {",
  "  const 在 = 关.messages.some(m => String(m.content).includes(串)) || String(关.工具说明 ?? '').includes(串);",
  "  console.log(名.padEnd(14), 在 ? '还在' : '已消失');",
  "}",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "const 处数 = new Set(特征.slice(0, 4).map(([, 串]) => 开.messages.findIndex(m => String(m.content).includes(串)))).size;",
  "console.log('R6 的四段分布在', 处数, '条不同消息里');",
  "console.log('→ 若做成一个占位符, 只能插在一个位置, 另外几处要么丢、要么变成模板里的固定文字(但它们随开关变化)');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
