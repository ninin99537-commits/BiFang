// 一次性探针: 16 个占位符里, 每一个**真的能展开出多少字**?
//
// 为什么必须量: 占位符展开的内容来自 `零件内容[代号]`。
// 而 R6/R7 的 `零件内容` 只是**特征串**（判"在不在"用的），不是真实内容 ——
// 真实内容散在 R2/R3/R5/D14 里。若把 R6 当占位符, 它只会展开出 12 个字。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-expand.ts');
const 产物 = path.join(import.meta.dirname, '_probe-expand.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '玩家走进广场', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: ['甲'],",
  "  currentCards: { 甲: { 当前在做: '做饭', 恋爱对象: '是' } },",
  "  autoTrackEnabled: true, physioEnabled: true, 恋爱对象名单: ['甲'],",
  "  预填充: false, worldbook: 'WB', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "const 内容 = r.零件内容 ?? {};",
  "const 全消息 = r.messages.map(m => String(m.content)).join('\\u0000');",
  "",
  "console.log('=== 16 个占位符（按 #215 清单）各自展开多少字 ===');",
  "const 清单 = ['R1','R2','R3','R4','R5','R6','R7','D1','D2','D-T','D-N','D9','D10','D11','D12','D13','D14'];",
  "let 合计 = 0;",
  "for (const 代 of 清单) {",
  "  const 件 = 零件表.find(x => x.代号 === 代);",
  "  const c = String(内容[代] ?? '');",
  "  合计 += c.length;",
  "  const 旗 = c.length === 0 ? '（空）' : (代 === 'R6' || 代 === 'R7' ? '  ⚠ 只是特征串，不是真实内容' : '');",
  "  console.log(代.padEnd(5), (件?.名 ?? '?').padEnd(8), '展开 ' + String(c.length).padStart(5) + ' 字' + 旗);",
  "}",
  "console.log('合计', 合计, '字（全消息', 全消息.length, '字）');",
  "",
  "console.log('');",
  "console.log('=== R6 的真实体量（差值法：开 vs 关）===');",
  "const 原I2 = console.info, 原T2 = console.table, 原W2 = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let 关;",
  "try { 关 = buildUpdateMessages(造({ physioEnabled: false })); }",
  "finally { console.info = 原I2; console.table = 原T2; console.warn = 原W2; }",
  "const 开长 = r.messages.reduce((s, m) => s + String(m.content).length, 0);",
  "const 关长 = 关.messages.reduce((s, m) => s + String(m.content).length, 0);",
  "console.log('生理开 全文', 开长, '| 生理关 全文', 关长, '| R6 真实体量', 开长 - 关长, '字');",
  "console.log('而 R6 的占位符只会展开', String(内容.R6 ?? '').length, '字 —— 差', (开长 - 关长) - String(内容.R6 ?? '').length, '字');",
  "",
  "console.log('');",
  "console.log('=== R7 同理 ===');",
  "const 原I3 = console.info, 原T3 = console.table, 原W3 = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let 无恋爱;",
  "try { 无恋爱 = buildUpdateMessages(造({ 恋爱对象名单: [] })); }",
  "finally { console.info = 原I3; console.table = 原T3; console.warn = 原W3; }",
  "const 无恋爱长 = 无恋爱.messages.reduce((s, m) => s + String(m.content).length, 0);",
  "console.log('有恋爱对象 全文', 开长, '| 无恋爱对象 全文', 无恋爱长, '| R7 真实体量', 开长 - 无恋爱长, '字');",
  "console.log('而 R7 的占位符只会展开', String(内容.R7 ?? '').length, '字');",
  "",
  "console.log('');",
  "console.log('=== 若把 R6/R7 当占位符, 产物会变成什么样 ===');",
  "console.log('规则段（R1-R5 + R6）填回长度:',",
  "  ['R1','R2','R3','R4','R5','R6'].map(代 => String(内容[代] ?? '').length).reduce((a,b) => a+b, 0));",
  "console.log('实际第1条消息长度:', String(r.messages[0].content).length);",
  "console.log('→ 若两者不等, 说明 R6 的真实内容不在 R6 的占位符里, 而是在 R2/R3/R5 内部');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
