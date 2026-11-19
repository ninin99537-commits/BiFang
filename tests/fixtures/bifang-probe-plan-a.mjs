// 一次性验证: 方案甲下, 默认模板的三段文本能否逐字节还原产物?
//
// 方案甲: R1-R5 的骨架进模板文字(生理段留在占位符里), D14 尾部拆出生理/恋爱两个占位符。
// 本探针先验证**零件级**的还原(不涉及拆 D14), 再验证 D14 拆两个之后能否还原。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-plan-a.ts');
const 产物 = path.join(此处, '_probe-plan-a.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '玩家走进广场', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: 'x', 恋爱对象: '是' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, worldbook: 'WB', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
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
  "// ── ① D14 拆两个占位符: 基线 + 生理段 + 恋爱段 ──",
  "console.log('=== ① D14 能否拆成 基线 / 生理 / 恋爱 三段 ===');",
  "const 全关 = 跑({});",
  "const 生理开 = 跑({ physioEnabled: true });",
  "const 恋爱开 = 跑({ 恋爱对象名单: ['甲'] });",
  "const 都开 = 跑({ physioEnabled: true, 恋爱对象名单: ['甲'] });",
  "",
  "const d14 = (r) => String(r.零件内容?.D14 ?? '');",
  "const 基线 = d14(全关);",
  "const 生理段 = d14(生理开).slice(基线.length);",
  "const 恋爱段 = d14(恋爱开).slice(基线.length);",
  "console.log('基线 len=' + 基线.length + ' | 生理段 len=' + 生理段.length + ' | 恋爱段 len=' + 恋爱段.length);",
  "console.log('都开时 === 基线+生理+恋爱 ?', d14(都开) === 基线 + 生理段 + 恋爱段);",
  "",
  "// 关键: 生理段/恋爱段会不会随**其他**开关变?（若会, 它们就不是纯数据）",
  "console.log('');",
  "console.log('=== ② 生理段/恋爱段的内容稳不稳（换数据后）===');",
  "const 换数据 = 跑({ physioEnabled: true, 恋爱对象名单: ['甲'], tracked: ['乙'], worldbook: 'WB2' });",
  "const 换数据生理 = d14(换数据).slice(基线.length);",
  "console.log('生理段 换数据后相同?', 换数据生理.slice(0, 生理段.length) === 生理段);",
  "console.log('  （生理段里若含名单, 换名单就变 → 它就不是纯静态规则）');",
  "console.log('生理段开头:', JSON.stringify(生理段.slice(0, 80)));",
  "console.log('恋爱段开头:', JSON.stringify(恋爱段.slice(0, 80)));",
  "",
  "// ── ③ 零件级还原: 三段模板 ──",
  "console.log('');",
  "console.log('=== ③ 三段模板能否逐字节还原（方案甲: R1-R5 整体占位）===');",
  "const 内容 = 都开.零件内容 ?? {};",
  "const 规则段 = ['R1','R2','R3','R4','R5'].map(d => String(内容[d] ?? '')).join('');",
  "const 场景段 = String(内容.D13 ?? '');",
  "const 任务段 = ['D1','D2','D-T','D-N','D9','D10','D11','D12','D14'].map(d => String(内容[d] ?? '')).join('');",
  "const 实际 = 都开.messages;",
  "console.log('规则段 === 第1条?', 规则段 === String(实际[0].content));",
  "console.log('场景段 === 第2条?', 场景段 === String(实际[1].content));",
  "console.log('任务段 === 第3条?', 任务段 === String(实际[2].content));",
  "",
  "// ── ④ 若 D14 拆两个, 任务段要能按 基线+生理+恋爱 拼回 ──",
  "console.log('');",
  "console.log('=== ④ 拆 D14 之后, 任务段仍能还原吗 ===');",
  "const 任务段不拆 = 任务段;",
  "const 任务段拆后 = ['D1','D2','D-T','D-N','D9','D10','D11','D12'].map(d => String(内容[d] ?? '')).join('')",
  "  + 基线 + 生理段 + 恋爱段;",
  "console.log('拆后 === 不拆?', 任务段拆后 === 任务段不拆);",
  "if (任务段拆后 !== 任务段不拆) {",
  "  for (let i = 0; i < Math.max(任务段拆后.length, 任务段不拆.length); i++) {",
  "    if (任务段拆后[i] !== 任务段不拆[i]) {",
  "      console.log('差异 @', i);",
  "      console.log('  拆后:', JSON.stringify(任务段拆后.slice(Math.max(0,i-40), i+40)));",
  "      console.log('  不拆:', JSON.stringify(任务段不拆.slice(Math.max(0,i-40), i+40)));",
  "      break;",
  "    }",
  "  }",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
