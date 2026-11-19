// 一次性探针（只读）: 精确比对 I3 基准（旧快照）与当前产物，逐字符定位差异。
//
// 为什么必须精确到字符（#271 要求 commit message 逐行打印差异）:
//   I3 报"实际 1579 字 / 期望 1580 字"，差 1。
//   但需求方预期是"2 处各少一个 \n"。**这两个说法不一致，必须查清**：
//     · 若真少 2 个字符 → 我漏了什么
//     · 若少 1 个字符 → 需求方的预期表述不准（实际是"前缀开头的 \n\n 变 \n"）
//
//   而"差 1"与"差 2"的区别，决定了 commit message 怎么写。
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-i3diff.ts');
const 产物 = path.join(此处, '_probe-i3diff.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import 快照 from '../fixtures/bifang-prompt-模板化后.json';",
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
  "const 快 = typeof 快照 === 'string' ? JSON.parse(快照) : 快照;",
  "const 现 = 跑({});",
  "",
  "console.log('=== 快照结构 ===');",
  "console.log('  keys: ' + Object.keys(快).join(', '));",
  "const 快messages = 快.messages ?? 快.默认?.messages ?? [];",
  "console.log('  快照 messages 条数: ' + 快messages.length);",
  "console.log('  当前 messages 条数: ' + 现.messages.length);",
  "",
  "for (let i = 0; i < Math.max(快messages.length, 现.messages.length); i++) {",
  "  const a = String(快messages[i]?.content ?? '');",
  "  const b = String(现.messages[i]?.content ?? '');",
  "  if (a === b) { console.log(''); console.log('第 ' + (i+1) + ' 条: 相同 (' + a.length + ' 字)'); continue; }",
  "  console.log('');",
  "  console.log('第 ' + (i+1) + ' 条: ★ 不同  快照 ' + a.length + ' 字 / 当前 ' + b.length + ' 字  差 ' + (a.length - b.length));",
  "  // 逐字符定位全部差异",
  "  let x = 0, y = 0, n = 0;",
  "  while ((x < a.length || y < b.length) && n < 20) {",
  "    if (a[x] === b[y]) { x++; y++; continue; }",
  "    n++;",
  "    console.log('  [差异 ' + n + '] 快照位置 ' + x + ' / 当前位置 ' + y);",
  "    console.log('    快照: ' + JSON.stringify(a.slice(Math.max(0, x - 25), x + 35)));",
  "    console.log('    当前: ' + JSON.stringify(b.slice(Math.max(0, y - 25), y + 35)));",
  "    // 跳过差异：优先找能重新对齐的点",
  "    let 对齐 = false;",
  "    for (let k = 1; k <= 40 && !对齐; k++) {",
  "      if (a[x + k] === b[y]) { x += k; 对齐 = true; console.log('      → 快照跳 ' + k + ' 字符后对齐'); }",
  "      else if (a[x] === b[y + k]) { y += k; 对齐 = true; console.log('      → 当前跳 ' + k + ' 字符后对齐'); }",
  "    }",
  "    if (!对齐) { console.log('      → 无法对齐，停止'); break; }",
  "  }",
  "  if (n >= 20) console.log('  （差异点超过 20，已截断）');",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
