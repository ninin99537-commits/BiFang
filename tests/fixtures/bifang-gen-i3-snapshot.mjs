// 重采 I3 基准（第三次：去伪装 → 模板化 → **删默认模板的玩家输入段**）
//
// 为什么必须重采：用户 2026-11-19 裁定「感觉可以删」—— 默认模板里不再有
// `{{彼方:场景判断}}`。那是**有意的行为变更**：模型从此读不到玩家本轮说的话。
// 旧基准（含场景判断）不再是基准。
//
// 采的是**当前实现的产物**。所以这次之后，"I3 逐字节"验的是
// "模板化之后没有把别的东西改坏"，而不是"与模板化之前一致"。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_gen-i3-snapshot.ts');
const 产物 = path.join(此处, '_gen-i3-snapshot.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { writeFileSync } from 'node:fs';",
  "",
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
  "// 组合与旧基准一致（除了「登记归档」已删除），但**场景判断不再进默认产物** ——",
  "// 因为默认模板里没有那个占位符了。所以「带场景判断」那一组现在与「默认」相同。",
  "const 组合们 = {",
  "  默认: {},",
  "  带场景判断: { context: '主角走进广场。' },",
  "  全进工具: { 规则进工具: true },",
  "  全进工具带场景: { 规则进工具: true, context: '主角走进广场。' },",
  "  生理开: { physioEnabled: true },",
  "};",
  "",
  "const 快照 = {};",
  "for (const [名, 额外] of Object.entries(组合们)) {",
  "  const r = 跑(额外);",
  "  快照[名] = {",
  "    messages: r.messages.map(m => ({ role: m.role, content: m.content })),",
  "    工具说明: r.工具说明 ?? null,",
  "  };",
  "  console.log(名.padEnd(14), 'messages:', r.messages.map(m => m.role + ':' + m.content.length).join(', '),",
  "    '| 工具', (r.工具说明 ?? '').length || 'null');",
  "}",
  "",
  "writeFileSync('tests/fixtures/bifang-prompt-模板化后.json', JSON.stringify(快照, null, 2));",
  "console.log('');",
  "console.log('已写出 tests/fixtures/bifang-prompt-模板化后.json');",
  "",
  "// 顺带量：默认模板删掉场景判断后，默认产物少多少字",
  "const 有场景 = 跑({ context: '主角走进广场。' });",
  "const 无场景 = 跑({});",
  "const 少 = 有场景.messages.reduce((s, m) => s + m.content.length, 0)",
  "  - 无场景.messages.reduce((s, m) => s + m.content.length, 0);",
  "console.log('');",
  "console.log('删掉场景判断段后，默认产物比「有场景判断」少', 少, '字（那是那 158 字）');",
  "console.log('注：两组现在产物**相同** —— 因为默认模板里没有那个占位符了。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
