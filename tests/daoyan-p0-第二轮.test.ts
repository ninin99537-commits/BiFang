// 剧情导演 · 第二轮方案 P0(docs/剧情导演-长线伏笔与反迎合-第二轮方案.md 第 4/3/7 节)
//   4.1 本幕揭示只出被点名的待兑现伏笔
//   4.2 契诃夫之枪/收束调度在导演有明确意图时不改节拍(但照记催办)
//   7.1 真实命运并进档位 + 老设置迁移
//   3.x 提示词: 可预测性自查 / 名词锚点 / 场与幕 / 参考与确定事项
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 构造本幕指令, 取命运规则, 取点名伏笔, 装配本幕揭示 } from '../src/剧情导演/引擎规则';
import { SYSTEM_PROMPT, buildDirectorMessages, build本幕指令 } from '../src/剧情导演/prompts';
import { SettingsSchema } from '../src/剧情导演/schema';
import { 迁移真实命运, 旧版残留键 } from '../src/剧情导演/settings';

(globalThis as any)._ = {
  clamp: (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
  cloneDeep: (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
};

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
const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), ...部分 });
const 核验已执行 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
const 伏笔 = (部分: Record<string, any>): any => ({
  编号: 1, 内容: '铜扣', 埋设层: 3, 埋设章: 1, 状态: '发酵', 回收窗口: '', 关联冲突: '', 公开线头: '她把缺角的铜扣塞进药箱', ...部分,
});

console.log('\n[4.1] 本幕揭示: 只出被点名的待兑现');
{
  const 账 = 账本({
    已分析轮数: 6,
    伏笔: [
      伏笔({ 编号: 3, 状态: '待兑现', 公开线头: '铜扣' }),
      伏笔({ 编号: 7, 状态: '待兑现', 公开线头: '旧信' }),
      伏笔({ 编号: 9, 状态: '待兑现', 公开线头: '雨夜的敲门声' }),
    ],
  });
  check('取点名: 现场 + 硬性要求里的 #N', 取点名伏笔({ 伏笔现场: '#7 在抽屉里', 硬性要求: '让 #9 回响一次' }).sort(), [7, 9]);
  const 揭示 = 装配本幕揭示(账, { 伏笔现场: '#7 在抽屉里' });
  ok('点名的 #7 进揭示', 揭示.some(x => x.includes('旧信')));
  ok('RED: 没点名的 #3 不进', !揭示.some(x => x.includes('铜扣')));
  ok('RED: 没点名的 #9 不进', !揭示.some(x => x.includes('雨夜')));
  check('什么都没点名 → 空', 装配本幕揭示(账, {}), []);
  check('显式排除优先', 装配本幕揭示(账, {}, { 点名: [3, 7], 排除: [3] }).length, 1);

  // 走完整构造: 导演没点名任何线, 三条待兑现都不该冒出来
  const r = 构造本幕指令({ 旧指令: null, 下一幕: { 节拍: '阴影' }, 账本: 账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 20, 暂停注入: false });
  check('RED: 构造出的指令不会一次催三条', (r.指令?.本幕揭示 ?? []).length, 0);

  // 收官幕: 全部待了结的都点名
  const 收官 = 构造本幕指令({ 旧指令: null, 下一幕: {}, 账本: { ...账, 收官请求: true } as any, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 20, 暂停注入: false });
  check('收官幕: 三条待兑现都进揭示', (收官.指令?.本幕揭示 ?? []).length, 3);
}

console.log('\n[4.2] 契诃夫之枪 / 收束调度: 尊重导演的明确意图');
{
  const 逾期账 = 账本({
    已分析轮数: 5,
    下一指令编号: 2,
    章回: { 章号: 4, 主题: '夺嫡', 计划高潮: '', 进度: '推进' } as any,
    伏笔: [伏笔({ 编号: 5, 内容: '玉佩', 回收窗口: '第3章收束前' })],
  });
  const 有意图 = 构造本幕指令({
    旧指令: null, 下一幕: { 节拍: '受挫', 硬性要求: '刺客在城门口截住主角, 夺走密信' },
    账本: 逾期账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 9, 暂停注入: false,
      // 2026-11-13: 这条验的是「结构规则优先」**关闭**时的老行为（让位给导演意图）
      结构规则优先: false,
  });
  check('RED: 有明确意图时保留导演节拍', 有意图.指令?.节拍, '受挫');
  ok('调整里留了建议', 有意图.调整.some(x => x.includes('契诃夫之枪') && x.includes('保留其节拍')));
  ok('现场没被塞进 #5', !(有意图.指令?.伏笔现场 ?? '').includes('#5'));
  check('仍然记催办(本章不再反复提)', 有意图.催办更新, [5]);

  const 无意图 = 构造本幕指令({ 旧指令: null, 下一幕: { 节拍: '小胜' }, 账本: 逾期账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 9, 暂停注入: false });
  check('无明确意图: 照旧改成兑现伏笔', 无意图.指令?.节拍, '兑现伏笔');
  ok('无明确意图: 现场带 #5', (无意图.指令?.伏笔现场 ?? '').includes('#5'));

  const 收束账 = 账本({
    已分析轮数: 9,
    章回: { 章号: 5, 主题: 'x', 计划高潮: '', 进度: '收束' } as any,
    伏笔: [伏笔({ 编号: 2, 目标窗口: { 最早章: 4, 最迟章: 6 } })],
  });
  const 收束有意图 = 构造本幕指令({ 旧指令: null, 下一幕: { 节拍: '反转', 硬性要求: '盟友倒戈' }, 账本: 收束账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 40, 暂停注入: false, 结构规则优先: false });
  check('收束调度同样让位', 收束有意图.指令?.节拍, '反转');
  ok('收束调度留建议', 收束有意图.调整.some(x => x.includes('收束调度') && x.includes('保留其节拍')));
}

console.log('\n[7.1] 命运并进档位');
{
  check('档 1', 取命运规则(1).取消保送, false);
  check('档 2', 取命运规则(2).取消保送, false);
  check('档 3 取消保送', 取命运规则(3).取消保送, true);
  check('档 3 主角死亡不自动续演', 取命运规则(3).主角死亡续演, false);
  check('档 4 主角死亡续演', 取命运规则(4).主角死亡续演, true);
  check('越界档位被夹住', 取命运规则(9).主角死亡续演, true);
  check('默认档位是 3', SettingsSchema.parse({}).导演.强度档位, 3);

  check('迁移: 开过真实命运 + 档 2 → 提到 3', 迁移真实命运({ 真实命运模式: true, 导演: { 强度档位: 2 } }), 3);
  check('迁移: 开过真实命运 + 档 4 → 不动', 迁移真实命运({ 真实命运模式: true, 导演: { 强度档位: 4 } }), null);
  check('迁移: 没开过 → 不动', 迁移真实命运({ 真实命运模式: false, 导演: { 强度档位: 1 } }), null);
  check('迁移: 没写档位(默认 3) → 不动', 迁移真实命运({ 真实命运模式: true }), null);
  ok('真实命运模式在残留键清单里(启动时删掉)', (旧版残留键 as readonly string[]).includes('真实命运模式'));

  const 设置 = SettingsSchema.parse({ 导演: { 强度档位: 3 } });
  const msgs = buildDirectorMessages({
    账本: 账本(), reply: '', replyCount: 0, context: '', worldbook: '', playerName: null, playerDesc: '',
    档位: 3, 破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  ok('档 3 的系统提示带命运规则', msgs.some(m => m.role === 'system' && m.content.includes('命运规则(第 3 档')));
  void 设置;
}

console.log('\n[3.x] 提示词');
{
  ok('3.1 可预测性自查', SYSTEM_PROMPT.includes('可预测性自查') && SYSTEM_PROMPT.includes('最可能猜到'));
  ok('3.2 名词锚点', SYSTEM_PROMPT.includes('可检索的名词锚点'));
  ok('3.2 双重读法', SYSTEM_PROMPT.includes('双重读法'));
  ok('3.6 场与幕分开说明', SYSTEM_PROMPT.includes('【场与幕'));
  const msgs = buildDirectorMessages({
    账本: 账本({ 已分析轮数: 12 }), reply: '', replyCount: 0, context: '', worldbook: '', playerName: null, playerDesc: '',
    破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  const user = msgs.find(m => m.role === 'user')?.content ?? '';
  ok('3.6 账本里叫「当前场」', user.includes('"当前场":12'));
  ok('3.6 不再有歧义的「当前幕」键', !user.includes('"当前幕"'));

  const 指令账 = 账本({
    当前指令: { 编号: 3, 节拍: '受挫', 硬性要求: 'x', 伏笔现场: '', 禁止事项: '', 生成楼层: 1, 核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [] } as any,
  });
  const 文本 = build本幕指令(指令账, SettingsSchema.parse({}));
  ok('3.7 仍以【本幕参考】开头(世界书清理按它识别)', 文本.startsWith('【本幕参考】'));
  // 2026-11-12 硬约束通道: 统辖句改写 —— 现在点名【本幕硬约束】也属于"必须体现",
  // 且与第 5/6 项一起列在"只能换写法, 不能换结果"里(以前只写【本幕已确定】与第 5、6 项)。
  // 2026-11-12 统辖句扩了一条: 第 4 项（禁令）也摘进"必须体现"里（它没有"写法"可换）。
  ok('3.7 写明【本幕已确定】与第 5/6 项必须体现', 文本.includes('【本幕已确定】、第 4 项的禁令、第 5、6 项都是必须体现的'));
  ok('统辖句同时点名【本幕硬约束】', 文本.includes('【本幕硬约束】、第 1 项的结构要求'));
  // 2026-11-11: 节拍从"演法建议"里摘出来 —— 它是这一幕的结构要求(核验也按它判), 不能再被
  // "第 1~4 项不必逐字照做"这句话放行。
  ok('节拍不再落在"不必照做"的豁免里', !文本.includes('第 1~4 项是导演给的演法建议'));
  ok('节拍单独写成"结构要求"', 文本.includes('1. 这一幕的结构要求：受挫'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
