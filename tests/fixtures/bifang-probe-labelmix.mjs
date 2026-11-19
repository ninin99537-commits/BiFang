// 一次性探针（只读）: 三个 A 类"标签"里，到底有多少是**纯标签**、多少是**指令**。
//
// 为什么要量（这是我上一轮分类没做细的地方）:
//   我按"以 【X】( 开头、以 ):\n 结尾"把它们判成 A 类纯标签。
//   但逐字读下去会发现里面混着**指令**：
//     D10 的 "应按当前时间推进" / "原样保留, 不得泛化或丢失" / "按规则 10 防全知处理"
//     D2 的 "是你设计该 NPC 幕后生活的依据" / "你的输出格式始终只遵循本提示词的 JSON 要求"
//     D9 的 "你更新 NPC 状态时同样需要据此理解主角"
//
//   若这些搬进**模板文字**，用户删掉那一行就同时删掉了指令 —— 而指令丢失不报错。
//   这正是需求方说的 C 类风险。**所以我必须先量，再决定是整段搬还是只搬可见标签。**
//
// 判据: 对每个 A 类前缀，按句子切开，人工标注"标签 / 指令"，统计字数占比。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-labelmix.ts');
const 产物 = path.join(此处, '_probe-labelmix.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = () => ({",
  "  reply: '正文一。\\n\\n正文二。', replyCount: 2, context: '玩家输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '甲: 走了',",
  "  playerName: '主角', playerDescription: '主角描述', 展开宏: (t) => t, 模板: 默认模板,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "function 前缀(s) {",
  "  const i = s.indexOf('):\\n');",
  "  return i < 0 ? '' : s.slice(0, i + 3);",
  "}",
  "",
  "for (const [代号, 名] of [['D2','世界书'], ['D9','主角信息'], ['D10','现有状态卡']]) {",
  "  const s = String(r.零件内容[代号] ?? '');",
  "  const p = 前缀(s);",
  "  console.log('');",
  "  console.log('======== ' + 代号 + ' ' + 名 + '：前缀 ' + p.length + ' 字 ========');",
  "  // 按句号/分号/冒号切句，逐句列出",
  "  const 句们 = p.split(/(?<=[。；:：])/).filter(x => x.trim());",
  "  句们.forEach((句, i) => {",
  "    console.log('  [' + (i+1) + '] ' + 句.length + ' 字  ' + JSON.stringify(句));",
  "  });",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
