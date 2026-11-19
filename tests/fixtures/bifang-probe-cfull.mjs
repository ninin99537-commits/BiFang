// 一次性探针（只读）: 给需求方看"两种做法"的展开全文，供他读语气。
//
// 做法甲（我判断不成立，但也要给他看）: 指令搬进 R2/R4
// 做法乙（我建议）: 只把「纯标签」剥成裸标题，指令原地不动
//
// 目的：他要的是"展开后的全文，我读一遍语气"。所以这里只输出文本，不下结论。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-cfull.ts');
const 产物 = path.join(此处, '_probe-cfull.mjs');

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
  "function 打印(标题, r) {",
  "  console.log('');",
  "  console.log('############################################################');",
  "  console.log('# ' + 标题);",
  "  console.log('############################################################');",
  "  r.messages.forEach((m, i) => {",
  "    console.log('');",
  "    console.log('───── 第 ' + (i+1) + ' 条 · ' + m.role + ' · ' + String(m.content).length + ' 字 ─────');",
  "    console.log(String(m.content));",
  "  });",
  "}",
  "",
  "console.log('说明：下面是**当前**（D9 已剥、D2/D10 未剥）的真实产物。');",
  "console.log('请重点读两处：');",
  "console.log('  ① user 消息里「世界书/设定(…)」那一大段 —— 用户自己写标签时会叠三层');",
  "console.log('  ② user 消息里「这些NPC现有的幕后状态卡(…)」那一大段 —— 同上');",
  "打印('【当前】默认模板 · 完整展开', 跑({}));",
  "",
  "console.log('');",
  "console.log('');",
  "console.log('############################################################');",
  "console.log('# 【当前】用户自定义模板（他自己写了标签）');",
  "console.log('############################################################');",
  "const 用户模板 = [",
  "  { id: 'u1', role: 'system', content: '你是彼方。{{彼方:核心原则}}{{彼方:NPC 判定}}{{彼方:字段规格}}{{彼方:输出要求}}' },",
  "  { id: 'u2', role: 'user', content: '<世界设定>{{彼方:世界书}}</世界设定>' },",
  "  { id: 'u3', role: 'user', content: '<我的状态卡>{{彼方:现有状态卡}}</我的状态卡>' },",
  "  { id: 'u4', role: 'user', content: '<User基础设定>{{彼方:主角信息}}</User基础设定>' },",
  "  { id: 'u5', role: 'user', content: '{{彼方:最近正文回复}}' },",
  "];",
  "const 用户产物 = 跑({ 模板: 用户模板 });",
  "用户产物.messages.forEach((m, i) => {",
  "  console.log('');",
  "  console.log('───── 第 ' + (i+1) + ' 条 · ' + m.role + ' · ' + String(m.content).length + ' 字 ─────');",
  "  console.log(String(m.content));",
  "});",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
