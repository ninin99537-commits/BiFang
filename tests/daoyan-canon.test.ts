// 剧情导演 · 同人偏离度(原著约束块)
//
// 盯三件事:
//  ① 关闭 = 一个字节都不多(切片拼装不许改动原 SYSTEM_PROMPT);
//  ② 三档各拼一块, 位置在【视野约束】之后、【四本账】之前, 且只拼一块;
//  ③ 只进引擎的系统提示词 —— 不许漏进「编剧备忘」与「本幕指令」两条注入通道
//    (与八股禁令同一条纪律)。
import { createPinia, setActivePinia } from 'pinia';
import { buildDirectorMessages, buildInjectionPrompt, build本幕指令, SYSTEM_PROMPT, build原著约束 } from '../src/剧情导演/prompts';
import { SettingsSchema, 偏离度列表 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 采集本轮输入 } from '../src/剧情导演/取料';
import type { Host } from '../src/剧情导演/host';

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

function 组消息(偏离度?: any, 额外: Record<string, any> = {}) {
  return buildDirectorMessages({
    账本: emptyData(),
    reply: '【最新回复】\n正文',
    replyCount: 1,
    context: '玩家说话',
    worldbook: '',
    playerName: '旅人',
    playerDesc: '一个路过的旅人',
    破限: false,
    头部填充: false,
    头部填充文本: '',
    防截断: false,
    预填充: false,
    ...(偏离度 === undefined ? {} : { 偏离度 }),
    ...额外,
  });
}
function 系统文本(messages: { role: string; content: string }[]): string {
  return messages.filter(消息 => 消息.role === 'system').map(消息 => 消息.content).join('\n');
}

console.log('\n[1] 关闭 = 原样, 一个字节都不多');
{
  // 缺省(不传)与显式传「关闭」必须完全一致, 且等于原始的 SYSTEM_PROMPT
  const 缺省 = 系统文本(组消息());
  const 关闭 = 系统文本(组消息('关闭'));
  check('缺省即关闭', 缺省, SYSTEM_PROMPT);
  check('显式关闭同缺省', 关闭, SYSTEM_PROMPT);
  ok('不含原著块', !关闭.includes('【原著与同人'));
  ok('不含偏离度字样', !关闭.includes('偏离度'));
  check('build原著约束(关闭) 是空串', build原著约束('关闭'), '');

  // 两段拼装不许改动原文: 骨架按序仍在、首尾没被切掉
  const 骨架 = ['你是「剧情导演」', '【最高原则', '【视野约束', '【结构记忆', '【四本账', '【节拍', '【给演员的指令怎么写', '【静默思考流程', '【反迎合', '输出要求'];
  let 上一位 = -1;
  for (const 段 of 骨架) {
    const 位置 = SYSTEM_PROMPT.indexOf(段);
    ok(`骨架按序: ${段}`, 位置 > 上一位);
    上一位 = 位置;
  }
  ok('结尾仍在(纠偏后尾部多了几行说明, 但四本账结尾那行没被切丢)', SYSTEM_PROMPT.includes('- 没有章回/冲突/弧线/命运时对应字段给 null 或空数组。'));
}

console.log('\n[2] 三档各拼一块, 位置在【视野约束】之后、【四本账】之前');
{
  const 期望句: Record<string, string> = {
    严格贴合: '节点按序发生，主角只能改变过程与代价，不能改变节点结果。',
    允许偏离: '主线节点按序推进，支线与细节随主角行动改写；节点结果被改写后按新结果续推。',
    自由演绎: '索引只作背景，不要求按序推进。',
  };
  for (const 档 of 偏离度列表.filter(项 => 项 !== '关闭')) {
    const 文本 = 系统文本(组消息(档));
    ok(`[${档}] 有原著块`, 文本.includes('【原著与同人】'));
    ok(`[${档}] 只拼一块`, 文本.split('【原著与同人】').length === 2);
    ok(`[${档}] 带本档说明`, 文本.includes(`当前偏离度：${期望句[档]}`));
    for (const 别的 of Object.keys(期望句).filter(项 => 项 !== 档)) {
      ok(`[${档}] 不串档(${别的})`, !文本.includes(期望句[别的]));
    }
    ok(`[${档}] 在视野约束之后`, 文本.indexOf('【原著与同人】') > 文本.indexOf('【视野约束'));
    ok(`[${档}] 在四本账之前`, 文本.indexOf('【原著与同人】') < 文本.indexOf('【四本账'));
    ok(`[${档}] 原文尾部仍在(四本账没被切丢)`, 文本.includes('没有章回/冲突/弧线/命运时对应字段给 null 或空数组。'));
  }
}

console.log('\n[3] 原著块的硬要求: 编码/时间线/未发生节点/主角不在索引/撞毁不拽回');
{
  const 文本 = build原著约束('允许偏离');
  ok('编码不是唯一格式', 文本.includes('FAR-001') && 文本.includes('BTS-012') && 文本.includes('N001'));
  ok('不得编造编码', 文本.includes('不得编造索引里没有的编码'));
  ok('按索引与时间判先后', 文本.includes('先后以索引排列与时间为准'));
  ok('优先推进下一个节点', 文本.includes('下一幕优先推进当前之后的下一个节点'));
  ok('未发生节点不许提前', 文本.includes('晚于当前时间的节点尚未发生'));
  ok('不得 OOC', 文本.includes('不得 OOC'));
  ok('主角资料为准', 文本.includes('主角是谁以【主角资料】为准'));
  ok('主角可不在索引里', 文本.includes('主角不在索引人物中时，按原著之外的人处理'));
  ok('改写后重算', 文本.includes('按已发生的结果重算，不按索引重算'));
  ok('撞毁线走已消亡', 文本.includes('被撞毁的原著线把对应伏笔改为「已消亡」'));
  ok('不得拽回原著', 文本.includes('不得把剧情拽回原著'));
  // 不写理由: 只许是要求句, 不许出现"这防的是/因为/为了"这类二次解释
  for (const 解释词 of ['这防的是', '因为', '之所以', '目的是', '这样一来']) {
    ok(`不写理由: 不含「${解释词}」`, !文本.includes(解释词));
  }
}

console.log('\n[4] 只进引擎系统提示词: 两条注入通道都不许漏');
{
  const 账本 = emptyData();
  账本.章回 = { 章号: 1, 主题: '归途', 计划高潮: '交锋', 进度: '铺垫' };
  账本.当前指令 = {
    编号: 1,
    节拍: '受挫',
    硬性要求: '计划落空',
    伏笔现场: '',
    禁止事项: '',
    生成楼层: 1,
    核验升级次数: 0,
    已跳过: false,
    代码调整: [],
    档位: 3,
    红线: [],
  };
  const 事实层 = buildInjectionPrompt(账本);
  const 指令层 = build本幕指令(账本, SettingsSchema.parse({ 导演: { 偏离度: '严格贴合' } }));
  ok('编剧备忘不含原著块', !事实层.includes('【原著与同人'));
  ok('本幕指令不含原著块', !指令层.includes('【原著与同人'));
}

console.log('\n[5] 防截断照旧: 原著块仍在四本账之前, 破限参考段落在最后');
{
  const 文本 = 系统文本(组消息('严格贴合', { 防截断: true }));
  ok('有原著块', 文本.includes('【原著与同人】'));
  ok('原著块在四本账之前', 文本.indexOf('【原著与同人】') < 文本.indexOf('【四本账'));
  ok('防截断段落仍在', 文本.length > SYSTEM_PROMPT.length);
}

console.log('\n[6] 设置层: 默认关闭, 四档可选');
{
  const 默认 = SettingsSchema.parse({});
  check('默认偏离度', 默认.导演.偏离度, '关闭');
  for (const 档 of 偏离度列表) {
    check(`可存 ${档}`, SettingsSchema.parse({ 导演: { 偏离度: 档 } }).导演.偏离度, 档);
  }
  check('非法值回落', SettingsSchema.safeParse({ 导演: { 偏离度: '贴贴' } }).success, false);
}

console.log('\n[7] 取料把设置里的偏离度原样交给引擎(端到端接线)');
{
  const 宿主 = {
    chat: {
      lastMessageId: () => 1,
      messages: () => [{ message_id: 1, role: 'assistant', message: '正文', is_hidden: false, data: {}, extra: {}, name: 'AI' }],
    },
    persona: { name: () => '旅人', description: () => '一个路过的旅人' },
  } as unknown as Pick<Host, 'chat' | 'persona'>;
  const 底 = SettingsSchema.parse({ 导演: { 读取世界书: false } });

  const 关 = await 采集本轮输入(宿主, emptyData(), 底, false);
  ok('关闭: 取料成功', 关.成功);
  if (关.成功) ok('关闭: 消息里没有原著块', !关.输入.messages.map(消息 => 消息.content).join('\n').includes('【原著与同人'));

  const 开 = await 采集本轮输入(宿主, emptyData(), { ...底, 导演: { ...底.导演, 偏离度: '自由演绎' } }, false);
  ok('自由演绎: 取料成功', 开.成功);
  if (开.成功) {
    const 文本 = 开.输入.messages.map(消息 => 消息.content).join('\n');
    ok('自由演绎: 消息里有原著块', 文本.includes('【原著与同人】'));
    ok('自由演绎: 带本档说明', 文本.includes('索引只作背景，不要求按序推进。'));
  }
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
