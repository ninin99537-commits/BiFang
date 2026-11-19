// 一次性探针（只读）: 补两个事实，才能把 #254 答全。
//
// ① 全进工具时，第 1 段（system）为什么"既在 messages 又在工具说明"？
//    是不是只留了第一行？
// ② 默认模板（2 段）在全进工具下是什么样？与 11 段的行为一致吗？
// ③ 工具说明里的段是怎么拼的（顺序、分隔符）？
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-tool11b.ts');
const 产物 = path.join(此处, '_probe-tool11b.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, ...额外,",
  "});",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "console.log('=== ① 11 段 + 全进工具：第 1 段在 messages 里留了什么 ===');",
  "const 段们 = [",
  "  { id: '1', role: 'system', content: '第一行是身份句\\n第二行是规则A\\n第三行是规则B' },",
  "  { id: '2', role: 'assistant', content: '收到' },",
  "  { id: '3', role: 'user', content: '资料' },",
  "];",
  "const r1 = 跑({ 模板: 段们, 规则进工具: true });",
  "r1.messages.forEach((m, i) => console.log('  messages 第' + (i+1) + '条 ' + m.role + ': ' + JSON.stringify(String(m.content))));",
  "console.log('  工具说明:', JSON.stringify(String(r1.工具说明 ?? '')));",
  "",
  "console.log('');",
  "console.log('=== ② 默认模板（2 段）+ 全进工具 ===');",
  "const r2 = 跑({ 模板: 默认模板, 规则进工具: true });",
  "console.log('  messages:', r2.messages.length, '条');",
  "r2.messages.forEach((m, i) => console.log('    第' + (i+1) + '条 ' + m.role + ' len=' + String(m.content).length + ' ' + JSON.stringify(String(m.content).slice(0, 60))));",
  "console.log('  工具说明 len =', String(r2.工具说明 ?? '').length);",
  "console.log('  工具说明开头:', JSON.stringify(String(r2.工具说明 ?? '').slice(0, 120)));",
  "",
  "console.log('');",
  "console.log('=== ③ 工具说明里段的顺序与分隔 ===');",
  "const 工具 = String(r1.工具说明 ?? '');",
  "const 位置们 = ['第一行是身份句', '收到', '资料'].map(k => [k, 工具.indexOf(k)]);",
  "位置们.forEach(([k, p]) => console.log('  ' + k.padEnd(12) + ' 位置 ' + p));",
  "console.log('  按位置排序:', 位置们.slice().sort((a,b) => a[1]-b[1]).map(x => x[0]).join(' → '));",
  "",
  "console.log('');",
  "console.log('=== ④ 全进工具时，assistant 段的存在意义 ===');",
  "console.log('  段们里的 assistant 段「收到」:');",
  "console.log('    在 messages 里?', r1.messages.some(m => m.role === 'assistant'));",
  "console.log('    在工具说明里?', 工具.includes('收到'));",
  "console.log('  → 若 messages 里一条 assistant 都没有，那对话感就完全没了');",
  "console.log('  messages 的 role 序列:', JSON.stringify(r1.messages.map(m => m.role)));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
