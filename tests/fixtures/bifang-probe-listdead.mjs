// 一次性探针: 删锚点路径之前，确认「列表路径（input.条目）现在还有没有输出作用」。
//
// 为什么必须量（不量就是推断）：
//   我在交接稿里写了"`input.条目` 现在只影响清单，不影响产物"。
//   如果这句错了，那"删列表路径是安全的"整个判断就是错的。
//
// 判据: 给一份带标记的条目，看它出不出现在 messages / 工具说明里。
//   不出现在产物里、只出现在清单里 → 列表路径对输出已死。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-listdead.ts');
const 产物 = path.join(此处, '_probe-listdead.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
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
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  const 警 = [];",
  "  console.info = () => {}; console.table = () => {};",
  "  console.warn = (...a) => 警.push(a.join(' '));",
  "  let r;",
  "  try { r = buildUpdateMessages(造(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return { r, 警 };",
  "};",
  "",
  "const 标记 = '条目标记-XYZ-不应出现在产物';",
  "",
  "console.log('=== ① 给一份带标记的条目 ===');",
  "const A = 跑({ 条目: [{ id: 'u1', role: 'user', content: 标记, 启用: true }], 条目顺序: ['u1'] });",
  "const A全文 = A.r.messages.map(m => String(m.content)).join('\\n');",
  "const A工具 = String(A.r.工具说明 ?? '');",
  "console.log('  在 messages 里?', A全文.includes(标记));",
  "console.log('  在工具说明里?', A工具.includes(标记));",
  "const A清单 = JSON.stringify(A.r.拼装清单 ?? []);",
  "console.log('  清单里提到它?', A清单.includes(标记), '（清单项只有代号/名/字数，不该含正文）');",
  "",
  "console.log('');",
  "console.log('=== ② 对比: 不给条目时产物是否完全相同 ===');",
  "const B = 跑({});",
  "console.log('  messages 逐条相同?',",
  "  JSON.stringify(A.r.messages) === JSON.stringify(B.r.messages));",
  "console.log('  工具说明相同?', (A.r.工具说明 ?? null) === (B.r.工具说明 ?? null));",
  "",
  "console.log('');",
  "console.log('=== ③ 给一份带标记的自定义段（锚点路径）===');",
  "const C = 跑({ 自定义段: [{ 锚点: '最后', role: 'system', content: 标记, 启用: true }] });",
  "const C全文 = C.r.messages.map(m => String(m.content)).join('\\n');",
  "console.log('  在 messages 里?', C全文.includes(标记));",
  "console.log('  messages 与不给时相同?',",
  "  JSON.stringify(C.r.messages) === JSON.stringify(B.r.messages));",
  "",
  "console.log('');",
  "console.log('=== ④ 清单里那两个\"来自旧设置\"分支还有没有机会命中 ===');",
  "const D = 跑({",
  "  自定义段: [{ 锚点: '最后', role: 'system', content: '{{彼方:世界书}}', 启用: true, 来自旧设置: true }],",
  "  worldbook: 'WB-内容',",
  "});",
  "const D项 = (D.r.拼装清单 ?? []).find(x => x.代号 === 'D2');",
  "console.log('  D2 清单项:', JSON.stringify(D项));",
  "console.log('  → 备注是否出现「来自旧设置迁移」?', String(D项?.备注 ?? '').includes('来自旧设置'));",
  "",
  "console.log('');",
  "console.log('=== ⑤ 关闭零件还有没有作用（这是另一条仍在生效的路径）===');",
  "const E = 跑({ 关闭零件: ['D1'] });",
  "const E全文 = E.r.messages.map(m => String(m.content)).join('\\n');",
  "console.log('  关掉 D1 后，正文还在吗?', E全文.includes('这是一段剧情正文'));",
  "console.log('  messages 与不关时相同?',",
  "  JSON.stringify(E.r.messages) === JSON.stringify(B.r.messages));",
  "",
  "console.log('');",
  "console.log('=== 结论 ===');",
  "console.log('列表路径(input.条目)对产物有作用?',",
  "  JSON.stringify(A.r.messages) !== JSON.stringify(B.r.messages));",
  "console.log('锚点路径(input.自定义段)对产物有作用?',",
  "  JSON.stringify(C.r.messages) !== JSON.stringify(B.r.messages));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
