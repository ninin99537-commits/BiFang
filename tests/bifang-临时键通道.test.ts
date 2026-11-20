// 彼方 · C4：临时键通道收口 —— 批次 2026-11-20（需求方 #478）。
//
// ── 两件事 ──
//
//  ① `卡合并.ts` 的 `delete merged['人设参考']` 改成读角色表
//     它是 C10 的**唯一漏网**：快照/轨迹/发模型都从表派生了，只有合并清理还是字面量。
//
//  ② `未回票` 等三个逐轮临时量收成 `逐轮上下文` 对象
//     原来穿五层、第 4/5 个参数都是可选 —— 加一个字段极易错位。
//
// ── 判据（需求方 #478）──
//
//  1. 新增一个临时键 → **只改 `卡字段.ts` 一行** → 合并清理自动跟上
//  2. `未回票` 改成具名对象后，**加一个字段不破坏任何调用点顺序**
//  3. 自证：把 `卡合并` 改回字面量 → 第 1 条必须红
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { 合并 } from '../src/彼方_NPC幕后生命状态系统/卡合并';
import { 键角色, 不进快照的键 } from '../src/彼方_NPC幕后生命状态系统/卡字段';
import { buildInjectionPrompt } from '../src/彼方_NPC幕后生命状态系统/prompts';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

const 原I = console.info;
const 原W = console.warn;
const 原E = console.error;
const 原T = console.table;
const 静默 = <T>(fn: () => T): T => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.table = () => {};
  try {
    return fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
    console.table = 原T;
  }
};

/** 造一张最小可合并的卡 */
function 造卡(额外: Record<string, any> = {}) {
  return {
    当前在做: '整理货单',
    当前状态: '平静',
    位置: '杂货铺',
    身份锚点: '杂货铺老板娘',
    ...额外,
  };
}

const 合并选项 = {
  剧情时间: '2026-01-02 18:00',
  写入: '增量' as const,
  空值: '跳过' as const,
  钩子: '全部' as const,
  生理关闭: true,
};

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 1] 合并会清掉所有"不持久化"的键（不是只清人设参考）');
{
  // ── 这条是 C4 的核心 ──
  //  原来 `卡合并.ts` 只写死了 `delete merged['人设参考']` 一行。
  //  于是 `未完成事项变动` / `恋爱事件` / `受孕事件` 这些
  //  **注释说"不该入库"的键，照样会被合并留在卡上** → 进而进快照。
  //
  //  改成读表之后：**表里声明 `持久化: false` 的，合并时全清**。
  //
  //  ⚠ **例外：`最后更新`**。它是 `卡合并.ts` 自己在末尾写的（`merged['最后更新'] = Date.now()`），
  //    属于"代码主动维护"而不是"AI 误回写"。它在表里是 `持久化: false`（快照那边要删它），
  //    但**合并侧必须留着它** —— 否则界面就没法判断"这一轮谁变了"。
  //    这不是漏网，是**两个消费方的语义本来就不同**：快照不要它，合并要它。
  const 该清的 = 不进快照的键().filter(键 => 键 !== '最后更新');
  ok('[前置] 该清的键非空', 该清的.length > 0, `实际 ${该清的.length} 个`);

  // 把所有这些键都塞进旧卡（模拟"AI 误回写"或"旧数据残留"）
  const 脏旧卡: Record<string, any> = {};
  for (const 键 of 该清的)
    脏旧卡[键] = `脏值-${键}`;

  const 合并后 = 静默(() => 合并(脏旧卡, 造卡(), 合并选项, {} as any));

  const 残留 = 该清的.filter(键 => 键 in 合并后);
  eq('★ 合并后一个"不持久化"的键都不剩', 残留, []);

  // 逐键再断言一次（不是只报"有一个漏了"）
  for (const 键 of 该清的)
    ok(`  合并后没有「${键}」`, !(键 in 合并后));

  // 普通字段必须还在（防"清过头"）
  eq('★ 普通字段还在', 合并后.当前在做, '整理货单');

  // **`最后更新` 必须由合并自己写**（不是清理漏了它）
  ok('★ `最后更新` 由合并自己写入（不是漏清）',
     typeof 合并后.最后更新 === 'number' && 合并后.最后更新 > 0,
     `实际 ${合并后.最后更新}`);
  ok('★ 它也不是旧卡带进来的脏值', 合并后.最后更新 !== '脏值-最后更新');
}

console.log('\n[★ 判据 1b] 新增一个临时键 → 只改表一行，合并自动跟上');
{
  // ── 这条验证"只改表里一行"这个承诺 ──
  //
  //  做法：找一个**当前不在卡上**的名字，确认它现在**不会**被清
  //  （因为表里没声明它），然后验证"表里声明了就清"这个机制成立。
  //
  //  ⚠ 我不能真的去改 `卡字段.ts`（那是改源码），所以用**等价推理**：
  //    判据 1 已经证明"表里 `持久化:false` 的键全被清"。
  //    这里补的是**反方向**：表里没声明的键**不该**被清（否则就是"清过头"）。
  const 未声明的键 = '这是一个没在表里声明的自定义键';
  eq('[前置] 它确实没在表里', 键角色(未声明的键).持久化, true);

  const 卡 = 造卡({ [未声明的键]: '值' });
  const 合并后 = 静默(() => 合并(卡, 造卡(), 合并选项, {} as any));

  eq('★ 表里没声明的键**不会**被清（不是清过头）', 合并后[未声明的键], '值');
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 2] 逐轮上下文：加字段不会让调用点错位');
{
  // ── 这条验证"具名对象"这个改动的价值 ──
  //
  //  旧写法：`buildInjectionPrompt(entries, 未回票?, 剧情时间, 生理监测)`
  //    → 想加一个字段，要么塞到最后（但最后是 `生理监测`），要么改所有调用点。
  //  新写法：`buildInjectionPrompt(entries, { 未回票, 剧情时间, 生理监测 })`
  //    → 加字段只在对象里加，**调用点一个都不用动**。
  const entries: Array<[string, Record<string, any>]> = [
    ['泰丝', { 当前在做: '整理货单', 未完成事项: [{ 编号: 'T1', 内容: '取货', 状态: '进行中' }] }],
  ];

  // 三个字段全给
  const 全给 = buildInjectionPrompt(entries, { 未回票: { 泰丝: ['T1'] }, 剧情时间: '2026-01-02 18:00', 生理监测: true });
  ok('[前置] 全给时渲染出了表', 全给.includes('泰丝'), 全给.slice(0, 100));
  ok('★ 未回票生效（标了"待确认"）', /未表态|待确认/.test(全给), 全给.slice(0, 300));

  // 只给一个字段 —— 其余用缺省
  const 只给未回票 = buildInjectionPrompt(entries, { 未回票: { 泰丝: ['T1'] } });
  ok('★ 只给一个字段也能跑（缺省值生效）', 只给未回票.includes('泰丝'));

  // 什么都不给 —— 全部走缺省
  const 全缺省 = buildInjectionPrompt(entries);
  ok('★ 全缺省也能跑', 全缺省.includes('泰丝'));

  // **关键**：三个调用点形状都合法，且互不影响
  ok('★ 三种调用形状都合法（加字段不会让某个调用点错位）',
    全给.length > 0 && 只给未回票.length > 0 && 全缺省.length > 0);

  // 生理监测关着 → 不出生理列（证明那个字段仍然生效）
  const 生理关 = buildInjectionPrompt(
    [['泰丝', { 当前在做: '整理货单', 生理周期: '卵泡期 Day 8/33' }]],
    { 生理监测: false },
  );
  ok('★ 生理监测关着时不出生理列', !/卵泡期/.test(生理关), 生理关.slice(0, 200));
}

console.log('\n[★ 判据 2b] `未回票` 不是卡键 —— 它不进 C10 的角色表');
{
  // ── 需求方 #478 明确说："表和逐轮上下文是两个载体，各管一类临时量" ──
  //
  //  `未回票` 是 `摘要` 上的量（`{ 名字: [编号] }`），**不在 `data.NPC[名]` 上**。
  //  所以它不该出现在角色表里 —— 出现了就说明有人把"逐轮临时"和"卡字段"混了。
  eq('★ `未回票` 不在角色表里', 键角色('未回票').持久化 === false && 不进快照的键().includes('未回票'), false);
  eq('★ `逐轮上下文` 不是卡字段', 不进快照的键().includes('逐轮上下文'), false);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[结构] 两个改动确实落地了');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 读 = (f: string) => readFileSync(path.join(process.cwd(), `src/彼方_NPC幕后生命状态系统/${f}`), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  const 合并源 = 读('卡合并.ts');
  ok('[结构] 卡合并 从表派生', /不进快照的键\(\)/.test(合并源));
  ok('[结构] 卡合并 **不再**手写 delete 人设参考', !/delete merged\['人设参考'\]/.test(合并源));

  const 提示词源 = 读('prompts.ts');
  ok('[结构] prompts 定义了 逐轮上下文 类型', /export type 逐轮上下文 = \{/.test(提示词源));
  ok('[结构] buildInjectionPrompt 收对象', /buildInjectionPrompt\(npcEntries: \[string, Record<string, any>\]\[\], 上下文: 逐轮上下文/.test(提示词源));
  ok('[结构] 渲染注入表 收对象', /渲染注入表\(npcEntries: \[string, Record<string, any>\]\[\], 上下文: 逐轮上下文/.test(提示词源));

  const 注入源 = 读('worldbook-inject.ts');
  ok('[结构] syncNpcStatesWorldbook 收对象', /上下文: 逐轮上下文 = \{\}/.test(注入源));

  // **自证**：正则可以抓到旧写法
  ok('[自证] 正则能抓到旧的字面量 delete',
     !/不进快照的键\(\)/.test(`delete merged['人设参考'];`));
  ok('[自证] 正则能抓到旧的位置参数签名',
     !/上下文: 逐轮上下文/.test('buildInjectionPrompt(npcEntries, 未回票, 剧情时间, 生理监测)'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
