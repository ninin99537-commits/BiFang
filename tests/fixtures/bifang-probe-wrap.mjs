// 一次性探针: 把 11 个"保留占位符"的零件切成【包装文字】+【数据】。
//
// 为什么必须切（#208）: 占位符只产数据, 包装搬进模板。
// 但包装里可能**嵌着动态值**（如「共 N 条」），那种包装搬不进静态模板。
//
// 判据: 换一组数据/换一轮输入, 看零件内容的**公共前缀**变不变。
//   不变 → 包装是静态的, 可以搬进模板
//   变了 → 包装里有动态值, 搬进去就固化了
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-wrap.ts');
const 产物 = path.join(import.meta.dirname, '_probe-wrap.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文甲。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: 'WB甲', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹甲',",
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
  "/** 两组输入的公共前缀长度 */",
  "function 公共前缀(a, b) {",
  "  let i = 0;",
  "  while (i < a.length && i < b.length && a[i] === b[i]) i++;",
  "  return i;",
  "}",
  "",
  "// 组 A 与 组 B: 数据全换（正文/世界书/轨迹/名字/时间都换）, 看包装是否稳定",
  "const A = 跑({});",
  "const B = 跑({",
  "  reply: '完全不同的剧情。', replyCount: 3, worldbook: 'WB乙', recentTrace: '轨迹乙',",
  "  tracked: ['乙', '丙'], inSceneHint: ['乙'],",
  "  currentCards: { 乙: { 当前在做: '看店' } },",
  "  currentStoryTime: '2027-05-05 08:00', storyTimeHint: '2027-05-06 09:00', storySpan: '约 1.1 天',",
  "  playerName: '玩家二', playerDescription: '描述二',",
  "});",
  "",
  "const 看 = ['D1','D2','D-T','D-N','D9','D10','D11','D12','D13'];\n",
  "console.log('=== 换数据后, 包装(公共前缀)稳不稳 ===');",
  "for (const 代 of 看) {",
  "  const a = String(A.零件内容?.[代] ?? '');",
  "  const b = String(B.零件内容?.[代] ?? '');",
  "  if (!a && !b) { console.log(代.padEnd(5), '(两组都空)'); continue; }",
  "  const n = 公共前缀(a, b);",
  "  console.log('');",
  "  console.log(代 + '  A.len=' + a.length + ' B.len=' + b.length + ' 公共前缀=' + n);",
  "  console.log('   包装候选:', JSON.stringify(a.slice(0, n)));",
  "  console.log('   包装之后(数据开头):', JSON.stringify(a.slice(n, n + 60)));",
  "  console.log('   B 在同一位置:', JSON.stringify(b.slice(n, n + 60)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== D1 的「共 N 条」是不是动态的 ===');",
  "const d1a = String(A.零件内容?.D1 ?? '');",
  "const d1b = String(B.零件内容?.D1 ?? '');",
  "console.log('replyCount=1:', JSON.stringify(d1a.slice(0, 50)));",
  "console.log('replyCount=3:', JSON.stringify(d1b.slice(0, 50)));",
  "console.log('→ 若两行不同, 说明包装里有动态值');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
