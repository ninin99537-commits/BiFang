// 剧情导演 · 运行状态单一阶梯
//
// 症状: 面板顶部那条状态条的五个分支写在 悬浮球界面.vue 的 computed 里(只能用
// `vueSource.includes(...)` 断言), 而悬浮球的五态是 球状态.ts 里的纯函数(242 行用例钉住)。
// 两边输入几乎相同 —— 已剧终 / 自动暂停 / 连败次数 / 更新中 / 已分析轮数 / 接管轮数 ——
// 却各算一遍, README v1.2 D 记的正是它们曾经互相矛盾。
//
// 现在一条阶梯: 计算运行状态 给 级别/标题/明细/球态, 状态条读前三项、悬浮球读球态。
import { createPinia, setActivePinia } from 'pinia';
import { 计算运行状态, 计算球状态, 球状态列表 } from '../src/剧情导演/球状态';
import type { 运行状态输入 } from '../src/剧情导演/球状态';
import { 熔断阈值 } from '../src/剧情导演/快照';

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
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

/** 一个"正常运转中"的输入, 各用例只覆盖自己关心的那几项 */
function 输入(补: Partial<运行状态输入> = {}): 运行状态输入 {
  return {
    已剧终: false,
    自动暂停: false,
    连败次数: 0,
    最后失败原因: '',
    最后失败时间: 0,
    已分析轮数: 10,
    接管轮数: 3,
    锚点楼层: 42,
    引擎调用次数: 7,
    编排中: false,
    ...补,
  };
}

console.log('\n[1] 五级阶梯各就各位');
{
  check('正常运转 → on', 计算运行状态(输入()).级别, 'on');
  check('轮数不够 → cold', 计算运行状态(输入({ 已分析轮数: 1 })).级别, 'cold');
  check('连败 > 0 → warn', 计算运行状态(输入({ 连败次数: 1 })).级别, 'warn');
  check('自动暂停 → off', 计算运行状态(输入({ 自动暂停: true })).级别, 'off');
  check('已剧终 → over', 计算运行状态(输入({ 已剧终: true })).级别, 'over');
}

console.log('\n[2] 优先级: 停摆压过故障, 故障压过冷启动(R0 的教训)');
{
  check('剧终压过自动暂停', 计算运行状态(输入({ 已剧终: true, 自动暂停: true })).级别, 'over');
  check('剧终压过连败', 计算运行状态(输入({ 已剧终: true, 连败次数: 2 })).级别, 'over');
  check('自动暂停压过连败', 计算运行状态(输入({ 自动暂停: true, 连败次数: 2 })).级别, 'off');
  check('连败压过冷启动', 计算运行状态(输入({ 连败次数: 1, 已分析轮数: 0 })).级别, 'warn');
  check('自动暂停压过冷启动', 计算运行状态(输入({ 自动暂停: true, 已分析轮数: 0 })).级别, 'off');
}

console.log('\n[3] 球态由同一个结果给出, 不再各算一遍');
{
  check('剧终 → 球态 剧终', 计算运行状态(输入({ 已剧终: true })).球态, '剧终');
  check('自动暂停 → 球态 离线', 计算运行状态(输入({ 自动暂停: true })).球态, '离线');
  check('连败 → 球态 出错', 计算运行状态(输入({ 连败次数: 1 })).球态, '出错');
  check('冷启动 + 没在跑 → 球态 待命', 计算运行状态(输入({ 已分析轮数: 0 })).球态, '待命');
  check('冷启动 + 正在跑 → 球态 编排中', 计算运行状态(输入({ 已分析轮数: 0, 编排中: true })).球态, '编排中');
  check('正常 + 正在跑 → 球态 编排中', 计算运行状态(输入({ 编排中: true })).球态, '编排中');
  ok('每个球态都在合法列表里', 球状态列表.includes(计算运行状态(输入()).球态 as any));
}

console.log('\n[4] 旧入口 计算球状态 与本阶梯完全一致(签名没变, 行为没变)');
{
  const 组合: { 已剧终: boolean; 自动暂停: boolean; 连败次数: number; 编排中: boolean }[] = [];
  for (const 已剧终 of [false, true])
    for (const 自动暂停 of [false, true])
      for (const 连败次数 of [0, 2])
        for (const 编排中 of [false, true]) 组合.push({ 已剧终, 自动暂停, 连败次数, 编排中 });

  const 不一致 = 组合.filter(项 => {
    const 旧 = 计算球状态(项);
    const 新 = 计算运行状态(输入({ ...项, 已分析轮数: 10 })).球态;
    return 旧 !== 新;
  });
  check('16 种组合全部一致', 不一致.length, 0);
}

console.log('\n[5] 明细文本带上用户要看的数字');
{
  const 离线 = 计算运行状态(输入({ 自动暂停: true, 连败次数: 2, 最后失败原因: '接口超时' }));
  ok('离线明细含连败与阈值', 离线.明细.includes(`2/${熔断阈值}`));
  ok('离线明细含失败原因', 离线.明细.includes('接口超时'));

  const 冷 = 计算运行状态(输入({ 已分析轮数: 1, 接管轮数: 3 }));
  ok('冷启动明细写第几轮/共几轮', 冷.明细.includes('1/2') && 冷.明细.includes('第 3 轮起'));

  const 跑 = 计算运行状态(输入({ 锚点楼层: 42, 引擎调用次数: 7 }));
  ok('运行中明细含楼层与调用次数', 跑.明细.includes('#42') && 跑.明细.includes('7 次'));

  const 无楼层 = 计算运行状态(输入({ 锚点楼层: -1 }));
  ok('没编排过时楼层显示 —', 无楼层.明细.includes('#—'));
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
