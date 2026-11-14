// 剧情导演 · 提醒规则表(2026-11-12 架构深化 ③)
//
// 以前 20 条提醒规则是一条 130 行的 if 链: 加一条 = 在链中间插一段, 顺序靠读代码才知道,
// 阈值散在字面量里, 用例只能逐条抄文案。
//
// 现在规则是**数据**: 顺序写在数组里(改顺序就是改行为, 所以顺序是语义), 每条自己说清
// "什么时候响、响什么"。这个文件钉三件事:
//   ① 顺序(它决定输出行序, 也决定"先说什么");
//   ② 每条规则都能单独跑(空账本不抛错、返回数组);
//   ③ 结构提醒 === 把表按顺序跑一遍, 没有额外分支。
import { createPinia, setActivePinia } from 'pinia';
import { emptyData } from '../src/剧情导演/快照';
import { SettingsSchema } from '../src/剧情导演/schema';
import type { 导演账本 } from '../src/剧情导演/schema';
import { 结构提醒, 提醒规则表 } from '../src/剧情导演/取料';

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

const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), 已分析轮数: 10, ...部分 });

// ---------------------------------------------------------------------------
console.log('\n[1] 规则顺序就是语义(它决定输出行序)');
{
  check('规则表顺序被钉死', 提醒规则表.map(规则 => 规则.名), [
    '知情自查缺口',
    '上一道缺必演',
    '连胜无代价',
    '最近代价',
    '对手该出手',
    '未收档对抗堆积',
    '世界时间',
    '幕纲现状',
    '生活幕',
    '幕纲落后或该收章',
    '中点',
    '主角欲望判据',
    'B线缺失',
    '缺误导',
    '读者领先',
    '节奏',
    '长线回响',
    '章长度',
    '回响配额',
    '兑现条件自检',
    '矛盾久悬',
    '反转重复',
  ]);
  check('规则名不重复', new Set(提醒规则表.map(规则 => 规则.名)).size, 提醒规则表.length);
}

// ---------------------------------------------------------------------------
console.log('\n[2] 每条规则都能单独跑(空账本不抛错)');
{
  const 空 = emptyData();
  let 抛了 = '';
  for (const 规则 of 提醒规则表) {
    try {
      const 行 = 规则.生成(空, { 当前幕: 0 });
      if (!Array.isArray(行)) 抛了 = `${规则.名} 返回的不是数组`;
    } catch (error) {
      抛了 = `${规则.名} 抛错: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  check('逐条跑过都不抛错', 抛了, '');
  // 空账本不该把每一行都点着 —— 提醒太多等于没有提醒
  ok('空账本上的提醒行数很少(<6)', 结构提醒(空, 0).length < 6);
}

// ---------------------------------------------------------------------------
console.log('\n[3] 结构提醒 === 把表按顺序跑一遍(没有藏在函数体里的额外分支)');
{
  // 造一份能同时命中好几条规则的账本
  const 账 = 账本({
    章回: {
      章号: 1,
      主题: 'x',
      计划高潮: '',
      进度: '推进',
      起始场: 1,
      当前幕号: 1,
      幕纲: ['第1幕｜类型: 生活｜目标: …｜障碍: 无｜转折: …｜代价: …｜结束条件: …'],
    } as any,
    书纲: { 核心问题: 'q', 欲望: { 想要: '把妹妹带出北区' } } as any,
    冲突: [
      { 名: 'a', 阶段: '升级', 强度: 6, 最后行动幕: 0 },
      { 名: 'b', 阶段: '升级', 强度: 6, 最后行动幕: 0 },
      { 名: 'c', 阶段: '升级', 强度: 6, 最后行动幕: 0 },
    ] as any,
    读者领先: [],
    世界时间: { 天数: 3, 文本: '第1天' },
  });
  const 逐条 = 提醒规则表.flatMap(规则 => 规则.生成(账, { 当前幕: 3 }));
  const 一起 = 结构提醒(账, 3);
  check('逐条拼接 === 结构提醒', 一起, 逐条);
  ok('这份账本确实命中了好几条', 一起.length >= 4);
  // 顺序有意义: 幕纲现状必须排在中点之前(中点那条要用"现在第几幕"的上下文说话)
  const 现状 = 一起.findIndex(行 => 行.includes('本章共'));
  const 中点 = 一起.findIndex(行 => 行.includes('还没有「中点」'));
  ok('含幕纲的提醒排在中点提醒之前', 现状 >= 0 && 中点 > 现状);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
