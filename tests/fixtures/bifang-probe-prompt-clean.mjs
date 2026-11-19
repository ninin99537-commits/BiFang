// 一次性探针: 生成真实 userContent，扫里面还有没有"实现说明"。
//
// ── 为什么要跑真实产物而不是扫源码 ──
//  源码里的注释、条件分支、未展开的模板都不会进产物。
//  需求方的判据是「**产物里**不许出现这些词」，所以必须看真实渲染结果。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 入口 = path.join(此处, '_probe-prompt-clean.ts');
const 产物 = path.join(此处, '_probe-prompt-clean.mjs');

const 源码 = [
  "import { createPinia, setActivePinia } from 'pinia';",
  "setActivePinia(createPinia());",
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 结果 = buildUpdateMessages({",
  "  reply: '泰丝在柜台后整理货单，抬头看了一眼门口。',",
  "  replyCount: 1,",
  "  context: '',",
  "  timeJump: null,",
  "  tracked: ['泰丝'],",
  "  inSceneHint: ['泰丝'],",
  "  currentCards: {",
  "    泰丝: {",
  "      当前在做: '整理货单', 当前状态: '平静', 位置: '杂货铺',",
  "      身份锚点: '杂货铺老板娘', 近期关键事件: '2026-01-01 进货',",
  "      生活状态: '吃饭(2026-01-02 08:00)', 接下来想做: '盘账',",
  "      当前目标: '保住铺子', 心事: '房租涨了', 藏起来的打算: '想搬走',",
  "      恋爱对象: '是', 好感: '亲近', 情感倾向: '内敛',",
  "      生理周期: '卵泡期 Day 8/33', 生理周期日期: '2026-01-01 06:00',",
  "      是否怀孕: false, 周期影响: '体力正常', 周期长度: '33',",
  "      未完成事项: [{ 编号: 'T1', 内容: '去码头取货', 状态: '进行中' }],",
  "    },",
  "  },",
  "  autoTrackEnabled: true,",
  "  physioEnabled: true,",
  "  恋爱对象名单: ['泰丝'],",
  "  自定义段: [],",
  "  worldbook: '【世界观】这是一个边境小镇。',",
  "  currentStoryTime: '2026-01-02 12:30',",
  "  storySpan: '约 2.0 天（按正文时刻估算）',",
  "  recentTrace: '',",
  "  storyTimeHint: '2026-01-02 12:30',",
  "  playerName: '旅人',",
  "  playerDescription: '流浪的旅行者。',",
  "  展开宏: (t) => t,",
  "});",
  "",
  "const 全部文本 = JSON.stringify(结果);",
  "console.log('产物长度: ' + 全部文本.length + ' 字符');",
  "console.log('');",
  "",
  "const 禁词 = ['彼方代码', '由彼方', '彼方会', '与主AI相同', '与正文AI相同', '供你理解', '宿主', '本插件', '我们', '插件'];",
  "console.log('=== 产物里的禁词 ===');",
  "let 命中 = 0;",
  "for (const 词 of 禁词) {",
  "  const 次数 = (全部文本.split(词).length - 1);",
  "  if (次数 > 0) { 命中 += 次数; console.log('  ★ ' + 词 + ' × ' + 次数); }",
  "}",
  "if (命中 === 0) console.log('  （无）✅');",
  "console.log('');",
  "",
  "const 泛化 = [",
  "  ['由代码', /由代码/g],",
  "  ['代码会', /代码会/g],",
  "  ['由系统', /由系统/g],",
  "  ['系统维护', /系统维护/g],",
  "  ['系统判定', /系统判定/g],",
  "  ['自动维护', /自动维护/g],",
  "];",
  "console.log('=== 泛化检查 ===');",
  "let 泛化命中 = 0;",
  "for (const [名, 正则] of 泛化) {",
  "  const m = 全部文本.match(正则);",
  "  if (m) { 泛化命中 += m.length; console.log('  ★ ' + 名 + ' × ' + m.length); }",
  "}",
  "if (泛化命中 === 0) console.log('  （无）✅');",
  "console.log('');",
  "",
  "const 段们 = 结果.messages ?? [];",
  "console.log('=== 段数: ' + 段们.length + ' ===');",
  "for (const [i, m] of 段们.entries()) {",
  "  console.log('');",
  "  console.log('───── 第 ' + (i + 1) + ' 段 [' + m.role + '] (' + String(m.content ?? '').length + ' 字) ─────');",
  "  console.log(String(m.content ?? ''));",
  "}",
  "",
  "console.log('');",
  "console.log('结果: ' + (命中 === 0 ? '产物干净' : '产物里还有 ' + 命中 + ' 处禁词'));",
].join('\n');

writeFileSync(入口, 源码);
await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
