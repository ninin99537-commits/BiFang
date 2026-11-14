// 彼方 · 身体迹象(注入时由代码按孕周/周期日算出)
import { 身体迹象, 孕期迹象, 周期迹象 } from '../src/彼方_NPC幕后生命状态系统/身体迹象';
import { buildInjectionPrompt } from '../src/彼方_NPC幕后生命状态系统/prompts';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`); }
}

console.log('\n[1] 孕期');
check('孕 2 周: 无感', 孕期迹象(2), '');
check('孕 4 周: 月经推迟', 孕期迹象(4), '月经推迟了');
check('孕 8 周: 孕吐嗜睡', 孕期迹象(8), '恶心反胃, 嗜睡, 胸口胀痛');
check('孕 20 周: 显怀', 孕期迹象(20), '小腹开始隆起');
check('孕程 80 周的种族, 8 周 ≈ 人类 4 周', 孕期迹象(8, 80), '月经推迟了');
check('从卡读孕周', 身体迹象({ 生理周期: '孕期 孕9周+2天' }), '恶心反胃, 嗜睡, 胸口胀痛');

console.log('\n[2] 周期');
check('Day 1 腹痛', 周期迹象(1, 28), '经期第一二天, 腹痛乏力');
check('Day 27/28 经前', 周期迹象(27, 28), '经前几天, 容易烦躁、胸胀');
check('Day 10 无', 周期迹象(10, 28), '');
check('从卡读周期', 身体迹象({ 生理周期: '黄体期 Day 30/31' }), '经前几天, 容易烦躁、胸胀');
check('哺乳期不判', 身体迹象({ 生理周期: '哺乳期' }), '');
check('没有生理字段', 身体迹象({}), '');

console.log('\n[3] 注入表');
check('有迹象才出列', buildInjectionPrompt([['甲', { 当前在做: '看书', 生理周期: '孕期 孕9周+2天', 是否怀孕: 'true' }]]).includes('| 身体迹象'), true);
check('男性/无生理不出列', buildInjectionPrompt([['乙', { 当前在做: '看书' }]]).includes('身体迹象'), false);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
