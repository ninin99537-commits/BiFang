// 一次性探针（只读）: 把每个数据零件切成「标签前缀 / 数据本体」，量出各自字数。
//
// 为什么必须量（#261 判据 3 要"剥掉多少"）:
//   我要报一张表，而表里的数字必须是**量出来的**，不是估的。
//   上一批的教训：规模估错会改变计划（把该一次做完的事拆成三批）。
//
// 切法（三种，取先命中的）:
//   ① 第一个 `):` 或 `）:` 之后 → 标签结束（括号说明型）
//   ② 第一个 `:` + 换行 → 标签结束（`名字: xxx` 型）
//   ③ 都没有 → 没有标签前缀
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-split.ts');
const 产物 = path.join(此处, '_probe-split.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
  "",
  "const 造 = () => ({",
  "  reply: '这是第一段正文。\\n\\n这是第二段正文，结尾在这里。', replyCount: 2,",
  "  context: '玩家的输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文内容', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天',",
  "  recentTrace: '甲: 从广场走到家',",
  "  playerName: '主角', playerDescription: '主角的描述文本', 展开宏: (t) => t,",
  "  模板: 默认模板,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "/** 找一个零件的标签前缀长度（返回 -1 表示没有标签） */",
  "function 找标签长度(s) {",
  "  // ① 括号说明型：第一个 `):` / `）:` 之后就是数据",
  "  const m1 = s.match(/^[\\s\\S]*?[)）]:/);",
  "  if (m1 && m1[0].length < s.length) return m1[0].length;",
  "  // ② `xxx:` 后紧跟换行（`名字: 值` 那种不算标签，跳过）",
  "  const m2 = s.match(/^[\\s\\S]*?:\\n/);",
  "  if (m2 && m2[0].length < s.length) return m2[0].length;",
  "  return -1;",
  "}",
  "",
  "console.log('| 代号 | 名字 | 原字数 | 标签字数 | 数据字数 | 标签开头 |');",
  "console.log('|---|---|---|---|---|---|');",
  "const 件们 = r.零件内容 ?? {};",
  "for (const 代号 of ['D1','D2','D-T','D-N','D9','D10','D11','D12','D13']) {",
  "  const s = String(件们[代号] ?? '');",
  "  const 名 = 零件表.find(x => x.代号 === 代号)?.名 ?? '?';",
  "  if (!s) { console.log('| ' + 代号 + ' | ' + 名 + ' | 0 | 0 | 0 | （本轮为空） |'); continue; }",
  "  const 标长 = 找标签长度(s);",
  "  const 标签 = 标长 > 0 ? s.slice(0, 标长) : '';",
  "  const 数据 = 标长 > 0 ? s.slice(标长) : s;",
  "  const 标显 = 标长 > 0",
  "    ? JSON.stringify(标签.replace(/\\n/g, '\\\\n')).slice(0, 70)",
  "    : '（无标签前缀）';",
  "  console.log('| ' + 代号 + ' | ' + 名 + ' | ' + s.length + ' | ' + (标长 > 0 ? 标长 : 0) + ' | ' + 数据.length + ' | ' + 标显 + ' |');",
  "}",
  "",
  "console.log('');",
  "console.log('=== 每个零件里出现的 `【…】` 与「括号说明」（判定 A/B/C 用）===');",
  "for (const 代号 of ['D1','D2','D-T','D-N','D9','D10','D11','D12','D13','R5']) {",
  "  const s = String(件们[代号] ?? '');",
  "  if (!s) continue;",
  "  const 方括号 = [...s.matchAll(/【[^】]{1,30}】/g)].map(m => m[0]);",
  "  const 去重 = [...new Set(方括号)];",
  "  if (去重.length) console.log('  ' + 代号.padEnd(6) + ' 方括号: ' + 去重.join(' '));",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
