// 烟火 v2.4 · 运转密度三档 + 世界书素材源
//
// 这一轮只做三件事: ①把"静止授权"从量化改为"静止是结论, 不是默认"(不加任何硬配额);
// ②把世界书从"世界观判据"升级为素材源(接上外部燃料, 且不降低事件合格线);
// ③把每轮配额做成玩家可调的三档(稀疏/正常/密集)。
//
// 用例钉住四件事:
//   [1] 三档产出的 user 消息逐行比较, **只有【运转密度】那一行不同**(其余逐字相同);
//   [2] 配额数字只在 运转密度表 里出现一次, 提示词其余位置一律"见【运转密度】",
//       且旧的量化授权句(「占所有回合的一半以上是正常的」「一件新事件也不许新增」)已删净;
//   [3] 世界书素材段与防退化的纪律句在位;
//   [4] 旧设置里没有 世界密度 → 兜底为「正常」, 且不丢其他设置。
import { createPinia, setActivePinia } from 'pinia';
import { buildTickMessages, SYSTEM_PROMPT, 运转密度表 } from '../src/烟火_世界运转/prompts';
import 提示词源码 from '../src/烟火_世界运转/prompts.ts?raw';
import { SettingsSchema } from '../src/烟火_世界运转/schema';
import { emptyData } from '../src/烟火_世界运转/state';
import 界面源码 from '../src/烟火_世界运转/悬浮球界面.vue?raw';

// prompts/schema/state 用到酒馆注入的 `_`; 给最小替身(node 里没有 lodash)
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
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}
function 出现次数(文本: string, 片段: string): number {
  return 文本.split(片段).length - 1;
}

// ---------------------------------------------------------------------------
// 固定输入: 五层有内容 + 世界书有设定, 这样素材段/世界书段都在场
// ---------------------------------------------------------------------------
const world = emptyData();
world.世界.时间 = '元和三年·三月初七';
world.世界.氛围 = '山雨欲来';
world.世界.总览 = '朝局暗涌, 边关未靖';
world.地域.京城 = { 概况: '天下中枢', 局势: '物价渐高', 当权者: '中书令·裴肃', 对外关系: '与北境互市', 前情: '三年大旱后迁都议起' };
world.大势.北境战云 = { 概况: '北狄南侵之势', 进展: '前锋已至雁门外', 走向: '或成大战', 前情: '去岁互市断绝' };
world.伏笔 = [{ 标题: '盐引亏空', 埋设: '盐铁新政', 指向: '朝堂清算', 成熟度: '将熟', 前情: '户部亏空被压了半年' }];
world.节令 = [{ 名称: '春汛', 周期: '每年', 时间: '元和三年·三月十五', 概况: '黄河春汛' }];
world.指标.民怨 = { 值: '62', 趋势: '上升', 说明: '粮价带动' };
world.事件 = [{
  id: 'e1', 标题: '雁门互市断绝', 描述: '边市已闭', 地点: '雁门', 时间: '元和三年·二月初一',
  规模: '要事', 传播: '区域', 渠道: '商旅', 势力: '', 阶段: '进行', 隐秘: '公开',
  代表人物: '守将·韩烈', 前情: '北狄索价过高', 演变: [],
}];
world.势力 = { 北狄王庭: { 目标: '南下掠粮', 动向: '集结骑兵', 前情: '连年雪灾', 势力范围: '漠北', 对外关系: '与中原敌对', 头面人物: '可汗·阿史那' } };

const 基础 = {
  world,
  reply: '【最新回复】\n他推开门, 街上湿漉漉的。',
  replyCount: 1,
  context: '我去街上走走',
  timeJump: null,
  时间约束: '正文未给出新日期, 沿用上次世界时间',
  // 这张卡的世界时间是"元和三年·三月初七"——解析不出来, 所以跨日事实 = 无法判定(v2.8 K 档降级)
  跨日: null,
  worldbook: '【世界书】北狄信奉狼神; 中原设盐铁使掌盐引。',
  playerName: '沈砚',
  playerDesc: '一个书生',
  破限: false,
  头部填充: false,
  头部填充文本: '',
  防截断: false,
  预填充: false,
  节令历法: true,
  世界指标: true,
};
type 密度 = keyof typeof 运转密度表;

/** 取该密度下唯一那条 user(任务)消息: 内容里含【世界当前状态】 */
function user内容(密度: 密度, 跨日: any = null): string {
  const messages = buildTickMessages({ ...基础, 世界密度: 密度, 跨日 });
  const target = messages.filter(message => message.role === 'user' && message.content.includes('【世界当前状态】'));
  check(`密度 ${密度}: 恰好一条任务 user 消息`, target.length, 1);
  return target[0].content;
}
function 逐行差异(a: string, b: string): number[] {
  const la = a.split('\n');
  const lb = b.split('\n');
  const out: number[] = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) out.push(i);
  }
  return out;
}

console.log('\n[1] 三档只差【运转密度】一行: 其余逐行逐字相同');
{
  const 行 = { 稀疏: user内容('稀疏'), 正常: user内容('正常'), 密集: user内容('密集') };
  const 正常行 = 行.正常.split('\n');
  for (const 密度 of ['稀疏', '密集'] as const) {
    const 差异 = 逐行差异(行.正常, 行[密度]);
    check(`${密度} vs 正常: 只有一行不同`, 差异.length, 1);
    const 该行 = 正常行[差异[0]] ?? '';
    ok(`${密度} vs 正常: 差异行是【运转密度】行`, 该行.startsWith('【运转密度】'));
    // 行数也必须一致(不能多出/少掉空行以外的东西)
    check(`${密度} vs 正常: 行数一致`, 行[密度].split('\n').length, 正常行.length);
  }
  ok('正常档普通上限1件、工作集6条', 行.正常.includes('普通新增上限1件') && 行.正常.includes('重点跟进目标6条'));
  ok('稀疏档普通上限1件、准入参考8条', 行.稀疏.includes('普通新增上限1件') && 行.稀疏.includes('进行中准入参考8条'));
  ok('密集档普通上限2件、准入参考14条', 行.密集.includes('普通新增上限2件') && 行.密集.includes('进行中准入参考14条'));
  ok('古代卡不给大跳额度', 行.正常.includes('不可判定，不给予大跳额度'));
  ok('跨日正常档上限2件', user内容('正常', { 最少: 3, 最多: 3 }).includes('有依据跨日，新增上限2件'));
  ok('跨日稀疏档上限1件', user内容('稀疏', { 最少: 1, 最多: 1 }).includes('有依据跨日，新增上限1件'));
  ok('跨日密集档上限3件', user内容('密集', { 最少: 1, 最多: 1 }).includes('有依据跨日，新增上限3件'));
  ok('正常档先维护旧事', 行.正常.includes('先维护旧事，再检查到期条件'));
  ok('稀疏档允许连续零新增', 行.稀疏.includes('允许连续零新增'));
  ok('密集档也不为凑数制造动作', 行.密集.includes('不为凑数制造动作'));
  ok('世界当前状态快照在三档里都原样在场', (['稀疏', '正常', '密集'] as const).every(d => 行[d].includes('"世界":{"时间":"元和三年·三月初七"')));
}

console.log('\n[2] 配额数字只在 运转密度表 里; 提示词其余位置写"见【运转密度】"; 量化授权句已删净');
{
  check('表: 稀疏', [运转密度表.稀疏.每轮新增, 运转密度表.稀疏.大跳新增, 运转密度表.稀疏.进行中上限], [1, 1, 8]);
  check('表: 正常', [运转密度表.正常.每轮新增, 运转密度表.正常.大跳新增, 运转密度表.正常.进行中上限], [1, 2, 10]);
  check('表: 密集', [运转密度表.密集.每轮新增, 运转密度表.密集.大跳新增, 运转密度表.密集.进行中上限], [2, 3, 14]);

  const 正常任务 = user内容('正常');
  check('策略在运行时只有一处', 出现次数(正常任务, '【运转密度】'), 1);

  ok('无「不超过 2 件」', !提示词源码.includes('不超过 2 件'));
  ok('无「放宽到 4 件」', !提示词源码.includes('放宽到 4 件'));
  ok('无「总数 ≤10」', !提示词源码.includes('总数 ≤10'));
  ok('无「占所有回合的一半以上是正常的」', !提示词源码.includes('占所有回合的一半以上是正常的'));
  ok('无「一件新事件也不许新增」', !提示词源码.includes('一件新事件也不许新增'));
  ok('旧的量化静止授权句「纯带旧账的回合是合法且常见的」已删', !提示词源码.includes('纯带旧账的回合是合法且常见的'));
  ok('零新增是合法结论', SYSTEM_PROMPT.includes('零新增合法，静止可以是正确结论'));
  ok('额度不是生产目标', SYSTEM_PROMPT.includes('新增上限是额度，不是必须交出的数量'));
  ok('没有硬配额措辞「连续」轮强制产出', !提示词源码.includes('连续 N 轮'));
}

console.log('\n[3] 世界书是素材源: 段落 + 防退化纪律句在位');
{
  ok('世界书是只读设定', SYSTEM_PROMPT.includes('设定说明身份、地理、制度与世界规则'));
  ok('正文意图不是已完成结果', SYSTEM_PROMPT.includes('用户提出的行动是意图'));
  ok('静态设定不直接入账', SYSTEM_PROMPT.includes('静态设定、重复声明都不另开事件'));
  ok('先维护旧事后考虑新事', SYSTEM_PROMPT.includes('先推进旧事，后考虑新事'));
  ok('已有因果是变化依据', SYSTEM_PROMPT.includes('世界变化要有已存在的动因、可用条件和足够世界内时间'));
}

console.log('\n[4] 旧设置兜底: 没有 世界密度 → 「正常」, 且不丢其他设置');
{
  check('空设置 → 正常', SettingsSchema.parse({}).运转.世界密度, '正常');
  const 旧设置 = SettingsSchema.parse({ 运转: { 更新频率: 5, 破限: true, 节令历法: false }, 启用运转: false });
  check('旧设置缺键 → 正常', 旧设置.运转.世界密度, '正常');
  check('旧设置其余字段不丢', [旧设置.运转.更新频率, 旧设置.运转.破限, 旧设置.运转.节令历法, 旧设置.启用运转], [5, true, false, false]);
  check('三档都能解析', (['稀疏', '正常', '密集'] as const).map(d => SettingsSchema.parse({ 运转: { 世界密度: d } }).运转.世界密度), ['稀疏', '正常', '密集']);
  let 拒绝 = false;
  try {
    SettingsSchema.parse({ 运转: { 世界密度: '超密' } });
  }
  catch {
    拒绝 = true;
  }
  ok('非法档位被拒', 拒绝);
}

console.log('\n[5] 面板: 三档下拉绑定 settings.运转.世界密度, 挂在更新频率下面');
{
  ok('下拉已绑定', 界面源码.includes('v-model="settings.运转.世界密度"'));
  ok('三个档位选项都在', (['稀疏', '正常', '密集'] as const).every(d => 界面源码.includes(`<option value="${d}">`)));
  ok('说明文案在位', 界面源码.includes('稀疏=允许长时间没有新事件；正常=每轮主动找，找不到才静止；密集=每轮尽量都有产出。只调配额，不改事件合格线。'));
  ok('位置在「更新频率」之后', 界面源码.indexOf('运转密度') > 界面源码.indexOf('更新频率'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
