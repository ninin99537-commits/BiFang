// 一次性探针（只读）: 验"标签搬进模板"能不能真的逐字节。
//
// 为什么必须验（#260 要求 I3 逐字节）:
//   `渲染段` 有四条规则，其中两条与这次改动直接相关：
//     ① 整行占位符 → 内容，**前面不补换行**
//     ②b 行内占位符为空 → **整行消失**
//
//   而零件的 `\n\n` 前缀是"固有属性"（除 R1/D1 外都有）。
//   所以"标签搬走、数据留下"时，那 `\n\n` 归谁，决定了产物是否逐字节。
//
// 本探针做三件事:
//   ① 模拟"标签进模板 + 数据纯化"，看拼出来的结果与原来是否逐字节
//   ② 对**空值**场景再算一遍（世界书为空 / 台账为空）
//   ③ 报出差异的**具体字符位置**
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-move.ts');
const 产物 = path.join(此处, '_probe-move.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板, 渲染段 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
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
  "const 原产物 = 跑({});",
  "const 原user = String(原产物.messages.find(m => m.role === 'user')?.content ?? '');",
  "",
  "console.log('=== ① 模拟：标签搬进模板后，用 渲染段 重新拼一遍 ===');",
  "// 模拟改动后的零件内容（标签剥掉、保留一个 \\n 让标签后有换行）",
  "const 零件 = 原产物.零件内容;",
  "const d2 = String(零件['D2'] ?? '');",
  "const d9 = String(零件['D9'] ?? '');",
  "",
  "// 切点：标签到 `):\\n` 为止（含 \\n）",
  "const d2切 = d2.indexOf('):\\n') + 3;",
  "const d2标签 = d2.slice(0, d2切);",
  "const d2数据 = d2.slice(d2切);",
  "const d9切 = d9.indexOf('):\\n') + 3;",
  "const d9标签 = d9.slice(0, d9切);",
  "const d9数据 = d9.slice(d9切);",
  "",
  "console.log('  D2 标签 ' + d2标签.length + ' 字，数据 ' + d2数据.length + ' 字');",
  "console.log('  D9 标签 ' + d9标签.length + ' 字，数据 ' + d9数据.length + ' 字');",
  "",
  "// 模拟新模板：标签行 + 数据占位符（**同一行**，靠 ②b 让空时整行消失）",
  "const 新零件 = { ...零件, 'D2': d2数据, 'D9': d9数据 };",
  "const 新模板段 = [",
  "  '{{彼方:最近正文回复}}',",
  "  d2标签.trimEnd() + '{{彼方:世界书}}',",
  "  '{{彼方:时间}}',",
  "  '{{彼方:名单}}',",
  "  d9标签.trimEnd() + '{{彼方:主角信息}}',",
  "  '{{彼方:现有状态卡}}',",
  "  '{{彼方:台账账况}}',",
  "  '{{彼方:近期轨迹}}',",
  "].join('\\n');",
  "",
  "const 新渲染 = 渲染段(新模板段, (名) => {",
  "  const 件 = { '最近正文回复': 'D1', '世界书': 'D2', '时间': 'D-T', '名单': 'D-N',",
  "    '主角信息': 'D9', '现有状态卡': 'D10', '台账账况': 'D11', '近期轨迹': 'D12' };",
  "  return 新零件[件[名]] ?? '';",
  "});",
  "",
  "// 只比前 8 段（D14 骨架与生理/恋爱任务不在模拟范围内）",
  "const 原前8 = 原user.split('\\n**更新 NPC 状态时')[0];",
  "console.log('');",
  "console.log('  原前8段 ' + 原前8.length + ' 字，新渲染 ' + 新渲染.length + ' 字');",
  "console.log('  逐字节相同? ' + (原前8 === 新渲染));",
  "if (原前8 !== 新渲染) {",
  "  // 找第一处差异",
  "  let i = 0;",
  "  while (i < 原前8.length && i < 新渲染.length && 原前8[i] === 新渲染[i]) i++;",
  "  console.log('  第一处差异在位置 ' + i);",
  "  console.log('    原: ' + JSON.stringify(原前8.slice(Math.max(0, i - 30), i + 30)));",
  "  console.log('    新: ' + JSON.stringify(新渲染.slice(Math.max(0, i - 30), i + 30)));",
  "}",
  "",
  "console.log('');",
  "console.log('=== ② 空值场景：世界书为空 ===');",
  "const 空产物 = 跑({ worldbook: '' });",
  "const 空user = String(空产物.messages.find(m => m.role === 'user')?.content ?? '');",
  "console.log('  原产物（空世界书）含「世界书/设定」? ' + 空user.includes('世界书/设定'));",
  "console.log('  原产物开头 60 字: ' + JSON.stringify(空user.slice(0, 60)));",
  "",
  "// 模拟：世界书为空时，新模板的标签行会不会残留",
  "const 空零件 = { ...空产物.零件内容, 'D2': '', 'D9': String(空产物.零件内容['D9'] ?? '') };",
  "const 空渲染 = 渲染段(新模板段, (名) => {",
  "  const 件 = { '最近正文回复': 'D1', '世界书': 'D2', '时间': 'D-T', '名单': 'D-N',",
  "    '主角信息': 'D9', '现有状态卡': 'D10', '台账账况': 'D11', '近期轨迹': 'D12' };",
  "  return 空零件[件[名]] ?? '';",
  "});",
  "const 空原前8 = 空user.split('\\n**更新 NPC 状态时')[0];",
  "console.log('  新渲染含「世界书/设定」? ' + 空渲染.includes('世界书/设定'));",
  "console.log('  空场景逐字节相同? ' + (空原前8 === 空渲染));",
  "if (空原前8 !== 空渲染) {",
  "  let i = 0;",
  "  while (i < 空原前8.length && i < 空渲染.length && 空原前8[i] === 空渲染[i]) i++;",
  "  console.log('    第一处差异位置 ' + i);",
  "  console.log('      原: ' + JSON.stringify(空原前8.slice(Math.max(0, i - 20), i + 20)));",
  "  console.log('      新: ' + JSON.stringify(空渲染.slice(Math.max(0, i - 20), i + 20)));",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
