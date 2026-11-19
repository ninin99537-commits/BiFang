// 一次性探针: 生理三段(R2/R3/R5 里)各自落在骨架的什么位置?
//
// 判据: 若三段在同一骨架里**相邻**, 一个占位符可以覆盖它们;
//       若分散在不同位置, 一个占位符只能插一处 → 另外两处要么丢、要么变静态字。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-physloc.ts');
const 产物 = path.join(此处, '_probe-physloc.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: 'x', 恋爱对象: '是' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, ...额外,",
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
  "const 关 = 跑({});",
  "const 开 = 跑({ physioEnabled: true });",
  "",
  "// 三段生理内容的特征串（取开头）",
  "const 段们 = [",
  "  ['R2-生理权威段', '**现有状态卡中的生理字段是彼方代码判定的权威数据**'],",
  "  ['R3-生理增量条目', '生理周期: 彼方代码会按剧情时间自动推进'],",
  "  ['R5-生理自检段', '**生理自检: 对每个返回生理周期的 NPC'],",
  "];",
  "",
  "console.log('=== 生理三段在 R2/R3/R5 骨架里的位置 ===');",
  "for (const [名, 特征] of 段们) {",
  "  // 在开着的版本里找到这段的完整范围（用关着的版本对比出差异区间）",
  "  const 找 = (r) => {",
  "    for (const [代, c] of Object.entries(r.零件内容 ?? {})) {",
  "      const s = String(c);",
  "      const i = s.indexOf(特征);",
  "      if (i >= 0) return { 代, 位: i, 长: s.length };",
  "    }",
  "    return null;",
  "  };",
  "  const 在开 = 找(开);",
  "  const 在关 = 找(关);",
  "  if (!在开) { console.log(名, '未找到'); continue; }",
  "  // 关着的版本里同代号零件的长度",
  "  const 关长 = 在关 ? 在关.长 : 0;",
  "  console.log('');",
  "  console.log(名);",
  "  console.log('  落在零件:', 在开.代, '| 该零件开时 len=' + 在开.长 + ' 关时 len=' + 关长);",
  "  console.log('  特征串在该零件的第', 在开.位, '字（' + Math.round(在开.位 / 在开.长 * 100) + '% 处）');",
  "  console.log('  → ' + (在开.位 === 0 ? '**在开头**' : 在开.位 >= 在开.长 - 400 ? '**在结尾**' : '**在中间**'));",
  "}",
  "",
  "console.log('');",
  "console.log('=== 若把三段合成一个占位符(740字), 插在一个位置 ===');",
  "console.log('三段分别在: R2 / R3 / R5 —— 三个不同零件（即三条不同位置）');",
  "console.log('一个占位符只能插一处 → 另两处要么丢、要么变静态字（关掉时还在）');",
  "console.log('');",
  "console.log('=== 验证: 三段的内容长度 ===');",
  "for (const [代, 关c, 开c] of ['R2','R3','R5'].map(d => [d, String(关.零件内容?.[d] ?? ''), String(开.零件内容?.[d] ?? '')])) {",
  "  console.log(代, '关 len=' + 关c.length, '开 len=' + 开c.length, '差', 开c.length - 关c.length);",
  "}",
  "",
  "console.log('');",
  "console.log('=== D14 尾部的生理/恋爱段（这两个是连续追加, 可以各做一个占位符）===');",
  "const d14关 = String(关.零件内容?.D14 ?? '');",
  "const d14生理 = String(跑({ physioEnabled: true }).零件内容?.D14 ?? '');",
  "const d14恋爱 = String(跑({ 恋爱对象名单: ['甲'] }).零件内容?.D14 ?? '');",
  "console.log('D14 基线 len=' + d14关.length);",
  "console.log('  生理段 = 基线之后追加 ' + (d14生理.length - d14关.length) + ' 字');",
  "console.log('  恋爱段 = 基线之后追加 ' + (d14恋爱.length - d14关.length) + ' 字');",
  "console.log('  两者都在**结尾追加** → 各做一个占位符是可行的（顺序固定: 生理在前、恋爱在后）');",
  "const 两者 = String(跑({ physioEnabled: true, 恋爱对象名单: ['甲'] }).零件内容?.D14 ?? '');",
  "const 生理段 = d14生理.slice(d14关.length);",
  "const 恋爱段 = d14恋爱.slice(d14关.length);",
  "console.log('  两者同开时 === 基线 + 生理段 + 恋爱段 ?', 两者 === d14关 + 生理段 + 恋爱段);",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
