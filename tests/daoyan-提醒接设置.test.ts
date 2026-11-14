// 剧情导演 · 提醒必须读用户设置的两个阈值（2026-11-13 批 C · 判据 ⑪a / ⑪b）
//
// 病根：提醒侧以前写死 —— 高阈用「连续高阈值默认」（至少还是常量），
// **低阈直接写字面量 3**（提醒.ts:812 原行）。
// 而 3 恰好等于「连续低阈值默认」→ 所有用例都用默认值 → 「默认值下行为正确」恒真 → 缺口被默认值盖住。
// 只有**改过设置**的用户才看得到（真机：设置 6 时引擎尊重、提醒照喊）。
//
// ⚠️ 每组必须有不传阈值的对照组：「传 6 → 不出现」单独一条是假绿 ——
//    函数不读参数、或夹具压根没触发，都能让它成立。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 结构提醒 } from '../src/剧情导演/取料';

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

// 幕纲标「冲突」（不是生活幕）→ 避开批 A 的留白豁免，否则规则早早让位，测不到阈值
const 账本 = (张力: any): 导演账本 =>
  ({
    ...emptyData(),
    已分析轮数: 10,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 1, 幕纲: ['第1幕｜类型: 冲突｜目标:t'], 当前幕号: 1 },
    张力,
  } as 导演账本);

const 停在高点 = (行: string[]) => 行.filter(x => x.includes('停在高点'));
const 低张力句 = (行: string[]) => 行.filter(x => x.includes('低张力'));

// ---------------------------------------------------------------------------
console.log('\n[⑪a] 高阈：设置 6 时不喊「停在高点」；不传阈值（默认 3）时必须喊');
{
  const 账 = 账本({ 当前: 9, 距上次高潮楼层: 1, 连续低张力: 0, 最近节拍: ['受挫', '反转', '受挫'] });
  check('⑪a 阈值.高 = 6 + 连续 3 场高张力 → 不出现「停在高点」', 停在高点(结构提醒(账, 11, { 高: 6, 低: 3 })).length, 0);
  check('对照 ⑪a：不传阈值（默认 3）→ 出现 1 条', 停在高点(结构提醒(账, 11)).length, 1);
  check('对照 ⑪a：阈值.高 = 3（与默认同值，显式传）→ 出现 1 条', 停在高点(结构提醒(账, 11, { 高: 3, 低: 3 })).length, 1);
}

console.log('\n[⑪b] 低阈：设置 6 时不喊「低张力」；不传阈值（默认 3）时必须喊');
{
  const 账 = 账本({ 当前: 2, 距上次高潮楼层: 9, 连续低张力: 4, 最近节拍: ['小胜', '小胜', '阴影'] });
  check('⑪b 阈值.低 = 6 + 连续低张力 4 → 不出现「低张力」', 低张力句(结构提醒(账, 11, { 高: 3, 低: 6 })).length, 0);
  check('对照 ⑪b：不传阈值（默认 3）→ 出现 1 条', 低张力句(结构提醒(账, 11)).length, 1);
  check('对照 ⑪b：阈值.低 = 4（边界，恰好等于连低）→ 出现 1 条', 低张力句(结构提醒(账, 11, { 高: 3, 低: 4 })).length, 1);
  check('边界 ⑪b：阈值.低 = 5 → 不出现（证明是 >= 而不是 >）', 低张力句(结构提醒(账, 11, { 高: 3, 低: 5 })).length, 0);
}

console.log('\n[NaN 防线] 阈值传 NaN 时必须退回默认，不能把提醒弄哑（需求方点名的静默失效）');
{
  const 账 = 账本({ 当前: 9, 距上次高潮楼层: 1, 连续低张力: 4, 最近节拍: ['受挫', '反转', '受挫'] });
  const 行 = 结构提醒(账, 11, { 高: NaN as any, 低: NaN as any });
  check('阈值 NaN → 高阈退回默认，仍然喊「停在高点」', 停在高点(行).length, 1);
  check('阈值 NaN → 低阈退回默认，仍然喊「低张力」', 低张力句(行).length, 1);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) process.exit(1);
