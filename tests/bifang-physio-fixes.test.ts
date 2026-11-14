// 彼方 · 生理修正(改进方案 §2 / §7): 新建孕期卡不清零、AI 不能绕过掷骰、同日合并判定、外射系数
import {
  一致化生理,
  calcConceptionRate,
  applyConceptionCheck,
  sameDayCountFactor,
  确保周期长度,
} from '../src/彼方_NPC幕后生命状态系统/生理规则';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}  实际 ${JSON.stringify(actual)}`); }
}
const 静音 = () => { const w = console.warn; const i = console.info; console.warn = () => {}; console.info = () => {}; return () => { console.warn = w; console.info = i; }; };
function 固定随机<T>(值: number, fn: () => T): T {
  const r = Math.random;
  Math.random = () => 值;
  try { return fn(); } finally { Math.random = r; }
}

console.log('\n[1] 新建卡按人设已是孕期: 受孕日期按本卡孕周反推, 下一轮不清零');
{
  const 恢复 = 静音();
  const 新卡: Record<string, any> = { 曾用名: '甲', 生理周期: '孕期 孕20周+3天', 是否怀孕: 'true', 周期长度: 28 };
  一致化生理({ 卡: 新卡, 旧卡: {}, 剧情时间: '2026-10-17 20:00 至 2026-10-17 22:40', 本轮更新: 新卡 });
  check('受孕日期 = 剧情日 - 143 天', 新卡['受孕日期'], '2026-05-27 22:40');
  check('本轮孕周保持 20+3', 新卡['生理周期'], '孕期 孕20周+3天');
  const 次轮: Record<string, any> = { ...新卡 };
  一致化生理({ 卡: 次轮, 旧卡: 新卡, 剧情时间: '2026-10-18 08:00 至 2026-10-18 09:00', 本轮更新: {} });
  check('次日推进到 20+4, 没有被清零', 次轮['生理周期'], '孕期 孕20周+4天');
  恢复();
}

console.log('\n[2] 已有生理档案的未孕角色: AI 直接写孕期会被撤回');
{
  const 恢复 = 静音();
  const 旧卡 = { 曾用名: '乙', 生理周期: '卵泡期 Day 8/28', 是否怀孕: 'false', 周期长度: 28, 生理周期日期: '2026-10-17 08:00' };
  const 卡: Record<string, any> = { ...旧卡, 生理周期: '孕期 孕6周+0天', 是否怀孕: 'true' };
  一致化生理({ 卡, 旧卡, 剧情时间: '2026-10-17 20:00 至 2026-10-17 22:00', 本轮更新: { 生理周期: '孕期 孕6周+0天' } });
  check('生理周期撤回旧值', 卡['生理周期'], '卵泡期 Day 8/28');
  check('是否怀孕 = false', 卡['是否怀孕'], 'false');
  check('没有残留受孕日期', '受孕日期' in 卡, false);
  恢复();
}

console.log('\n[3] 受孕率系数');
check('外射 ×0.2: 排卵日 25% → 5%', calcConceptionRate(28, 14, '外射'), 0.05);
check('无防护排卵日 25%', calcConceptionRate(28, 14, '无'), 0.25);
check('次数加成: 1 次 ×1', sameDayCountFactor(1), 1);
check('次数加成: 3 次 ×1.2', sameDayCountFactor(3), 1.2);
check('次数加成封顶 ×1.3', sameDayCountFactor(10), 1.3);

console.log('\n[4] 同日合并判定');
{
  const 恢复 = 静音();
  const 基础 = () => ({ 曾用名: '丙', 生理周期: '排卵期 Day 14/28', 是否怀孕: 'false', 周期长度: 28 });
  const 事件 = (次数: number, 时间 = '2026-10-17 21:00') => ({ 时间, 对象: '主角', 方式: '阴道内射', 防护: '无', 次数 });
  // 3 次: 当日概率 = 25% × 1.2 = 30%; 掷 0.29 → 中, 0.31 → 不中
  const 中 = { ...基础(), 受孕事件: 事件(3) };
  check('3 次, 掷 0.29 → 怀孕', 固定随机(0.29, () => applyConceptionCheck(中, {}, '2026-10-17 20:00 至 2026-10-17 22:00')), true);
  const 不中: Record<string, any> = { ...基础(), 受孕事件: 事件(3) };
  check('3 次, 掷 0.31 → 未孕(旧逻辑 1-(0.75)^3≈58% 会中)', 固定随机(0.31, () => applyConceptionCheck(不中, {}, '2026-10-17 20:00 至 2026-10-17 22:00')), false);
  check('写下当日判定记录', 不中['受孕判定记录'], '2026-10-17|0.3000');
  // 同日下一轮又报 1 次(25% ≤ 已判 30%): 不再掷骰
  const 同日再报: Record<string, any> = { ...不中, 受孕事件: 事件(1, '2026-10-17 23:00') };
  check('同日再报低概率: 不掷骰(掷 0 也不中)', 固定随机(0, () => applyConceptionCheck(同日再报, 不中, '2026-10-17 22:30 至 2026-10-17 23:30')), false);
  // 次日: 新的一天, 重新判
  const 次日: Record<string, any> = { ...不中, 生理周期: '排卵期 Day 15/28', 受孕事件: 事件(1, '2026-10-18 21:00') };
  check('次日重新判定(掷 0 → 中)', 固定随机(0, () => applyConceptionCheck(次日, 不中, '2026-10-18 20:00 至 2026-10-18 22:00')), true);
  恢复();
}

console.log('\n[5] 周期长度中心加权 26–32, 已有值不动');
{
  check('最低 26', 固定随机(0, () => { const c: any = { 生理周期: 'Day 1/28' }; 确保周期长度(c); return c.周期长度; }), 26);
  check('中心 29', 固定随机(0.5, () => { const c: any = { 生理周期: 'Day 1/28' }; 确保周期长度(c); return c.周期长度; }), 29);
  check('最高 32', 固定随机(0.999999, () => { const c: any = { 生理周期: 'Day 1/28' }; 确保周期长度(c); return c.周期长度; }), 32);
  check('人设已有 35 保留', 固定随机(0, () => { const c: any = { 生理周期: 'Day 1/35', 周期长度: 35 }; 确保周期长度(c); return c.周期长度; }), 35);
}

console.log(`\n通过 ${pass}, 失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
