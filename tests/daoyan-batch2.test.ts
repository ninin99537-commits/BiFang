// 剧情导演 · 批次二（D 冷启动提示同源 / E 配置化 / 代码调整上面板 / 弧线终态枚举化）
//
// 覆盖 dsh 的《批次二审查清单》要求钉住的用例：
//   D: 冷启动提示与 I 状态条同源（同一处状态判断）/ 状态条优先级不回退
//   E: 接管轮数与张力阈值配置化（默认值、旧设置补默认、改值后行为随之变化）
//   代码调整上面板: 只读 指令.代码调整、无触发不渲染、零行为
//   弧线终态枚举化: 枚举是单一事实源 / 非枚举值归一或兜底且不崩 / 老账本迁移 / 提示词同步
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本, 弧线 } from '../src/剧情导演/schema';
import { SettingsSchema, 弧线阶段列表 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 应用引擎输出 } from '../src/剧情导演/账本数据';
import { 构造本幕指令, type 核验结果 } from '../src/剧情导演/引擎规则';
import { 归一弧线阶段, 规范化条目, 取层 } from '../src/剧情导演/字段表';
import promptSource from '../src/剧情导演/prompts.ts?raw';
import schemaSource from '../src/剧情导演/schema.ts?raw';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;
import 运行状态源码 from '../src/剧情导演/球状态.ts?raw';
import snapshotSource from '../src/剧情导演/快照.ts?raw';
import 迁移源码 from '../src/剧情导演/账本迁移.ts?raw';
import engineSource from '../src/剧情导演/引擎规则.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
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

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}
const 核验已执行: 核验结果 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
/** 造一个"已经过了冷启动、没有触发条件"的账本 */
function 平静账本(部分: Partial<导演账本> = {}): 导演账本 {
  return 账本({ 已分析轮数: 9, ...部分 });
}
function 装配(账: 导演账本, 下一幕节拍: string, 额外: Record<string, any> = {}) {
  return 构造本幕指令({
    旧指令: null,
    下一幕: { 节拍: 下一幕节拍 },
    账本: 账,
    核验: 核验已执行,
    档位: 3,
    红线: [],
    楼层: 12,
    暂停注入: false,
    ...额外,
  });
}
function 弧(阶段: any): 弧线 {
  return 规范化条目<弧线>(取层('弧线'), { 角色: '甲', 缺口: '缺了什么', 阶段, 下一步契机: '' });
}

// ---------------------------------------------------------------------------
console.log('\n[E] 配置化: 默认值 / 旧设置补默认 / 越界夹取');
{
  const 空 = SettingsSchema.parse({});
  check('E: 全新设置 → 接管轮数默认 4', 空.导演.接管轮数, 4);
  check('E: 全新设置 → 张力阈值默认 3/3', [空.导演.连续高阈值, 空.导演.连续低阈值], [3, 3]);

  // 老设置(批次一之前存的全局变量)没有这三个字段 → zod default 补齐, 已有值不被动
  const 旧设置 = SettingsSchema.parse({ 导演: { 强度档位: 2, 更新频率: 2, 红线: ['主角不死'] } });
  check('E: 旧设置缺新字段 → 补默认(不崩)', [旧设置.导演.接管轮数, 旧设置.导演.连续高阈值, 旧设置.导演.连续低阈值], [4, 3, 3]);
  check('E: 旧设置已有值不被覆盖', [旧设置.导演.强度档位, 旧设置.导演.更新频率, 旧设置.导演.红线], [2, 2, ['主角不死']]);

  const 越界 = SettingsSchema.parse({ 导演: { 接管轮数: 99, 连续高阈值: 0, 连续低阈值: -5 } });
  check('E: 接管轮数夹到 1~20', 越界.导演.接管轮数, 20);
  check('E: 阈值夹到 1~10', [越界.导演.连续高阈值, 越界.导演.连续低阈值], [1, 1]);
  const 小数 = SettingsSchema.parse({ 导演: { 接管轮数: 3.7, 连续高阈值: 2.2 } });
  check('E: 非整数被取整', [小数.导演.接管轮数, 小数.导演.连续高阈值], [4, 2]);
}

console.log('\n[E] 行为随配置变化: 接管轮数（冷启动判定不再硬编码 4）');
{
  const 三轮 = 账本({ 已分析轮数: 3 });
  check('E: 接管轮数=4 → 第 3 轮不下令', 装配(三轮, '受挫', { 接管轮数: 4 }).指令, null);
  ok('E: 接管轮数=2 → 第 3 轮已下令', !!装配(三轮, '受挫', { 接管轮数: 2 }).指令);
  check('E: 接管轮数=5 → 第 3 轮仍不下令', 装配(三轮, '受挫', { 接管轮数: 5 }).指令, null);
  check('E: 不传接管轮数 → 兜底 4（老调用点不回归）', 装配(三轮, '受挫').指令, null);

  const 首轮 = 账本({ 已分析轮数: 1 });
  ok('E: 接管轮数=1 → 首轮就下令', !!装配(首轮, '受挫', { 接管轮数: 1 }).指令);
  check('E: 接管轮数=2 → 首轮不下令', 装配(首轮, '受挫', { 接管轮数: 2 }).指令, null);
}

console.log('\n[E] 行为随配置变化: 张力阈值');
{
  // 连续 3 幕高张力(用"受挫"凑, 避开"高潮后必有代价"那条独立规则)
  const 高张 = 平静账本({ 张力: { ...emptyData().张力, 最近节拍: ['受挫', '受挫', '受挫'] } });
  const 高阈2 = 装配(高张, '小胜', { 阈值: { 高: 2, 低: 3 } });
  check('E: 连续高张力 ≥ 阈值(2) → 强制余波', 高阈2.指令?.节拍, '余波');
  ok('E: 调整里有张力曲线记录', (高阈2.指令?.代码调整 ?? []).some(项 => 项.includes('张力曲线')));

  const 高阈5 = 装配(高张, '小胜', { 阈值: { 高: 5, 低: 3 } });
  check('E: 阈值调高 → 不插手(仍是引擎要的节拍)', 高阈5.指令?.节拍, '小胜');
  ok('E: 阈值调高后没有张力曲线记录', !(高阈5.指令?.代码调整 ?? []).some(项 => 项.includes('张力曲线')));

  const 低张 = 平静账本({ 张力: { ...emptyData().张力, 连续低张力: 3 } });
  const 低阈2 = 装配(低张, '小胜', { 阈值: { 高: 3, 低: 2 } });
  check('E: 连续低张力 ≥ 阈值(2) → 安排山雨欲来(阴影)', 低阈2.指令?.节拍, '阴影');
  const 低阈5 = 装配(低张, '小胜', { 阈值: { 高: 3, 低: 5 } });
  check('E: 低阈值调高 → 不插手', 低阈5.指令?.节拍, '小胜');

  check('E: 不传阈值 → 兜底 3/3（老调用点不回归）', 装配(高张, '小胜').指令?.节拍, '余波');
}

// ---------------------------------------------------------------------------
console.log('\n[弧线枚举] 枚举是单一事实源 + 自由文本归一（不崩）');
{
  check('弧线: 枚举取值 = 初始/裂缝/挣扎/抉择/蜕变/闭环', [...弧线阶段列表], ['初始', '裂缝', '挣扎', '抉择', '蜕变', '闭环']);
  check('弧线: 枚举内原样保留', 弧('挣扎').阶段, '挣扎');
  check('弧线: 枚举内终态保留(闭环)', 弧('闭环').阶段, '闭环');

  // 老账本自由文本 → 关键词归一（dsh 审定的映射规则）
  check('弧线: "已完成" → 闭环', 弧('已完成').阶段, '闭环');
  check('弧线: "已经完成" → 闭环', 弧('已经完成').阶段, '闭环');
  // 2026-11-12 缺陷修复（需求方探针）：以前这条样本用「接近闭环」。
  // 「接近」不是完成 —— 判成终态会让一条还在演的弧线被归档、再也不出现在候选里。
  check('弧线: "接近闭环" → 不是闭环（接近性守卫）', 弧('接近闭环').阶段 === '闭环', false);
  check('弧线: "已进入蜕变期" → 蜕变', 弧('已进入蜕变期').阶段, '蜕变');
  check('弧线: "面临重大抉择" → 抉择', 弧('面临重大抉择').阶段, '抉择');
  check('弧线: "内心挣扎中" → 挣扎', 弧('内心挣扎中').阶段, '挣扎');
  check('弧线: "出现裂缝" → 裂缝', 弧('出现裂缝').阶段, '裂缝');
  check('弧线: "达成" → 闭环', 弧('达成').阶段, '闭环');

  // 否定守卫 + 兜底: 归不了的一律 初始(非终态, 不误淘汰能演的弧线)
  check('弧线: "尚未完成" → 初始(否定守卫)', 弧('尚未完成').阶段, '初始');
  check('弧线: "没有闭环" → 初始(否定守卫)', 弧('没有闭环').阶段, '初始');
  check('弧线: 乱写 → 兜底 初始', 弧('随便写点什么').阶段, '初始');
  check('弧线: 缺字段 → 初始(不崩)', 弧(undefined).阶段, '初始');
  check('弧线: 空串 → 初始(不崩)', 弧('').阶段, '初始');
  check('弧线: 数字 → 初始(不崩)', 弧(42).阶段, '初始');
  check('弧线: 映射函数对 undefined 不炸', 归一弧线阶段(undefined as any), '');

  // 终态判定: 归一后才判"闭环", 所以自由文本里**真的写完成**的也能被淘汰(不再永不淘汰)。
  // 2026-11-12: 样本从「接近闭环」换成「已经完成」—— 前者是"接近"，不是完成，不该被淘汰。
  const 条目 = 弧('已经完成');
  ok('弧线: 归一后终态判定生效(可淘汰)', 条目.阶段 === '闭环');
  check('弧线: 非终态不判终态', 取层('弧线').终态(弧('挣扎')), false);
}

console.log('\n[弧线枚举] 提示词同步 + 老账本迁移');
{
  // 提示词里是**插值**(?raw 读到的是模板原文, 拿不到展开后的值) → 断言"来自单一事实源"而不是断言字面量
  ok('prompts: 阶段枚举从 schema 单一事实源插值', promptSource.includes('弧线阶段列表.join'));
  ok('prompts: 明确禁止自造阶段名', promptSource.includes('不许自造'));
  ok('schema: 弧线阶段列表 是导出常量(唯一来源)', schemaSource.includes('export const 弧线阶段列表'));

  // 迁移路径 1: 引擎一轮过账后, 老账本里"引擎本轮没提到的"弧线也会被规范化(不再带自由文本进终态判定)
  const 旧账 = 账本({ 弧线: [{ 角色: '甲', 缺口: '缺', 阶段: '已经完成' as any, 下一步契机: '' }] });
  const 新账 = 应用引擎输出(旧账, { 弧线: [] }, 1).账本;
  // 阶段 A/B 起: 终态条目(归一后 = 闭环)**归档进历史档案**而不是留在活跃工作集。
  // 所以"没被丢掉"要同时看活跃区与档案区 —— 旧断言只看 新账.弧线.length, 那是在验"终态还赖在活跃集里",
  // 恰好与新纪律相反(未结束的不许丢, 已终态的进档案)。
  const 弧线全在 = [...新账.弧线, ...新账.历史档案.弧线];
  check('迁移: 老弧线条目没被丢掉', 弧线全在.length, 1);
  check('迁移: 老自由文本阶段归一到枚举', 弧线全在[0].阶段, '闭环');
  check('迁移: 归一为终态 → 进历史档案(活跃工作集不再留它)', [新账.弧线.length, 新账.历史档案.弧线.length], [0, 1]);

  // 迁移路径 2: 装载(删楼回退/重开)走 sanitizeSnapshot, 同样对弧线做 规范化条目
  ok('迁移: 快照装载路径对弧线做规范化', 迁移源码.includes("规范化条目<弧线>(取层('弧线'), x)"));
}

// ---------------------------------------------------------------------------
console.log('\n[D] 冷启动提示与状态条同源（面板不再各写一套）');
{
  ok('D: 冷启动提示从状态条派生(同一处判断)', vueSource.includes("状态条.value.级别 === 'cold'"));
  ok('D: 面板不再自己算冷启动', !vueSource.includes('账本.value.已分析轮数 < 接管轮数'));
  ok('D: 冷启动提示定义在状态条之后(派生视图)', vueSource.indexOf('const 冷启动提示') > vueSource.indexOf('const 状态条'));
  ok('D: 冷启动文案含轮数进度', 运行状态源码.includes('轮起编排本幕'));
  ok('D: 接管轮数取自设置(E 接线)', vueSource.includes('设置.value.导演.接管轮数'));
  // I 的优先级不回退: 剧终 > 离线 > 冷启动 > 运行中
  ok('D/I: 状态条优先级未回退(剧终最先判)', vueSource.indexOf("'over'") < vueSource.indexOf("'cold'"));
  ok('D/I: 离线判断在冷启动之前', vueSource.indexOf('离线.value.自动暂停') < vueSource.indexOf("'cold'"));
}

console.log('\n[代码调整上面板] 只读 · 无触发不留空块 · 零行为');
{
  ok('面板: 渲染本轮代码规则触发', vueSource.includes('本轮代码规则触发'));
  ok('面板: 无触发不渲染(v-if 长度)', vueSource.includes('v-if="代码调整.length"'));
  ok('面板: 数据源是 指令.代码调整(只读)', vueSource.includes('账本.value.当前指令?.代码调整'));
  ok('零行为: 引擎规则仍把 调整 写进 指令.代码调整', engineSource.includes('代码调整: 调整'));
  ok('面板: 样式已定义', vueSource.includes('.dj-adjust-list'));

  const 结果 = 装配(平静账本({ 张力: { ...emptyData().张力, 最近节拍: ['受挫', '受挫', '受挫'] } }), '小胜', { 阈值: { 高: 2, 低: 3 } });
  ok('面板数据同源: 被触发时 指令.代码调整 非空', (结果.指令?.代码调整 ?? []).length > 0);
  const 无触发 = 装配(平静账本(), '小胜');
  check('面板数据同源: 无触发时为空数组(面板不渲染)', 无触发.指令?.代码调整 ?? [], []);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
