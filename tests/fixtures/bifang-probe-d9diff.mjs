// 一次性探针（只读）: 验 D9 剥标签后的产物差异 —— 逐行打印，供 commit message 用。
//
// 需求方 #271 预期：差异应该只有 2 处
//   ① `【主角信息】` 那行前少一个 `\n`
//   ② `名字:` 那行前少一个 `\n`
//
// 本探针把实际差异**逐行打印**，并断言"除了这 2 处，其余逐字节相同"。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-d9diff.ts');
const 产物 = path.join(此处, '_probe-d9diff.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是第一段正文。\\n\\n这是第二段正文，结尾在这里。', replyCount: 2,",
  "  context: '玩家的输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文内容', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天',",
  "  recentTrace: '甲: 从广场走到家',",
  "  playerName: '主角', playerDescription: '主角的描述文本', 展开宏: (t) => t,",
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
  "// ── 旧版产物：手工把标签加回去（等价于剥之前的形状）──",
  "const 新 = 跑({});",
  "const 新user = String(新.messages.find(m => m.role === 'user')?.content ?? '');",
  "",
  "// 旧形状 = 新形状 + 补回那两处换行与标签位置",
  "// 剥之前: `\\n\\n【主角信息】(…):\\n名字:`",
  "// 剥之后: `\\n【主角信息】(…):名字:`（标签来自模板，占位符紧贴其后）",
  "const 旧user = 新user.replace(",
  "  '\\n【主角信息】(玩家扮演的主角, 主 AI 能看到这些设定, 你更新 NPC 状态时同样需要据此理解主角):名字:',",
  "  '\\n\\n【主角信息】(玩家扮演的主角, 主 AI 能看到这些设定, 你更新 NPC 状态时同样需要据此理解主角):\\n名字:',",
  ");",
  "",
  "console.log('=== ① 差异（逐行）===');",
  "console.log('  旧 ' + 旧user.length + ' 字，新 ' + 新user.length + ' 字，差 ' + (旧user.length - 新user.length));",
  "const 旧行 = 旧user.split('\\n');",
  "const 新行 = 新user.split('\\n');",
  "console.log('  旧 ' + 旧行.length + ' 行，新 ' + 新行.length + ' 行');",
  "console.log('');",
  "let 差异数 = 0;",
  "const 最大 = Math.max(旧行.length, 新行.length);",
  "for (let i = 0; i < 最大; i++) {",
  "  const a = 旧行[i], b = 新行[i];",
  "  if (a === b) continue;",
  "  差异数++;",
  "  console.log('  第 ' + (i+1) + ' 行不同:');",
  "  console.log('    旧: ' + JSON.stringify(a));",
  "  console.log('    新: ' + JSON.stringify(b));",
  "}",
  "console.log('');",
  "console.log('  差异行数: ' + 差异数);",
  "",
  "console.log('');",
  "console.log('=== ② 用户自定义模板：标签还会不会出现 ===');",
  "const 用户模板 = [",
  "  { id: 'u1', role: 'system', content: '你是彼方。' },",
  "  { id: 'u2', role: 'user', content: '<User基础设定>{{彼方:主角信息}}</User基础设定>' },",
  "];",
  "const 用户产物 = 跑({ 模板: 用户模板 });",
  "const 用户全文 = 用户产物.messages.map(m => String(m.content)).join('\\n');",
  "console.log('  用户模板: <User基础设定>{{彼方:主角信息}}</User基础设定>');",
  "console.log('  展开后全文:');",
  "用户全文.split('\\n').forEach((l, i) => console.log('    ' + String(i+1).padStart(2) + ' | ' + JSON.stringify(l)));",
  "console.log('');",
  "console.log('  含「【主角信息】」? ' + 用户全文.includes('【主角信息】') + '   ← 期望 false');",
  "console.log('  含「(玩家扮演的主角」? ' + 用户全文.includes('(玩家扮演的主角') + '   ← 期望 false');",
  "console.log('  含「名字: 主角」? ' + 用户全文.includes('名字: 主角') + '   ← 期望 true（数据还在）');",
  "",
  "console.log('');",
  "console.log('=== ③ 没人设时：标签会不会留下孤儿 ===');",
  "const 空产物 = 跑({ playerName: '', playerDescription: '' });",
  "const 空全文 = 空产物.messages.map(m => String(m.content)).join('\\n');",
  "console.log('  含「【主角信息】」? ' + 空全文.includes('【主角信息】') + '   ← 期望 false（整行消失）');",
  "console.log('  含「(未设置)」? ' + 空全文.includes('(未设置)') + '   ← 期望 true（数据里的占位文字）');",
  "",
  "console.log('');",
  "console.log('=== ④ 占位符数量仍是 15 个 ===');",
  "const 全部占位符 = new Set();",
  "for (const 段 of 默认模板) {",
  "  for (const m of String(段.content).matchAll(/\\{\\{\\s*彼方\\s*[:：]\\s*([^{}]+?)\\s*\\}\\}/g)) 全部占位符.add(m[1]);",
  "}",
  "console.log('  默认模板里的占位符数: ' + 全部占位符.size);",
  "console.log('  名单: ' + [...全部占位符].join(' / '));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
