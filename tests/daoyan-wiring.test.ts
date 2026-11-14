// 剧情导演 · 接线与提示词(文本断言 + 纯函数) —— D3/D5/D6/D9/D10/E1–E7/B1
// 生成前注入(D5)与事件接线在 $() 里跑不进 node, 所以用文本断言钉住关键性质;
// 注入口的"该不该注入"用纯函数 应注入的指令文本 真跑。
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 应注入的指令文本 } from '../src/剧情导演/注入';
import { buildDirectorMessages, buildInjectionPrompt, build本幕指令 } from '../src/剧情导演/prompts';
import { SettingsSchema } from '../src/剧情导演/schema';
import indexSource from '../src/剧情导演/index.ts?raw';
import injectSource from '../src/剧情导演/注入.ts?raw';
import updateSource from '../src/剧情导演/update.ts?raw';
import promptSource from '../src/剧情导演/prompts.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
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

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}
const 指令 = { 编号: 1, 节拍: '阴影' as const, 硬性要求: 'x', 伏笔现场: '#3', 禁止事项: '无', 生成楼层: 9, 核验升级次数: 0, 已跳过: false, 代码调整: [] };

console.log('\n[D5] 生成前事件: 新管线**有意 await 规划**, 但仍不许走旧慢推进/不许当取消手段');
{
  const start = indexSource.indexOf('生成前处理');
  const end = indexSource.indexOf('[剧情导演] 剧情导演已加载');
  const 段 = indexSource.slice(start, end > start ? end : indexSource.length);
  // 回退到旧管线(2026-10-29): 生成前事件**只做幂等重注**, 绝不 await 慢 API;
  // 慢的编排只在 MESSAGE_RECEIVED 之后(updateDirector)跑, 下一轮生效。
  ok('生成前事件仍然同步重注指令', 段.includes('sync本幕指令'));
  ok('RED: 生成前事件里没有 await 慢推进', !段.includes('await updateDirector') && !段.includes('await 规划本次'));
  ok('入口不再订阅玩家消息渲染/发送事件', !indexSource.includes('onUserMessageRendered') && !indexSource.includes('onMessageSent'));
  // 这几条是**不能反转**的: 旧慢推进只能在正文后跑; 也不能靠抛错/返回值当取消手段。
  ok('生成前事件不调用旧慢推进 updateDirector', !段.includes('updateDirector'));
  ok('生成前事件不靠抛错取消生成', !/throw\s+new\s+Error\(\s*['"]生成/.test(段));
  ok('生成前事件不碰返回 false 的取消契约', !/return\s+false\s*;?\s*\/\/\s*取消/.test(段));
  ok('注入层本幕指令是同步函数(无 async)', !/function sync本幕指令\([^)]*\)\s*:\s*Promise/.test(injectSource) && injectSource.includes('export function sync本幕指令'));
}

console.log('\n[D6] 群聊检测即暂停');
{
  ok('入口检测群聊', indexSource.includes('isGroupChat()'));
  ok('推进管线也检测群聊', updateSource.includes('isGroupChat()'));
}

console.log('\n[D9] 死亡抉择状态机: 待决→暂停; 抉择→仍暂停; 消费→注入恢复; 抉择进引擎');
{
  ok('推进里登记死亡待决', updateSource.includes('markPending'));
  ok('推进里识别主角死亡', updateSource.includes('主角死亡'));
  ok('推进里消费死亡抉择', updateSource.includes('本次抉择'));
  const 设置 = SettingsSchema.parse({});
  const 带指令 = (部分 = {}) => 账本({ 当前指令: { ...指令 }, ...部分 });
  check('正常指令应注入', 应注入的指令文本(带指令(), 设置, false) !== '', true);
  check('死亡待决(未选) → 暂停', 应注入的指令文本(带指令({ 待决死亡: true, 死亡抉择: '' }), 设置, false), '');
  check('死亡待决(已选未消费) → 仍暂停', 应注入的指令文本(带指令({ 待决死亡: true, 死亡抉择: '视角转移' }), 设置, false), '');
  check('抉择被消费后 → 注入恢复', 应注入的指令文本(带指令({ 待决死亡: false, 死亡抉择: '' }), 设置, false) !== '', true);
  check('暂停注入标志 → 不注入', 应注入的指令文本(带指令(), 设置, true), '');
  check('无指令 → 不注入', 应注入的指令文本(账本(), 设置, false), '');
  check('已跳过 → 不注入', 应注入的指令文本(带指令({ 当前指令: { ...指令, 已跳过: true } }), 设置, false), '');
  check('总开关关 → 不注入', 应注入的指令文本(带指令(), SettingsSchema.parse({ 启用导演: false }), false), '');
  check('自动接管关 → 不注入', 应注入的指令文本(带指令(), SettingsSchema.parse({ 导演: { 自动接管: false } }), false), '');
  // 抉择进引擎: buildDirectorMessages 把抉择写进任务(引擎据此分向)
  const msgs = buildDirectorMessages({
    账本: 账本({ 死亡抉择: '世界观内复活' }),
    reply: '正文', replyCount: 1, context: '', worldbook: '', playerName: null, playerDesc: '',
    死亡抉择: '世界观内复活', 破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  const 任务 = msgs.find(m => m.role === 'user')?.content ?? '';
  ok('引擎任务里有抉择', 任务.includes('世界观内复活'));
  ok('引擎任务里有分向要求', 任务.includes('死亡-复活'));
}

console.log('\n[E1] 事实层: 世界书常驻条目「编剧备忘」蓝灯常驻/防递归/空则删');
{
  ok('用固定条目名常量', injectSource.includes('WORLDBOOK_ENTRY_NAME'));
  ok('常驻条目策略 constant', injectSource.includes("type: 'constant'"));
  ok('防递归 prevent_incoming/outgoing', injectSource.includes('prevent_incoming') && injectSource.includes('prevent_outgoing'));
  ok('空账本时不写条目', injectSource.includes('有账本事实(data)'));
}

console.log('\n[E2] 指令层: injectPrompts + GENERATION_AFTER_COMMANDS, depth 0');
{
  ok('用 host 注入能力(不直连平台)', injectSource.includes('useHost().inject.inject('));
  ok('幂等清理走 host', injectSource.includes('useHost().inject.uninject('));
  ok('深度 0', injectSource.includes('depth: 0'));
  ok('入口监听生成事件', indexSource.includes('onGenerationAfterCommands'));
}

console.log('\n[E3] 去重纪律(纠偏后): 事实层不再罗列伏笔, 指令层按编号指认');
{
  // 纠偏: 旧纪律是"事实层登记全部伏笔编号, 指令层只按编号引用" —— 那等于把**所有**未引爆线头
  // 常驻给演员, 会让他在错误时机反复碰这些线(提前兑现)。现在反过来:
  //   事实层只给"有多少条未结束线头"的极简连续性提示; 本幕要碰哪一条由**指令层**指认编号。
  const 备忘 = buildInjectionPrompt(账本({
    章回: { 章号: 1, 主题: '起', 计划高潮: '', 进度: '铺垫' },
    伏笔: [{ 编号: 7, 内容: '旧钥匙', 公开线头: '她收起一把旧钥匙', 埋设层: 1, 埋设章: 1, 状态: '发酵', 回收窗口: '', 关联冲突: '' }],
  }));
  ok('事实层不再逐条罗列伏笔编号', !备忘.includes('#7'));
  ok('事实层不再复制公开线头原文', !备忘.includes('她收起一把旧钥匙'));
  ok('事实层只给未结束线头的条数', 备忘.includes('未结束的线头') && 备忘.includes('1 条'));
  ok('事实层指向"由本幕指令指定"', 备忘.includes('本幕指令') && 备忘.includes('指定'));
}

console.log('\n[E4/E5] 指令渲染档位+红线; 玩家冲突按档缩放');
{
  ok('指令带当前档位', promptSource.includes('强度档位=第'));
  ok('档 1/2 玩家行动生效、指令让位', promptSource.includes('低档(1/2)'));
  ok('档 3/4 戏剧性变形', promptSource.includes('高档(3/4)'));
}

console.log('\n[E7] 记忆条目防混淆段');
{
  ok('提到记忆回溯', promptSource.includes('记忆回溯'));
  ok('声明不是设定/不是指令/不得领取任务', promptSource.includes('不得从中领取'));
  ok('核验只看最近正文', promptSource.includes('核验只针对最近正文') || promptSource.includes('执行核验只针对最近正文'));
}

console.log('\n[D3/D10] 无状态重启(全量账本含上一道指令); 与烟火尺度分界');
{
  // 2026-11-12(架构深化 ①): 原来是 grep `当前指令: 账本.当前指令` —— 那份白名单已由 `账本字段表` 派生,
  // 这句话不存在了。改成**行为**: 让引擎消息真的带上一道指令, 断言它在里面。
  {
    const 带指令 = { ...emptyData(), 当前指令: { 编号: 7, 节拍: '高潮', 硬性要求: '打起来' } as any };
    const 文本 = buildDirectorMessages({
      账本: 带指令,
      reply: '正文',
      replyCount: 1,
      context: '',
      worldbook: '',
      playerName: null,
      playerDesc: '',
      破限: false,
      头部填充: false,
      头部填充文本: '',
      防截断: false,
      预填充: false,
    } as any)
      .map(m => m.content)
      .join('\n');
    ok('引擎消息带上当前指令', 文本.includes('当前指令') && 文本.includes('"编号":7'));
  }
  ok('提示词声明只读最近几层/账本为唯一长线记忆', promptSource.includes('账本是你唯一的长线记忆') || promptSource.includes('唯一的长线记忆'));
  ok('尺度让给烟火', promptSource.includes('让给「烟火」'));
  ok('不读烟火数据', promptSource.includes('不读取烟火的任何数据'));
}

console.log('\n[B1] 零截断: 发送路径(提示词/注入)不含 slice/substring');
{
  ok('prompts.ts 无 slice/substring', !promptSource.includes('.slice(') && !promptSource.includes('substring('));
  ok('注入.ts 无 slice/substring', !injectSource.includes('.slice(') && !injectSource.includes('substring('));
  const 指令文本段 = injectSource.slice(injectSource.indexOf('应注入的指令文本'), injectSource.indexOf('export function sync本幕指令'));
  ok('指令文本组装无截断', !指令文本段.includes('slice'));
}

console.log('\n[文风] 八股禁令: 管导演自己的输出, 不再重复下发给主 AI');
{
  ok('prompts.ts 载入八股禁令原文', promptSource.includes('八股禁令.txt?raw'));
  ok('SYSTEM_PROMPT 有「给演员的指令怎么写」一节', promptSource.includes('【给演员的指令怎么写】'));
  const 消息 = buildDirectorMessages({
    账本: 账本(), reply: '正文', replyCount: 1, context: '', worldbook: '', playerName: null, playerDesc: '',
    破限: false, 头部填充: false, 头部填充文本: '', 防截断: false, 预填充: false,
  });
  const 系统 = 消息.find(m => m.role === 'system')?.content ?? '';
  ok('系统提示词里带着禁令正文', 系统.includes('导演指令禁令') || 系统.includes('只写发生了什么'));
  ok('禁令点名反例「以专业医师的冷酷语调」', 系统.includes('以专业医师的冷酷语调精准报出'));
  ok('包裹标签已被剥掉', !系统.includes('<导演指令禁令>') && !系统.includes('</导演指令禁令>'));
  const 备忘 = buildInjectionPrompt(账本({ 章回: { 章号: 1, 主题: '起', 计划高潮: '', 进度: '铺垫' } }));
  ok('编剧备忘不夹带禁令(主 AI 那边已有一份)', !备忘.includes('导演指令禁令') && !备忘.includes('文风铁律'));
  const 指令文本 = build本幕指令(账本({ 当前指令: { ...指令, 档位: 2, 红线: [] } as any }), SettingsSchema.parse({}));
  ok('本幕指令不夹带禁令', !指令文本.includes('导演指令禁令') && !指令文本.includes('文风铁律'));
  ok('无指令时本幕指令仍为空', build本幕指令(账本(), SettingsSchema.parse({})) === '');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
