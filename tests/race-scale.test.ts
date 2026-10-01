// 彼方 · 种族时间尺度规则 —— 直接跑真实源码(打包见 tests/run.mjs)
// 覆盖本次改动的核心主张: 「缺数字就不动作」+「有数字就按种族算」
import {
  extractGestationWeeks,
  extractLactationMonths,
  lactationExpired,
  normalizeRaceScale,
  pregnancyKnowledgeByWeek,
  ensurePregnancyKnowledge,
  cycleStageName,
} from '../src/彼方_NPC幕后生命状态系统/生理规则';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}  实际 ${JSON.stringify(actual)}`); }
}
const ts = (s: string) => new Date(`${s.replace(' ', 'T')}:00Z`).getTime();
const DAY = 86400000;

console.log('\n[1] 缺「哺乳期月数」= 不动作(这是本次改动的核心)');
check('无字段 → null(不判断)', lactationExpired(ts('2026-01-01 00:00'), ts('2027-01-01 00:00'), {}), null);
check('空字符串 → null', lactationExpired(ts('2026-01-01 00:00'), ts('2027-01-01 00:00'), { 哺乳期月数: '' }), null);
check('乱写 abc → null', lactationExpired(ts('2026-01-01 00:00'), ts('2027-01-01 00:00'), { 哺乳期月数: 'abc' }), null);
check('时间不可解析 → null', lactationExpired(null, ts('2027-01-01 00:00'), { 哺乳期月数: '6' }), null);

console.log('\n[2] 人类 6 个月(190 天时已超期)');
const human = { 哺乳期月数: '6' };
check('150 天 → 未超期', lactationExpired(ts('2026-01-01 00:00'), ts('2026-05-31 00:00'), human), false);
check('190 天 → 已超期', lactationExpired(ts('2026-01-01 00:00'), ts('2026-07-10 00:00'), human), true);

console.log('\n[3] 龙族 12 个月 —— 旧代码在这里会强行把人改成月经期');
const dragon = { 哺乳期月数: '12' };
check('190 天 → 未超期(不再误判)', lactationExpired(ts('2026-01-01 00:00'), ts('2026-07-10 00:00'), dragon), false);
check('400 天 → 已超期', lactationExpired(ts('2026-01-01 00:00'), ts('2027-02-05 00:00'), dragon), true);

console.log('\n[4] 数值归一化: 非法/越界一律不写入');
check("'52' → '52'", normalizeRaceScale('孕程周数', '52'), '52');
check('52.7 → 52', normalizeRaceScale('孕程周数', 52.7), '52');
check('0 → null', normalizeRaceScale('孕程周数', 0), null);
check('-3 → null', normalizeRaceScale('哺乳期月数', -3), null);
check("'六个月' → null", normalizeRaceScale('哺乳期月数', '六个月'), null);
check('999 → null(超出上限)', normalizeRaceScale('哺乳期月数', 999), null);
check('未知字段 → null', normalizeRaceScale('随便', 5), null);
check('读取: 缺字段 → null', extractLactationMonths({}), null);
check("读取: '12' → 12", extractLactationMonths({ 哺乳期月数: '12' }), 12);

console.log('\n[5] 怀孕知晓按孕程比例(人类 40 周必须与原逻辑完全一致)');
check('人类 w3 → 未知', pregnancyKnowledgeByWeek(3, 40), '未知');
check('人类 w5 → 疑似', pregnancyKnowledgeByWeek(5, 40), '疑似');
check('人类 w7 → 已确认', pregnancyKnowledgeByWeek(7, 40), '已确认');
check('人类 w4 → 疑似', pregnancyKnowledgeByWeek(4, 40), '疑似');
check('人类 w6 → 已确认', pregnancyKnowledgeByWeek(6, 40), '已确认');
check('缺孕程 → 按人类(未知)', pregnancyKnowledgeByWeek(3, null), '未知');
check('孕周不可解析 → 未知', pregnancyKnowledgeByWeek(null, 52), '未知');
check('龙族52 w5 → 未知(人类会误判成疑似)', pregnancyKnowledgeByWeek(5, 52), '未知');
check('龙族52 w6 → 疑似', pregnancyKnowledgeByWeek(6, 52), '疑似');
check('龙族52 w9 → 已确认', pregnancyKnowledgeByWeek(9, 52), '已确认');

console.log('\n[6] ensurePregnancyKnowledge 端到端');
const dragonCard: Record<string, unknown> = { 是否怀孕: 'true', 生理周期: '孕期 孕5周+0天', 孕程周数: '52' };
ensurePregnancyKnowledge(dragonCard);
check('龙族 w5 → 未知', dragonCard['怀孕知晓'], '未知');
const humanCard: Record<string, unknown> = { 是否怀孕: 'true', 生理周期: '孕期 孕5周+0天' };
ensurePregnancyKnowledge(humanCard);
check('缺孕程 w5 → 疑似(仍是补缺失字段)', humanCard['怀孕知晓'], '疑似');
const notPregnant: Record<string, unknown> = { 是否怀孕: 'false', 怀孕知晓: '疑似' };
ensurePregnancyKnowledge(notPregnant);
check('未怀孕 → 清掉知晓字段', '怀孕知晓' in notPregnant, false);

console.log('\n[7] 回归: 阶段判定没被动过');
check('Day 20 / 周期 28 → 黄体期', cycleStageName(20, 28), '黄体期');
check('Day 3 / 周期 28 → 月经期', cycleStageName(3, 28), '月经期');
check('Day 14 / 周期 28 → 排卵期', cycleStageName(14, 28), '排卵期');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
