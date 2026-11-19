// 重采 I3 基准 —— **通用生成器**（2026-11-19 第 4、5 次都用它）
//
// ── 用途 ──
//  重采 `tests/fixtures/bifang-prompt-模板化后.json`。**I3 是这一整套改造的刹车**：
//  默认模板展开后必须与这份快照逐字节一致，否则"只是换了位置"这句话不成立。
//
// ── 什么时候要重采（必须是"有意的行为变更"）──
//  ① 删/改默认模板里的段或占位符
//  ② 改零件的默认内容（如把标签从占位符搬进模板）
//  ③ 改渲染规则
//  **重采必须单独 commit，并在 message 里写清"为什么变、差异是什么"。**
//
// ── 历次重采 ──
//  ① 去伪装
//  ② 模板化（本改造本身）
//  ③ 删默认模板里的玩家输入段（用户「感觉可以删」）
//  ④ 剥掉 D9「主角信息」的标签（#271）—— 差异只有 1 处：`名单` 与 `【主角信息】` 之间 `\n\n` → `\n`
//  ⑤ D2/D10 的说明与指令搬进模板（#285 裁 C）—— user 段 1579 → 1531
//
// ── ⚠ 输入必须与 `tests/bifang-模板.test.ts` 的 `造输入` **完全一致** ──
//  上一次（第三次重采的探针）就是因为自己另写一份、`replyCount` 填了 2，
//  导致"比对两个不同场景的产物"，误判成"有差异"。
//  **比对基准时用同一个输入构造器，不许自己另写一份。**
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
  "// ⚠ 与 tests/bifang-模板.test.ts 的 造输入 逐字一致",
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
