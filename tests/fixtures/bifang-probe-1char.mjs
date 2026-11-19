// 一次性探针: 用户段少 1 字 —— 精确找出是哪个换行丢了
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-1char.ts');
const 产物 = path.join(此处, '_probe-1char.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
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
  "const 现状 = 跑({});",
  "const 用模板 = 跑({ 模板: 默认模板 });",
  "",
  "const 原用户 = String(现状.messages[现状.messages.length - 1].content);",
  "const 模用户 = String(用模板.messages[用模板.messages.length - 1].content);",
  "console.log('现状用户段 len =', 原用户.length);",
  "console.log('模板用户段 len =', 模用户.length);",
  "",
  "// 找首个差异",
  "for (let i = 0; i < Math.max(原用户.length, 模用户.length); i++) {",
  "  if (原用户[i] !== 模用户[i]) {",
  "    console.log('首个差异 @', i);",
  "    console.log('  现状:', JSON.stringify(原用户.slice(Math.max(0, i - 60), i + 60)));",
  "    console.log('  模板:', JSON.stringify(模用户.slice(Math.max(0, i - 60), i + 60)));",
  "    break;",
  "  }",
  "}",
  "",
  "// 逐零件看边界",
  "console.log('');",
  "console.log('=== 每个零件的首尾字符（现状）===');",
  "const 内容 = 现状.零件内容 ?? {};",
  "for (const 代 of ['D1','D2','D-T','D-N','D9','D10','D11','D12','D14']) {",
  "  const c = String(内容[代] ?? '');",
  "  console.log(代.padEnd(5), 'len=' + String(c.length).padStart(4), c ? ('首=' + JSON.stringify(c.slice(0,4)) + ' 尾=' + JSON.stringify(c.slice(-4))) : '(空)');",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
