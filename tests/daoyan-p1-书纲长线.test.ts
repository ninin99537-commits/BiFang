// 剧情导演 · 第二轮方案 P1: 书纲 / 伏笔分级与按场回响 / 兑现包与召回补缺 / 章长度提醒 / 迁移
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { SettingsSchema } from '../src/剧情导演/schema';
import { emptyData, loadData, writeStateSnapshot } from '../src/剧情导演/快照';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { 应用引擎输出 } from '../src/剧情导演/账本数据';
import { 构造本幕指令 } from '../src/剧情导演/引擎规则';
import { buildDirectorMessages, buildInjectionPrompt, build本幕指令 } from '../src/剧情导演/prompts';
import { 合并书纲, 叠加覆盖, 需要生成书纲, 渲染书纲块, 规范化书纲覆盖, 挂靠伏笔, 空书纲覆盖 } from '../src/剧情导演/书纲';
import { 渲染前情, 解析召回 } from '../src/剧情导演/证据链';
import { 回响提醒, 章长度提醒, 结构提醒, 读最近召回, 回响间隔, 章长度阈值 } from '../src/剧情导演/取料';
import { 书纲覆盖键, 写书纲覆盖 } from '../src/剧情导演/运行状态';

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
const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), ...部分 });
const 核验已执行 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
const 真相候选 = (部分: Record<string, any> = {}) => ({ ID: '', 真相: '药铺老板是主角失踪的父亲', 揭晓时机: '主角第一次失去重要的人之后', 线索计划: ['他左手缺一指'], 状态: '潜藏', 修订原因: [], ...部分 });

console.log('\n[书纲] 合并: 生成 / 签发 ID / 漏输出保留 / 改写要理由');
{
  const 首 = 合并书纲(null, { 核心问题: '她能不能原谅自己', 深层真相: [真相候选(), 真相候选({ 真相: '镇长在囤粮' })], 人物暗线: [{ 角色ID: '林晚', 暗线: '她要回京城继承家业' }] }, 4);
  check('首次生成: 两条真相, ID 由代码签 T1/T2', 首.书纲?.深层真相.map(x => x.ID), ['T1', 'T2']);
  check('生成场记下', 首.书纲?.生成场, 4);
  check('人物暗线进来', 首.书纲?.人物暗线.length, 1);
  check('没给书纲 → 原样保留', 合并书纲(首.书纲, undefined, 5).书纲, 首.书纲);
  const 漏 = 合并书纲(首.书纲, { 深层真相: [{ ...真相候选(), ID: 'T1' }] }, 5);
  check('只带回 T1 → T2 仍在(漏输出 ≠ 删除)', 漏.书纲?.深层真相.length, 2);
  const 无理由 = 合并书纲(首.书纲, { 深层真相: [{ ...真相候选({ 真相: '药铺老板其实是仇人' }), ID: 'T1' }] }, 5);
  check('RED: 无理由改写 → 保留原文', 无理由.书纲?.深层真相[0].真相, '药铺老板是主角失踪的父亲');
  ok('拒绝记录可见', 无理由.拒绝.some(x => x.includes('没给新的修订原因')));
  const 有理由 = 合并书纲(首.书纲, { 深层真相: [{ ...真相候选({ 真相: '药铺老板其实是仇人', 修订原因: ['主角在第 30 场杀了他的兄弟, 原设定撞毁'] }), ID: 'T1' }] }, 5);
  check('有理由改写 → 接受', 有理由.书纲?.深层真相[0].真相, '药铺老板其实是仇人');
  const 核心改 = 合并书纲(首.书纲, { 核心问题: '另一个问题' }, 5);
  check('核心问题确立后不随单轮改写', 核心改.书纲?.核心问题, '她能不能原谅自己');
  const 多 = 合并书纲(null, { 深层真相: [1, 2, 3, 4, 5, 6].map(n => 真相候选({ 真相: `真相${n}` })) }, 4);
  check('活跃真相上限 5', 多.书纲?.深层真相.length, 5);
  const 废 = 合并书纲(首.书纲, { 深层真相: [{ ...真相候选(), ID: 'T2', 真相: '镇长在囤粮', 状态: '已废弃' }] }, 6);
  const 复活 = 合并书纲(废.书纲, { 深层真相: [{ ...真相候选(), ID: 'T2', 真相: '镇长在囤粮', 状态: '潜藏' }] }, 7);
  check('已废弃不能复活', 复活.书纲?.深层真相.find(x => x.ID === 'T2')?.状态, '已废弃');
}

console.log('\n[书纲] 用户覆盖: 编辑 / 锁定 / 否决 / 重写');
{
  const 纲 = 合并书纲(null, { 核心问题: 'Q', 深层真相: [真相候选(), 真相候选({ 真相: '镇长在囤粮' })] }, 4).书纲!;
  const 覆盖 = 规范化书纲覆盖({ 真相: { T1: { 真相: '药铺老板是主角的舅舅', 锁定: true } }, 否决: { T2: '太俗套' } });
  const 叠 = 叠加覆盖(纲, 覆盖)!;
  check('用户编辑生效', 叠.深层真相[0].真相, '药铺老板是主角的舅舅');
  check('改过的标「来源: 用户」', 叠.深层真相[0].来源, '用户');
  check('锁定生效', 叠.深层真相[0].锁定, true);
  check('否决 → 已废弃', 叠.深层真相[1].状态, '已废弃');
  ok('否决原因记进修订原因', 叠.深层真相[1].修订原因.some(x => x.includes('太俗套')));
  const 想改锁定 = 合并书纲(叠, { 深层真相: [{ ...真相候选({ 真相: '导演想改成别的', 修订原因: ['理由'] }), ID: 'T1' }] }, 5);
  check('RED: 锁定的真相导演改不动(哪怕给了理由)', 想改锁定.书纲?.深层真相[0].真相, '药铺老板是主角的舅舅');
  const 想废锁定 = 合并书纲(叠, { 深层真相: [{ ...真相候选({ 真相: '药铺老板是主角的舅舅', 状态: '已废弃' }), ID: 'T1' }] }, 5);
  check('RED: 锁定的真相导演废不掉', 想废锁定.书纲?.深层真相[0].状态, '潜藏');
  const 补计划 = 合并书纲(叠, { 深层真相: [{ ...真相候选({ 真相: '药铺老板是主角的舅舅', 线索计划: ['他认得主角母亲的字'] }), ID: 'T1' }] }, 5);
  ok('锁定的真相可以补线索计划', 补计划.书纲!.深层真相[0].线索计划.includes('他认得主角母亲的字'));
  // 否决后只剩 1 条活跃 → 需要再生成; 提示词带否决原因
  check('否决后活跃 < 2 时仍有活跃 → 不强制整份重生成', 需要生成书纲(叠, 覆盖, 10, 4), false);
  const 块 = 渲染书纲块({ 书纲: 叠, 伏笔: [], 需要生成: false, 请求重写: false, 否决: 覆盖.否决, 有既有剧情: true });
  ok('提示词告诉导演: 用户否决过 T2 + 原因', 块.includes('T2') && 块.includes('太俗套') && 块.includes('另写一条'));
  ok('提示词标出用户锁定', 块.includes('用户锁定'));
  const 全否 = 叠加覆盖(纲, 规范化书纲覆盖({ 否决: { T1: '', T2: '' } }));
  check('全部否决 → 需要生成', 需要生成书纲(全否, null, 10, 4), true);
  // 重写: 导演没带回的自家真相作废, 用户锁定的保留
  const 重写 = 合并书纲(叠, { 深层真相: [真相候选({ 真相: '全新的真相' })] }, 9, { 重写: true });
  check('重写: 锁定的 T1 保留', 重写.书纲?.深层真相.find(x => x.ID === 'T1')?.状态, '潜藏');
  ok('重写: 新真相签了新 ID', 重写.书纲!.深层真相.some(x => x.真相 === '全新的真相' && x.ID === 'T3'));
  check('请求重写 → 需要生成', 需要生成书纲(纲, { ...空书纲覆盖(), 请求重写: true }, 10, 4), true);
}

console.log('\n[书纲] 生成时机: 第 4 轮(接管轮数)随首道指令; 老聊天倒推');
{
  check('第 3 轮之前不要', 需要生成书纲(null, null, 2, 4), false);
  check('第 4 轮(已分析 3)要', 需要生成书纲(null, null, 3, 4), true);
  check('老聊天(已分析 80, 没书纲)要', 需要生成书纲(null, null, 80, 4), true);
  const 块 = 渲染书纲块({ 书纲: null, 伏笔: [], 需要生成: true, 请求重写: false, 否决: {}, 有既有剧情: true });
  ok('老聊天: 要求从现有伏笔反推并挂靠', 块.includes('反推') && 块.includes('书纲ID'));
  ok('要求人物暗线(恋爱对象也有自己的事)', 块.includes('人物暗线') && 块.includes('恋爱对象'));
  const msgs = buildDirectorMessages({
    账本: 账本({ 已分析轮数: 3 }), reply: '', replyCount: 0, context: '', worldbook: '', playerName: null, playerDesc: '',
    书纲块: 块, 破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  ok('书纲块进了导演的 user 消息', (msgs.find(m => m.role === 'user')?.content ?? '').includes('【请生成书纲】'));
}

console.log('\n[书纲] 永不注入主 AI');
{
  const 纲 = 合并书纲(null, { 核心问题: '秘密的核心问题', 深层真相: [真相候选({ 真相: '绝密真相XYZ' })], 人物暗线: [{ 角色ID: '林晚', 暗线: '暗线ABC' }] }, 4).书纲!;
  const 账 = 账本({
    书纲: 纲,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进' } as any,
    当前指令: { 编号: 1, 节拍: '受挫', 硬性要求: 'x', 伏笔现场: '', 禁止事项: '', 生成楼层: 1, 核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [] } as any,
  });
  const 注入 = buildInjectionPrompt(账) + build本幕指令(账, SettingsSchema.parse({}));
  ok('RED: 编剧备忘与本幕指令里没有书纲真相', !注入.includes('绝密真相XYZ'));
  ok('没有核心问题', !注入.includes('秘密的核心问题'));
  ok('没有人物暗线', !注入.includes('暗线ABC'));
}

console.log('\n[书纲] 应用引擎输出 + 挂靠');
{
  const 旧 = 账本({ 已分析轮数: 3, 章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进' } as any });
  const r = 应用引擎输出(旧, {
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进' },
    书纲: { 核心问题: 'Q', 深层真相: [真相候选()] },
    伏笔: [{ 编号: '', 内容: '缺指的左手', 公开线头: '药铺老板左手缺一根小指', 状态: '埋下', 书纲ID: 'T1' }],
  }, 12);
  check('书纲落账', r.账本.书纲?.深层真相[0].ID, 'T1');
  const 新伏笔 = r.账本.伏笔[0];
  check('挂书纲的伏笔跨度自动 = 长', 新伏笔.跨度, '长');
  check('埋设场 = 本场(已分析+1)', 新伏笔.埋设场, 4);
  check('挂靠由代码算', 挂靠伏笔(r.账本.书纲, r.账本.伏笔), { T1: [新伏笔.编号] });
}

console.log('\n[回响] 按场计, 短线不提醒, 长线 15 场 / 中线 10 场');
{
  const 账 = 账本({
    已分析轮数: 40,
    伏笔: [
      { 编号: 1, 内容: '铜扣', 埋设层: 3, 埋设章: 1, 状态: '潜伏', 回收窗口: '', 关联冲突: '', 公开线头: '缺角的铜扣', 跨度: '长', 书纲ID: 'T1', 埋设场: 5, 最后回响场: 20 } as any,
      { 编号: 2, 内容: '旧信', 埋设层: 3, 埋设章: 1, 状态: '潜伏', 回收窗口: '', 关联冲突: '', 跨度: '中', 埋设场: 35, 最后回响场: 35 } as any,
      { 编号: 3, 内容: '雨夜', 埋设层: 3, 埋设章: 1, 状态: '潜伏', 回收窗口: '', 关联冲突: '', 跨度: '短', 埋设场: 1, 最后回响场: 1 } as any,
      { 编号: 4, 内容: '老伏笔', 埋设层: 3, 埋设章: 1, 状态: '潜伏', 回收窗口: '', 关联冲突: '' } as any,
    ],
  });
  const 提 = 回响提醒(账, 40);
  ok('长线 #1 已 20 场 → 提醒', 提.some(x => x.includes('#1') && x.includes('缺角的铜扣') && x.includes('T1')));
  ok('中线 #2 才 5 场 → 不提', !提.some(x => x.includes('#2')));
  ok('短线 #3 → 不提', !提.some(x => x.includes('#3')));
  ok('老账本没场号的 #4 → 不猜', !提.some(x => x.includes('#4')));
  check('阈值', 回响间隔, { 中: 10, 长: 15 });
  ok('结构提醒里带上了回响', 结构提醒(账, 40).some(x => x.includes('轻回响')));
  // 回响后更新最后回响场
  const r = 应用引擎输出(账本({ ...账, 已分析轮数: 40 }), {
    伏笔: [{ 编号: 1, 内容: '铜扣', 状态: '潜伏', 中间回响: [{ 记忆引用: 'AM0090', 楼层: 88, 公开摘要: '铜扣出现在仓库门口的泥里' }] }],
  }, 88);
  check('中间回响变多 → 最后回响场 = 本场', r.账本.伏笔.find(x => x.编号 === 1)?.最后回响场, 41);
  check('埋设场冻结', r.账本.伏笔.find(x => x.编号 === 1)?.埋设场, 5);
  check('跨度保持长', r.账本.伏笔.find(x => x.编号 === 1)?.跨度, '长');
}

console.log('\n[章长度] 40 场没收束 → 提醒');
{
  check('阈值 40', 章长度阈值, 40);
  const 账 = 账本({ 章回: { 章号: 2, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 10 } as any });
  // 2026-11-12 口径统一（需求方裁定）：起始场本身算第一场 → 演了几场 = 当前场 − 起始场 + 1。
  // 起始场 10、第 50 场 → 41 场（以前这里写 40，钉的就是"少一场"的错口径）。
  ok('第 50 场 → 提醒', 章长度提醒(账, 50).some(x => x.includes('第 2 章已经演了 41 场')));
  // 第 49 场 → 49−10+1 = 40，**正好到阈值**（`长 < 40 → 不提`），所以会提醒。
  // 要验"不到阈值不提"，得退到第 48 场（39 场）。原来写"第 49 场"是错口径下的巧合。
  check('第 48 场 → 不提（39 场，未到阈值）', 章长度提醒(账, 48), []);
  check('第 49 场 → 提醒（40 场，正好到阈值）', 章长度提醒(账, 49).length, 1);
  check('收束中 → 不提', 章长度提醒(账本({ 章回: { 章号: 2, 主题: 'x', 计划高潮: '', 进度: '收束', 起始场: 1 } as any }), 99), []);
  const 换章 = 应用引擎输出(账本({ 已分析轮数: 20, 章回: { 章号: 2, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 10 } as any }), { 章回: { 章号: 3, 主题: 'y', 计划高潮: '', 进度: '铺垫' } }, 50);
  check('换章 → 起始场 = 本场', 换章.账本.章回?.起始场, 21);
  const 同章 = 应用引擎输出(账本({ 已分析轮数: 20, 章回: { 章号: 2, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 10 } as any }), { 章回: { 章号: 2, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 999 } }, 50);
  check('同章 → 沿用起始场(不接受模型给的值)', 同章.账本.章回?.起始场, 10);
}

console.log('\n[兑现包] 前情: 附公开摘要, 召回里有的只写引用, 不带幕后真相');
{
  const 条: any = {
    编号: 7, 内容: '铜扣', 埋设层: 12, 埋设章: 1, 状态: '待兑现', 回收窗口: '', 关联冲突: '', 公开线头: '缺角的铜扣', 幕后真相: '铜扣是父亲的遗物',
    埋设证据: [{ 记忆引用: 'AM0012', 楼层: 12, 公开摘要: '她把那枚缺了一角的铜扣塞进了药箱夹层', 定位: '已核' }],
    中间回响: [{ 记忆引用: 'AM0087', 楼层: 87, 公开摘要: '铜扣再次出现在仓库门口的泥里', 定位: '已核' }],
  };
  const 全 = 渲染前情(条);
  check('两条前情, 按楼层排', 全, ['#7（埋下）第 12 层：她把那枚缺了一角的铜扣塞进了药箱夹层', '#7（回响）第 87 层：铜扣再次出现在仓库门口的泥里']);
  // 优化 3: 召回是上一条消息的, 下一轮未必还在 —— 有摘要就一律附上, 不再省略
  const 省 = 渲染前情(条, new Set(['AM0087']));
  check('召回里有 AM0087 → 仍附摘要(不省略)', 省, 全);
  const 无摘要 = 渲染前情({ ...条, 中间回响: [{ 记忆引用: 'AM0087', 楼层: 87, 公开摘要: '', 定位: '已核' }] }, new Set(['AM0087']));
  ok('没有摘要时才退回写记忆编号', 无摘要[1] === '#7（回响）第 87 层：见记忆 AM0087');
  ok('前情不带幕后真相', !全.join('').includes('父亲的遗物'));
  check('解析召回', [...解析召回('<scene>x</scene><recall>AM0001, am0002 ,AM0103</recall>')], ['AM0001', 'AM0002', 'AM0103']);
  check('没有 recall 标签 → 空集', 解析召回('随便什么').size, 0);
  // 构造指令: 点名 #7 → 前情进指令; 未点名不进
  const 账 = 账本({ 已分析轮数: 60, 伏笔: [条] });
  const r = 构造本幕指令({ 旧指令: null, 下一幕: { 节拍: '兑现伏笔', 伏笔现场: '#7 在仓库' }, 账本: 账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 120, 暂停注入: false, 已召回: new Set(['AM0087']) });
  check('点名 #7 → 指令带两条前情', r.指令?.前情?.length, 2);
  const 文本 = build本幕指令({ ...账, 当前指令: r.指令 }, SettingsSchema.parse({}));
  ok('本幕指令渲染出 7. 前情', 文本.includes('7. 前情') && 文本.includes('药箱夹层'));
  ok('本幕指令里没有幕后真相', !文本.includes('父亲的遗物'));
  const 未点名 = 构造本幕指令({ 旧指令: null, 下一幕: { 节拍: '阴影' }, 账本: 账, 核验: 核验已执行, 档位: 3, 红线: [], 楼层: 120, 暂停注入: false });
  check('未点名 → 无前情', 未点名.指令?.前情 ?? [], []);
  // 读最近召回: 宿主没有 recallPlot(老测试台/记忆插件没装) → 空集不抛
  check('宿主没有 recallPlot → 空集', 读最近召回({ chat: {} as any }, 9).size, 0);
  check('从锚点往前找到最近一条有召回的楼', [...读最近召回({ chat: { recallPlot: (id: number) => (id === 8 ? '<recall>AM0004</recall>' : '') } as any }, 9)], ['AM0004']);
}

console.log('\n[迁移] 老快照没有书纲 / 新字段 → 不崩; 用户覆盖不随删楼回滚');
{
  const floors: Record<number, any> = { 5: { role: 'assistant', message: 'x', is_hidden: false } };
  const floorVars: Record<number, any> = {};
  let chatVars: Record<string, any> = {};
  injectHostForTest({
    vars: {
      get: (o: any) => (o.type === 'chat' ? chatVars : o.type === 'message' ? floorVars[o.message_id] ?? {} : {}),
      update: (fn: any, o: any) => {
        if (o.type === 'chat') chatVars = fn(chatVars);
        else if (o.type === 'message') floorVars[o.message_id] = fn(floorVars[o.message_id] ?? {});
        return {};
      },
      del: () => ({ variables: {}, delete_occurred: false }),
      insertOrAssign: () => ({}),
      scriptId: () => 'test',
    } as any,
    chat: { messages: (r: any) => (floors[Number(r)] ? [{ message_id: Number(r), ...floors[Number(r)] }] : []), lastMessageId: () => 5, currentChatId: () => 'c', isGroupChat: () => false, recallPlot: () => '' } as any,
  });
  resetSettingsReadCacheForTest();
  const 纲 = 合并书纲(null, { 核心问题: 'Q', 深层真相: [真相候选()] }, 4).书纲!;
  ok('写快照', writeStateSnapshot(账本({ 书纲: 纲, 已分析轮数: 4 }), 5, 5, true));
  check('读回书纲', loadData().书纲?.深层真相[0].真相, '药铺老板是主角失踪的父亲');
  写书纲覆盖({ ...空书纲覆盖(), 真相: { T1: { 真相: '用户改的真相', 锁定: true } } });
  ok('覆盖存在单独的聊天变量键', !!chatVars[书纲覆盖键]);
  check('装载时叠上用户覆盖', loadData().书纲?.深层真相[0].真相, '用户改的真相');
  // 老快照: 删掉书纲字段
  delete floorVars[5]['剧情导演'].书纲;
  check('老快照没有书纲 → null, 不崩', loadData().书纲, null);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
