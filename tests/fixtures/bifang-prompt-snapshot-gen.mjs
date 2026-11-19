// 生成器：把 buildUpdateMessages 的输出冻结成 fixture，供 I3（全默认逐字节）比对。
// 用法: node tests/fixtures/bifang-prompt-snapshot-gen.mjs <输出路径>
//
// ⚠ **这个脚本会覆盖基准**。什么时候该跑：
//   ① 改动代码**之前**采"改造前"（规矩 §十二 #24：有些事实只在某一刻为真）
//   ② **有意的行为变更之后**重采新基准（例如 2026-11-19 移除消息伪装）
//
// 第二种情形必须单独成一个 commit，而且要在交付里说清"基准变了、为什么变"——
// 否则后来人看到 diff 会以为是改坏了。
//
// 采的组合覆盖 messages 的全部承载路径：
//   默认 / 带场景判断 / 全进工具 / 全进工具+带场景 / 生理开 / 登记归档
// 每个组合同时采 messages 与 工具说明。
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 临时入口 = path.join(import.meta.dirname, '_snapshot-entry.ts');
const 临时产物 = path.join(import.meta.dirname, '_snapshot-entry.mjs');

writeFileSync(临时入口, `
import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';
import { writeFileSync } from 'node:fs';

const 造输入 = (额外 = {}) => ({
  reply: '这是一段剧情正文。',
  replyCount: 1,
  context: '',
  timeJump: '',
  tracked: ['甲'],
  inSceneHint: [],
  currentCards: { 甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' } },
  autoTrackEnabled: true,
  physioEnabled: false,
  恋爱对象名单: [],
  自定义段: [],
  预填充: false,
  worldbook: '',
  currentStoryTime: '2026-01-01 20:00',
  storyTimeHint: '2026-01-02 12:30',
  storySpan: '约 0.7 天',
  recentTrace: '',
  playerName: '主角',
  playerDescription: '',
  展开宏: (t) => t,
  ...额外,
});

const 组合 = {
  '默认': {},
  '带场景判断': { context: '主角走进广场。' },
  '全进工具': { 规则进工具: true },
  '全进工具带场景': { 规则进工具: true, context: '主角走进广场。' },
  '生理开': { physioEnabled: true },
  '登记归档': { 登记归档: true },
};

const 结果 = {};
for (const [名, 额外] of Object.entries(组合)) {
  const r = buildUpdateMessages(造输入(额外));
  结果[名] = { messages: r.messages, 工具说明: r.工具说明 ?? null };
}
writeFileSync(process.argv[2], JSON.stringify(结果, null, 2), 'utf8');
console.log('采了', Object.keys(结果).length, '种组合');
`);

await buildTest(临时入口, 临时产物);
await import(new URL(`file:///${临时产物.replace(/\\/g, '/')}`).href);
