// 彼方 · 提示词形状 —— 四个开关组合出的消息形状, 以及"任务"那条 user 落在哪里
//
// 不管破限/预填充/头部填充怎么组合, 任务消息都必须还在它该在的位置(收尾 user 不是任务,
// 头部填充那条 user 也不是)。以前这里断言的是 buildUpdateMessages 返回的 { messages, 锚点 };
// 2026-10-09 去掉重试回喂后锚点没了(它的唯一用途就是把反馈接到任务那条上), 改成直接从消息
// 内容里认任务那条 —— 断言的是同一件事, 而且不再依赖一个只为回喂存在的返回值。
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';

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

const 基础输入 = {
  reply: '正文内容',
  replyCount: 1,
  context: '玩家的最新输入',
  timeJump: '无',
  tracked: ['甲'],
  inSceneHint: [],
  currentCards: { 甲: { 当前在做: '做饭' } },
  autoTrackEnabled: true,
  physioEnabled: false,
  破限: false,
  头部填充: false,
  头部填充文本: '',
  防截断: false,
  预填充: false,
  worldbook: '',
  currentStoryTime: '0137-01-01 00:00',
  storyTimeHint: '0137-01-01 00:00',
  playerName: '主角',
  playerDescription: '',
};
const 造 = (覆盖: Record<string, unknown> = {}) => buildUpdateMessages({ ...基础输入, ...覆盖 });
const 角色序列 = (messages: { role: string }[]) => messages.map(m => m.role);
/** 任务消息的特征: 内置任务正文里有这句 */
const 是任务 = (messages: { content: string }[], i: number) => !!messages[i] && messages[i].content.includes('请根据最近剧情、最近正文回复和更新原则');
/** 任务那条 user 的下标(-1 = 没找到) */
const 任务下标 = (messages: { role: string; content: string }[]) => messages.findIndex(m => m.role === 'user' && 是任务([m], 0));
const 承诺特征 = '我彼方向User保证';

console.log('\n[1] 四个开关全关: system(主提示词) → system(用户输入) → user(任务)');
{
  const { messages } = 造();
  check('角色序列', 角色序列(messages), ['system', 'system', 'user']);
  check('任务在下标 2', 任务下标(messages), 2);
}

console.log('\n[2] 破限开 + 预填充关 → 尾部是 收尾user(它不是任务)');
{
  const { messages } = 造({ 破限: true });
  check('角色序列', 角色序列(messages), ['system', 'system', 'user', 'system', 'assistant', 'user']);
  check('任务在下标 2(不是最后那条收尾 user)', 任务下标(messages), 2);
  check('尾条不是任务', 任务下标(messages) === messages.length - 1, false);
  ok('承诺在消息里', messages.some(m => m.content.includes(承诺特征)));
}

console.log('\n[3] 破限开 + 预填充开 → 尾部是 assistant(承诺), 没有收尾 user');
{
  const { messages } = 造({ 破限: true, 预填充: true });
  check('角色序列', 角色序列(messages), ['system', 'system', 'user', 'system', 'assistant']);
  check('任务在下标 2', 任务下标(messages), 2);
}

console.log('\n[4] 头部填充开(第一条是 user) → 任务不能认成那条填充');
{
  const { messages } = 造({ 头部填充: true });
  check('角色序列', 角色序列(messages)[0], 'user');
  check('任务在下标 3(跳过头部填充那条 user)', 任务下标(messages), 3);
  ok('第一条不是任务', 是任务(messages, 0) === false);
  const 自定义文本 = 造({ 头部填充: true, 头部填充文本: '这是自定义的头部文本' });
  check('自定义头部文本被用上', 自定义文本.messages[0].content, '这是自定义的头部文本');
}

console.log('\n[5] 头部填充 + 破限 + 预填充全开 → 任务仍然只在它自己那条上');
{
  const { messages } = 造({ 头部填充: true, 破限: true, 预填充: true });
  check('角色序列', 角色序列(messages), ['user', 'system', 'system', 'user', 'system', 'assistant']);
  check('任务在下标 3', 任务下标(messages), 3);
}

console.log('\n[6] 防截断: 只影响主 system 的长度, 不影响任务的位置');
{
  const 关 = 造();
  const 开 = 造({ 防截断: true });
  ok('防截断开启后主 system 变长(缝进了免责声明段)', 开.messages[0].content.length > 关.messages[0].content.length);
  check('角色序列不变', 角色序列(开.messages), 角色序列(关.messages));
  check('任务下标不变', 任务下标(开.messages), 任务下标(关.messages));
}

console.log('\n[7] 生理监测: 只影响主提示词内容, 不影响任务的位置');
{
  const 关 = 造();
  const 开 = 造({ physioEnabled: true });
  check('关闭时不出现生理段', 关.messages[0].content.includes('生理周期日期'), false);
  check('开启时出现生理段', 开.messages[0].content.includes('生理周期日期'), true);
  check('任务下标不变', 任务下标(开.messages), 任务下标(关.messages));
}

console.log('\n[8] 破限段只在任务之后出现, 不在主 system 里');
{
  const 开 = 造({ 破限: true });
  check('主 system 不含 SPECIAL NOTE', 开.messages[0].content.includes('SPECIAL NOTE'), false);
  check('任务之后的 system 含 SPECIAL NOTE', 开.messages[3].content.includes('SPECIAL NOTE'), true);
  check('SPECIAL NOTE 只出现一次', 开.messages.filter(m => m.content.includes('SPECIAL NOTE')).length, 1);
  check('承诺只出现一次', 开.messages.filter(m => m.content.includes(承诺特征)).length, 1);
  const 关 = 造({ 破限: false });
  check('破限关时不出现 SPECIAL NOTE', 关.messages.some(m => m.content.includes('SPECIAL NOTE')), false);
}

console.log('\n[9] 用户输入与任务分开: 玩家输入只出现在那条独立 system 里');
{
  const { messages } = 造();
  check('独立 system 含用户输入', messages[1].content.includes('玩家的最新输入'), true);
  check('任务消息里不含用户输入原文', messages[2].content.includes('玩家的最新输入'), false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
