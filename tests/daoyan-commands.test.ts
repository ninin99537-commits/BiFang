// 剧情导演 · 导演命令
//
// 症状: 每条"改账本"的按钮都跟着一组必须同时成立的动作, 而它们以前各自手写在 悬浮球界面.vue
// 的 handler 里, 只能靠 `vueSource.includes('确认剧终结算')` 这类字符串匹配验。
// 四条终局路径尤其明显, 任何一条漏一个动作都是静默失效(备忘没撤 / meta 没写 / 指令还在注入)。
//
// 现在一条命令 = 一组不变量, 用记录型假依赖就能断言顺序与次数。
import { createPinia, setActivePinia } from 'pinia';
import { 建导演命令 } from '../src/剧情导演/导演命令';
import type { 命令依赖 } from '../src/剧情导演/导演命令';
import { emptyData } from '../src/剧情导演/快照';
import { SettingsSchema } from '../src/剧情导演/schema';

// 与其它导演用例同一套垫片: schema.ts 的 zod transform 里用 _.clamp, 存储层读 localStorage
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

/** 一份空账本 + 可注入的几条记录 */
function 造账本(补: Record<string, unknown> = {}): any {
  return { ...emptyData(), 指标: undefined, 伏笔: [], 冲突: [], 弧线: [], ...补 };
}

function 造(账本: any, 设置: any, 选项: { 落盘会失败?: boolean } = {}) {
  const 记录: string[] = [];
  const 依赖: 命令依赖 = {
    账本: () => 账本,
    // 2026-11-20：落盘失败时命令会调它回滚（#507 ②）
    恢复账本: 改前 => {
      记录.push('恢复账本');
      // 就地覆盖：把账本对象的所有键换成改前那份（保持引用不变）
      for (const k of Object.keys(账本))
        delete 账本[k];
      Object.assign(账本, JSON.parse(JSON.stringify(改前)));
    },
    设置: () => 设置,
    提交: 副作用 => {
      记录.push(`提交:${JSON.stringify(副作用 ?? null)}`);
      return !选项.落盘会失败;
    },
    写已剧终: 值 => {
      记录.push(`写已剧终:${值}`);
      return true;
    },
    同步备忘: 要写 => 记录.push(`同步备忘:${要写}`),
    撤本幕指令: () => 记录.push('撤本幕指令'),
    重注本幕: 暂停 => 记录.push(`重注本幕:${暂停}`),
    清空并重载: () => {
      记录.push('清空并重载');
      return 账本;
    },
    结算死亡: () => 记录.push('结算死亡'),
    设自动暂停: 值 => {
      记录.push(`设自动暂停:${值}`);
      return { 连续失败: 0 } as any;
    },
    清推进失败: () => {
      记录.push('清推进失败');
      return { 连续失败: 0 } as any;
    },
    提示: () => 记录.push('提示'),
    日志: () => 记录.push('日志'),
  };
  return { 命令: 建导演命令(依赖), 记录 };
}

const 默认设置 = SettingsSchema.parse({});

console.log('\n[1] 跳过本幕: 没指令就什么都不做; 有指令才作废并重注');
{
  const 空账 = 造账本();
  const a = 造(空账, 默认设置);
  check('无当前指令 → 返回 false', a.命令.跳过本幕(), false);
  check('无当前指令 → 一次提交都没有', a.记录.filter(项 => 项.startsWith('提交:')), []);

  const 有账 = 造账本({ 当前指令: { 强度: '平稳', 硬性要求: [], 伏笔现场: [], 禁止事项: [] } });
  const b = 造(有账, 默认设置);
  check('有当前指令 → 返回 true', b.命令.跳过本幕(), true);
  check('跳过本幕规则已生效(指令被标记作废, 核验升级清零)', [有账.当前指令.已跳过, 有账.当前指令.核验升级次数], [true, 0]);
  check('落盘时带「重注本幕」', b.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重注本幕":false}']);
}

console.log('\n[2] 总开关: OFF 撤备忘+撤指令, ON 写备忘+重注指令(两件都不能少)');
{
  const 关 = 造(造账本(), { ...默认设置, 启用导演: false });
  关.命令.切换总开关();
  check('OFF 的动作集合', 关.记录.filter(项 => 项 !== '日志'), ['同步备忘:false', '撤本幕指令']);

  const 开 = 造(造账本(), { ...默认设置, 启用导演: true, 导演: { ...默认设置.导演, 注入世界书条目: true } });
  开.命令.切换总开关();
  check('ON 的动作集合', 开.记录.filter(项 => 项 !== '日志'), ['同步备忘:true', '重注本幕:false']);
}

console.log('\n[3] 清空: 数据清掉之后必须把两层注入一起撤掉');
{
  const t = 造(造账本(), 默认设置);
  t.命令.清空();
  check('清空的动作集合', t.记录.filter(项 => 项 !== '日志'), ['清空并重载', '同步备忘:false', '重注本幕:false']);
}

console.log('\n[4] 死亡抉择: 剧终结算先要二次确认, 其余当场记账并结算 pending');
{
  const 账 = 造账本();
  const t = 造(账, 默认设置);
  check('剧终结算 → 需二次确认', t.命令.做死亡抉择('剧终结算' as any), '需二次确认');
  check('二次确认前不动账本', 账.死亡抉择, '');
  check('二次确认前不结算、不提交', t.记录, []);

  check('其余选项 → 已记录', t.命令.做死亡抉择('视角转移' as any), '已记录');
  check('抉择写进账本', 账.死亡抉择, '视角转移');
  check('pending 被结算', t.记录.includes('结算死亡'), true);
  check('提交时重注本幕', t.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重注本幕":true}']);
}

console.log('\n[5] 全书结算: 请求收官幂等, 第二次点击不产生第二道收束幕');
{
  const 账 = 造账本();
  const t = 造(账, 默认设置);
  check('第一次 → true', t.命令.做全书结算(), true);
  check('账本记下收官请求', 账.收官请求, true);
  check('给了用户提示', t.记录.includes('提示'), true);
  check('第二次 → false', t.命令.做全书结算(), false);
  check('第二次没有额外提交', t.记录.filter(项 => 项.startsWith('提交:')).length, 1);
}

console.log('\n[6] 确认剧终: 双写 + 停引擎 + 成绩单进日志, 顺序固定');
{
  const 账 = 造账本();
  const t = 造(账, 默认设置);
  t.命令.确认剧终();
  check('账本已剧终', 账.已剧终, true);
  check('收官请求被清掉', 账.收官请求, false);
  ok('终值快照已写入', !!账.指标?.终值);
  check('chat meta 双写', t.记录.includes('写已剧终:true'), true);
  check('pending 被结算', t.记录.includes('结算死亡'), true);
  check('落盘时撤备忘 + 重注指令', t.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重写备忘":false,"重注本幕":true}']);
  // ── 2026-11-20 改顺序（#507 ② / #510 ②）──
  //
  //  原来断言的是"先结算死亡 → 再写 meta → 最后落盘"。
  //  那条顺序有个洞：**账本落盘失败时，meta 侧已经写了「已剧终」** →
  //  引擎停了，但账本不认 → 两边永久分叉。
  //
  //  现在改成"先落盘，成功了才写 meta"。这条断言跟着改 ——
  //  **不是"改断言让它变绿"，是旧断言断言的正是本批要消灭的行为。**
  ok('★ 顺序: 先结算死亡, 再落盘, **最后**才写 meta',
     t.记录.indexOf('结算死亡') < t.记录.findIndex(项 => 项.startsWith('提交:'))
     && t.记录.findIndex(项 => 项.startsWith('提交:')) < t.记录.indexOf('写已剧终:true'),
     `实际顺序: ${t.记录.join(' → ')}`);
}

console.log('\n[7] 清除剧终: 两边都清, 连收官请求与终值一起清');
{
  const 账 = 造账本({ 已剧终: true, 收官请求: true, 指标: { 终值: { 起伏次数: 3 } } });
  const t = 造(账, { ...默认设置, 导演: { ...默认设置.导演, 注入世界书条目: true } });
  t.命令.清除剧终();
  check('已剧终清掉', 账.已剧终, false);
  check('收官请求清掉', 账.收官请求, false);
  check('终值清空(避免恢复游玩后挂旧成绩)', 账.指标?.终值, null);
  check('chat meta 双写', t.记录.includes('写已剧终:false'), true);
  check('按注入开关重写备忘', t.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重写备忘":true,"重注本幕":false}']);
}

console.log('\n[8b] ★ 落盘失败要回滚（2026-11-20 #507 ②）');
{
  // ── 这条钉的是本批修的缺陷 ──
  //  `修一笔` 是**就地改响应式对象**，改完界面上就已经变了。
  //  落盘失败时原来只打一行日志（"内存里仍生效"）—— **无回滚** →
  //  用户看到"改成功了"，刷新后没了。
  const 账 = 造账本({
    伏笔: [{ 编号: 7, 内容: 'x', 状态: '埋下' }],
  });
  const t = 造(账, 默认设置, { 落盘会失败: true });

  const 改成功 = t.命令.改伏笔状态(7, '发酵');
  check('★ 落盘失败 → 返回 false（不是"看起来成功"）', 改成功, false);
  check('★ 账本被恢复成改前那份（伏笔仍是"埋下"）', 账.伏笔[0].状态, '埋下');
  check('★ 确实调了 恢复账本', t.记录.includes('恢复账本'), true);
}

console.log('\n[8c] ★ 确认剧终落盘失败 → meta 侧一个字都不写（#510 ②）');
{
  // ── 这条钉的是"双写顺序"那个洞 ──
  //  原来"先写 meta 再落盘" → 落盘失败时留下"meta 说已剧终、账本不认"。
  //  现在"先落盘，成功才写 meta" → 失败则**两处都没变**。
  const 账 = 造账本({ 收官请求: true });
  const t = 造(账, 默认设置, { 落盘会失败: true });

  t.命令.确认剧终();

  check('★ 落盘失败 → 账本没变成已剧终', 账.已剧终, false);
  check('★ **chat meta 侧一个字都没写**', t.记录.includes('写已剧终:true'), false);
  check('★ 确实调了 恢复账本', t.记录.includes('恢复账本'), true);
}

console.log('\n[8] 三条修笔: 找到就改并提交, 找不到就什么都不做');
{
  const 账 = 造账本({
    伏笔: [{ 编号: 7, 内容: 'x', 状态: '埋下' }],
    冲突: [{ 名: '对峙', 阶段: '铺垫' }],
    弧线: [{ 角色: '林素问', 阶段: '缺口' }],
  });
  const t = 造(账, { ...默认设置, 导演: { ...默认设置.导演, 注入世界书条目: true } });

  check('改伏笔状态', t.命令.改伏笔状态(7, '发酵'), true);
  check('伏笔状态已改', 账.伏笔[0].状态, '发酵');
  check('伏笔改动重写备忘', t.记录.filter(项 => 项.startsWith('提交:')).pop(), '提交:{"重写备忘":true}');

  check('改冲突阶段', t.命令.改冲突阶段('对峙', '升级'), true);
  check('冲突阶段已改', 账.冲突[0].阶段, '升级');

  check('改弧线阶段', t.命令.改弧线阶段('林素问', '闭环'), true);
  check('弧线阶段已改', 账.弧线[0].阶段, '闭环');
  check('弧线不改写备忘(副作用为空)', t.记录.filter(项 => 项.startsWith('提交:')).pop(), '提交:null');

  const 之前 = t.记录.filter(项 => 项.startsWith('提交:')).length;
  check('找不到伏笔 → false', t.命令.改伏笔状态(999, '发酵'), false);
  check('找不到伏笔 → 不提交', t.记录.filter(项 => 项.startsWith('提交:')).length, 之前);
}

console.log('\n[9] 离线状态: 恢复接管与清计数都写回视图');
{
  const t = 造(造账本(), 默认设置);
  check('恢复自动接管返回离线状态', t.命令.恢复自动接管(), { 连续失败: 0 } as any);
  check('设自动暂停(false)', t.记录.includes('设自动暂停:false'), true);
  t.命令.清空离线计数();
  check('清推进失败', t.记录.includes('清推进失败'), true);
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
