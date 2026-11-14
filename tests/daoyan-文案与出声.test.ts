// 剧情导演 · 批次A（提示词文案）+ 批次B（出声）—— 2026-11-13
//
// A（只改 prompts.ts，零行为变更）：三处自相矛盾/说假话的文案，各自只留**一种**说法。
// B（不改行为、不拦整轮）：① 世界时间两样都没给 → 走既有 `沿用` 通道记一条；
//                          ② 幕纲里没有「生活」幕 / 幕纲数不在 3~5 → 出声。
//
// 判据（需求方给的）：
//   A：grep `再 3 轮`、`刷掉`、`每章 3 条`，每个短语只在新说法里出现一次。
//   B：反例账本能触发；正常账本不刷屏（同一轮同一条只说一次）；**不许拦整轮**。
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 应用引擎输出 } from '../src/剧情导演/账本数据';
import { 结构提醒 } from '../src/剧情导演/提醒';

(globalThis as any)._ = {
  clamp: (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
  cloneDeep: (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

const 核验 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
const 计 = (文本: string, 词: string) => 文本.split(词).length - 1;

// ---------------------------------------------------------------------------
console.log('\n[A] 提示词三处：每种说法只留一种');
{
  const 源 = readFileSync('src/剧情导演/prompts.ts', 'utf8');
  // ① 「刷掉」是假话（回响是增量并集）—— 新说法里只剩一句否定式，不许再出现第二处
  ok('「刷掉」全文 ≤1 处，且是否定式（不会刷掉）', 计(源, '刷掉') <= 1 && 源.includes('不会把旧回响刷掉'));
  ok('新说法讲清了机制（增量并集）', 源.includes('增量并集'));
  // ② 时间轴只剩一条：从第一次没演出来起算 → 第 2 轮既成事实 → 第 3 轮撤下
  check('旧说法「再 3 轮」已清零', 计(源, '再 3 轮'), 0);
  ok('新时间轴在（起算点写清）', 源.includes('从它第一次没演出来起算'));
  ok('第 2 轮 = 既成事实', 源.includes('第 2 轮改写成「开场既成事实」'));
  ok('第 3 轮 = 撤下交回', 源.includes('第 3 轮就**把它撤下、交回你重新安排**'));
  // ③ 两个数的关系：3 是目标、6 是代码唯一会查的那档、代码不按章计数
  ok('写明「代码唯一会查的那一档」', 源.includes('代码唯一会查的那一档'));
  ok('写明「代码不按章计数」', 源.includes('代码**不按章计数**'));
  ok('「每章 3 条」只出现一次', 计(源, '每章 3 条') <= 1);
}

// ---------------------------------------------------------------------------
console.log('\n[B1] 世界时间：两样都没给 → 沿用通道记一条；给了 → 不记');
{
  const 旧 = (): 导演账本 => ({ ...emptyData(), 已分析轮数: 9, 世界时间: { 天数: 30, 文本: '深秋' } } as 导演账本);
  const 跑 = (载荷: any) => 应用引擎输出(旧(), { 上一幕核验: 核验, 下一幕: { 节拍: '受挫' }, ...载荷 }, 20, {});

  const 都没给 = 跑({});
  ok('都没给 → 沿用 里有「世界时间 时间推进天数/当前时间」', 都没给.沿用.includes('世界时间 时间推进天数/当前时间'));
  check('行为不变：天数没动', 都没给.账本.世界时间?.天数, 30);
  check('行为不变：文本沿用', 都没给.账本.世界时间?.文本, '深秋');

  const 给了 = 跑({ 时间推进天数: 2, 当前时间: '初冬' });
  ok('给了两样 → 不记这条', !给了.沿用.includes('世界时间 时间推进天数/当前时间'));
  check('给了 → 天数累加', 给了.账本.世界时间?.天数, 32);
  check('给了 → 文本取新的', 给了.账本.世界时间?.文本, '初冬');

  const 只给推进 = 跑({ 时间推进天数: 1 });
  ok('只给推进天数 → 不记（有一条给了就不算漏）', !只给推进.沿用.includes('世界时间 时间推进天数/当前时间'));
  ok('只给推进天数 → 不拦这一轮（照常出结果）', 只给推进.账本.世界时间?.天数 === 31);
}

console.log('\n[B2] 幕纲：没有生活幕 / 幕数不在 3~5 → 出声（不拦、不刷屏）');
{
  const 幕 = (n: number, 含生活: boolean) =>
    Array.from({ length: n }, (_, i) => `第${i + 1}幕｜类型: ${含生活 && i === 1 ? '生活' : '事件'}｜目标:${i}`);
  const 账 = (幕纲: string[]): 导演账本 =>
    ({ ...emptyData(), 已分析轮数: 9, 章回: { 章号: 1, 进度: '推进', 幕纲, 当前幕号: 1 } as any } as 导演账本);

  const 无生活 = 结构提醒(账(幕(4, false)), 9);
  ok('没有生活幕 → 提一句', 无生活.some(x => x.includes('没有一幕是「生活」')));
  const 只一条 = 无生活.filter(x => x.includes('没有一幕是「生活」')).length;
  check('同一轮只说一次（不刷屏）', 只一条, 1);

  const 有生活 = 结构提醒(账(幕(4, true)), 9);
  ok('有生活幕 → 不提', !有生活.some(x => x.includes('没有一幕是「生活」')));

  const 太少 = 结构提醒(账(幕(2, true)), 9);
  ok('幕纲 2 幕 → 提"不在 3~5"', 太少.some(x => x.includes('不在 3~5 的常规区间')));
  const 太多 = 结构提醒(账(幕(6, true)), 9);
  ok('幕纲 6 幕 → 提"不在 3~5"', 太多.some(x => x.includes('不在 3~5 的常规区间')));
  const 正常 = 结构提醒(账(幕(4, true)), 9);
  ok('幕纲 4 幕 → 不提区间', !正常.some(x => x.includes('不在 3~5 的常规区间')));

  // 反例（一票否决）：出声不许变成"拦下整轮"
  const 应用 = 应用引擎输出(账(幕(2, false)), { 上一幕核验: 核验, 下一幕: { 节拍: '受挫' } }, 20, {});
  ok('不拦整轮：仍然正常返回账本', !!应用.账本);
  ok('不拦整轮：没有因为幕纲被拒', !应用.拒绝.some(x => x.includes('幕纲')));
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
