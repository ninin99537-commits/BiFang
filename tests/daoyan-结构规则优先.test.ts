// 剧情导演 · 「结构规则优先」开关（2026-11-13）
//
// 病根（真机 113 快照实测，需求方给的数）:
//   `硬性要求` 非空率 **94.7%** → `引擎规则.导演有明确意图` 恒真 →
//   张力曲线 / 契诃夫之枪 / 收束调度 / 高潮后代价 **0 次生效** →
//   78 场里 59 场余波 + 11 场日常 = **89.7% 是没有张力的戏**。
//
// 但"直接删豁免"也是错的：代码的机械规则会盖掉导演对因果的判断（玩家刚做了关键选择那类）。
// 所以做成开关：
//   · true(默认) → 四条规则照样生效；代码改节拍，并把"导演原拟 X → 改成 Y，因为 Z"写进 `代码调整`
//     （导演的意图**不丢**，由拒绝回路下一轮回执）。
//   · false     → **逐字**回到老行为（导演有明确要求就保留其节拍，只留一条建议）。
//
// 本用例钉的就是这两条，外加"回退路径不许坏"。

import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { SettingsSchema } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 构造本幕指令 } from '../src/剧情导演/引擎规则';

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
const 伏笔 = (部分: Record<string, any>): any => ({
  编号: 1, 内容: 'x', 埋设层: 1, 埋设章: 1, 状态: '发酵', 回收窗口: '', 关联冲突: '',
  公开线头: '', 埋设证据: [], 中间回响: [], 兑现证据: [], 知情角色: [], 关联角色: [],
  目标窗口: null, 兑现条件: [], 候选兑现: [], 误导说明: '', 误导证据: [], 跨度: '中', ...部分,
});

/** 连续 3 幕高张力 → 张力曲线该出「余波」 */
const 高张力账 = (): 导演账本 =>
  ({
    ...emptyData(),
    已分析轮数: 9,
    章回: { 章号: 3, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 1, 幕纲: ['第1幕｜类型: 事件｜目标:a'], 当前幕号: 1 } as any,
    张力: { 当前: 9, 距上次高潮楼层: 0, 连续低张力: 0, 最近节拍: ['高潮', '高潮', '高潮'] },
  } as 导演账本);

/** 导演有明确意图（这就是真机上 94.7% 的常态） */
const 有意图 = (节拍: string) => ({ 节拍, 硬性要求: '玩家刚救了她的命, 这一幕演他们的对话' });

const 造 = (结构规则优先: boolean | undefined, 账本 = 高张力账(), 下一幕 = 有意图('受挫')) =>
  构造本幕指令({
    旧指令: null,
    下一幕,
    账本,
    核验: 核验 as any,
    档位: 3,
    红线: [],
    楼层: 40,
    暂停注入: false,
    ...(结构规则优先 === undefined ? {} : { 结构规则优先 }),
  });

// ---------------------------------------------------------------------------
console.log('\n[1] 开关 true（默认）: 有明确意图也照样改节拍，并把"导演原拟"写进代码调整');
{
  const 开 = 造(true);
  check('节拍被改成「余波」（不再让位）', 开.指令?.节拍, '余波');
  const 调整 = (开.指令?.代码调整 ?? []).join(' | ');
  ok('代码调整里有"导演原拟「受挫」"', 调整.includes('导演原拟「受挫」'));
  ok('代码调整里说清了改成什么', 调整.includes('余波'));
  ok('代码调整里给了原因（连续 3 幕高张力）', 调整.includes('连续 3 幕高张力'));
  ok('导演的意图没有丢（说明它进了回执而不是被删）', 调整.includes('记入本轮回执'));

  // 不传这个参数时，默认值必须是 true（生产默认；也让新调用点不会默默退回老行为）
  const 缺省 = 造(undefined);
  check('不传参数 → 与 true 行为一致（默认 true）', 缺省.指令?.节拍, '余波');
}

console.log('\n[2] 开关 false: 逐字回到老行为（保留导演节拍，只留一条建议）');
{
  const 关 = 造(false);
  check('节拍保持导演的「受挫」', 关.指令?.节拍, '受挫');
  const 调整 = (关.指令?.代码调整 ?? []).join(' | ');
  ok('提示词是老文案（"保留其节拍"）', 调整.includes('保留其节拍「受挫」'));
  ok('老路径不出现"导演原拟"', !调整.includes('导演原拟'));
}

console.log('\n[3] 四条规则逐条核（不许只改张力曲线）');
{
  // ① 张力曲线·高（上面已覆盖）
  check('① 张力曲线·高 → 余波', 造(true, 高张力账()).指令?.节拍, '余波');

  // ② 张力曲线·低 → 阴影
  const 低账 = { ...emptyData(), 已分析轮数: 9, 章回: { 章号: 3, 进度: '推进' } as any,
    张力: { 当前: 2, 距上次高潮楼层: 9, 连续低张力: 3, 最近节拍: ['日常', '日常', '日常'] } } as 导演账本;
  check('② 张力曲线·低 → 阴影', 造(true, 低账, 有意图('小胜')).指令?.节拍, '阴影');

  // ③ 高潮后必有代价（上一幕是高潮 + 档位 3）
  const 代价账 = { ...emptyData(), 已分析轮数: 9, 章回: { 章号: 3, 进度: '推进' } as any,
    张力: { 当前: 8, 距上次高潮楼层: 0, 连续低张力: 0, 最近节拍: ['受挫', '反转', '高潮'] } } as 导演账本;
  check('③ 高潮后代价 → 余波', 造(true, 代价账, 有意图('小胜')).指令?.节拍, '余波');

  // ④ 契诃夫之枪（最迟窗口已到 → 兑现伏笔）
  const 兑现账 = { ...emptyData(), 已分析轮数: 9,
    章回: { 章号: 5, 进度: '推进' } as any,
    伏笔: [伏笔({ 编号: 5, 内容: '玉佩', 目标窗口: { 最早章: 3, 最迟章: 4 } })] } as 导演账本;
  const 兑现 = 造(true, 兑现账, 有意图('刻画'));
  check('④ 契诃夫 → 兑现伏笔', 兑现.指令?.节拍, '兑现伏笔');
  ok('④ 代码调整里有"导演原拟「刻画」"', (兑现.指令?.代码调整 ?? []).join(' | ').includes('导演原拟「刻画」'));

  // ⑤ 收束调度（章回收束 + 有候选）
  const 收束账 = { ...emptyData(), 已分析轮数: 9,
    章回: { 章号: 5, 进度: '收束', 起始场: 1, 幕纲: ['第1幕｜类型: 事件｜目标:a'] } as any,
    伏笔: [伏笔({ 编号: 2, 内容: '密信', 目标窗口: { 最早章: 4, 最迟章: 6 } })] } as 导演账本;
  check('⑤ 收束调度 → 兑现伏笔', 造(true, 收束账, 有意图('反转')).指令?.节拍, '兑现伏笔');
}

console.log('\n[4] 设置项本身：默认 true、可配、老设置没有这个键也拿得到 true');
{
  check('默认值 = true', SettingsSchema.parse({}).导演.结构规则优先, true);
  check('可配 false', SettingsSchema.parse({ 导演: { 结构规则优先: false } }).导演.结构规则优先, false);
  // 老设置（根本没有这个键）→ 迁移后必须是 true
  const 老设置 = { 导演: { 接管轮数: 6, 连续高阈值: 4, 连续低阈值: 2 } };
  check('老设置缺这个键 → 默认 true', SettingsSchema.parse(老设置).导演.结构规则优先, true);
  ok('老设置的其它键没被顺手改掉', SettingsSchema.parse(老设置).导演.接管轮数 === 6);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
