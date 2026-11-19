// 一次性探针（只读）: 验 D2/D10 搬进模板后的四种场景，并打印展开全文。
//
// 要验的四件（都是这次改动可能踩的坑）:
//   ① 有值：世界书 / 状态卡都非空 → 说明与数据都在
//   ② 世界书为空：那一整行（含 183 字说明）必须**整行消失**，不留孤儿
//   ③ 状态卡为空（第一轮）：那一整行（含 348 字说明）必须**整行消失**
//   ④ 用户自定义模板：`{{彼方:世界书}}` 只出数据，不含我们的说明
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-final.ts');
const 产物 = path.join(此处, '_probe-final.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '她把信递过来，指尖在封口上按了按。', replyCount: 1, context: '', timeJump: '无',",
  "  tracked: ['泰丝'], inSceneHint: ['泰丝'],",
  "  currentCards: { 泰丝: { 当前在做: '在柜台后整理货单', 当前状态: '平静', 位置: '杂货铺', 身份锚点: '杂货铺老板' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '【世界观】这是一个边境小镇，常年多雾。', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '泰丝: 从后院走到柜台',",
  "  playerName: '林', playerDescription: '一位旅行者，沉默寡言。', 展开宏: (t) => t,",
  "  模板: 默认模板, ...额外,",
  "});",
  "const 跑 = (额外 = {}) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "console.log('=== ① 有值：说明与数据都在 ===');",
  "const 有 = 跑();",
  "const 有全文 = 有.messages.map(m => m.content).join('\\n');",
  "console.log('  含「世界书/设定(」? ' + 有全文.includes('世界书/设定('));",
  "console.log('  含「世界书数据」? ' + 有全文.includes('【世界观】'));",
  "console.log('  含「这些NPC现有的幕后状态卡(」? ' + 有全文.includes('这些NPC现有的幕后状态卡('));",
  "console.log('  含 JSON? ' + 有全文.includes('\"泰丝\"'));",
  "",
  "console.log('');",
  "console.log('=== ② 世界书为空：整行必须消失 ===');",
  "const 空书 = 跑({ worldbook: '' });",
  "const 空书全文 = 空书.messages.map(m => m.content).join('\\n');",
  "console.log('  含「世界书/设定(」? ' + 空书全文.includes('世界书/设定(') + '   ← 期望 false');",
  "console.log('  含「与主AI」? ' + 空书全文.includes('与主AI') + '   ← 期望 false');",
  "",
  "console.log('');",
  "console.log('=== ③ 状态卡为空（第一轮）：整行必须消失 ===');",
  "const 空卡 = 跑({ currentCards: {} });",
  "const 空卡全文 = 空卡.messages.map(m => m.content).join('\\n');",
  "console.log('  含「这些NPC现有的幕后状态卡(」? ' + 空卡全文.includes('这些NPC现有的幕后状态卡(') + '   ← 期望 false');",
  "console.log('  含「不得泛化或丢失」? ' + 空卡全文.includes('不得泛化或丢失') + '   ← 期望 false');",
  "",
  "console.log('');",
  "console.log('=== ④ 用户自定义模板：占位符只出数据 ===');",
  "const 用户模板 = [",
  "  { id: 'u1', role: 'system', content: '你是彼方。{{彼方:核心原则}}' },",
  "  { id: 'u2', role: 'user', content: '<世界设定>{{彼方:世界书}}</世界设定>' },",
  "  { id: 'u3', role: 'user', content: '<我的状态卡>{{彼方:现有状态卡}}</我的状态卡>' },",
  "  { id: 'u4', role: 'user', content: '<User基础设定>{{彼方:主角信息}}</User基础设定>' },",
  "];",
  "const 用户 = 跑({ 模板: 用户模板 });",
  "const 用户全文 = 用户.messages.map(m => m.content).join('\\n');",
  "console.log('  含「世界书/设定(」? ' + 用户全文.includes('世界书/设定(') + '   ← 期望 false');",
  "console.log('  含「这些NPC现有的幕后状态卡(」? ' + 用户全文.includes('这些NPC现有的幕后状态卡(') + '   ← 期望 false');",
  "console.log('  含「【主角信息】」? ' + 用户全文.includes('【主角信息】') + '   ← 期望 false');",
  "console.log('  含世界书数据? ' + 用户全文.includes('【世界观】') + '   ← 期望 true');",
  "console.log('  含 JSON? ' + 用户全文.includes('\"泰丝\"') + '   ← 期望 true');",
  "",
  "console.log('');",
  "console.log('=== ⑤ 默认模板总字数 ===');",
  "console.log('  默认模板（段内容合计）: ' + 默认模板.map(s => s.content.length).reduce((a,b) => a+b, 0) + ' 字');",
  "console.log('  第 1 段: ' + 默认模板[0].content.length + ' 字');",
  "console.log('  第 2 段: ' + 默认模板[1].content.length + ' 字');",
  "console.log('  （搬之前第 2 段是 623 字左右）');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
