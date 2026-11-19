// 重采 I3 基准（**第四次**：剥掉 D9「主角信息」的标签）
//
// ── 为什么必须重采（需求方 #271 裁定）──
//  用户在自己的模板里写 `<User基础设定>{{彼方:主角信息}}</User基础设定>` 时，
//  展开后得到「我们的 `【主角信息】(…):` + 他的标签 + 数据」—— 三层包着。
//
//  所以 `【主角信息】(…)` 这个标签从**占位符内容**搬到**默认模板文字**里。
//  那是一次**有意的行为变更**：默认产物少一个空行（`\n\n` → `\n`）。
//
// ── 差异只有 1 处（实测，不是估）──
//  位置 517：`…名字: (无)\n\n【主角信息】(…` → `…名字: (无)\n【主角信息】(…`
//  五组（默认/带场景判断/全进工具/全进工具带场景/生理开）都是同一处、同一个字符。
//
// ── 重采之后 I3 验什么 ──
//  "剥标签没把别的东西改坏"，而不是"与剥之前一模一样"。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_gen-i3-snapshot-v4.ts');
const 产物 = path.join(此处, '_gen-i3-snapshot-v4.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { writeFileSync } from 'node:fs';",
  "",
  "// ⚠ 输入必须与 `tests/bifang-模板.test.ts` 的 造输入 **完全一致**",
  "//   （上次探针就是因为自己另写一份、replyCount 填了 2 才误判）",
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
  "const 跑 = (额外 = {}) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "const 组合们 = {",
  "  默认: {},",
  "  '带场景判断': { context: '主角走进广场。' },",
  "  '全进工具': { 规则进工具: true },",
  "  '全进工具带场景': { 规则进工具: true, context: '主角走进广场。' },",
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
  "  console.log(名.padEnd(16), 'messages:', r.messages.map(m => m.role + ':' + m.content.length).join(', '),",
  "    '| 工具', (r.工具说明 ?? '').length || 'null');",
  "}",
  "",
  "writeFileSync('tests/fixtures/bifang-prompt-模板化后.json', JSON.stringify(快照, null, 2));",
  "console.log('');",
  "console.log('已写入 tests/fixtures/bifang-prompt-模板化后.json');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
