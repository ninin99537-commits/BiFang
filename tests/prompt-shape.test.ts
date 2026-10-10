// 彼方 · 提示词形状 —— 四个开关组合出的消息形状, 以及"任务"那条 user 落在哪里
//
// 不管破限/预填充/头部填充怎么组合, 任务消息都必须还在它该在的位置(收尾 user 不是任务,
// 头部填充那条 user 也不是)。以前这里断言的是 buildUpdateMessages 返回的 { messages, 锚点 };
// 2026-10-09 去掉重试回喂后锚点没了(它的唯一用途就是把反馈接到任务那条上), 改成直接从消息
// 内容里认任务那条 —— 断言的是同一件事, 而且不再依赖一个只为回喂存在的返回值。
import { buildInjectionPrompt, buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';

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

console.log('\n[10] 恋爱: 没有标记时, 全开关矩阵与从前逐字节相同(验收红线)');
{
  // 缺省参数(输入里根本没有 恋爱对象名单 这个键) ≡ 显式空名单: 新参数缺省时输出一个字节都不变
  check('不带恋爱参数 ≡ 恋爱名单为空', JSON.stringify(造().messages), JSON.stringify(造({ 恋爱对象名单: [] }).messages));

  // 全开关矩阵: 破限 × 预填充 × 头部填充 × 防截断 × 生理监测 × 有无 context = 64 组
  const 组合: Array<Record<string, unknown>> = [];
  for (const 破限 of [false, true])
    for (const 预填充 of [false, true])
      for (const 头部填充 of [false, true])
        for (const 防截断 of [false, true])
          for (const physioEnabled of [false, true])
            for (const context of ['玩家的最新输入', ''])
              组合.push({ 破限, 预填充, 头部填充, 防截断, physioEnabled, context });
  check('矩阵有 64 组', 组合.length, 64);
  const 漏了的 = 组合.filter(c => JSON.stringify(造(c).messages).includes('【恋爱监测】'));
  check('没有标记时, 64 种开关组合下任何消息都不含恋爱说明段', 漏了的.length, 0);
  const 漏事件 = 组合.filter(c => JSON.stringify(造(c).messages).includes('恋爱事件'));
  check('没有标记时也不出现「恋爱事件」这个键', 漏事件.length, 0);
  // 空名单(界面上没有标记时真实传的就是空数组)同样干净
  const 空名单漏了的 = 组合.filter(c => JSON.stringify(造({ ...c, 恋爱对象名单: [] }).messages).includes('【恋爱监测】'));
  check('显式空名单同样一组都不含恋爱说明段', 空名单漏了的.length, 0);
}

console.log('\n[11] 恋爱: 有标记时只是任务 user 的尾部追加, 位置与角色序列都不变');
{
  const 恋爱卡 = { 甲: { 当前在做: '做饭', 恋爱对象: '是' } };
  const 无标记 = 造();
  const 有标记 = 造({ 恋爱对象名单: ['甲'], currentCards: 恋爱卡 });
  const 任务 = 有标记.messages[任务下标(有标记.messages)];
  check('无标记时任何消息都没有恋爱说明段', 无标记.messages.some(m => m.content.includes('【恋爱监测】')), false);
  check('有标记时出现恋爱说明段', 有标记.messages.some(m => m.content.includes('【恋爱监测】')), true);
  check('说明段只出现一次, 且就在任务那条 user 上', 有标记.messages.filter(m => m.content.includes('【恋爱监测】')).length, 1);
  check('任务下标不变', 任务下标(有标记.messages), 任务下标(无标记.messages));
  check('角色序列不变', 角色序列(有标记.messages), 角色序列(无标记.messages));
  check('两条 system 里都不含恋爱说明段', 有标记.messages.slice(0, 2).filter(m => m.content.includes('【恋爱监测】')).length, 0);
  const 任务正文位置 = 任务.content.indexOf('请根据最近剧情、最近正文回复和更新原则');
  const 恋爱段位置 = 任务.content.indexOf('【恋爱监测】');
  ok('恋爱段排在任务正文之后', 任务正文位置 >= 0 && 恋爱段位置 > 任务正文位置);
  ok('恋爱段一直排到任务消息末尾', 任务.content.trimEnd().endsWith('- 卡上「恋爱开局」已经是「是」的 NPC **不要加这条**。'));
  check('名单里的 NPC 名字出现在说明段里', 任务.content.includes('恋爱对象: 甲'), true);
  // 与生理段的先后: 生理在前, 恋爱在后(两块都是尾部追加, 顺序固定)
  const 两块 = 造({ physioEnabled: true, 恋爱对象名单: ['甲'], currentCards: 恋爱卡 }).messages[2].content;
  ok('生理段排在恋爱段之前', 两块.indexOf('【生理监测】') >= 0 && 两块.indexOf('【生理监测】') < 两块.indexOf('【恋爱监测】'));
}

console.log('\n[12] 注入条目: 只给阶段名/名分/标签/态度, 绝不给 0–100 的裸数值');
{
  const 卡 = {
    当前在做: '做饭',
    恋爱对象: '是',
    好感值: '73.5',
    情欲值: '42.1',
    好感阶段: '暧昧',
    情欲阶段: '想要',
    名分: '恋人',
    恋爱标签: '冷战,占有欲',
    恋爱态度: '嘴上说不在乎, 但你一走开就盯着门口',
    情感倾向: '病娇',
    恋爱动向: '好感+3.5(交心) · 2026-08-15',
    恋爱基准日期: '2026-08-15 18:30',
  };
  const 注入 = buildInjectionPrompt([['甲', 卡]] as any);
  // 注入已改成**一次表头 + 每行一个 NPC**的竖线表(与烟火同款, 见 prompts.ts 的 渲染注入表)。
  // 断言不能再扫"整行"——恋爱态度 是自由文本, 里面的数字("3 个陌生人")不算违规(§10 口径),
  // 而它现在是最后一个单元格、与前四个恋爱列同处一行。所以先按表头解析成单元格, 再逐格断言。
  const 解析表 = (文本: string) => {
    const 行 = 文本.split('\n').filter(l => l.includes(' | '));
    const 列 = (行[0] ?? '').split(' | ');
    return { 列, 格: (名: string) => 行.slice(1).map(l => l.split(' | ')[列.indexOf(名)]) };
  };
  const { 列, 格 } = 解析表(注入);
  check('表头第一格是"名字"', 列[0], '名字');
  check('恋爱五列按序落在表头末五位', 列.slice(-5), ['好感', '情欲', '名分', '标签', '恋爱态度']);
  check('好感格是阶段名', 格('好感'), ['暧昧']);
  check('情欲格是阶段名', 格('情欲'), ['想要']);
  check('名分格', 格('名分'), ['恋人']);
  check('标签格', 格('标签'), ['冷战,占有欲']);
  check('恋爱态度格原样带出', 格('恋爱态度'), ['嘴上说不在乎, 但你一走开就盯着门口']);
  check('阶段/名分/标签格里没有裸数值 73.5 / 42.1 / 42', ['好感', '情欲', '名分', '标签'].flatMap(格).filter(v => /73\.5|42\.1|42/.test(v ?? '')), []);
  // 恋爱态度 里的数字不是裸数值, 不得因此判违规(否则自由文本会把这条例行断言变成假阳性)
  const 带数字态度 = buildInjectionPrompt([['甲', { ...卡, 恋爱态度: '她说"3 个陌生人"都比你强' }]] as any);
  const 带数字格 = 解析表(带数字态度).格;
  check('恋爱态度带数字时, 前四格仍然干净(扫描范围没外溢)', ['好感', '情欲', '名分', '标签'].flatMap(带数字格).filter(v => /73\.5|42/.test(v ?? '')), []);
  ok('恋爱态度照原样注入', 带数字态度.includes('3 个陌生人'));
  check('没有"好感值"这个字段名', 注入.includes('好感值'), false);
  check('没有"情欲值"这个字段名', 注入.includes('情欲值'), false);
  check('没有情感倾向(幕后系数, 不给主 AI)', 注入.includes('病娇'), false);
  check('没有恋爱动向(因果一行留在卡上, 不进注入)', 注入.includes('恋爱动向'), false);
  // 未标记的 NPC: 一个恋爱字样都不该有
  const 未标记注入 = buildInjectionPrompt([['乙', { 当前在做: '整理货架' }]] as any);
  check('未标记的 NPC 注入里没有恋爱段', 未标记注入.includes('恋爱'), false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
