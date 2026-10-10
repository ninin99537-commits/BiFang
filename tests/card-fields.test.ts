// 彼方 · 一张卡的字段表(候选8) —— 字段知识只有一个来源: 卡字段.ts
//
// 以前同一件事写在四处: 卡字段.ts 的字段名、界面里的详情分组、"添加 NPC"弹窗手写的六个输入框、
// 数据变更.ts 的扩展编辑字段。加一个字段要记得改四处, 漏一处就静默丢字段。
// 现在 "名/分组/说明/建档" 都在卡片字段表里, 界面从它生成分组与弹窗。
// 这里钉住"表、名单、扩展字段、界面"四者不许再各自漂移。
import {
  APPEND_CARD_FIELDS,
  CARD_FIELDS,
  字段分组表,
  字段说明表,
  字段表,
  扩展编辑字段,
  建档字段,
} from '../src/彼方_NPC幕后生命状态系统/卡字段';
import vueSource from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
    console.log(`  ✓ ${名}`);
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}
function check(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
    console.log(`  ✓ ${名}`);
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

console.log('\n[1] 字段表本身: 不重名、分组合法、每个都有说明');
{
  const 名 = 字段表.map(f => f.名);
  check('字段表没有重名', 名.length, new Set(名).size);
  ok('每个字段都有非空说明', 字段表.every(f => typeof f.说明 === 'string' && f.说明.trim().length > 0));
  ok('每个字段的分组都是已知的五个之一', 字段表.every(f => ['核心', '生活', '内心', '生理', '恋爱'].includes(f.组)));
  check('受孕日期 与 生理周期日期 都在表里', ['受孕日期', '生理周期日期'].every(n => 名.includes(n)), true);
}

console.log('\n[2] 名单与表一致: CARD_FIELDS + 扩展编辑字段 = 表里的全部字段');
{
  const 表里的 = [...字段表.map(f => f.名)].sort();
  const 名单里的 = [...CARD_FIELDS, ...扩展编辑字段].sort();
  check('两边成员完全一致', 名单里的, 表里的);
  check('扩展编辑字段 就是那十四个(生理五项 + 恋爱九项, 顺序沿用旧表)', 扩展编辑字段, ['受孕日期', '生理周期日期', '怀孕知晓', '孕程周数', '哺乳期月数', '恋爱对象', '情感倾向', '好感值', '情欲值', '好感阶段', '情欲阶段', '名分', '恋爱动向', '恋爱开局']);
  ok('扩展字段在表里都标了 扩展', 扩展编辑字段.every(n => 字段表.find(f => f.名 === n)?.扩展 === true));
  ok('非扩展字段在表里都没标 扩展', 字段表.filter(f => !f.扩展).every(f => CARD_FIELDS.includes(f.名)));
  check('追加式合并字段也在表里', APPEND_CARD_FIELDS.every(n => 字段表.some(f => f.名 === n)), true);
}

console.log('\n[3] 详情页分组: 核心三字段之外, 每个字段恰好属于一组');
{
  check('核心 = 当前在做 / 当前状态 / 位置', 字段表.filter(f => f.组 === '核心').map(f => f.名), ['当前在做', '当前状态', '位置']);
  const 分组里的 = Object.values(字段分组表).flat();
  check('分组收录的字段数 = 表里非核心字段数', 分组里的.length, 字段表.filter(f => f.组 !== '核心').length);
  check('同一个字段没有被两组收录', 分组里的.length, new Set(分组里的).size);
  check('分组里的字段都能在表里找到', 分组里的.every(n => 字段表.some(f => f.名 === n)), true);
  check('四组都不为空', Object.values(字段分组表).every(列 => 列.length > 0), true);
  check('生活组包含 身份锚点 且排在最前(界面顺序不变)', 字段分组表['生活'][0], '身份锚点');
  // 恋爱分组: 十一个恋爱字段都在表里、且只归「恋爱」这一组
  check('恋爱组收录的字段', 字段分组表['恋爱'], ['恋爱对象', '情感倾向', '好感值', '情欲值', '好感阶段', '情欲阶段', '名分', '恋爱标签', '恋爱态度', '恋爱动向', '恋爱开局']);
  check('CARD_FIELDS 里只有 AI 要写的那两个恋爱字段', CARD_FIELDS.filter(f => 字段分组表['恋爱'].includes(f)), ['恋爱态度', '恋爱标签']);
  check('隐藏字段 恋爱基准日期 不在表里(照 周期长度 的先例)', 字段表.some(f => f.名 === '恋爱基准日期') || 扩展编辑字段.includes('恋爱基准日期'), false);
}

console.log('\n[4] 建档弹窗: 字段来自表, 输入形态与占位也在表里');
{
  const 名 = 建档字段.map(f => f.名);
  check('弹窗字段(按表序)', 名, ['身份锚点', '当前在做', '当前状态', '位置', '接下来想做']);
  ok('弹窗字段都在表里', 名.every(n => 字段表.some(f => f.名 === n)));
  ok('每个弹窗字段都有占位提示(自己的或共用说明)', 建档字段.every(f => String(f.占位 || f.说明 || '').length > 0));
  check('位置用输入框', 字段表.find(f => f.名 === '位置')?.输入, 'input');
  ok('说明表覆盖每个字段', 字段表.every(f => 字段说明表[f.名] === f.说明));
}

console.log('\n[5] 界面不再各写一份: 分组与弹窗字段都从表里取');
{
  ok('界面引用了 字段分组表', vueSource.includes('字段分组表'));
  ok('界面引用了 建档字段', vueSource.includes('建档字段'));
  ok('界面用 字段说明表 做悬停提示', vueSource.includes('字段说明表'));
  ok('界面里没有手写的分组表 DETAIL_GROUPS', !vueSource.includes('DETAIL_GROUPS'));
  ok('界面里没有手写的弹窗字段(身份锚点)', !vueSource.includes('addDraft[\'身份锚点\']'));
  ok('界面里没有手写的弹窗字段(接下来想做)', !vueSource.includes('addDraft[\'接下来想做\']'));
  ok('界面里没有按分组写死三段的模板', !vueSource.includes('detailFields[\'生活\']') && !vueSource.includes('detailFields[\'内心\']'));
  ok('分组标题与图标仍留在界面(那是展示)', vueSource.includes('生活动态') && vueSource.includes('PhSuitcaseSimple'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
