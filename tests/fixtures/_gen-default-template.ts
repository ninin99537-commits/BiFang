import { buildUpdateMessages } from '../../src/彼方_NPC幕后生命状态系统/prompts';
import { 零件表 } from '../../src/彼方_NPC幕后生命状态系统/零件表';
import { writeFileSync } from 'node:fs';

const 造 = (额外 = {}) => ({
  reply: '剧情正文。', replyCount: 1, context: '玩家走进广场', timeJump: '',
  tracked: ['甲'], inSceneHint: [],
  currentCards: { 甲: { 当前在做: 'x', 恋爱对象: '是' } },
  autoTrackEnabled: true, physioEnabled: false, 恋爱对象名单: [],
  预填充: false, worldbook: 'WB', currentStoryTime: '2026-01-01 20:00',
  storyTimeHint: '2026-01-02 12:30', storySpan: '约 0.7 天', recentTrace: '轨迹',
  playerName: '主角', playerDescription: '描述', 展开宏: (t) => t, ...额外,
});

const 跑 = (额外) => {
  const 原I = console.info, 原T = console.table, 原W = console.warn;
  console.info = () => {}; console.table = () => {}; console.warn = () => {};
  let r;
  try { r = buildUpdateMessages(造(额外)); }
  finally { console.info = 原I; console.table = 原T; console.warn = 原W; }
  return r;
};

const 全关 = 跑({});
const 内容 = 全关.零件内容 ?? {};
const 骨架 = String(内容.D14 ?? '');

const 身份句 = String(内容.R1 ?? '');
const 占位 = (代号) => '{{彼方:' + (零件表.find(x => x.代号 === 代号)?.名 ?? 代号) + '}}';

const 系统段 = [身份句, 占位('R2'), 占位('R3'), 占位('R4'), 占位('R5')].join('\n');
const 场景段 = 占位('D13');
const 用户段 = [
  占位('D1'), 占位('D2'), 占位('D-T'), 占位('D-N'), 占位('D9'),
  占位('D10'), 占位('D11'), 占位('D12'),
  骨架,
  '{{彼方:生理任务}}',
  '{{彼方:恋爱任务}}',
].join('\n');

const 模板 = { 系统段, 场景判断: 场景段, 用户段 };

// ── 渲染（v3 规则，见文件头）──
function 渲染(文本, 值表) {
  const 行们 = 文本.split('\n');
  const 项们 = [];
  for (const 行 of 行们) {
    const m = 行.match(/^\{\{彼方:(.+?)\}\}$/);
    if (m) {
      const 值 = 值表[m[1]] ?? '';
      if (!值) continue;                 // ② 空 → 整行消失
      项们.push({ 文: 值, 是占位符: true });
      continue;
    }
    项们.push({ 文: 行.replace(/\{\{彼方:(.+?)\}\}/g, (_, 名) => 值表[名] ?? ''), 是占位符: false });
  }
  let 结果 = '';
  for (let i = 0; i < 项们.length; i++) {
    结果 += 项们[i].文;
    const 下一项 = 项们[i + 1];
    // ④ 只在「两个普通文字行相邻」时补换行
    if (下一项 && !项们[i].是占位符 && !下一项.是占位符) 结果 += '\n';
  }
  return 结果;
}

const 值表 = {};
for (const 件 of 零件表) 值表[件.名] = String(内容[件.代号] ?? '');
值表['生理任务'] = '';
值表['恋爱任务'] = '';

console.log('=== ① 渲染验证（默认配置）===');
const 段们 = [['系统段', 系统段, 0], ['场景判断', 场景段, 1], ['用户段', 用户段, 2]];
let 全对 = true;
for (const [名, 文, i] of 段们) {
  const 出 = 渲染(String(文), 值表);
  const 原 = String(全关.messages[i].content);
  const 同 = 出 === 原;
  if (!同) 全对 = false;
  console.log(名, '逐字节相同?', 同, '| 渲染', 出.length, '实际', 原.length);
  if (!同) {
    for (let k = 0; k < Math.max(出.length, 原.length); k++) {
      if (出[k] !== 原[k]) {
        console.log('  差异 @', k);
        console.log('  渲染:', JSON.stringify(出.slice(Math.max(0,k-45), k+45)));
        console.log('  实际:', JSON.stringify(原.slice(Math.max(0,k-45), k+45)));
        break;
      }
    }
  }
}
console.log('全部逐字节相同?', 全对);

// ── ② 带生理/恋爱 ──
console.log('');
console.log('=== ② 生理开 + 有恋爱对象 ===');
const 都开 = 跑({ physioEnabled: true, 恋爱对象名单: ['甲'] });
const 内容2 = 都开.零件内容 ?? {};
const 值表2 = {};
for (const 件 of 零件表) 值表2[件.名] = String(内容2[件.代号] ?? '');
const 骨架2 = String(内容2.D14 ?? '');
const 生理段 = 骨架2.slice(骨架.length, 骨架.length + 4593);
const 恋爱段 = 骨架2.slice(骨架.length + 4593);
值表2['生理任务'] = 生理段;
值表2['恋爱任务'] = 恋爱段;
console.log('  生理段 len=' + 生理段.length + ' | 恋爱段 len=' + 恋爱段.length);
let 全对2 = true;
for (const [名, 文, i] of 段们) {
  const 出 = 渲染(String(文), 值表2);
  const 原 = String(都开.messages[i].content);
  const 同 = 出 === 原;
  if (!同) 全对2 = false;
  console.log('  ' + 名, '逐字节相同?', 同, '| 渲染', 出.length, '实际', 原.length);
  if (!同) {
    for (let k = 0; k < Math.max(出.length, 原.length); k++) {
      if (出[k] !== 原[k]) {
        console.log('    差异 @', k);
        console.log('    渲染:', JSON.stringify(出.slice(Math.max(0,k-45), k+45)));
        console.log('    实际:', JSON.stringify(原.slice(Math.max(0,k-45), k+45)));
        break;
      }
    }
  }
}

// ── ③ 空条件 ──
console.log('');
console.log('=== ③ 空条件（无世界书/无场景/无轨迹）===');
const 空跑 = 跑({ worldbook: '', context: '', recentTrace: '' });
const 值表3 = {};
for (const 件 of 零件表) 值表3[件.名] = String((空跑.零件内容 ?? {})[件.代号] ?? '');
值表3['生理任务'] = '';
值表3['恋爱任务'] = '';
console.log('  消息数:', 空跑.messages.length, '（场景判断为空时只有 2 条）');
let 全对3 = true;
const 段名3 = ['系统段', '用户段'];
[系统段, 用户段].forEach((文, idx) => {
  const 出 = 渲染(String(文), 值表3);
  const 原 = String(空跑.messages[idx === 0 ? 0 : 1].content);
  const 同 = 出 === 原;
  if (!同) 全对3 = false;
  console.log('  ' + 段名3[idx], '逐字节相同?', 同, '| 渲染', 出.length, '实际', 原.length);
  if (!同) {
    for (let k = 0; k < Math.max(出.length, 原.length); k++) {
      if (出[k] !== 原[k]) {
        console.log('    差异 @', k);
        console.log('    渲染:', JSON.stringify(出.slice(Math.max(0,k-45), k+45)));
        console.log('    实际:', JSON.stringify(原.slice(Math.max(0,k-45), k+45)));
        break;
      }
    }
  }
});

// ── ④ 往回翻的指代 ──
console.log('');
console.log('=== ④ 「往回翻」的指代 ===');
const 可疑 = [];
for (const m of String(系统段 + '\n' + 场景段 + '\n' + 用户段).matchAll(/(参见|如上|上述|前文|前面说的|同前)[^。\n]{0,25}/g)) 可疑.push('模板: ' + m[0]);
for (const [代, c] of Object.entries(内容)) {
  for (const m of String(c).matchAll(/(见原则 ?\d|见规则 ?\d|参见原则|如上所述)/g)) 可疑.push(代 + ': ' + m[0]);
}
console.log(可疑.length ? 可疑.join('\n') : '（无）');

// ── ⑤ 可编辑字数 ──
const 去占位 = (s) => s.replace(/\{\{彼方:[^}]+\}\}/g, '');
let 可编辑 = 0;
for (const 文 of [系统段, 场景段, 用户段]) 可编辑 += 去占位(文).replace(/\n/g, '').length;
console.log('');
console.log('=== ⑤ 可编辑字数 ===');
console.log('模板总长', (系统段 + 场景段 + 用户段).length, '字 | 可编辑', 可编辑, '字（身份句', 身份句.length, '+ D14 骨架', 骨架.length, '）');

writeFileSync('tests/fixtures/默认模板-方案甲.json', JSON.stringify({ 模板, 三组验证: { 默认: 全对, 生理恋爱: 全对2, 空条件: 全对3 }, 可编辑字数: 可编辑 }, null, 2));
console.log('');
console.log('=== 模板全文 ===');
console.log('--- ① 系统段 ---');
console.log(系统段);
console.log('--- ② 场景判断 ---');
console.log(场景段);
console.log('--- ③ 用户段 ---');
console.log(用户段);