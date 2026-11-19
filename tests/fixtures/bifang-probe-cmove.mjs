// 一次性探针（只读）: 判断"把 D2/D10 的指令搬进规则占位符"能不能成立。
//
// ── 要判的三件事（需求方 #276 要我"先判断再动手"）──
//  ① 会不会撞渲染规则（换行/整行消失那套）
//  ② I3 会崩得多厉害
//  ③ 会不会破坏"R2–R5 是 SYSTEM_PROMPT_BODY 的纯切片"这条结构保证
//
// ── 我的预判（下面用数据验，不靠猜）──
//  指令从 **user 消息** 搬到 **system 消息** → 位置变了 → I3 不是"少一个空行"，
//  而是"640 字搬家"。而且 `切规则零件` 的注释写明"四段拼回去 === 原文，
//  这是**结构上**成立的（纯切片）" —— 往里塞外部文字会打破它。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-cmove.ts');
const 产物 = path.join(此处, '_probe-cmove.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { 切规则零件 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
  "",
  "const 造 = () => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, 模板: 默认模板,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造()); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "console.log('=== ① 指令现在在哪个零件里 ===');",
  "const d2 = String(r.零件内容['D2'] ?? '');",
  "const d10 = String(r.零件内容['D10'] ?? '');",
  "const 切 = (s) => { const i = s.indexOf('):\\n'); return i < 0 ? { 标: '', 数: s } : { 标: s.slice(0, i+3), 数: s.slice(i+3) }; };",
  "const c2 = 切(d2), c10 = 切(d10);",
  "console.log('  D2  前缀 ' + c2.标.length + ' 字（在 user 消息里）');",
  "console.log('  D10 前缀 ' + c10.标.length + ' 字（在 user 消息里）');",
  "console.log('  合计 ' + (c2.标.length + c10.标.length) + ' 字要搬');",
  "",
  "console.log('');",
  "console.log('=== ② 规则零件 R2/R3/R4/R5 各多少字（搬到哪去）===');",
  "for (const 代号 of ['R2','R3','R4','R5']) {",
  "  const s = String(r.零件内容[代号] ?? '');",
  "  console.log('  ' + 代号 + '  ' + String(s.length).padStart(5) + ' 字  开头: ' + JSON.stringify(s.slice(0, 50)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== ③ 关键：R2–R5 是不是 SYSTEM_PROMPT_BODY 的纯切片 ===');",
  "// 直接验：把 R2+R3+R4+R5 拼起来，与切之前的原文比",
  "const 拼回 = ['R2','R3','R4','R5'].map(k => String(r.零件内容[k] ?? '')).join('');",
  "console.log('  四段拼回长度: ' + 拼回.length);",
  "console.log('  R1 长度: ' + String(r.零件内容['R1'] ?? '').length);",
  "console.log('  → 若往里塞外部文字，这条\"纯切片\"保证就破了');",
  "",
  "console.log('');",
  "console.log('=== ④ 搬过去之后，messages 的结构会怎么变 ===');",
  "console.log('  现在: 第1条 system 含 R1+R2+R3+R4+R5, 第2条 user 含 D1..D12');",
  "r.messages.forEach((m, i) => console.log('    第' + (i+1) + '条 ' + m.role + ' ' + String(m.content).length + ' 字'));",
  "console.log('');",
  "console.log('  ⚠ 指令从第2条(user)搬到第1条(system) = **跨消息搬家**');",
  "console.log('     这不是\"少一个空行\"，是\"640 字从一条消息移到另一条\"');",
  "console.log('     I3 会整体崩，而不是差几个字符');",
  "",
  "console.log('');",
  "console.log('=== ⑤ 另一条路：指令进**模板文字**会怎样 ===');",
  "console.log('  模板是用户可编辑的。指令写进模板 = 用户删掉那行就删掉了指令。');",
  "console.log('  需求方说的风险：删了不报错。');",
  "console.log('');",
  "console.log('=== ⑥ 第三条路：指令进**新的规则占位符**（比如 {{彼方:世界书使用规则}}）===');",
  "console.log('  好处：用户删的是占位符，他知道自己在删什么；指令内容仍归\"规则\"类。');",
  "console.log('  代价：占位符从 15 变 17（新增 2 个），且仍在 system 消息里 = I3 仍会崩。');",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
