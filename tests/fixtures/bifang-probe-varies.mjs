// 一次性探针: #210 前提核查 —— 那 6 个"要变成模板文字"的零件, 真的每轮都一样吗?
//
// 需求方 #210 的分界线: 「每轮都一样的字 → 默认提示词; 随这一轮数据变 → 占位符」。
// 并点名 R1 身份句 / R2 核心原则 / R3 NPC判定 / R4 字段规格 / R5 输出要求 / D14 任务指令
// 改成模板固定文字。
//
// 但要先量: 这 6 个里有没有**随设置变**的（第三条: 随设置或名单变 → 占位符）。
// 已知疑点:
//   ① `取身份句(!!input.登记归档)` —— R1 可能随「登记归档」开关变
//   ② D14 尾部拼了 `${noNewNpcInstruction}${physioInstruction}${恋爱Instruction}`
//   ③ 全进工具时规则整块搬进工具说明
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-varies.ts');
const 产物 = path.join(import.meta.dirname, '_probe-varies.mjs');

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
  "const 基线 = 跑({});",
  "const 看 = ['R1','R2','R3','R4','R5','D13','D1','D2','D-T','D-N','D9','D10','D11','D12','D14'];",
  "",
  "/** 某个开关切过去之后, 哪些零件内容变了 */",
  "function 比(名, 额外) {",
  "  const r = 跑(额外);",
  "  const 变 = [];",
  "  for (const 代 of 看) {",
  "    const a = String(基线.零件内容?.[代] ?? '');",
  "    const b = String(r.零件内容?.[代] ?? '');",
  "    if (a !== b) 变.push(代 + '(' + a.length + '→' + b.length + ')');",
  "  }",
  "  console.log(名.padEnd(16), 变.length ? 变.join(' ') : '(无变化)');",
  "}",
  "",
  "console.log('=== 每个设置开关会让哪些零件内容变化 ===');",
  "比('登记归档=开', { 登记归档: true });",
  "比('生理=开', { physioEnabled: true });",
  "比('恋爱名单=[甲]', { 恋爱对象名单: ['甲'] });",
  "比('预填充=开', { 预填充: true });",
  "比('全进工具', { 规则进工具: true });",
  "比('全进工具+生理', { 规则进工具: true, physioEnabled: true });",
  "",
  "console.log('');",
  "console.log('=== R1 两种身份句（登记归档 开/关） ===');",
  "const r1关 = String(基线.零件内容?.R1 ?? '');",
  "const r1开 = String(跑({ 登记归档: true }).零件内容?.R1 ?? '');",
  "console.log('关:', JSON.stringify(r1关));",
  "console.log('开:', JSON.stringify(r1开));",
  "console.log('相同?', r1关 === r1开);",
  "",
  "console.log('');",
  "console.log('=== 全进工具时, 规则零件还在 messages 里吗 ===');",
  "const 全工具 = 跑({ 规则进工具: true });",
  "console.log('messages 条数:', 全工具.messages.length, '| 各条 role:', 全工具.messages.map(m => m.role).join(','));",
  "console.log('各条长度:', 全工具.messages.map(m => String(m.content).length).join(', '));",
  "console.log('工具说明长度:', String(全工具.工具说明 ?? '').length);",
  "console.log('R2 内容在工具说明里?', String(全工具.工具说明 ?? '').includes(String(全工具.零件内容?.R2 ?? 'x').slice(0, 30)));",
  "console.log('R2 内容在 messages 里?', 全工具.messages.some(m => String(m.content).includes(String(全工具.零件内容?.R2 ?? 'x').slice(0, 30))));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
