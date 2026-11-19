// 一次性探针（只读）: 全进工具 + N 段（11 段、role 混排）时，每段到底去哪？
//
// 需求方 #254 的担心:
//   若 assistant 段（"收到，我将…"这种确认句）也被搬进工具说明，
//   **它们在 messages 里的作用就没了**（建立"有来有回"的对话感），而用户看不出来。
//
// 判据: 造一份 11 段、role 混排的模板，开全进工具，然后**逐段追踪它的内容落在哪**。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-tool11.ts');
const 产物 = path.join(此处, '_probe-tool11.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
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
  "// 11 段，role 混排，每段一个唯一标记",
  "const 段们 = [",
  "  { id: '1',  role: 'system',    content: 'MARK-01-system-规则' },",
  "  { id: '2',  role: 'assistant', content: 'MARK-02-assistant-收到我将' },",
  "  { id: '3',  role: 'user',      content: 'MARK-03-user-以下是资料' },",
  "  { id: '4',  role: 'system',    content: 'MARK-04-system-补充规则' },",
  "  { id: '5',  role: 'assistant', content: 'MARK-05-assistant-好的' },",
  "  { id: '6',  role: 'user',      content: 'MARK-06-user-剧情在这里' },",
  "  { id: '7',  role: 'system',    content: 'MARK-08-system-输出要求' },",
  "  { id: '8',  role: 'assistant', content: 'MARK-08-assistant-明白' },",
  "  { id: '9',  role: 'user',      content: 'MARK-09-user-最后请输出JSON' },",
  "  { id: '10', role: 'system',    content: 'MARK-10-system-再补一句' },",
  "  { id: '11', role: 'user',      content: 'MARK-11-user-结尾' },",
  "];",
  "",
  "const 标记们 = 段们.map(s => s.content);",
  "",
  "function 报告(名, r) {",
  "  const 消息全文 = r.messages.map(m => String(m.content)).join('\\n');",
  "  const 工具 = String(r.工具说明 ?? '');",
  "  console.log('');",
  "  console.log('=== ' + 名 + ' ===');",
  "  console.log('  messages: ' + r.messages.length + ' 条  [' + r.messages.map(m => m.role + ':' + String(m.content).length).join(', ') + ']');",
  "  console.log('  工具说明: ' + 工具.length + ' 字');",
  "  console.log('');",
  "  console.log('  段  role        在messages?  在工具说明?  落在第几条');",
  "  段们.forEach((段, i) => {",
  "    const 在消息 = 消息全文.includes(段.content);",
  "    const 在工具 = 工具.includes(段.content);",
  "    const 第几条 = r.messages.findIndex(m => String(m.content).includes(段.content));",
  "    console.log('  ' + String(i+1).padStart(2) + '  ' + 段.role.padEnd(11) + String(在消息).padEnd(12) + String(在工具).padEnd(12) + (第几条 >= 0 ? '第' + (第几条+1) + '条' : '—'));",
  "  });",
  "  return { 消息全文, 工具 };",
  "}",
  "",
  "const 默认 = 报告('① 默认（不进工具）', 跑({ 模板: 段们 }));",
  "const 全工具 = 报告('② 全进工具', 跑({ 模板: 段们, 规则进工具: true }));",
  "",
  "console.log('');",
  "console.log('=== ③ 关键问题：assistant 段去哪了 ===');",
  "const assistant段们 = 段们.filter(s => s.role === 'assistant');",
  "assistant段们.forEach(段 => {",
  "  const 在消息 = 全工具.消息全文.includes(段.content);",
  "  const 在工具 = 全工具.工具.includes(段.content);",
  "  console.log('  ' + 段.content.padEnd(30) + ' messages? ' + String(在消息).padEnd(6) + ' 工具说明? ' + 在工具);",
  "});",
  "",
  "console.log('');",
  "console.log('=== ④ 全进工具时 messages 里到底剩什么 ===');",
  "跑({ 模板: 段们, 规则进工具: true }).messages.forEach((m, i) => {",
  "  console.log('  第' + (i+1) + '条 ' + m.role.padEnd(10) + ' len=' + String(m.content).length + '  ' + JSON.stringify(String(m.content).slice(0, 80)));",
  "});",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
