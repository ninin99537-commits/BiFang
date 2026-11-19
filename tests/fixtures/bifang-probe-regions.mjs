// 一次性探针: 每个数据零件的「包装」能不能搬进静态模板?
//
// 判据: 换一组数据, 看零件内容的**差异区间有几处**。
//   1 处且在最前  → 包装是干净前缀, 可以搬进模板
//   1 处且在最后  → 包装是干净后缀, 可以搬进模板
//   多处 / 在中间  → 动态值嵌在句子里, **搬不走**（搬了就把动态值固化成静态字）
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-regions.ts');
const 产物 = path.join(import.meta.dirname, '_probe-regions.mjs');

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
  "/** 找出两段文本的所有差异区间（逐字符比对, 合并相邻差异） */",
  "function 差异区间们(a, b) {",
  "  // 用最长公共子序列的简化版: 逐字扫, 不同就记为差异, 连续的合并",
  "  const 区间 = [];",
  "  let i = 0, j = 0;",
  "  let 起 = -1;",
  "  // 先算后缀公共长度, 避免尾部数据被当成差异区间的噪声",
  "  let 后 = 0;",
  "  while (后 < a.length && 后 < b.length && a[a.length-1-后] === b[b.length-1-后]) 后++;",
  "  const a正 = a.slice(0, a.length - 后), b正 = b.slice(0, b.length - 后);",
  "  while (i < a正.length || j < b正.length) {",
  "    if (i < a正.length && j < b正.length && a正[i] === b正[j]) {",
  "      if (起 >= 0) { 区间.push({ 起, 止: i }); 起 = -1; }",
  "      i++; j++;",
  "    } else {",
  "      if (起 < 0) 起 = i;",
  "      // 尝试跳过 a 或 b 的一侧",
  "      if (i < a正.length && (j >= b正.length || a正.indexOf(b正.slice(j, j + 12), i) < 0)) i++;",
  "      else if (j < b正.length) j++;",
  "      else i++;",
  "    }",
  "  }",
  "  if (起 >= 0) 区间.push({ 起, 止: a正.length });",
  "  if (后 > 0) 区间.push({ 起: a正.length, 止: a.length, 是后缀: true });",
  "  return 区间;",
  "}",
  "",
  "const A = 跑({});",
  "const B = 跑({",
  "  reply: '完全不同的剧情。', replyCount: 3, worldbook: 'WB乙', recentTrace: '轨迹乙',",
  "  tracked: ['乙', '丙'], inSceneHint: ['乙'],",
  "  currentCards: { 乙: { 当前在做: '看店' } },",
  "  currentStoryTime: '2027-05-05 08:00', storyTimeHint: '2027-05-06 09:00', storySpan: '约 1.1 天',",
  "  playerName: '玩家二', playerDescription: '描述二',",
  "});",
  "",
  "const 看 = ['D1','D2','D-T','D-N','D9','D10','D12'];",
  "console.log('零件   A长  B长  差异区间数  可搬?');",
  "for (const 代 of 看) {",
  "  const a = String(A.零件内容?.[代] ?? '');",
  "  const b = String(B.零件内容?.[代] ?? '');",
  "  if (!a && !b) { console.log(代.padEnd(5), '(两组都空)'); continue; }",
  "  const 区间 = 差异区间们(a, b);",
  "  const 可搬 = 区间.length === 1 && (区间[0].起 === 0 || 区间[0].是后缀);",
  "  console.log(代.padEnd(5), String(a.length).padStart(4), String(b.length).padStart(4), String(区间.length).padStart(10), '  ' + (可搬 ? '可以' : '**不行**'));",
  "  for (const q of 区间.slice(0, 6)) {",
  "    console.log('      区间 @' + q.起 + '..' + q.止 + (q.是后缀 ? '(后缀)' : '') + '  A:' + JSON.stringify(a.slice(q.起, Math.min(q.止, q.起 + 45))) + '  B:' + JSON.stringify(b.slice(q.起, Math.min(q.止, q.起 + 45))));",
  "  }",
  "}",
  "",
  "console.log('');",
  "console.log('=== 逐个看关键零件的结构（静态字 / 动态值 交替?） ===');",
  "for (const 代 of ['D-N', 'D9', 'D12', 'D10', 'D-T']) {",
  "  const a = String(A.零件内容?.[代] ?? '');",
  "  console.log('');",
  "  console.log('--- ' + 代 + ' 全文 ---');",
  "  console.log(JSON.stringify(a));",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
