// 一次性探针: 若要"包装搬模板、占位符只产数据", 需要几个**值级**占位符?
// 以及其中几个需要**重复出现**（与 C4「首处生效」冲突）。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-values.ts');
const 产物 = path.join(import.meta.dirname, '_probe-values.mjs');

const 源码 = [
  "import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';",
  "",
  "const 造输入 = (额外 = {}) => ({",
  "  reply: '剧情正文甲。', replyCount: 1, context: '玩家走进广场', timeJump: '无',",
  "  tracked: ['甲'], inSceneHint: ['甲'],",
  "  currentCards: { 甲: { 当前在做: '做饭' } },",
  "  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],",
  "  预填充: false, worldbook: 'WB甲', currentStoryTime: '2026-01-01 20:00',",
  "  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹甲',",
  "  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,",
  "});",
  "",
  "const 原I = console.info, 原T = console.table, 原W = console.warn;",
  "console.info = () => {}; console.table = () => {}; console.warn = () => {};",
  "let r;",
  "try { r = buildUpdateMessages(造输入({})); }",
  "finally { console.info = 原I; console.table = 原T; console.warn = 原W; }",
  "",
  "const 值 = {",
  "  '最近正文': '剧情正文甲。',",
  "  '正文条数': '1',",
  "  '世界书': 'WB甲',",
  "  '正文时间': '2026-01-02 12:30',",
  "  '时间跳跃': '无',",
  "  '上次剧情时间': '2026-01-01 20:00',",
  "  '剧情跨度': '约 0.7 天',",
  "  '追踪名单': '甲',",
  "  '正文提到的人': '甲',",
  "  '主角名': '主角',",
  "  '主角描述': '描述',",
  "  '状态卡JSON': 'x',",
  "  '轨迹': '轨迹甲',",
  "  '场景判断输入': '玩家走进广场',",
  "};",
  "",
  "console.log('=== 每个值在「零件内容」里出现几次（决定是否需要重复占位符） ===');",
  "const 零件们 = r.零件内容 ?? {};",
  "const 全 = Object.values(零件们).map(String).join('\\u0000');",
  "for (const [名, v] of Object.entries(值)) {",
  "  if (!v || v === 'x') continue;",
  "  const 次 = 全.split(v).length - 1;",
  "  const 警告 = 次 > 1 ? '  ← **需要重复出现 ' + 次 + ' 次, 与 C4 冲突**' : '';",
  "  console.log(名.padEnd(8), '出现', 次, '次' + 警告);",
  "}",
  "",
  "console.log('');",
  "console.log('=== 逐零件: 该零件的动态值有哪些 ===');",
  "const 归属 = {",
  "  'D1': ['最近正文', '正文条数'],",
  "  'D2': ['世界书'],",
  "  'D-T': ['正文时间', '时间跳跃', '上次剧情时间', '剧情跨度'],",
  "  'D-N': ['追踪名单', '正文提到的人'],",
  "  'D9': ['主角名', '主角描述'],",
  "  'D10': ['上次剧情时间', '状态卡JSON'],",
  "  'D12': ['轨迹'],",
  "  'D13': ['场景判断输入'],",
  "};",
  "for (const [代, 名单] of Object.entries(归属)) {",
  "  const c = String(零件们[代] ?? '');",
  "  const 细 = 名单.map(名 => {",
  "    const v = 值[名];",
  "    if (!v || v === 'x') return null;",
  "    const 次 = c.split(v).length - 1;",
  "    return 次 > 0 ? 名 + '×' + 次 : null;",
  "  }).filter(Boolean);",
  "  console.log(代.padEnd(5), 'len=' + String(c.length).padStart(4), '|', 细.join(' ') || '(无)');",
  "}",
].join('\n');

writeFileSync(入口, 源码);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
