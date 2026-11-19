// 一次性探针（只读）: 验证「方案 D」—— 不加新占位符也能逐字节。
//
// ── 为什么前面三个方案都不够 ──
//   B  : 标签做成占位符 → 逐字节 ✓，但要新增 3 个占位符（清单从 15 变 18，用户可见）
//   C  : 标签写成模板文字、数据保留 \n\n → 少一个 \n（规则 ④ 只补一个）
//   C2 : 加了空行补第二个 \n → **数据为空时**空行残留，多一个 \n
//
// ── 方案 D 的思路 ──
//   不补空行，改成让**数据本体以 \n 开头**：
//     有数据：规则 ④ 给标签行补 `\n`，数据自带 `\n` → `\n\n` ✓
//     没数据：标签行整行消失（规则 ②b），**一个 `\n` 都不产生**；
//             下一个整行占位符按规则 ① 不补 `\n`，而它的内容自带 `\n\n` → `\n\n` ✓
//
//   两种场景都对，且**不需要新占位符**。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-wayD.ts');
const 产物 = path.join(此处, '_probe-wayD.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板, 渲染段 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '正文一。\\n\\n正文二。', replyCount: 2, context: '玩家输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '甲: 走了',",
  "  playerName: '主角', playerDescription: '主角描述', 展开宏: (t) => t,",
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
  "/** 切：标签（到 `):\\n` 含） / 数据 */",
  "function 切(s) {",
  "  const i = s.indexOf('):\\n');",
  "  if (i < 0) return { 标签: '', 数据: s };",
  "  return { 标签: s.slice(0, i + 3), 数据: s.slice(i + 3) };",
  "}",
  "",
  "const 名表 = { '最近正文回复': 'D1', '世界书': 'D2', '时间': 'D-T', '名单': 'D-N',",
  "  '主角信息': 'D9', '现有状态卡': 'D10', '台账账况': 'D11', '近期轨迹': 'D12' };",
  "",
  "function 验(场景名, 额外) {",
  "  const 产物 = 跑(额外);",
  "  const 原user = String(产物.messages.find(m => m.role === 'user')?.content ?? '');",
  "  const 零件 = 产物.零件内容;",
  "",
  "  // 原段：截到 D12 结尾（含）",
  "  const d12 = String(零件['D12'] ?? '');",
  "  const 位 = d12 ? 原user.indexOf(d12) + d12.length : 原user.split('\\n\\n**更新 NPC 状态时')[0].length;",
  "  const 原段 = 原user.slice(0, 位);",
  "",
  "  const 切2 = 切(String(零件['D2'] ?? ''));",
  "  const 切9 = 切(String(零件['D9'] ?? ''));",
  "  const 切10 = 切(String(零件['D10'] ?? ''));",
  "",
  "  // 方案 D：数据以 \\n 开头（有数据时），标签去前导 \\n、去尾 \\n",
  "  const 做数据 = (x) => (x ? '\\n' + x : '');",
  "  const 做标签 = (p) => p.replace(/^\\n+/, '').replace(/\\n$/, '');",
  "  const 新零件 = {",
  "    ...零件,",
  "    'D2': 做数据(切2.数据), 'D9': 做数据(切9.数据), 'D10': 做数据(切10.数据),",
  "  };",
  "  const 新模板 = [",
  "    '{{彼方:最近正文回复}}',",
  "    做标签(切2.标签) + '{{彼方:世界书}}',",
  "    '{{彼方:时间}}',",
  "    '{{彼方:名单}}',",
  "    做标签(切9.标签) + '{{彼方:主角信息}}',",
  "    做标签(切10.标签) + '{{彼方:现有状态卡}}',",
  "    '{{彼方:台账账况}}',",
  "    '{{彼方:近期轨迹}}',",
  "  ].join('\\n');",
  "  const 新 = 渲染段(新模板, (名) => 新零件[名表[名]] ?? '');",
  "",
  "  console.log('');",
  "  console.log('--- ' + 场景名 + ' ---');",
  "  console.log('  原 ' + 原段.length + ' 字，新 ' + 新.length + ' 字，逐字节? ' + (原段 === 新));",
  "  if (原段 !== 新) {",
  "    let i = 0; while (i < 原段.length && i < 新.length && 原段[i] === 新[i]) i++;",
  "    console.log('    差异位置 ' + i);",
  "    console.log('      原: ' + JSON.stringify(原段.slice(Math.max(0,i-30), i+30)));",
  "    console.log('      新: ' + JSON.stringify(新.slice(Math.max(0,i-30), i+30)));",
  "  }",
  "}",
  "",
  "验('① 有值', {});",
  "验('② 世界书为空', { worldbook: '' });",
  "验('③ 主角信息为空', { playerName: '', playerDescription: '' });",
  "验('④ 世界书 + 主角都空', { worldbook: '', playerName: '', playerDescription: '' });",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
