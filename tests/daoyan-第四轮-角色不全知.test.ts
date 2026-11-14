// 剧情导演 · 第四轮: 角色不能全知(2026-11-06 定稿)。
//   症状: 导演台规划的剧情让角色 A 汇报了 A 没参与、也没听说的事 —— 导演全知, 角色跟着全知。
//   分工: **判断交给模型**。导演每安排一件要角色知道的事, 先自问三句: 他知道吗 / 证据是什么 / 不知道怎么办。
//        代码只收拾格式、把自查传下去、把缺口摆回导演面前 —— 一个字都不判断谁该知道什么。
//   关键: 自查**不依赖**记忆插件的 <cb>(它常常没有、也覆盖不全)。有 <cb> 就对照, 没有就靠账本/正文/前情。
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 解析不知情, 取不知情说法, 渲染证据来源 } from '../src/剧情导演/知情';
import { 构造本幕指令, 规范化知情核对, 规范化必演 } from '../src/剧情导演/引擎规则';
import { 渲染镜头外块, 挑镜头外候选 } from '../src/剧情导演/镜头外';
import { build本幕指令, SYSTEM_PROMPT } from '../src/剧情导演/prompts';
import { 结构提醒 } from '../src/剧情导演/取料';
import { SettingsSchema } from '../src/剧情导演/schema';
import { createPinia, setActivePinia } from 'pinia';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;

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
const 人 = (角色ID: string, 部分: Record<string, any> = {}): any => ({
  角色ID, 状态: '活跃', 状态证据: [], 状态历史: [], 独立目标: [], 当前关系: [], 永久后果: [], 持久后果: [], 承诺与债务: [], 已知事实引用: [], 未竟计划: [], 最后变化: null, 最后变化楼层: 0, ...部分,
});
const 账本 = (部分: Partial<导演账本> = {}): 导演账本 => ({ ...emptyData(), 已分析轮数: 10, ...部分 });
const 已执行 = { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false };
const 构造 = (下一幕: any, 部分: Record<string, any> = {}) =>
  构造本幕指令({ 旧指令: null, 下一幕, 账本: 账本(), 核验: 已执行, 档位: 3, 红线: [], 楼层: 30, 暂停注入: false, ...部分 });
const 注入 = (指令: any) => build本幕指令(账本({ 当前指令: 指令 }), SettingsSchema.parse({}));

const 边界 = [
  '【Lim】不能确认干河床下方WLF残余兵力确切人数，不知道乔尔已听到钟声正从工坊拄拐赶来，不知道玛利亚对北线增援的具体调配预案',
  '【艾莉】不知道乔尔已从工坊赶来，不能确认南侧下塔路线是否已被封锁',
].join('\n');

console.log('\n[1] 名册只是材料(代码不判断对错)');
{
  const 表 = 解析不知情(边界);
  check('两个角色都进名册', [...表.keys()].sort(), ['Lim', '艾莉'].sort());
  check('Lim 拆成三条', 表.get('Lim')!.length, 3);
  ok('原句原样保留(给导演看, 不加工)', 表.get('Lim')![1].includes('乔尔已听到钟声'));
  check('空文本 → 空表', 解析不知情('').size, 0);
  check('不是 【X】 开头 → 不解析', 解析不知情('角色能力与信息边界：\n乔尔不知道').size, 0);
  check('带括注也取得到', 取不知情说法(表, 'Lim（旅人）').length, 3);
  check('没有名册 → 空清单(不伪造)', 取不知情说法(undefined, 'Lim'), []);
}

console.log('\n[2] 代码不再删必演(判断权在模型)');
{
  const r = 构造({ 节拍: '受挫', 硬性要求: '守住北门', 必演: { 内容: '艾莉向北门汇报乔尔正从工坊赶来', 命运: false, 角色ID: '艾莉' } }, {
    账本: 账本({ 角色命运: [人('艾莉'), 人('乔尔')] }),
  });
  check('必演照发', r.指令!.必演?.内容, '艾莉向北门汇报乔尔正从工坊赶来');
  ok('代码调整里没有"全知拦截"', !r.指令!.代码调整.some(x => x.includes('全知拦截')));
  ok('必演对象里不再有"知情依据"(闸门专用的字段已删)', !('知情依据' in (规范化必演({ 内容: 'x', 角色ID: 'A', 知情依据: '亲历' }) as any)));
}

console.log('\n[3] 自查长什么样(他知道吗 / 证据 / 不知道怎么办)');
{
  const 收 = 规范化知情核对([
    { 角色: '艾莉', 这件事: '向北门汇报WLF兵力', 知道吗: '知道', 证据: '第42场她在洼地亲历', 处理: '' },
    { 角色: '蒂娜', 事: '缴获铝热手雷的经过', 知道吗: '不知道', 证据: '她没参与', 处理: '改成她只看见手雷' },
    { 角色: '艾莉', 这件事: '向北门汇报WLF兵力', 知道吗: '知道', 证据: '第42场她在洼地亲历', 处理: '' },
    { 角色: '乔尔', 事: ' ' },
    { 角色: '', 事: '' },
    '一串文字也能收',
  ]);
  check('同名同事去重、空条目丢掉', 收.length, 4);
  check('第一条字段齐全', 收[0], { 角色: '艾莉', 事: '向北门汇报WLF兵力', 知道吗: '知道', 证据: '第42场她在洼地亲历', 处理: '' });
  check('"不知道"照收, 处理留着', [收[1].知道吗, 收[1].处理], ['不知道', '改成她只看见手雷']);
  check('没写知道吗 → 一律按不确定(最保守)', 收[2].知道吗, '不确定');
  check('一串文字只当"事"', 收[3], { 角色: '', 事: '一串文字也能收', 知道吗: '不确定', 证据: '', 处理: '' });
  check('"否/不知情"也算不知道', 规范化知情核对([{ 角色: 'A', 事: 'x', 知道吗: '不知情' }])[0].知道吗, '不知道');
  check('不是数组 → 空(不报错)', 规范化知情核对(null), []);
  check('上限 8 条', 规范化知情核对(Array.from({ length: 20 }, (_, i) => ({ 角色: `A${i}`, 事: `事${i}` }))).length, 8);
}

console.log('\n[4] 自查进指令、进正文提示');
{
  const r = 构造({
    节拍: '受挫',
    硬性要求: '守住北门',
    必演: { 内容: '艾莉向北门汇报WLF兵力', 命运: false, 角色ID: '艾莉' },
    知情核对: [
      { 角色: '艾莉', 这件事: '汇报WLF兵力', 知道吗: '知道', 证据: '上一场她在洼地亲历' },
      { 角色: '蒂娜', 事: '缴获铝热手雷的经过', 知道吗: '不知道', 处理: '让她只看见手雷' },
    ],
  });
  check('指令里带着两条', r.指令!.知情核对?.length, 2);
  const 文 = 注入(r.指令);
  ok('正文提示里有【本幕知情核对】', 文.includes('【本幕知情核对】'));
  ok('"知道"的要连证据一起写出来', 文.includes('知道, 凭上一场她在洼地亲历'));
  ok('"不知道"的要带处理', 文.includes('不知道 → 让她只看见手雷'));
  ok('提醒正文别扩写他知道的', 文.includes('不要顺手扩写'));
  const 无自查 = 构造({ 节拍: '受挫', 硬性要求: 'x' });
  ok('没有自查时不多一块', !注入(无自查.指令).includes('【本幕知情核对】'));

  // 写着不知道却没写怎么办 → 提醒主 AI 别让他们接触这件事
  const 缺 = 构造({ 节拍: '受挫', 硬性要求: 'x', 知情核对: [{ 角色: '蒂娜', 事: '手雷的来历', 知道吗: '不知道' }] });
  ok('缺处理时点名提醒', 注入(缺.指令).includes('【自查没写完】') && 注入(缺.指令).includes('蒂娜'));
}

console.log('\n[5] 缺口下一轮会摆回导演面前(不判断对错, 只提醒没写完)');
{
  const 指令 = 构造({ 节拍: '受挫', 硬性要求: 'x', 知情核对: [{ 角色: '蒂娜', 事: '手雷的来历', 知道吗: '不知道' }] }).指令;
  const 提醒 = 结构提醒(账本({ 当前指令: 指令 }), 11);
  ok('提醒里点了"没写怎么处理"', 提醒.some(x => x.includes('知情核对') && x.includes('蒂娜')));
  const 写完 = 构造({ 节拍: '受挫', 硬性要求: 'x', 知情核对: [{ 角色: '蒂娜', 事: '手雷的来历', 知道吗: '不知道', 处理: '让她只看见手雷' }] }).指令;
  ok('写完了就不提醒', !结构提醒(账本({ 当前指令: 写完 }), 11).some(x => x.includes('知情核对')));
  ok('没自查的旧账本不报错', !结构提醒(账本(), 11).some(x => x.includes('知情核对')));
}

console.log('\n[6] 自查不依赖 <cb>');
{
  ok('提示词明说 <cb> 常常没有', SYSTEM_PROMPT.includes('<cb>') && SYSTEM_PROMPT.includes('常常没有'));
  ok('提示词要求"证据写不出就按不知道算"', SYSTEM_PROMPT.includes('证据写不出具体的'));
  ok('提示词要求自己过这一关(不靠清单)', SYSTEM_PROMPT.includes('这一关得你自己过'));
  ok('提示词给了三问', SYSTEM_PROMPT.includes('这件事他知道吗?') && SYSTEM_PROMPT.includes('证据是什么?') && SYSTEM_PROMPT.includes('这一幕怎么办?'));
  ok('提示词说脚本不替你判断', SYSTEM_PROMPT.includes('脚本不替你判断'));
  ok('输出模板里带 知道吗/证据/处理', SYSTEM_PROMPT.includes('"知情核对":') && SYSTEM_PROMPT.includes('"知道吗"'));
  ok('不再承诺"脚本会拦下必演"', !SYSTEM_PROMPT.includes('脚本会**拦下这条必演**'));
  // 没有 <cb> 的一轮: 自查照样能写、照样进指令(完全不经过 信息边界)
  const r = 构造({ 节拍: '受挫', 硬性要求: 'x', 知情核对: [{ 角色: '艾莉', 事: '汇报', 知道吗: '不知道', 处理: '换成蒂娜' }] });
  ok('没有 <cb> 也照常下发', 注入(r.指令).includes('不知道 → 换成蒂娜'));
}

console.log('\n[7] 镜头外推进带上"他自己不知道什么"(材料, 不是判断)');
{
  const 账 = 账本({
    已分析轮数: 20,
    角色命运: [人('Lim', { 独立目标: ['清点弹药'], 最后推进幕: 0 }), 人('艾莉', { 独立目标: ['修弓'], 最后推进幕: 0 })],
  });
  const 表 = 解析不知情(边界);
  const 候选 = 挑镜头外候选({ 账本: 账, 当前幕: 20, 在场: [] });
  ok('挑到了候选', 候选.length > 0);
  const 块 = 渲染镜头外块(候选, 表);
  ok('块里带"他不知道"', 块.includes('他不知道'));
  ok('带的是这个人的原话', 块.includes('乔尔已听到钟声'));
  ok('没有名册 → 不多说(不伪造)', !渲染镜头外块(候选).includes('他不知道'));
}

console.log('\n[8] 面板摊开给人看');
{
  ok('本幕页有知情核对块', vueSource.includes('知情核对（导演自查：这件事他知道吗）'));
  ok('显示"知道吗"', vueSource.includes('条.知道吗'));
  ok('显示证据与处理', vueSource.includes('条.证据') && vueSource.includes('条.处理'));
  ok('样式跟着加(.dj-know 有规则)', vueSource.includes('.dj-know {'));
}

console.log('\n[9] 证据去哪找(材料清单, 不替代判断)');
{
  const 账 = 账本({
    角色命运: [
      人('Lim', { 已知事实引用: ['北门在第三夜被袭', '汤米带了两队民兵'] }),
      人('艾莉', { 已知事实引用: [] }),
      人('蒂娜'),
    ],
    伏笔: [{ 编号: 6, 内容: '缺角铜扣', 状态: '发酵', 埋设证据: [], 中间回响: [], 知情角色: ['艾莉', '汤米'] } as any],
    读者领先: [{ 事项: '乔尔没死', 哪些角色还不知道: ['艾莉'] } as any],
  });
  const 块 = 渲染证据来源(账, new Set(['AM0256', 'AM0255']));
  ok('告诉它按顺序找', 块.includes('按顺序找'));
  ok('① 本轮正文', 块.includes('他本人说过、做过、在场吗'));
  ok('② 记忆纪要 + AM 编号', 块.includes('AM 编号') && 块.includes('已召回 2 条'));
  ok('③ 账本: 已知事实引用(带条目数与原文)', 块.includes('Lim 2 条') && 块.includes('北门在第三夜被袭'));
  ok('③ 账本: 空着也要说出来', 块.includes('还空着'));
  ok('③ 账本: 伏笔.知情角色', 块.includes('#6') && 块.includes('艾莉、汤米'));
  ok('③ 账本: 读者领先', 块.includes('已经标明了 1 条'));
  ok('前情也算来源', 块.includes('前情'));
  ok('④ <cb> 排在最后且不是必需', 块.includes('有就以它为准'));
  ok('要求证据能回查, 不收"他应该知道"', 块.includes('能回查') && 块.includes('不算证据'));
  const 空块 = 渲染证据来源(账本(), undefined);
  ok('空账本也给得出清单', 空块.includes('按顺序找') && !空块.includes('已召回'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
