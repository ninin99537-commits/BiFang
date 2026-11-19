// 一次性探针: 补两个 #210 的前提核查
//   ① 全进工具模式下, 三条消息变成什么样? 场景判断去哪了?
//   ② D14 尾部那三段条件段(生理/恋爱/防新建NPC)的边界
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-toolmode.ts');
const 产物 = path.join(import.meta.dirname, '_probe-toolmode.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文。', replyCount: 1, context: '玩家走进广场', timeJump: '',",
  "  tracked: ['甲'], inSceneHint: [],",
  "  currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师', 恋爱对象: '是' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],",
  "  预填充: false, worldbook: 'WB', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 跑 = (额外) => {",
  "  const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "  console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "  let r;",
  "  try { r = buildUpdateMessages(造输入(额外)); }",
  "  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "  return r;",
  "};",
  "",
  "console.log('=== ① 默认 vs 全进工具: 消息结构 ===');",
  "for (const [名, 额外] of [['默认', {}], ['全进工具', { 规则进工具: true }]]) {",
  "  const r = 跑(额外);",
  "  console.log('');",
  "  console.log('--- ' + 名 + ' ---');",
  "  console.log('messages:', r.messages.length, '条');",
  "  r.messages.forEach((m, i) => {",
  "    const c = String(m.content);",
  "    console.log('  第' + (i+1) + '条 ' + m.role.padEnd(9) + ' len=' + String(c.length).padStart(6) + ' 开头=' + JSON.stringify(c.slice(0, 45)));",
  "  });",
  "  console.log('  工具说明 len=' + String(r.工具说明 ?? '').length);",
  "  // 场景判断在哪",
  "  const d13 = String(r.零件内容?.D13 ?? '');",
  "  const 在工具 = String(r.工具说明 ?? '').includes(d13.slice(0, 30));",
  "  const 在消息 = r.messages.findIndex(m => String(m.content).includes(d13.slice(0, 30)));",
  "  console.log('  场景判断(D13) len=' + d13.length + ' 在工具说明? ' + 在工具 + ' 在第几条消息? ' + (在消息 >= 0 ? 在消息 + 1 : '无'));",
  "  // 数据零件在哪",
  "  for (const 代 of ['D1','D2','D10']) {",
  "    const c = String(r.零件内容?.[代] ?? '');",
  "    if (!c) continue;",
  "    const t = String(r.工具说明 ?? '').includes(c.slice(0, 25));",
  "    const mi = r.messages.findIndex(m => String(m.content).includes(c.slice(0, 25)));",
  "    console.log('  ' + 代 + ' 在工具说明? ' + t + ' 在第几条消息? ' + (mi >= 0 ? mi + 1 : '无'));",
  "  }",
  "}",
  "",
  "console.log('');",
  "console.log('=== ② D14 尾部三段条件段的边界 ===');",
  "const 基线 = String(跑({}).零件内容?.D14 ?? '');",
  "console.log('默认 D14 len=' + 基线.length);",
  "console.log('默认 D14 全文:');",
  "console.log(JSON.stringify(基线));",
  "console.log('');",
  "const 生理 = String(跑({ physioEnabled: true }).零件内容?.D14 ?? '');",
  "const 恋爱 = String(跑({ 恋爱对象名单: ['甲'] }).零件内容?.D14 ?? '');",
  "const 两者 = String(跑({ physioEnabled: true, 恋爱对象名单: ['甲'] }).零件内容?.D14 ?? '');",
  "console.log('生理开 len=' + 生理.length + ' | 恋爱开 len=' + 恋爱.length + ' | 两者 len=' + 两者.length);",
  "console.log('两者 === 基线 + 生理段 + 恋爱段 ?', 两者.length === 基线.length + (生理.length - 基线.length) + (恋爱.length - 基线.length));",
  "console.log('生理段开头:', JSON.stringify(生理.slice(基线.length, 基线.length + 60)));",
  "console.log('恋爱段开头:', JSON.stringify(恋爱.slice(基线.length, 基线.length + 60)));",
  "// 防新建NPC 指令（noNewNpcInstruction）—— 那个由什么控制?",
  "const 关新建 = String(跑({ autoTrackEnabled: false }).零件内容?.D14 ?? '');",
  "console.log('autoTrackEnabled=false 时 D14 len=' + 关新建.length + ' 与基线相同? ' + (关新建 === 基线));",
  "if (关新建 !== 基线) console.log('  差异开头:', JSON.stringify(关新建.slice(基线.length - 20, 基线.length + 80)));",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
