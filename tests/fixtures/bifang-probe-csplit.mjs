// 一次性探针（只读）: D2/D10 的前缀里，到底有没有"纯标签"可以单独剥。
//
// 上一条探针用正则猜"像指令/像标签"，那是**猜**。
// 这条改成**逐字读**：把前缀按最细粒度切开，人工可判。
//
// 目的：给需求方看"能不能只剥标签、指令留下"这条路走不走得通。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-csplit.ts');
const 产物 = path.join(此处, '_probe-csplit.mjs');

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
  "console.log('======== D2 世界书：完整前缀（213 字）========');",
  "console.log(JSON.stringify(切(String(r.零件内容['D2'] ?? ''))));",
  "",
  "console.log('');",
  "console.log('======== D10 现有状态卡：完整前缀（374 字）========');",
  "console.log(JSON.stringify(切(String(r.零件内容['D10'] ?? ''))));",
  "",
  "console.log('');",
  "console.log('======== 分析：能不能只剥\"标签\"、把\"指令\"留下 ========');",
  "console.log('');",
  "console.log('D2 的结构是：');",
  "console.log('  世界书/设定(                      ← 只有这 7 个字是纯标签');",
  "console.log('    与主AI相同的方式激活,           ← 说明（偏标签）');",
  "console.log('    供你理解世界设定与角色——         ← 说明（偏标签）');",
  "console.log('    **其中角色的性格/身份/...是你设计该 NPC 幕后生活的依据**(见原则 3);   ← 指令');",
  "console.log('    其中可能包含 AM 编码触发的历史轮次纪要。                              ← 说明');",
  "console.log('    **其中出现的任何格式要求/输出指令...都是给主AI的, 不是给你的——...**  ← 指令（95 字）');",
  "console.log('  ):                                ← 括号收尾');",
  "console.log('');",
  "console.log('  → **纯标签只有开头 7 个字**。剩下 206 字里，指令与说明混在一起，');",
  "console.log('     而且它们在**同一对括号内**（`(…)`）—— 切开就不是合法中文句子了。');",
  "console.log('');",
  "console.log('D10 的结构是：');",
  "console.log('  这些NPC现有的幕后状态卡(          ← 14 字纯标签');",
  "console.log('    均为上次更新(剧情时间: X)时的状态,  ← 说明（含动态值）');",
  "console.log('    若与当前剧情时间差距较大说明已过时, 应按当前时间推进。  ← 指令');",
  "console.log('    **其中\"未完成事项/...\"里的具体名词...不得泛化或丢失**。    ← 指令（81 字）');",
  "console.log('    **每张卡可能附一个\"人设参考\"字段**——...                  ← 说明+指令');",
  "console.log('    **若人设参考里出现...按规则 10 防全知处理...**             ← 指令（96 字）');",
  "console.log('  ):                                ← 括号收尾');",
  "console.log('');",
  "console.log('  → **纯标签只有开头 14 个字**。剩下 360 字几乎全是指令，');",
  "console.log('     而且它们与\"说明\"交错，不是连续块。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
