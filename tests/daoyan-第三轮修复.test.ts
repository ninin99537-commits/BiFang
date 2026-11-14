// 剧情导演 · 第三轮审查修复(2026-11-01)。
//   A 账本闸门: 新持久后果记得上 / 正文证据能当状态证据 / 首次入册也过保护 / 章回漏输出保留 / 伏笔重复编号
//   B 必演: 旧命运必演不被新的顶掉 / 同一人改写继承计数 / 保护名单同一性
//   C 书纲: 否决的真相换 ID 不能复活 / 解锁真的生效 / 修订原因判"新"不判条数
//   D 取料: 召回编码进世界书扫描 / <cb> 信息边界 / 漏读补齐
//   E 面板: 停用状态 / 危险操作确认
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 应用引擎输出, 读者领先上限, 代价保留条数 } from '../src/剧情导演/账本数据';
import { 装配必演 } from '../src/剧情导演/引擎规则';
import { 合并书纲, 叠加覆盖, 规范化书纲覆盖 } from '../src/剧情导演/书纲';
import { 是保护角色, 文本提到保护角色 } from '../src/剧情导演/字段表';
import { 解析信息边界, 读最近召回原文, 采集本轮输入, 补读上限 } from '../src/剧情导演/取料';
import { 渲染前情, 前情回响上限 } from '../src/剧情导演/证据链';
import { 计算运行状态 } from '../src/剧情导演/球状态';
import { buildDirectorMessages } from '../src/剧情导演/prompts';
import { SettingsSchema } from '../src/剧情导演/schema';
import { createPinia, setActivePinia } from 'pinia';
import vueSource from '../src/剧情导演/悬浮球界面.vue?raw';

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
const 人 = (角色ID: string, 状态 = '活跃', 部分: Record<string, any> = {}): any => ({
  角色ID, 状态, 状态证据: [], 状态历史: [], 独立目标: [], 当前关系: [], 永久后果: [], 持久后果: [], 承诺与债务: [], 已知事实引用: [], 未竟计划: [], 最后变化: null, 最后变化楼层: 0, ...部分,
});
const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), 已分析轮数: 10, ...部分 });
const 找 = (账: 导演账本, ID: string) => 账.角色命运.find(x => x.角色ID === ID);

console.log('\n[A1] 已在册角色的新持久后果能记上(只有保护名单里的人不许新增)');
{
  const 载 = { 角色命运: [{ 角色ID: '艾莉', 状态: '活跃', 持久后果: [{ ID: '断臂', 内容: '右臂骨折', 来源证据: [{ 记忆引用: 'AM0001', 楼层: 10, 公开摘要: '中弹' }], 状态: '持续' }] }] };
  const r = 应用引擎输出(账本({ 角色命运: [人('艾莉')] }), 载, 10, { 正文楼层: [10] });
  check('普通角色: 新后果记上', 找(r.账本, '艾莉')!.持久后果!.map(x => x.ID), ['断臂']);
  const 保 = 应用引擎输出(账本({ 角色命运: [人('艾莉')] }), 载, 10, { 正文楼层: [10], 保护角色: ['艾莉'] });
  check('保护角色: 新后果不记', 找(保.账本, '艾莉')!.持久后果!.length, 0);
  ok('保护角色: 丢掉的后果有拒绝记录', 保.拒绝.some(x => x.includes('右臂骨折')));
}

console.log('\n[A2] 本轮正文里的"楼层 + 摘要"能当状态证据(刚发生的事还没有 AM)');
{
  const 载 = { 角色命运: [{ 角色ID: '乔尔', 状态: '死亡', 状态证据: [{ 记忆引用: '', 楼层: 11, 公开摘要: '中枪倒地' }] }] };
  const r = 应用引擎输出(账本({ 角色命运: [人('乔尔')] }), 载, 11, { 正文楼层: [9, 11] });
  check('状态转成死亡', 找(r.账本, '乔尔')!.状态, '死亡');
  check('证据标成已核', 找(r.账本, '乔尔')!.状态证据[0].定位, '已核');
  const 旧楼 = 应用引擎输出(账本({ 角色命运: [人('乔尔')] }), { 角色命运: [{ 角色ID: '乔尔', 状态: '死亡', 状态证据: [{ 记忆引用: '', 楼层: 3, 公开摘要: '中枪' }] }] }, 11, { 正文楼层: [9, 11] });
  check('楼层不在本轮正文里 + 没有 AM → 仍然拒收', 找(旧楼.账本, '乔尔')!.状态, '活跃');
  const 空摘要 = 应用引擎输出(账本({ 角色命运: [人('乔尔')] }), { 角色命运: [{ 角色ID: '乔尔', 状态: '死亡', 状态证据: [{ 记忆引用: '', 楼层: 11, 公开摘要: '' }] }] }, 11, { 正文楼层: [11] });
  check('没有摘要的空证据 → 拒收', 找(空摘要.账本, '乔尔')!.状态, '活跃');
}

console.log('\n[A3] 保护名单对首次入册同样生效');
{
  const 载 = { 角色命运: [{ 角色ID: '林晚', 状态: '死亡', 状态证据: [{ 记忆引用: 'AM0001', 楼层: 10, 公开摘要: '坠崖' }] }] };
  const r = 应用引擎输出(账本(), 载, 10, { 保护角色: ['林晚'], 正文楼层: [10] });
  check('首次入册写死亡 → 记为活跃', 找(r.账本, '林晚')!.状态, '活跃');
  ok('有红线拒绝记录', r.拒绝.some(x => x.includes('【红线】') && x.includes('林晚')));
  const 括注 = 应用引擎输出(账本(), { 角色命运: [{ ...载.角色命运[0], 角色ID: '林晚（剑客）' }] }, 10, { 保护角色: ['林晚'], 正文楼层: [10] });
  check('角色ID 带括注也拦得住', 找(括注.账本, '林晚（剑客）')!.状态, '活跃');
  const 非保护 = 应用引擎输出(账本(), 载, 10, { 保护角色: ['林'], 正文楼层: [10] });
  check('保护"林"不会连带"林晚"', 找(非保护.账本, '林晚')!.状态, '死亡');
}

console.log('\n[A4] 章回漏输出保留, 半截输出补齐');
{
  const 章 = { 章号: 3, 主题: '北门', 计划高潮: '守住北门', 进度: '推进', 起始场: 5 } as any;
  check('载荷没有章回键 → 沿用', 应用引擎输出(账本({ 章回: 章 }), { 伏笔: [] }, 10).账本.章回?.章号, 3);
  const 空 = 应用引擎输出(账本({ 章回: 章 }), { 章回: null }, 10);
  check('显式 null 但没完结 → 保留', 空.账本.章回?.章号, 3);
  ok('并记一笔', 空.拒绝.some(x => x.includes('章回被清空')));
  check('旧章回已完结 + null → 清空(本章结束)', 应用引擎输出(账本({ 章回: { ...章, 进度: '已完结' } }), { 章回: null }, 10).账本.章回, null);
  const 半 = 应用引擎输出(账本({ 章回: 章 }), { 章回: { 主题: '北门之后' } }, 10).账本.章回!;
  check('缺章号/进度 → 从旧章回补', [半.章号, 半.进度, 半.主题], [3, '推进', '北门之后']);
}

console.log('\n[A5] 伏笔: 重复编号只认第一次 / "#3" 写法能对上 / 同内容新条只签一次');
{
  const 旧 = 账本({ 伏笔: [{ 编号: 3, 内容: '缺角铜扣', 状态: '埋下', 埋设层: 2, 回收窗口: '', 关联冲突: '' } as any], 下一伏笔编号: 4 });
  const 重 = 应用引擎输出(旧, { 伏笔: [{ 编号: 3, 内容: '缺角铜扣', 状态: '潜伏' }, { 编号: 3, 内容: '缺角铜扣', 状态: '发酵' }] }, 10);
  check('只有一条 #3', 重.账本.伏笔.filter(x => x.编号 === 3).length, 1);
  check('认第一次的状态', 重.账本.伏笔.find(x => x.编号 === 3)!.状态, '潜伏');
  const 井 = 应用引擎输出(旧, { 伏笔: [{ 编号: '#3', 内容: '别的说法', 状态: '潜伏' }] }, 10);
  check('"#3" 对上旧条, 不另签新号', [井.账本.伏笔.length, 井.账本.下一伏笔编号], [1, 4]);
  const 同 = 应用引擎输出(账本(), { 伏笔: [{ 内容: '雨夜的敲门声' }, { 内容: '雨夜的敲门声' }] }, 10);
  check('同内容新条只签一次', 同.账本.伏笔.length, 1);
}

console.log('\n[A6] 会无限增长的数组有界');
{
  const 多领先 = Array.from({ length: 读者领先上限 + 3 }, (_, i) => ({ 事项: `信息差${i}`, 哪些角色还不知道: ['A'], 建立幕: i, 最后更新幕: i }));
  const r = 应用引擎输出(账本({ 读者领先: 多领先 }), {}, 10);
  check('读者领先封顶', r.账本.读者领先.length, 读者领先上限);
  ok('去掉的是最久没动的', !r.账本.读者领先.some(x => x.事项 === '信息差0'));
  const 多代价 = Array.from({ length: 代价保留条数 + 5 }, (_, i) => ({ 楼层: i, 章号: 1, 内容: `代价${i}`, 核验: '已核' as const }));
  check('代价账封顶', 应用引擎输出(账本({ 代价: 多代价 }), {}, 10).账本.代价.length, 代价保留条数);
  const 伏 = { 编号: 1, 内容: 'x', 埋设证据: [{ 记忆引用: 'AM0001', 楼层: 1, 公开摘要: '埋' }], 中间回响: [1, 2, 3, 4, 5].map(n => ({ 记忆引用: `AM000${n + 1}`, 楼层: n * 10, 公开摘要: `回响${n}` })) } as any;
  const 前情 = 渲染前情(伏);
  check('前情: 埋设 + 最近 3 条回响', 前情.length, 1 + 前情回响上限);
  ok('前情: 留的是最近的回响', 前情.some(x => x.includes('回响5')) && !前情.some(x => x.includes('回响1')));
}

console.log('\n[B] 命运必演: 旧的没演出来不被新的顶掉');
{
  const 旧必演 = { 内容: '林晚离开小镇', 命运: true, 角色ID: '林晚', 镜头外: false, 既成事实: false, 未执行轮: 0 };
  const 调整: string[] = [];
  const 换人 = 装配必演({ 候选: { 内容: '乔尔受伤', 命运: true, 角色ID: '乔尔' }, 旧: 旧必演, 已执行: false, 保护角色: [], 调整 });
  check('换了别人 → 先演旧的', [换人?.角色ID, 换人?.未执行轮], ['林晚', 1]);
  ok('记了一笔"先放下"', 调整.some(x => x.includes('先放下')));
  const 改写 = 装配必演({ 候选: { 内容: '林晚连夜搬走', 命运: true, 角色ID: '林晚' }, 旧: { ...旧必演, 未执行轮: 1 }, 已执行: false, 保护角色: [], 调整: [] });
  check('同一人改写 → 新内容 + 继承计数 + 转既成事实', [改写?.内容, 改写?.未执行轮, 改写?.既成事实], ['林晚连夜搬走', 2, true]);
  const 撤 = { 撤下: false };
  const 调2: string[] = [];
  装配必演({ 候选: null, 旧: { ...旧必演, 未执行轮: 2, 既成事实: true }, 已执行: false, 保护角色: [], 调整: 调2, 出参: 撤 });
  ok('撤下文案用新计数(3 轮)', 撤.撤下 && 调2.some(x => x.includes('已 3 轮')));
  check('保护名单同一性: 括注', 是保护角色('林晚（剑客）', ['林晚']), true);
  check('保护名单同一性: 不做包含', 是保护角色('林晚', ['林']), false);
  check('文本里提到两字名', 文本提到保护角色('让林晚离开', ['林晚']), '林晚');
  check('单字名不按文本匹配', 文本提到保护角色('树林里有人离开', ['林']), null);
  const 拦 = 装配必演({ 候选: { 内容: '剑客离开', 命运: true, 角色ID: '林晚（剑客）' }, 旧: null, 已执行: true, 保护角色: ['林晚'], 调整: [] });
  check('必演: 括注 ID 也被拦', 拦, null);
}

console.log('\n[C] 书纲');
{
  const 真 = (部分: Record<string, any> = {}) => ({ ID: '', 真相: '药铺老板是主角失踪的父亲', 揭晓时机: '', 线索计划: [], 状态: '潜藏', 修订原因: [], ...部分 });
  const 纲 = 合并书纲(null, { 核心问题: 'Q', 深层真相: [真(), 真({ 真相: '镇长在囤粮' })] }, 4).书纲!;
  const 废 = 叠加覆盖(纲, 规范化书纲覆盖({ 否决: { T2: '太俗' } }))!;
  const 复活 = 合并书纲(废, { 深层真相: [真({ 真相: '镇长 在囤粮。' })] }, 5);
  check('否决的真相换个 ID(空)原样交回 → 不收', 复活.书纲!.深层真相.length, 2);
  ok('并说明原因', 复活.拒绝.some(x => x.includes('已废弃') && x.includes('T2')));
  const 锁 = 叠加覆盖(纲, 规范化书纲覆盖({ 真相: { T1: { 锁定: true } } }))!;
  check('锁定生效', 锁.深层真相[0].锁定, true);
  const 解 = 叠加覆盖(锁, 规范化书纲覆盖({ 真相: { T1: { 锁定: false } } }))!;
  check('显式解锁能盖掉快照里的 true', 解.深层真相[0].锁定, false);
  const 垫 = 合并书纲(纲, { 深层真相: [真({ ID: 'T1', 真相: '改写', 修订原因: ['剧情需要', '剧情需要'] })] }, 5);
  check('重复的同一条原因 → 规范化后只算一条, 仍然算"新理由"(首次给理由)', 垫.书纲!.深层真相[0].真相, '改写');
  const 再改 = 合并书纲(垫.书纲, { 深层真相: [真({ ID: 'T1', 真相: '又改', 修订原因: ['剧情需要', '剧情需要'] })] }, 6);
  check('拿旧理由重复写 → 不算新理由, 拒绝改写', 再改.书纲!.深层真相[0].真相, '改写');
  ok('面板解锁写 false 而不是删键', vueSource.includes('项.锁定 = 锁;'));
}

console.log('\n[D] 取料: 召回编码 / 信息边界 / 漏读补齐');
{
  const 原文 = '<dm_plan>…</dm_plan>\n<recall>\nAM0256 | 0m\nAM0221 | 200d\n</recall>\n<cb>\n角色能力与信息边界：\n【Lim】不知道乔尔已从工坊赶来。\n【艾莉】不能确认南侧路线是否被封锁。\n</cb>';
  check('信息边界去掉插件标题行', 解析信息边界(原文), '【Lim】不知道乔尔已从工坊赶来。\n【艾莉】不能确认南侧路线是否被封锁。');
  check('没有 <cb> → 空', 解析信息边界('<recall>AM0001</recall>'), '');
  check('读最近召回原文: 往前找到用户楼', 读最近召回原文({ chat: { recallPlot: (id: number) => (id === 8 ? 原文 : '') } as any }, 9), 原文);

  // 采集本轮输入: 世界书扫描文本里要带上召回编码; 信息边界进导演提示词; 漏读补齐
  const 楼 = new Map<number, any>();
  for (let i = 1; i <= 20; i++) 楼.set(i, { message_id: i, role: i % 2 === 0 ? 'assistant' : 'user', message: i % 2 === 0 ? `正文${i}`.padEnd(600, '。') : `输入${i}`, is_hidden: false });
  const host: any = {
    chat: {
      lastMessageId: () => 20,
      messages: (范围: any, 选项?: any) => {
        const [a, b] = String(范围).split('-').map(Number);
        return [...楼.values()].filter(m => m.message_id >= a && m.message_id <= (b ?? a) && (!选项?.role || m.role === 选项.role));
      },
      recallPlot: (id: number) => (id === 19 ? 原文 : ''),
    },
    persona: { name: () => 'Lim', description: () => '' },
    worldbook: { boundNames: () => ({ primary: '', additional: [] }), chatName: () => '', globalNames: () => [] },
  };
  const 底 = SettingsSchema.parse({});
  const 设置 = { ...底, 导演: { ...底.导演, 读取世界书: false, 读取最近回复数: 3 } }; // 世界书读取依赖宿主环境; 这里只验信息边界与补读
  const 取 = await 采集本轮输入(host, 账本({ 处理到楼层: 6 }), 设置, false, null);
  ok('取料成功', 取.成功);
  if (取.成功) {
    const 用户块 = 取.输入.messages.map(m => m.content).join('\n');
    ok('信息边界进了导演提示词', 用户块.includes('【角色信息边界') && 用户块.includes('乔尔已从工坊赶来'));
    check('处理到 #6 之后有 7 条回复 → 补读到 7 条(超过默认 3 条)', 取.输入.recent.length, 7);
    check('召回集合', [...取.输入.已召回], ['AM0256', 'AM0221']);
  }
  const 远 = await 采集本轮输入(host, 账本({ 处理到楼层: 0 }), 设置, false, null);
  if (远.成功) check('没有处理记录 → 按设置读 3 条', 远.输入.recent.length, 3);
  ok('补读有上限', 补读上限 >= 3 && 补读上限 <= 10);

  // 常见存法: 召回模板直接拼在用户楼正文里(没有 qrf_plot) —— 编码照样认, 信息边界只出现一份
  const 模板输入 = '拉起艾莉和蒂娜冲向拒马防线\n\n以上是用户的本轮输入\n' + 原文;
  const 楼2 = new Map(楼);
  楼2.set(19, { message_id: 19, role: 'user', message: 模板输入, is_hidden: false });
  const 查楼2 = (范围: any, 选项?: any) => {
    const [a, b] = String(范围).split('-').map(Number);
    return [...楼2.values()].filter(m => m.message_id >= a && m.message_id <= (b ?? a) && (!选项?.role || m.role === 选项.role));
  };
  const host2: any = { ...host, chat: { ...host.chat, messages: 查楼2, recallPlot: () => '' } };
  const 内联 = await 采集本轮输入(host2, 账本({ 处理到楼层: 16 }), 设置, false, null);
  if (内联.成功) {
    const 全文 = 内联.输入.messages.map(m => m.content).join('\n');
    check('正文里的召回编码也认', [...内联.输入.已召回], ['AM0256', 'AM0221']);
    check('信息边界在导演提示词里只出现一次', 全文.split('乔尔已从工坊赶来').length - 1, 1);
    ok('用户原话还在', 全文.includes('拉起艾莉和蒂娜冲向拒马防线'));
  } else ok('内联取料成功', false);
  // 两处都有(qrf_plot + 正文模板): 同样只一份
  const host3: any = { ...host2, chat: { ...host2.chat, recallPlot: (id: number) => (id === 19 ? 原文 : '') } };
  const 双份 = await 采集本轮输入(host3, 账本({ 处理到楼层: 16 }), 设置, false, null);
  if (双份.成功) check('qrf_plot 和正文都有 → 仍只一份', 双份.输入.messages.map(m => m.content).join('\n').split('乔尔已从工坊赶来').length - 1, 1);
  else ok('双份取料成功', false);
  const 消息 = buildDirectorMessages({ 账本: 账本(), reply: 'x', replyCount: 1, context: '', worldbook: '', playerName: null, playerDesc: '', 破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false });
  // 判据换成"块特有的那行用法说明": 系统提示词里也会提到【角色信息边界】这个名字(反全知规则)
  ok('没有信息边界 → 不拼这一块', !消息.map(m => m.content).join('').includes('用途: 设计「读者领先」与「知情角色」时以它为准'));
  ok('提示词不再写死"最近三层"', !消息.map(m => m.content).join('').includes('最近三层'));
}

console.log('\n[E] 面板: 停用状态 / 危险操作确认');
{
  const 基 = { 已剧终: false, 自动暂停: false, 连败次数: 0, 最后失败原因: '', 最后失败时间: 0, 已分析轮数: 10, 接管轮数: 4, 锚点楼层: 9, 引擎调用次数: 3, 编排中: false };
  check('总开关关 → 状态条是"已停用"', 计算运行状态({ ...基, 已停用: true }).级别, 'stop');
  check('停用压过剧终', 计算运行状态({ ...基, 已停用: true, 已剧终: true }).级别, 'stop');
  check('开着时行为不变', 计算运行状态(基).级别, 'on');
  ok('面板把总开关传给状态条', vueSource.includes('已停用: !设置.value.启用导演'));
  ok('清空账本要二次确认', vueSource.includes("@click=\"待确认危险 = '清空'\"") && vueSource.includes('确认清空'));
  ok('清理世界书要二次确认', vueSource.includes("@click=\"待确认危险 = '清理世界书'\""));
  ok('清除已剧终要二次确认, 并说明成绩单会清掉', vueSource.includes("@click=\"待确认危险 = '清除剧终'\"") && vueSource.includes('成绩单'));
  ok('编排中不能清空', vueSource.includes(':disabled="更新中"'));
  ok('悬浮球是按钮(空格也能开)', vueSource.includes('role="button"') && vueSource.includes('@keydown.space.prevent="onOrbClick"'));
  ok('复制报错有成功/失败提示', vueSource.includes("toastSuccess('已复制"));
  ok('拉取模型失败有提示', vueSource.includes('拉取模型列表失败'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
