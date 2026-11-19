// 一次性探针（只读）: 把 D2 / D10 的前缀按"最小可判句"切开，逐句列出。
//
// 为什么不用正则猜"像指令/像标签"（上一条探针就是这么干的）:
//   那是**用形状猜语义**。而需求方 #283 给的判据是语义的：
//   **"模型读完这句会做什么不同的事？答不上来才删。"**
//   所以我只需要把句子切干净、编号、贴出来 —— 判断我自己做，不交给正则。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-sent.ts');
const 产物 = path.join(此处, '_probe-sent.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = () => ({",
  "  reply: '正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [], currentCards: { 甲: { 当前在做: 'x' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, 模板: 默认模板,",
  "});",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "const 切 = (s) => { const i = s.indexOf('):\\n'); return i < 0 ? '' : s.slice(0, i+3); };",
  "",
  "/** 切成最小可判句：在 。；, 和 ** 边界切，但保留原字符 */",
  "function 切句(s) {",
  "  // 先按句号/分号切",
  "  const 粗 = s.split(/(?<=[。；])/).filter(x => x.trim());",
  "  const 细 = [];",
  "  for (const 句 of 粗) {",
  "    // 再把 `, ` 切开（逗号后跟空格 —— 这份文本里的分隔习惯）",
  "    const 段 = 句.split(/(?<=, )(?=\\*\\*|[^\\s*])/);",
  "    细.push(...段.filter(x => x.trim()));",
  "  }",
  "  return 细;",
  "}",
  "",
  "for (const [代号, 名] of [['D2','世界书'], ['D10','现有状态卡']]) {",
  "  const 前 = 切(String(r.零件内容[代号] ?? ''));",
  "  console.log('');",
  "  console.log('################ ' + 代号 + ' ' + 名 + '：' + 前.length + ' 字 ################');",
  "  const 句们 = 切句(前);",
  "  句们.forEach((句, i) => {",
  "    console.log('');",
  "    console.log('  [' + (i+1) + '] ' + 句.length + ' 字');",
  "    console.log('      ' + JSON.stringify(句));",
  "  });",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
