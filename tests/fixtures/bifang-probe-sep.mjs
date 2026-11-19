// 一次性探针: 默认模板里占位符之间要不要空行?
//
// 量三件事:
//   ① 每段内容自己开头有没有前导分隔(决定了"直接黏"会不会黏死)
//   ② 有/无空行时, 展开后的样子差在哪
//   ③ 有没有哪两段黏在一起会读不清边界(比如规则段末尾 + 场景判断开头)
import { writeFileSync } from 'node:fs';
import { buildTest } from '../build.mjs';
import path from 'node:path';

const 入口 = path.join(import.meta.dirname, '_probe-sep.ts');
const 产物 = path.join(import.meta.dirname, '_probe-sep.mjs');

writeFileSync(入口, `
import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';

const 造输入 = (额外 = {}) => ({
  reply: '剧情正文。', replyCount: 1, context: '', timeJump: '',
  tracked: ['甲'], inSceneHint: [],
  currentCards: { 甲: { 当前在做: '做饭', 身份锚点: '面包师' } },
  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [], 自定义段: [],
  预填充: false, worldbook: '世界书内容', currentStoryTime: '2026-01-01 20:00',
  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹',
  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,
});

const 原I = console.info, 原T = console.table, 原W = console.warn;
console.info = () => {}; console.table = () => {}; console.warn = () => {};
let r;
try { r = buildUpdateMessages(造输入({})); } finally { console.info = 原I; console.table = 原T; console.warn = 原W; }

const 内容表 = r.零件内容 ?? {};
const 默认顺序 = ['R1','R2','R3','R4','R5','D13','D1','D2','D-T','D-N','D9','D10','D11','D12','D14'];

console.log('=== 每个零件内容的首尾字符 ===');
for (const 代 of 默认顺序) {
  const c = String(内容表[代] ?? '');
  if (!c) { console.log(代.padEnd(5), '(空)'); continue; }
  const 首 = JSON.stringify(c.slice(0, 3));
  const 尾 = JSON.stringify(c.slice(-3));
  console.log(代.padEnd(5), 'len=' + String(c.length).padStart(5), '首=' + 首.padEnd(14), '尾=' + 尾);
}

console.log('');
console.log('=== 无分隔直接黏 (取相邻两段看边界) ===');
const 有内容的 = 默认顺序.filter(代 => String(内容表[代] ?? '').trim());
for (let i = 0; i < 有内容的.length - 1; i++) {
  const a = 有内容的[i], b = 有内容的[i + 1];
  const ca = String(内容表[a] ?? ''), cb = String(内容表[b] ?? '');
  const 接缝 = ca.slice(-12) + '⟪接缝⟫' + cb.slice(0, 12);
  console.log((a + '→' + b).padEnd(10), JSON.stringify(接缝));
}
`);

await buildTest(入口, 产物);
await import(new URL(`file:///${产物.replace(/\\/g, '/')}`).href);
