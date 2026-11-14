// 剧情导演 · 拒绝回路（2026-11-12 P0）
//
// 病根：`构造参数.拒绝?: string[]` 只有声明，**全文件没有任何一处读它**。
// `update.ts` 每轮都把 `应用.拒绝` 传进来，然后就没有下文 —— 于是"写→被降级→看不到原因
// →原样再写→再记一条回响"这个环一直转着。真机上一条伏笔堆到 53 条回响，动力学就在这里。
//
// 修法（需求方裁定，三通道口径）：
// ① 只进**诊断通道**（`指令.代码调整`）；不进 `硬约束`（裁定）、不进 `硬性要求`（建议）——
//    正文 AI 不该读"代码为什么拒了导演"，那是导演和代码之间的事；
// ② 跨轮**折计**：同一句连续出现时折成「拒绝×N」，不原样再刷一遍；
// ③ **限条数** 5 条，涉及终态/不可逆（死亡/离场/已引爆…）的优先。
//
// 明确**不做**（同一批的边界）：不把拒绝塞进导演提示词 —— 那会变成第二套提醒，又回到没闭环的老路。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 构造本幕指令, 渲染拒绝回执, 拒绝回执上限 } from '../src/剧情导演/引擎规则';

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

const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), 已分析轮数: 20, ...部分 });
const 核验已执行 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
const 旧指令 = (部分: Record<string, any> = {}): any => ({
  编号: 1, 节拍: '阴影', 硬性要求: 'x', 伏笔现场: '', 禁止事项: '', 生成楼层: 9,
  核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [], ...部分,
});
const 造 = (拒绝: string[] | undefined, 旧?: any) =>
  构造本幕指令({
    旧指令: 旧 ?? null, 下一幕: { 节拍: '受挫' }, 账本: 账本(), 核验: 核验已执行,
    档位: 3, 红线: [], 楼层: 20, 暂停注入: false, 拒绝,
  });

// ---------------------------------------------------------------------------
console.log('\n[1] 塞 3 条 → 诊断通道里能找到这 3 条（副作用验，看输出不看返回值）');
{
  const 三条 = ['#4 拟转「已引爆」但证据不足 → 降为「待兑现」', '角色「艾莉」状态变更缺状态证据', '死者「乔尔」不能行动'];
  const r = 造(三条);
  const 代码调整 = r.指令?.代码调整 ?? [];
  ok(`代码调整 非空（实际 ${代码调整.length} 条）`, 代码调整.length > 0);
  三条.forEach(句 => ok(`能在代码调整里找到：${句.slice(0, 16)}…`, 代码调整.some(x => x.includes(句))));
  ok('都带【拒绝】前缀', 代码调整.filter(x => x.startsWith('【拒绝】')).length === 3);
}

console.log('\n[2] 塞 0 条 → 不留空的"拒绝"占位行');
{
  for (const 空 of [[], undefined]) {
    const r = 造(空 as any);
    const 代码调整 = r.指令?.代码调整 ?? [];
    ok(`拒绝=${JSON.stringify(空)} → 代码调整 里没有任何【拒绝】行`, !代码调整.some(x => x.includes('【拒绝')));
  }
  check('渲染拒绝回执 直接返回空数组', 渲染拒绝回执([], null), []);
  check('渲染拒绝回执：全空白也不产行', 渲染拒绝回执(['  ', ''], null), []);
}

console.log('\n[3] 同一句塞两轮 → 第二轮折成「拒绝×N」，不原样再出现');
{
  const 句 = '#4 拟转「已引爆」但证据不足 → 降为「待兑现」';
  const 一轮 = 造([句]);
  const 首轮行 = (一轮.指令?.代码调整 ?? []).find(x => x.includes(句))!;
  check('第一轮：单条前缀', 首轮行.startsWith('【拒绝】'), true);
  // 把第一轮的诊断通道当作"上一道指令"喂进去
  const 二轮 = 造([句], 旧指令({ 代码调整: 一轮.指令!.代码调整 }));
  const 二轮行 = (二轮.指令?.代码调整 ?? []).find(x => x.includes(句))!;
  ok('第二轮：原样那条不再出现', !(二轮.指令?.代码调整 ?? []).includes(`【拒绝】${句}`));
  ok('第二轮：折成「拒绝×2」', 二轮行.startsWith('【拒绝×2】'));
  // 第三轮继续累加
  const 三轮 = 造([句], 旧指令({ 代码调整: 二轮.指令!.代码调整 }));
  ok('第三轮：折成「拒绝×3」', (三轮.指令?.代码调整 ?? []).some(x => x.startsWith('【拒绝×3】') && x.includes(句)));
}

console.log('\n[4] 塞 8 条 → 最多 5 条，且终态/不可逆优先');
{
  const 八条 = [
    '格式问题：伏笔 #2 的状态值不在枚举里',
    '措辞问题：章回主题为空',
    '字段问题：冲突强度超出 1~10',
    '角色「艾莉」死亡但缺状态证据',
    '伏笔 #7 拟转「已引爆」但证据不足',
    '角色「泰丝」离开小镇没有离场事件',
    '重复问题：同一伏笔在输出里出现两次',
    '编号问题：新伏笔编号自己编了一个',
  ];
  const r = 造(八条);
  const 拒绝行 = (r.指令?.代码调整 ?? []).filter(x => x.includes('【拒绝'));
  check(`最多 ${拒绝回执上限} 条(实际 ${拒绝行.length})`, 拒绝行.length, 拒绝回执上限);
  const 文本 = 拒绝行.join('\n');
  ok('死亡类被保留', 文本.includes('死亡但缺状态证据'));
  ok('已引爆类被保留', 文本.includes('拟转「已引爆」'));
  ok('离场类被保留', 文本.includes('离开小镇没有离场事件'));
  // 只有 3 条是终态类，剩下 2 个名额按原顺序给前面的普通项；末尾两条必须被挤掉。
  // （不要把"普通项一个都不许留"当判据 —— 5 个名额里终态项只有 3 个，空出来的位置本来就该给普通项。）
  ok('末尾的普通项被挤掉（说明按优先级取了前 5）', !文本.includes('编号问题：新伏笔编号自己编了一个'));
  ok('重复/编号两条普通项都被挤掉', !文本.includes('重复问题') && !文本.includes('编号问题'));
}

console.log('\n[5] 三通道互不串：拒绝不进 硬约束，也不进 硬性要求');
{
  const 句 = '角色「艾莉」死亡但缺状态证据';
  const r = 造([句]);
  ok('不进 硬约束', !(r.指令?.硬约束 ?? []).some(x => x.includes('死亡但缺状态证据')));
  ok('不进 硬性要求', !String(r.指令?.硬性要求 ?? '').includes('死亡但缺状态证据'));
  ok('不进 伏笔现场/禁止事项', !String(r.指令?.伏笔现场 ?? '').includes(句) && !String(r.指令?.禁止事项 ?? '').includes(句));
}

console.log('\n[6] 与 调整 里的其它诊断共存（不挤掉真正的原因）');
{
  const r = 构造本幕指令({
    旧指令: null, 下一幕: { 节拍: '小胜' },
    账本: 账本({ 张力: { 当前: 9, 距上次高潮楼层: 1, 连续低张力: 0, 最近节拍: ['高潮', '高潮', '高潮'] } }),
    核验: 核验已执行, 档位: 3, 红线: [], 楼层: 20, 暂停注入: false, 拒绝: ['角色「艾莉」死亡但缺状态证据'],
  });
  const 全部 = r.调整;
  ok('拒绝行在', 全部.some(x => x.includes('【拒绝】')));
  ok('力曲线的原因也在', 全部.some(x => x.includes('张力曲线')));
  check('两条都在（拒绝排在最前）', 全部[0].startsWith('【拒绝】'), true);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
