// 剧情导演 · 提醒表按组互斥（2026-11-13 P2 2.2）+ ② 交付用例
//
// 病根：`提醒规则表` 是 22 条平铺规则，同一条事实可能被两条同时说。
// 之前"收章语义"那两条的互斥是**硬编码**在 `选收章发言者` 里的 —— 再来一组同义规则，
// 还得有人重想一遍谁让谁。现在规则自己声明 `组` / `优先级`，由 `结构提醒` 统一裁。
//
// ⚠️ 为什么另开一个文件而不是塞进 `daoyan-提醒互斥.test.ts`：
// 那个文件已经在 P0.8 定稿并被复验过，改它等于动已验收的判据。这里是**新增机制**，单独一份更清楚。
//
// ⚠️ 为什么测 `按组裁决` 这个纯函数而不是只测 `结构提醒`：
// 真实账本上很难构造"两条同组规则同时命中" —— `章长度` 内部本来就会在
// `选收章发言者 === '幕纲落后'` 时让位，所以组裁决在真账本上只是**第二层保险**。
// 不把它抽出来单独测，这条判据就只能靠"看起来对"。

import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 结构提醒, 按组裁决, 提醒规则表 } from '../src/剧情导演/提醒';
import type { 提醒规则 } from '../src/剧情导演/提醒';

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

/** 造一条只要被调用就产出 [标记] 的假规则 */
const 假规则 = (名: string, 输出: string, 组?: string, 优先级?: number): 提醒规则 => ({
  名,
  ...(组 ? { 组 } : {}),
  ...(优先级 === undefined ? {} : { 优先级 }),
  生成: () => [输出],
});

const 幕纲 = Array.from({ length: 5 }, (_, i) => `第${i + 1}幕｜类型: 事件｜目标:t`);
const 造账 = (部分: Record<string, any> = {}): 导演账本 =>
  ({
    ...emptyData(),
    已分析轮数: 40,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 1, 幕纲, 当前幕号: 5, ...部分 } as any,
  } as 导演账本);

// ---------------------------------------------------------------------------
console.log('\n[1] 按组裁决：同组只出一条，优先级大的赢；无组全出');
{
  const 甲 = 假规则('甲', 'A', 'G', 3);
  const 乙 = 假规则('乙', 'B', 'G', 2);
  const 丙 = 假规则('丙', 'C'); // 不进组
  check('同组两条只出优先级高的那条', 按组裁决([{ 规则: 乙, 行: ['B'] }, { 规则: 甲, 行: ['A'] }, { 规则: 丙, 行: ['C'] }]), ['A', 'C']);
}

console.log('\n[2] 同组同优先级 → 保留**数组里靠前**那条（顺序稳定，不靠 Map 运气）');
{
  const 甲 = 假规则('甲', 'A', 'G', 0);
  const 乙 = 假规则('乙', 'B', 'G', 0);
  check('靠前的赢', 按组裁决([{ 规则: 甲, 行: ['A'] }, { 规则: 乙, 行: ['B'] }]), ['A']);
  check('反过来也稳定（谁在前谁赢）', 按组裁决([{ 规则: 乙, 行: ['B'] }, { 规则: 甲, 行: ['A'] }]), ['B']);
  // 不填优先级 = 0，与显式 0 等价
  const 无优先级 = 假规则('无', 'X', 'G');
  check('不填优先级 = 0 → 与显式 0 平手时靠前的赢', 按组裁决([{ 规则: 无优先级, 行: ['X'] }, { 规则: 甲, 行: ['A'] }]), ['X']);
}

console.log('\n[3] 不同组的规则互不影响');
{
  const 甲 = 假规则('甲', 'A', 'G1', 1);
  const 乙 = 假规则('乙', 'B', 'G2', 9);
  check('两个组各出一条', 按组裁决([{ 规则: 甲, 行: ['A'] }, { 规则: 乙, 行: ['B'] }]), ['A', 'B']);
}

console.log('\n[4] 真表结构：收章语义那两条在组里、生活幕不在组里');
{
  const 表 = 提醒规则表;
  const 取 = (名: string) => 表.find(规则 => 规则.名 === 名)!;
  check('幕纲落后或该收章 → 组 收章语义 / 优先级 3', [取('幕纲落后或该收章').组, 取('幕纲落后或该收章').优先级], ['收章语义', 3]);
  check('章长度 → 组 收章语义 / 优先级 2', [取('章长度').组, 取('章长度').优先级], ['收章语义', 2]);
  check('生活幕**不进组**（它解释"为什么幕型不生效"，不是催收章）', 取('生活幕').组, undefined);
  ok('其余规则默认都不进组', 表.filter(规则 => 规则.组).length === 2);
}

console.log('\n[5] 真账本：收章语义那一轮只出一条（组裁决 + 内部让位都不许漏）');
{
  for (const 幕号 of [3, 5]) {
    for (const 轮 of [39, 40, 41]) {
      const 行 = 结构提醒(造账({ 当前幕号: 幕号, 起始场: 1 }), 轮 + 1);
      const 收章条 = 行.filter(x => /该收章|收束预算|开新章|演了 \d+ 场|已演 \d+ 场/.test(x));
      ok(`幕号 ${幕号}/5 · 场 ${轮 + 1} → 收章语义条数 ${收章条.length}（<=1）`, 收章条.length <= 1);
    }
  }
}

console.log('\n[6] 顺序稳定：同一账本连调两次，结果逐字相同');
{
  const 账 = 造账({ 进度: '收束', 收束起始场: 34 } as any);
  const 甲 = 结构提醒(账, 41);
  const 乙 = 结构提醒(账, 41);
  check('两次结果逐字相同', 甲, 乙);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
