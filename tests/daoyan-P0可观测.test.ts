// 剧情导演 · P0 可观测性四条（2026-11-14 事故后**重写版**，非原件）
//
// 同一个病：**代码在用一个「界面/提示词里看不见的单位」做裁决**。
//   P0-1 更新频率其实是节奏总旋钮     → 用户读成性能项
//   P0-2 世界时间被用来算「多久没动手」 → 面板 0 处显示
//   P0-3 场数被用来催收章             → 面板没有计数器
//   P0-4 代码拿场数当硬阈值           → 提示词没说（这条的观众是导演，不是用户）
//
// 面板是 .vue，tests/build.mjs 没有 .vue loader → 做**源码断言**（不能 import .vue）。
// ⚠️ 事故前这份是 37 条；本条按当时的断言构成重写，逐字不复现。
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 本章进度文本, 章长度阈值, 收束已用场数, 世界时间天数 } from '../src/剧情导演/提醒';
import { 收束预算场 } from '../src/剧情导演/字段表';

(globalThis as any)._ = {
  clamp: (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
  cloneDeep: (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + '\n        期望 ' + JSON.stringify(expected) + '\n        实际 ' + JSON.stringify(actual)); }
}
function ok(label: string, cond: boolean) { check(label, !!cond, true); }

const 账本 = (章回: any): 导演账本 => ({ ...emptyData(), 已分析轮数: 20, 章回 } as 导演账本);
/** 世界时间专用：`账本()` 的第一个参数是**章回**，别把世界时间传进去（重写时踩过：世界时间成了章回 → 天数恒 0）。 */
const 账本带世界 = (天数: any, 轮数 = 20): 导演账本 => ({ ...emptyData(), 已分析轮数: 轮数, 世界时间: { 天数, 文本: '' } } as any);
const 面板源 = readFileSync('src/剧情导演/悬浮球界面.vue', 'utf8');
const 提示源 = readFileSync('src/剧情导演/prompts.ts', 'utf8');

/** 只剥「整行注释」+「行尾 // 后的尾巴」。
 *  ⚠️ 不许用 /\/\*[\s\S]*?\*\//g：`accept="image/*"` 会被当成块注释开头，从这里吃掉 122 行真代码。
 *  ⚠️ 行尾那一刀必须留：否则「真调用删掉 + 行尾留一句 // TODO 本该调 函数X(」能把「调用数 ≥1」骗成绿。 */
const 面板源无注释 = 面板源
  .split('\n')
  .filter(行 => !/^\s*(\/\/|\/\*|\*|<!--)/.test(行))
  .map(行 => {
    const m = /(^|[^:])\s*\/\//.exec(行);
    return m ? 行.slice(0, m.index + (m[1] ? 1 : 0)) : 行;
  })
  .join('\n');

// ---------------------------------------------------------------------------
console.log('\n[P0-3] 本章进度文本：算式与 章长度提醒 同源（含那个 +1）');
{
  check('推进中：当前场 20、起始场 1 → 「本章已演 20 场」（+1 不能漏，漏了会算成 19）', 本章进度文本(账本({ 进度: '推进', 起始场: 1 }), 20), '本章已演 20 场');
  check('起始场缺失 → null（面板不显示，不能显示 0/负数）', 本章进度文本(账本({ 进度: '推进' }), 20), null);
  check('起始场 0 → null（同上）', 本章进度文本(账本({ 进度: '推进', 起始场: 0 }), 20), null);
  const 收 = 本章进度文本(账本({ 进度: '收束', 起始场: 15, 收束起始场: 16 }), 20);
  ok('收束态 → 走 收束已用场数（实际: ' + 收 + '）', /^收束已用 \d+\/8 场$/.test(String(收)));
  check('收束态的数字 = 收束已用场数(账本,20) 与预算 8', 收, '收束已用 ' + 收束已用场数(账本({ 进度: '收束', 起始场: 15, 收束起始场: 16 }), 20) + '/' + 收束预算场 + ' 场');
}

console.log('\n[P0-3] 面板只调它，**不许在 .vue 里重写算式**');
{
  ok('vue import 了 本章进度文本', /import\s*\{[^}]*本章进度文本[^}]*\}\s*from\s*'\.\/提醒'/.test(面板源无注释));
  ok('vue 有 computed 本章进度', /const 本章进度 = computed/.test(面板源无注释));
  ok('**.vue 里没有 起始场 参与算术**（没有第二份实现）', !/起始场/.test(面板源无注释));
  ok('vue 里没有出现 章长度阈值 的本地算式', !/章长度阈值/.test(面板源无注释));
  const 行 = 面板源无注释.split('\n').find(l => l.includes('本章进度文本(账本.value'));
  ok('找到调用点那一行', !!行);
  ok('面板传的实参不 +1（面板跑在落盘之后，账本已含本轮）', !!行 && !/本章进度文本\([^)]*\+\s*1/.test(String(行)));
}

console.log('\n[P0-2] 世界时间上面板：天数走取整函数、文本照常渲染、且只读');
{
  ok('模板里出现 账本.世界时间', 面板源无注释.includes('账本.世界时间'));
  const 插值裸天数 = [...面板源无注释.matchAll(/\{\{[^}]*\}\}/g)].filter(m => /世界时间\.天数/.test(m[0]));
  check('① 模板插值里不出现 世界时间.天数（裸插值 = 浮点尾巴直接上屏）', 插值裸天数.length, 0);
  const 调用数 = (面板源无注释.match(/世界时间天数\s*\(/g) || []).length;
  ok('② .vue 里调用了 世界时间天数(（实测 ' + 调用数 + ' 处）', 调用数 >= 1);
  ok('③ 仍然渲染了 文本（防顺手删掉）', /账本\.世界时间\.文本/.test(面板源无注释));
  ok('④ import 了 世界时间天数', /import\s*\{[^}]*世界时间天数[^}]*\}\s*from\s*'\.\/提醒'/.test(面板源无注释));
  const 段起 = 面板源无注释.indexOf('dj-desk-sub');
  const 段 = 面板源无注释.slice(段起, 段起 + 400);
  ok('这一行是只读（段内没有 v-model）', !/v-model/.test(段));
}

console.log('\n[P0-1] 更新频率的文案说清它是节奏总旋钮');
{
  const i = 面板源无注释.indexOf('推进间隔(每 N 条回复推进一次)');
  ok('标签改名成「推进间隔…」', i > 0);
  const 段 = 面板源无注释.slice(Math.max(0, i - 300), i + 500);
  ok('① 出现「节奏」', 段.includes('节奏'));
  ok('② 出现「推进」或「快慢」', 段.includes('推进') || 段.includes('快慢'));
  ok('③ 不出现「每轮」「每次」（那是复述执行频率）', !段.includes('每轮') && !段.includes('每次'));
}

console.log('\n[P0-4] 提示词告诉导演：场数由代码计量、什么时候会被催');
{
  const i = 提示源.indexOf('场数由**代码**数');
  ok('有「场数由代码数」这句', i > 0);
  const 段 = 提示源.slice(Math.max(0, i - 400), i + 300);
  ok('说了「场」', 段.includes('场'));
  ok('说了「代码」', 段.includes('代码'));
  ok('说了会被催收章', 提示源.includes('代码会直接提醒"该收章了"'));
  ok('章长度阈值仍是 40（没被顺手改）', 提示源.includes('整章超过 40 场') && 章长度阈值 === 40);
}

console.log('\n[P1-8] 红线：可以决定后果，不许替玩家演');
{
  ok('有「不许替玩家演」这条红线', 提示源.includes('不许替玩家演'));
  ok('禁止的是 行动/决定/心理/台词', 提示源.includes('**行动、决定、心理活动、台词**'));
  ok('**没有**削弱反迎合：仍写着「可以决定**后果**」', 提示源.includes('可以决定**后果**'));
  ok('「主角、配角、恋爱对象都可以失败、死亡、离开」仍在', 提示源.includes('主角、配角、恋爱对象都可以失败、死亡、离开'));
}

console.log('\n[补1] 世界时间天数 取整（真机 67.32200000000002 不能原样上屏）');
{
  check('67.32200000000002 → 67', 世界时间天数(账本带世界(67.32200000000002)), 67);
  check('负数 → 0（不显示负数天）', 世界时间天数(账本带世界(-3)), 0);
  check('空账本 → 0（防空跑）', 世界时间天数(账本带世界(undefined)), 0);
  check('0.4 → 0', 世界时间天数(账本带世界(0.4)), 0);
}

console.log('\n[补2] 收束态 + 收束起始场 缺失（A 方案，真机默认情况）');
{
  const 缺 = 本章进度文本(账本({ 进度: '收束', 起始场: 15 }), 20);
  ok('显示整章场数 + 标注收束中，不是假的 0/8（实际: ' + 缺 + '）', /^本章已演 \d+ 场（收束中）$/.test(String(缺)));
  ok('绝不出现 0/', !String(缺).includes('0/'));
  const 对照 = 本章进度文本(账本({ 进度: '收束', 起始场: 15, 收束起始场: 71 }), 78);
  ok('对照：收束起始场=71 → 走收束口径（实际: ' + 对照 + '）', /^收束已用 8\/8 场$/.test(String(对照)));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
