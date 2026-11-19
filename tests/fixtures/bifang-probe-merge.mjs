// 一次性探针: 段列表里"相邻同 role 合并成消息"会不会破 I3?
//
// 需求方 #226 说："段按顺序、同 role 相邻自然合并成消息"。
// 但默认段列表是 [system, system, user] —— 若 system+system 合并，
// 现在那两条 system（12980 + 158）会变成一条 13138。
// 那是**行为变更**，而 I3 要求逐字节等于现在的产物。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-merge.ts');
const 产物 = path.join(此处, '_probe-merge.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '玩家走进广场', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t,",
  "  模板: 默认模板, ...额外,",
  "});",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造({})); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "console.log('=== 现在（三条消息）===');",
  "r.messages.forEach((m, i) => console.log('  第' + (i+1) + '条', m.role, String(m.content).length));",
  "const 总长 = r.messages.reduce((s, m) => s + String(m.content).length, 0);",
  "console.log('  合计', 总长, '字');",
  "",
  "console.log('');",
  "console.log('=== 若 system+system 合并（相邻同 role）===');",
  "const 合并 = [];",
  "for (const m of r.messages) {",
  "  const 上 = 合并[合并.length - 1];",
  "  if (上 && 上.role === m.role) {",
  "    上.content = 上.content + '\\n\\n' + m.content;",
  "    continue;",
  "  }",
  "  合并.push({ role: m.role, content: m.content });",
  "}",
  "合并.forEach((m, i) => console.log('  第' + (i+1) + '条', m.role, String(m.content).length));",
  "const 合并总长 = 合并.reduce((s, m) => s + String(m.content).length, 0);",
  "console.log('  合计', 合并总长, '字（比现在多', 合并总长 - 总长, '字，那是合并时加的 \\\\n\\\\n）');",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "console.log('合并后消息数:', 合并.length, 'vs 现在', r.messages.length);",
  "console.log('合并会破坏 I3 吗?', JSON.stringify(合并.map(m=>m.content)) !== JSON.stringify(r.messages.map(m=>m.content)));",
  "",
  "// 场景判断并进规则段的后果",
  "const 规则那条 = String(r.messages[0].content);",
  "const 场景那条 = String(r.messages[1].content);",
  "console.log('');",
  "console.log('=== 场景判断并进 13k 字规则段之后 ===');",
  "console.log('  规则段', 规则那条.length, '字 + 场景判断', 场景那条.length, '字 =', 规则那条.length + 场景那条.length + 2);",
  "console.log('  而 #211 ② 的理由是：场景判断混进 13k 字正文里，模型会把玩家的行动渗进 NPC 的认知');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
