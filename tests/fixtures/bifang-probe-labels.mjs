// 一次性探针（只读）: 量清每个数据占位符的**精确内容**（开头字符 + 字数）。
//
// 为什么必须量（不量就是推断）:
//   我要把标签从占位符搬到模板，而 I3 要求**逐字节不变**。
//   能不能做到，取决于每个占位符的**前导换行**长什么样 ——
//   这是 `渲染段` 四条规则的前提（"除 R1/D1 外所有零件都以 \n\n 开头"）。
//   猜错一个字符，I3 就红，而红在哪要一行行找。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-labels.ts');
const 产物 = path.join(此处, '_probe-labels.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
  "",
  "const 造 = () => ({",
  "  reply: '这是第一段正文。\\n\\n这是第二段正文，结尾在这里。', replyCount: 2,",
  "  context: '玩家的输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文内容', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天',",
  "  recentTrace: '甲: 从广场走到家',",
  "  playerName: '主角', playerDescription: '主角的描述文本', 展开宏: (t) => t,",
  "  模板: 默认模板,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "console.log('=== ① 默认模板渲染出的 messages ===');",
  "r.messages.forEach((m, i) => {",
  "  console.log('  第' + (i+1) + '条 ' + m.role + ' 共 ' + String(m.content).length + ' 字');",
  "});",
  "",
  "console.log('');",
  "console.log('=== ② 每个数据零件的精确开头（JSON 转义，看得见 \\n）===');",
  "const 件们 = r.零件内容 ?? {};",
  "for (const [代号, 内容] of Object.entries(件们)) {",
  "  const s = String(内容 ?? '');",
  "  if (!代号.startsWith('D')) continue;",
  "  const 名 = 零件表.find(x => x.代号 === 代号)?.名 ?? '?';",
  "  console.log('');",
  "  console.log('  ' + 代号.padEnd(6) + 名.padEnd(10) + ' 共 ' + String(s.length).padStart(5) + ' 字');",
  "  console.log('    开头: ' + JSON.stringify(s.slice(0, 90)));",
  "  console.log('    结尾: ' + JSON.stringify(s.slice(-50)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== ③ 规则零件的开头（对照）===');",
  "for (const [代号, 内容] of Object.entries(件们)) {",
  "  if (代号.startsWith('D')) continue;",
  "  const s = String(内容 ?? '');",
  "  console.log('  ' + 代号.padEnd(6) + ' 共 ' + String(s.length).padStart(5) + ' 字  开头: ' + JSON.stringify(s.slice(0, 40)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== ④ 默认模板的 user 段全文（逐行带行号，看得见空行）===');",
  "const user = r.messages.find(m => m.role === 'user');",
  "String(user?.content ?? '').split('\\n').forEach((l, i) => {",
  "  console.log('  ' + String(i+1).padStart(3) + ' | ' + JSON.stringify(l.slice(0, 100)));",
  "});",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
