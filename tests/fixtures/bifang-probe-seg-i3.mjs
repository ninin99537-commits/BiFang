// 一次性探针: 段列表形态下 I3 还成不成立?
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-seg-i3.ts');
const 产物 = path.join(此处, '_probe-seg-i3.mjs');

const 源码 = [
  "import 快照文本 from './bifang-prompt-去伪装后.json?raw';",
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 快照 = JSON.parse(快照文本);",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t,",
  "  模板: 默认模板, ...额外,",
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
  "const 组合们 = [",
  "  ['默认', {}],",
  "  ['带场景判断', { context: '主角走进广场。' }],",
  "  ['全进工具', { 规则进工具: true }],",
  "  ['全进工具带场景', { 规则进工具: true, context: '主角走进广场。' }],",
  "  ['生理开', { physioEnabled: true }],",
  "];",
  "let 全过 = true;",
  "for (const [名, 额外] of 组合们) {",
  "  const 期 = 快照[名];",
  "  if (!期) { console.log(名, '快照缺'); continue; }",
  "  const 实 = 跑(额外);",
  "  const 条数对 = 实.messages.length === 期.messages.length;",
  "  let 内容对 = true;",
  "  for (let i = 0; i < Math.min(实.messages.length, 期.messages.length); i++) {",
  "    if (实.messages[i].content !== 期.messages[i].content) {",
  "      内容对 = false;",
  "      console.log('  ' + 名 + ' 第' + (i+1) + '条不同: 实', 实.messages[i].content.length, '期', 期.messages[i].content.length);",
  "      for (let k = 0; k < Math.max(实.messages[i].content.length, 期.messages[i].content.length); k++) {",
  "        if (实.messages[i].content[k] !== 期.messages[i].content[k]) {",
  "          console.log('    差异 @', k);",
  "          console.log('    实:', JSON.stringify(实.messages[i].content.slice(Math.max(0,k-45), k+45)));",
  "          console.log('    期:', JSON.stringify(期.messages[i].content.slice(Math.max(0,k-45), k+45)));",
  "          break;",
  "        }",
  "      }",
  "    }",
  "  }",
  "  const 工具对 = (实.工具说明 ?? null) === 期.工具说明;",
  "  const 过 = 条数对 && 内容对 && 工具对;",
  "  if (!过) 全过 = false;",
  "  console.log(名.padEnd(14), '条数', 条数对 ? '✓' : '✗(' + 实.messages.length + ' vs ' + 期.messages.length + ')',",
  "    '内容', 内容对 ? '✓' : '✗', '工具', 工具对 ? '✓' : '✗');",
  "}",
  "console.log('');",
  "console.log('全部通过?', 全过);",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
