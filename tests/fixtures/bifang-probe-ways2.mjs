// 一次性探针 v2（只读）: 精确验证方案 B 能否逐字节。
//
// v1 为什么报"逐字节 false"（§十二 #22 要求写清上一版错因）:
//   我用 `user.split('\n**更新 NPC 状态时')[0]` 切片，那个 split 把 D12 结尾的
//   `\n\n` 吃掉了一个 —— 于是原串比新渲染多 2 个字符，看起来像"方案 B 不行"。
//   **实际上方案 B 在前面 1522 字完全一致，差异只在切片边界。**
//   这就是"量错的方式会改变结论"——差 2 个字符，结论从"可行"变成"不可行"。
//
// v2 判据: 不切片。直接比较「原 user 段」与「新渲染 + 原 D14 之后的部分」，
//   或者更干净：比较到 D12 内容结束（含 D12 本身）为止。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-ways2.ts');
const 产物 = path.join(此处, '_probe-ways2.mjs');

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
  "function 切(s) {",
  "  const i = s.indexOf('):\\n');",
  "  if (i < 0) return { 标签: '', 数据: s };",
  "  return { 标签: s.slice(0, i + 3), 数据: s.slice(i + 3) };",
  "}",
  "",
  "const 名表 = { '最近正文回复': 'D1', '世界书': 'D2', '时间': 'D-T', '名单': 'D-N',",
  "  '主角信息': 'D9', '现有状态卡': 'D10', '台账账况': 'D11', '近期轨迹': 'D12' };",
  "",
  "/**",
  " * 用方案 B 的模板重新渲染「前 8 个数据零件」，并与原产物比较。",
  " * 比较范围：从 user 段开头，到 **D12 内容结尾**（含 D12 本身）。",
  " * 为什么不比到 user 末尾：D14 骨架是模板文字，不在这次改动范围。",
  " */",
  "function 验(场景名, 额外) {",
  "  const 产物 = 跑(额外);",
  "  const 原user = String(产物.messages.find(m => m.role === 'user')?.content ?? '');",
  "  const 零件 = 产物.零件内容;",
  "",
  "  const d12 = String(零件['D12'] ?? '');",
  "  // 原：截到 D12 结尾（含）。D12 为空时截到 D11 结尾。",
  "  let 原段;",
  "  if (d12) {",
  "    const 位 = 原user.indexOf(d12);",
  "    原段 = 原user.slice(0, 位 + d12.length);",
  "  }",
  "  else {",
  "    const d11 = String(零件['D11'] ?? '');",
  "    if (d11) { const 位 = 原user.indexOf(d11); 原段 = 原user.slice(0, 位 + d11.length); }",
  "    else 原段 = 原user.split('\\n\\n**更新 NPC 状态时')[0];",
  "  }",
  "",
  "  const 切2 = 切(String(零件['D2'] ?? ''));",
  "  const 切9 = 切(String(零件['D9'] ?? ''));",
  "  const 切10 = 切(String(零件['D10'] ?? ''));",
  "",
  "  const 新零件 = { ...零件,",
  "    'D2': 切2.数据, 'D2·标签': 切2.数据 ? 切2.标签 : '',",
  "    'D9': 切9.数据, 'D9·标签': 切9.数据 ? 切9.标签 : '',",
  "    'D10': 切10.数据, 'D10·标签': 切10.数据 ? 切10.标签 : '',",
  "  };",
  "  const 新模板 = [",
  "    '{{彼方:最近正文回复}}',",
  "    '{{彼方:世界书·标签}}',",
  "    '{{彼方:世界书}}',",
  "    '{{彼方:时间}}',",
  "    '{{彼方:名单}}',",
  "    '{{彼方:主角信息·标签}}',",
  "    '{{彼方:主角信息}}',",
  "    '{{彼方:现有状态卡·标签}}',",
  "    '{{彼方:现有状态卡}}',",
  "    '{{彼方:台账账况}}',",
  "    '{{彼方:近期轨迹}}',",
  "  ].join('\\n');",
  "  const 新 = 渲染段(新模板, (名) => {",
  "    if (名.endsWith('·标签')) return 新零件[名表[名.replace('·标签', '')] + '·标签'] ?? '';",
  "    return 新零件[名表[名]] ?? '';",
  "  });",
  "",
  "  console.log('');",
  "  console.log('--- ' + 场景名 + ' ---');",
  "  console.log('  原段 ' + 原段.length + ' 字，新渲染 ' + 新.length + ' 字');",
  "  console.log('  逐字节相同? ' + (原段 === 新));",
  "  if (原段 !== 新) {",
  "    let i = 0; while (i < 原段.length && i < 新.length && 原段[i] === 新[i]) i++;",
  "    console.log('    第一处差异位置 ' + i);",
  "    console.log('      原: ' + JSON.stringify(原段.slice(Math.max(0,i-30), i+30)));",
  "    console.log('      新: ' + JSON.stringify(新.slice(Math.max(0,i-30), i+30)));",
  "  }",
  "  // 附加：新渲染里有没有残留 A 类标签",
  "  console.log('  新渲染里含「【主角信息】」? ' + 新.includes('【主角信息】'));",
  "  console.log('  新渲染里含「世界书/设定(」? ' + 新.includes('世界书/设定('));",
  "  console.log('  新渲染里含「这些NPC现有的幕后状态卡(」? ' + 新.includes('这些NPC现有的幕后状态卡('));",
  "}",
  "",
  "验('① 有值（worldbook 有内容）', {});",
  "验('② 世界书为空', { worldbook: '' });",
  "验('③ 主角信息为空（没人设）', { playerName: '', playerDescription: '' });",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
