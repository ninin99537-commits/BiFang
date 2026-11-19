// 一次性探针（只读）: 精确量化「标签进模板文字」与 I3 逐字节的冲突。
//
// ── 这个探针要回答一个方案问题，不是实现问题 ──
//  需求方 #265 要求：① 标签进**默认模板的文字** ② I3 逐字节不变。
//  我试了四种写法（B/C/C2/D），只有 B（标签做成**占位符**）能同时满足。
//  而 B 的标签在模板里显示成 `{{彼方:世界书·标签}}`，不是文字。
//
//  所以：**"标签是文字" 与 "I3 逐字节" 在现有渲染规则下不可兼得。**
//  本探针把"不可兼得"量成具体数字，供需求方裁。
//
// 输出:
//   · 方案 C（标签文字）与原产物的**全部**差异点（位置 + 上下文）
//   · 差异是否只涉及换行（可见文字是否完全相同）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-conflict.ts');
const 产物 = path.join(此处, '_probe-conflict.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "import { 默认模板, 渲染段 } from '../../src/彼方_NPC幕后生命状态系统/提示词模板';",
  "",
  "const 造 = (额外 = {}) => ({",
  "  reply: '正文一。\\n\\n正文二。', replyCount: 2, context: '玩家输入', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['乙'],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: '世界书正文', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '甲: 走了',",
  "  playerName: '主角', playerDescription: '主角描述', 展开宏: (t) => t,",
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
  "function 验(场景名, 额外) {",
  "  const 产物 = 跑(额外);",
  "  const 原user = String(产物.messages.find(m => m.role === 'user')?.content ?? '');",
  "  const 零件 = 产物.零件内容;",
  "",
  "  const d12 = String(零件['D12'] ?? '');",
  "  const 位 = d12 ? 原user.indexOf(d12) + d12.length : 原user.split('\\n\\n**更新 NPC 状态时')[0].length;",
  "  const 原段 = 原user.slice(0, 位);",
  "",
  "  const 切2 = 切(String(零件['D2'] ?? ''));",
  "  const 切9 = 切(String(零件['D9'] ?? ''));",
  "  const 切10 = 切(String(零件['D10'] ?? ''));",
  "",
  "  // 方案 C：标签写成模板文字，数据保留原样（含它自己的 \\n\\n 前缀？不 —— 剥掉后没有前缀）",
  "  const 做标签 = (p) => p.replace(/^\\n+/, '').replace(/\\n$/, '');",
  "  const 新零件 = { ...零件, 'D2': 切2.数据, 'D9': 切9.数据, 'D10': 切10.数据 };",
  "  const 新模板 = [",
  "    '{{彼方:最近正文回复}}',",
  "    做标签(切2.标签) + '{{彼方:世界书}}',",
  "    '{{彼方:时间}}',",
  "    '{{彼方:名单}}',",
  "    做标签(切9.标签) + '{{彼方:主角信息}}',",
  "    做标签(切10.标签) + '{{彼方:现有状态卡}}',",
  "    '{{彼方:台账账况}}',",
  "    '{{彼方:近期轨迹}}',",
  "  ].join('\\n');",
  "  const 新 = 渲染段(新模板, (名) => 新零件[名表[名]] ?? '');",
  "",
  "  console.log('');",
  "  console.log('======== ' + 场景名 + ' ========');",
  "  console.log('  原 ' + 原段.length + ' 字，方案C ' + 新.length + ' 字，差 ' + (原段.length - 新.length));",
  "  const 去换行 = (s) => s.replace(/[ \\t]*\\n[ \\t]*/g, ' ').replace(/\\s+/g, ' ').trim();",
  "  console.log('  可见文字（去所有换行/空格）完全相同? ' + (去换行(原段) === 去换行(新)));",
  "  // 只统计换行符数量",
  "  const 数换行 = (s) => (s.match(/\\n/g) || []).length;",
  "  console.log('  换行符数: 原 ' + 数换行(原段) + ' / 新 ' + 数换行(新));",
  "  // 逐处差异",
  "  if (原段 !== 新) {",
  "    console.log('  差异点:');",
  "    let a = 0, b = 0, n = 0;",
  "    while (a < 原段.length && b < 新.length && n < 12) {",
  "      if (原段[a] === 新[b]) { a++; b++; continue; }",
  "      // 找最小差异窗口",
  "      const 原窗 = 原段.slice(a, a + 20);",
  "      const 新窗 = 新.slice(b, b + 20);",
  "      console.log('    [' + (n+1) + '] 位置 ' + a + '  原=' + JSON.stringify(原窗) + '  新=' + JSON.stringify(新窗));",
  "      // 跳过这段差异（找下一个相同点）",
  "      let 找到 = false;",
  "      for (let k = 1; k < 12 && !找到; k++) {",
  "        if (原段[a + k] === 新[b]) { a += k; 找到 = true; }",
  "        else if (原段[a] === 新[b + k]) { b += k; 找到 = true; }",
  "      }",
  "      if (!找到) break;",
  "      n++;",
  "    }",
  "  }",
  "}",
  "",
  "验('① 有值', {});",
  "验('② 世界书为空', { worldbook: '' });",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
