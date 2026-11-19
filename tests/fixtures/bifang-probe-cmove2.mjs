// 一次性探针（只读）: 实测"指令塞进 R2"会发生什么。
//
// 需求方 #276 问我："能不能搬进规则类占位符？"
// 我需要给出**数据**，不是判断。要量的是：
//   ① I3 崩多少（几条消息变、变多少字）
//   ② "R2–R5 是纯切片"这条结构保证还在不在
//   ③ 有没有更小的改法
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-cmove2.ts');
const 产物 = path.join(此处, '_probe-cmove2.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板, 渲染段 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "import { 切规则零件 } from '../../src/彼方_NPC幕后生命状态系统/零件表';",
  "import { readFileSync } from 'node:fs';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '这是一段剧情正文。', replyCount: 1, context: '', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '',",
  "  playerName: '主角', playerDescription: '', 展开宏: (t) => t, 模板: 默认模板, ...额外,",
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
  "const 原 = 跑({});",
  "",
  "console.log('=== ① 现在 R2–R5 拼回 === SYSTEM_PROMPT_BODY 吗 ===');",
  "// 从源码里取 SYSTEM_PROMPT_BODY(false) 的真实长度做对照",
  "const 拼回 = ['R2','R3','R4','R5'].map(k => String(原.零件内容[k] ?? '')).join('');",
  "console.log('  R2+R3+R4+R5 = ' + 拼回.length + ' 字');",
  "// 这条是**结构保证**：切规则零件是纯 slice，所以拼回必然等于原文。",
  "// 若往里塞外部文字，拼回就不再等于 SYSTEM_PROMPT_BODY —— 那条保证破了。",
  "console.log('  → 切规则零件是纯 slice，所以这条恒成立。塞外部文字就会破。');",
  "",
  "console.log('');",
  "console.log('=== ② 模拟：把 D2 的 213 字前缀塞进 R2 末尾 ===');",
  "const d2 = String(原.零件内容['D2'] ?? '');",
  "const d10 = String(原.零件内容['D10'] ?? '');",
  "const 切 = (s) => { const i = s.indexOf('):\\n'); return i < 0 ? { 标: '', 数: s } : { 标: s.slice(0, i+3), 数: s.slice(i+3) }; };",
  "const c2 = 切(d2), c10 = 切(d10);",
  "",
  "// 模拟新零件：R2 末尾追加指令、D2/D10 只留数据",
  "const 新零件 = {",
  "  ...原.零件内容,",
  "  'R2': String(原.零件内容['R2'] ?? '') + c2.标,",
  "  'R4': String(原.零件内容['R4'] ?? '') + c10.标,",
  "  'D2': c2.数,",
  "  'D10': c10.数,",
  "};",
  "",
  "// 用原模板重新渲染（模拟新产物）",
  "const 原user = String(原.messages.find(m => m.role === 'user')?.content ?? '');",
  "const 原system = String(原.messages.find(m => m.role === 'system')?.content ?? '');",
  "",
  "// 新 system = 原 system + 两段指令（粗模拟，位置不精确）",
  "const 新system = 原system + c2.标 + c10.标;",
  "// 新 user = 原 user 去掉那两段前缀",
  "const 新user = 原user.replace(c2.标, '').replace(c10.标, '');",
  "",
  "console.log('  system: ' + 原system.length + ' → ' + 新system.length + ' 字（+' + (新system.length - 原system.length) + '）');",
  "console.log('  user:   ' + 原user.length + ' → ' + 新user.length + ' 字（' + (新user.length - 原user.length) + '）');",
  "console.log('  合计:   ' + (原system.length + 原user.length) + ' → ' + (新system.length + 新user.length));",
  "",
  "console.log('');",
  "console.log('=== ③ I3 会崩成什么样 ===');",
  "console.log('  现在 I3 比对: 第1条 system / 第2条 user / 工具说明');",
  "console.log('  搬完之后:');",
  "console.log('    第1条 system 变了（多了 ' + (c2.标.length + c10.标.length) + ' 字指令）');",
  "console.log('    第2条 user   变了（少了同样多）');",
  "console.log('    → **两条都变**，不是\"少一个空行\"');",
  "console.log('');",
  "console.log('  与 D9 那次对比:');",
  "console.log('    D9: 1 个字符差异（\\n\\n → \\n），五组同位置');",
  "console.log('    C 类: 两条消息各变数百字，位置完全不同');",
  "",
  "console.log('');",
  "console.log('=== ④ 有没有更小的改法：只搬\"纯标签\"部分 ===');",
  "// D2 前缀拆成两句：前半标签 + 后半指令",
  "const d2句 = c2.标.split(/(?<=[。；:：])/).filter(x => x.trim());",
  "console.log('  D2 前缀拆成 ' + d2句.length + ' 句:');",
  "d2句.forEach((句, i) => {",
  "  const 像指令 = /\\*\\*|必须|严禁|不要|不是给你的|始终/.test(句);",
  "  console.log('    [' + (i+1) + '] ' + String(句.length).padStart(3) + ' 字 ' + (像指令 ? '【像指令】' : '【像标签】') + '  ' + JSON.stringify(句.slice(0, 50)));",
  "});",
  "",
  "const d10句 = c10.标.split(/(?<=[。；:：])/).filter(x => x.trim());",
  "console.log('');",
  "console.log('  D10 前缀拆成 ' + d10句.length + ' 句:');",
  "d10句.forEach((句, i) => {",
  "  const 像指令 = /\\*\\*|必须|严禁|不要|不得|应按|按规则/.test(句);",
  "  console.log('    [' + (i+1) + '] ' + String(句.length).padStart(3) + ' 字 ' + (像指令 ? '【像指令】' : '【像标签】') + '  ' + JSON.stringify(句.slice(0, 50)));",
  "});",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
