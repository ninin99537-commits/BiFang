// 一次性探针: 精确判断「包装搬模板」时, 哪些动态值必须**在同一个零件里出现多次**。
//
// 上一版探针的错: 拿值去全文数子串, 命中 61 次「1」、45 次「主角」——那是子串巧合,
// 不是"这个值真的要出现多次"。
//
// 正确判据: 逐零件看**该零件的模板**(把动态值挖成洞后的样子),
//   同一个洞出现 2 次以上 = 需要重复占位符（与 C4 首处生效冲突）。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-holes.ts');
const 产物 = path.join(import.meta.dirname, '_probe-holes.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文甲。', replyCount: 1, context: '玩家走进广场', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['甲'],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, worldbook: 'WB甲', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹甲',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造输入({})); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "const 零件们 = r.零件内容 ?? {};",
  "",
  "/** 逐零件把动态值挖成洞。长值优先, 避免短值吃掉长值的一部分。 */",
  "const 值表 = {",
  "  D1: { '最近正文': '剧情正文甲。', '正文条数': '1' },",
  "  D2: { '世界书': 'WB甲' },",
  "  'D-T': { '正文时间': '2026-01-02 12:30', '时间跳跃': '无', '上次剧情时间': '2026-01-01 20:00', '剧情跨度': '约 0.7 天' },",
  "  'D-N': { '追踪名单': '甲', '正文提到的人': '甲' },",
  "  D9: { '主角名': '主角', '主角描述': '描述' },",
  "  D10: { '上次剧情时间': '2026-01-01 20:00' },",
  "  D12: { '轨迹': '轨迹甲' },",
  "  D13: { '场景判断输入': '玩家走进广场' },",
  "};",
  "",
  "console.log('=== 逐零件: 挖洞后的模板 + 每个洞出现几次 ===');",
  "for (const [代, 值们] of Object.entries(值表)) {",
  "  let 文 = String(零件们[代] ?? '');",
  "  if (!文) { console.log(''); console.log(代, '(空)'); continue; }",
  "  // 长值优先",
  "  const 排 = Object.entries(值们).sort((a, b) => b[1].length - a[1].length);",
  "  const 计数 = {};",
  "  for (const [名, v] of 排) {",
  "    if (!v) continue;",
  "    let n = 0;",
  "    while (文.includes(v)) { 文 = 文.replace(v, '⟪' + 名 + '⟫'); n++; if (n > 20) break; }",
  "    计数[名] = n;",
  "  }",
  "  console.log('');",
  "  console.log('--- ' + 代 + ' 挖洞后（len ' + String(零件们[代]).length + ' → ' + 文.length + '）---');",
  "  console.log('  洞:', Object.entries(计数).filter(([,n]) => n > 0).map(([k,n]) => k + '×' + n).join(' ') || '(无)');",
  "  const 重复 = Object.entries(计数).filter(([,n]) => n > 1);",
  "  if (重复.length) console.log('  ⚠ 需重复的:', 重复.map(([k,n]) => k + '×' + n).join(' '), '← 与 C4 冲突');",
  "  console.log('  模板:', JSON.stringify(文));",
  "}",
  "",
  "console.log('');",
  "console.log('=== 反向验证: 这些洞能填回原样吗 ===');",
  "for (const [代, 值们] of Object.entries(值表)) {",
  "  const 原 = String(零件们[代] ?? '');",
  "  if (!原) continue;",
  "  let 文 = 原;",
  "  const 排 = Object.entries(值们).sort((a, b) => b[1].length - a[1].length);",
  "  for (const [名, v] of 排) {",
  "    if (!v) continue;",
  "    文 = 文.split(v).join('⟪' + 名 + '⟫');",
  "  }",
  "  let 回 = 文;",
  "  for (const [名, v] of 排) {",
  "    if (!v) continue;",
  "    回 = 回.split('⟪' + 名 + '⟫').join(v);",
  "  }",
  "  console.log(代.padEnd(5), '填回 === 原样?', 回 === 原);",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
