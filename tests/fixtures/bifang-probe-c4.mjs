// 一次性探针: #208「占位符只产数据」能不能做到?
//
// 冲突假设:
//   ① 包装里**嵌着动态值**, 且有些动态值在同一零件里出现多次
//      （D-T 的 storyTimeHint 出现 3 次、D9 的 playerName 2 次）
//   ② 但 C4 规定「同一零件被引用两次以上 → 首处展开, 其余忽略」
//   → 若按 #208 拆成细粒度占位符, 同一占位符写两次时**第二次会变空**
//
// 这条探针验 ②：同一个占位符写两次, 第二次展开成什么。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-c4.ts');
const 产物 = path.join(import.meta.dirname, '_probe-c4.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, worldbook: 'WB标记', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  const 警 = [];",
  "  console.info = () => {}; console.table = () => {};",
  "  console.warn = (...a) => 警.push(a.join(' '));",
  "  let r;",
  "  try { r = buildUpdateMessages(造输入(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return { r, 警 };",
  "};",
  "",
  "console.log('=== 同一个占位符在一个条目里写两次, 会怎样 ===');",
  "const { r, 警 } = 跑({",
  "  自定义段: [{ 锚点: '任务之后', role: 'user', content: '甲处: {{彼方:世界书}} | 乙处: {{彼方:世界书}}' }],",
  "});",
  "const 含 = r.messages.filter(m => String(m.content).includes('甲处'));",
  "console.log('含该条目的消息数:', 含.length);",
  "for (const m of 含) console.log('  内容:', JSON.stringify(String(m.content)));",
  "console.log('warn:', 警.filter(x => /首处|重复|已展开|忽略/.test(x)).join(' | ') || '(无相关 warn)');",
  "",
  "console.log('');",
  "console.log('=== 两个条目各引用一次同一零件, 会怎样 ===');",
  "const r2 = 跑({",
  "  自定义段: [",
  "    { 锚点: '任务之后', role: 'user', content: '条目一: {{彼方:世界书}}' },",
  "    { 锚点: '最后', role: 'user', content: '条目二: {{彼方:世界书}}' },",
  "  ],",
  "});",
  "const 含2 = r2.r.messages.filter(m => /条目[一二]/.test(String(m.content)));",
  "for (const m of 含2) console.log('  ', JSON.stringify(String(m.content).slice(0, 80)));",
  "console.log('warn:', r2.警.filter(x => /首处|重复|已展开|忽略/.test(x)).join(' | ') || '(无相关 warn)');",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "console.log('若第二次展开为空 → 拆细粒度占位符不可行（D-T 的 storyTimeHint 需要出现 3 次）');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
