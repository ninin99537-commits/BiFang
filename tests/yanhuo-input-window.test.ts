// 烟火 · 推进输入窗口(纯函数) —— 原文 / 扫描材料 / 模型正文分开
//
// 这一层只回答"选哪几层、怎么标注、哪份材料给谁", 不碰酒馆、不碰 Vue、不截断任何一条。
// 场景覆盖(依据 方案文档 §10「推荐输入方案」与 链路详审 第14项):
//   - 锚点封上界: 锚点之后的 user 不得混进当轮;
//   - 隐藏楼层不取(也不为凑数复活);
//   - 清空截止: null = 从未清空; 其余只读**严格大于**截止的楼层;
//   - 初始化 = 最近 N 条完整 assistant; 已有状态 = 最近 N 条上下文 + 全部未处理,
//     超过 N 只明确告警, 不截断、不漏中间跨日;
//   - 原文 / 扫描材料 / 模型正文分开: 先从原始消息里提完整 <recall> 块与 "AMxx|时差",
//     之后才对正文套传入的 filter(扫描材料不吃 filter, 免得 aftertalk 把关键词一起删掉);
//   - 不闭合的 recall 显式报告, 不拿残缺编码猜; 不宣称与主请求同一批。
import { 收集推进输入 } from '../src/烟火_世界运转/更新输入';

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
function ok(label: string, condition: unknown) {
  check(label, !!condition, true);
}

type 楼层 = { message_id: number; role: 'system' | 'assistant' | 'user'; message: string; is_hidden?: boolean; swipe_id?: number };

function 造层(message_id: number, role: 楼层['role'], message: string, extra: Partial<楼层> = {}): 楼层 {
  return { message_id, role, message, is_hidden: false, ...extra };
}

/** 站点选项: 默认"已有状态、未清空、不过滤"; 每个用例只覆盖自己关心的那几项 */
function 选项(overrides: Record<string, unknown> = {}) {
  return {
    anchorFloor: 10,
    recentCount: 3,
    processedFloor: 0,
    clearFloor: null as number | null,
    initialized: true,
    filter: (text: string) => text,
    ...overrides,
  } as any;
}

/** 模拟 createTextFilter 的"排除"模式: 只剥 <aftertalk> 块 */
function 排除幕后(text: string): string {
  return text.replace(/<aftertalk>[\s\S]*?<\/aftertalk>/g, '');
}

const ids = (列表: Array<{ message_id: number }>) => 列表.map(楼层 => 楼层.message_id);

console.log('\n[1] 初始化: 只取最近 N 条完整 assistant, 锚点之后的楼层不进来');
{
  const messages = [
    造层(1, 'user', '主角: 我去集市。'),
    造层(2, 'assistant', '集市很热闹。'),
    造层(3, 'user', '主角: 我买点东西。'),
    造层(4, 'assistant', '摊主招呼他。'),
    造层(5, 'assistant', '隐藏的旁白。', { is_hidden: true }),
    造层(6, 'assistant', '他往回走。'),
    造层(8, 'assistant', '锚点之后的回复。'),
    造层(9, 'user', '锚点之后的输入。'),
  ];
  const 输入 = 收集推进输入(messages, 选项({ anchorFloor: 6, recentCount: 2, initialized: false }));
  check('初始化: 最近 N 条完整 assistant(按楼层升序)', ids(输入.recent), [4, 6]);
  ok('锚点之后的回复不进入窗口', !输入.recent.some(楼层 => 楼层.message_id === 8));
  ok('隐藏楼层不取', !输入.recent.some(楼层 => 楼层.message_id === 5));
  check('上下文: 锚点之前最近的 user(清洗后)', 输入.context, '主角: 我买点东西。');
  check('reply 标注先后, 最后一条是【最新回复】',
    输入.reply, '【较早回复 1】\n摊主招呼他。\n\n【最新回复】\n他往回走。');
  check('latestReply 就是最后一条正文', 输入.latestReply, '他往回走。');
}

console.log('\n[2] 已有状态: 最近 N 条上下文 + 全部未处理(超 N 只告警, 不截断, 不漏中间跨日)');
{
  const messages = [
    造层(0, 'assistant', '开局旁白。'),
    造层(2, 'assistant', '旧一轮。'),
    造层(4, 'assistant', '第一段: 两天后，队伍出发。'),
    造层(6, 'assistant', '第二段: 路上无事。'),
    造层(8, 'assistant', '第三段: 到了城门。'),
    造层(10, 'assistant', '第四段: 城门开了。'),
  ];
  const 输入 = 收集推进输入(messages, 选项({ anchorFloor: 10, recentCount: 2, processedFloor: 2 }));
  check('未处理 assistant 全部补全(不是只取最近 N)', ids(输入.recent), [0, 2, 4, 6, 8, 10]);
  ok('超过 N 明确告警(说清条数与设置值)',
    输入.warnings.some(w => w.includes('超过') && w.includes('2') && w.includes('4')));
  check('unprocessedIds 只列未处理的那几条', 输入.unprocessedIds, [4, 6, 8, 10]);
  ok('每条的原文都完整(不切半句)',
    输入.recent.every(楼层 => messages.find(m => m.message_id === 楼层.message_id)!.message === 楼层.原文));
  ok('reply 里每一段都完整', 输入.reply.includes('第一段: 两天后，队伍出发。')
    && 输入.reply.includes('第二段: 路上无事。')
    && 输入.reply.includes('第三段: 到了城门。')
    && 输入.reply.includes('第四段: 城门开了。'));
  ok('中间那条带跨日的回复没被跳过(漏中间跨日的反例)', 输入.reply.includes('两天后'));
}

console.log('\n[3] 锚点封上界: 锚点之后的 user 不得进入上下文');
{
  const messages = [
    造层(5, 'user', '锚点之前的输入。'),
    造层(6, 'assistant', '回复。'),
    造层(7, 'user', '锚点之后的输入。'),
    造层(8, 'user', '隐藏的输入。', { is_hidden: true }),
  ];
  const 输入 = 收集推进输入(messages, 选项({ anchorFloor: 6, recentCount: 1, initialized: false }));
  check('context 取锚点之前最近一条 user', 输入.context, '锚点之前的输入。');
  ok('锚点之后的 user 没有被当成本轮输入', !输入.context.includes('锚点之后'));
}

console.log('\n[4] 清空截止: null = 未清空; 数字 = 只读严格大于截止的楼层');
{
  const messages = [
    造层(1, 'user', '清空前的输入。'),
    造层(2, 'assistant', '清空前的一轮。'),
    造层(3, 'user', '清空后的输入。'),
    造层(4, 'assistant', '清空后的一轮。'),
  ];
  const 未清空 = 收集推进输入(messages, 选项({ anchorFloor: 4, recentCount: 5, initialized: false, clearFloor: null }));
  check('未清空(null): 旧楼层照常可读', ids(未清空.recent), [2, 4]);

  const 已清空 = 收集推进输入(messages, 选项({ anchorFloor: 4, recentCount: 5, initialized: false, clearFloor: 2 }));
  check('清空到 #2: 只读严格大于 #2 的楼层', ids(已清空.recent), [4]);
  check('清空后的上下文也只取截止之后', 已清空.context, '清空后的输入。');
  ok('排除了多少条要说出来', 已清空.warnings.some(w => w.includes('清空截止') && w.includes('#2')));

  const 全被截止 = 收集推进输入(messages, 选项({ anchorFloor: 4, recentCount: 5, initialized: false, clearFloor: 4 }));
  check('截止落在锚点本身: 锚点也算清空前的', ids(全被截止.recent), []);
  ok('空窗口有明确告警', 全被截止.warnings.length > 0);
}

console.log('\n[5] 原文 / 扫描材料 / 模型正文分开: 完整 recall 块与 AMxx|时差先提, 再套 filter');
{
  const 原文 = '他推门进来。\n<aftertalk>幕后: 他其实在撒谎。</aftertalk>\n<recall>\nAM0256 | 0m\nAM0100 | 185d17h15m\n</recall>';
  const 输入 = 收集推进输入([造层(3, 'assistant', 原文)], 选项({
    anchorFloor: 3, recentCount: 1, initialized: false, filter: 排除幕后,
  }));
  check('原文完整保留(含 aftertalk 与 recall)', 输入.recent[0].原文, 原文);
  ok('模型正文剥掉了 aftertalk(filter 生效)', !输入.recent[0].正文.includes('他其实在撒谎'));
  ok('模型正文排除完整 recall 协议块(不是按关键词裁字)',
    !输入.recent[0].正文.includes('<recall>') && !输入.recent[0].正文.includes('AM0256'));
  ok('扫描材料保留原始 aftertalk 原文', 输入.scanText.includes('他其实在撒谎'));
  ok('扫描材料保留 AM 编码', 输入.scanText.includes('AM0256') && 输入.scanText.includes('AM0100'));
  check('recall 元数据: 编码与相对时差', 输入.recall.map(条 => 条.编码.map(码 => `${码.码}|${码.时差}`)),
    [['AM0256|0m', 'AM0100|185d17h15m']]);
  check('recall 元数据: 来源楼层与角色', 输入.recall.map(条 => [条.楼层, 条.角色]), [[3, 'assistant']]);
  check('recall 元数据: 来源写的是聊天原文', 输入.recall.map(条 => 条.来源), ['聊天原文']);
  ok('recall 元数据是只读的(来源/时差只当元数据, 不改写原文)', Object.isFrozen(输入.recall) && Object.isFrozen(输入.recall[0].编码));
  ok('不宣称与主请求同一批激活结果', 输入.warnings.some(w => w.includes('同一批')));
}

console.log('\n[5b] 说明段只从协议开头起算: 同一行写在协议前面的用户行动一个字都不能少');
{
  const 行动与协议同一行 = '他把信收好，转身出门。以上是用户的本轮输入，以下是<记忆回溯>的编码，供参考。\n<recall>\nAM0256 | 0m\n</recall>';
  const 输入 = 收集推进输入([
    造层(3, 'user', 行动与协议同一行),
    造层(6, 'assistant', 行动与协议同一行),
  ], 选项({ anchorFloor: 6, recentCount: 1, initialized: false }));
  check('上下文: 同一行的行动完整留下', 输入.context, '他把信收好，转身出门。');
  ok('上下文里没有协议说明段', !输入.context.includes('以上是用户的本轮输入'));
  check('模型正文: 同一行的行动也完整留下', 输入.recent[0].正文, '他把信收好，转身出门。');
  ok('模型正文不含 <recall> 块', !输入.recent[0].正文.includes('<recall>'));
  check('recall 编码照旧取到', 输入.recall.flatMap(条 => 条.编码.map(码 => 码.码)).join(','), 'AM0256,AM0256');
  check('原文仍然逐字完整', 输入.recent[0].原文, 行动与协议同一行);
}

console.log('\n[6] AM 编码落在被过滤的 aftertalk 里: 正文看不到了, 扫描材料仍要保住');
{
  const 原文 = '正文。\n<aftertalk>AM0777 | 3d</aftertalk>';
  const 输入 = 收集推进输入([造层(4, 'assistant', 原文)], 选项({
    anchorFloor: 4, recentCount: 1, initialized: false, filter: 排除幕后,
  }));
  ok('模型正文里没有这个码', !输入.recent[0].正文.includes('AM0777'));
  ok('扫描材料里仍有这个码(不被 aftertalk 过滤丢掉)', 输入.scanText.includes('AM0777'));
  check('recall 仍然记下它', 输入.recall.flatMap(条 => 条.编码.map(码 => 码.码)), ['AM0777']);
}

console.log('\n[7] 不闭合的 recall: 一个字都不清理, 显式报告并要求拒绝本轮');
{
  const 原文 = '正文。\n<recall>\nAM0256 | 0m\n</recall>\n又一段 <recall>\nAM0999 | 7d';
  const 输入 = 收集推进输入([造层(5, 'assistant', 原文)], 选项({ anchorFloor: 5, recentCount: 1, initialized: false }));
  ok('只采纳已闭合块里的编码', 输入.recall.flatMap(条 => 条.编码.map(码 => 码.码)).join(',') === 'AM0256');
  ok('未闭合被记下来', 输入.recall.some(条 => 条.未闭合));
  ok('有明确告警', 输入.warnings.some(w => w.includes('未闭合')));
  ok('告警要求拒绝本轮(不把残缺协议喂给模型)', 输入.warnings.some(w => w.includes('未闭合') && w.includes('拒绝')));
  check('未闭合: 正文就是原文(前后正文一个字都没清理, 已闭合块也不删)', 输入.recent[0].正文, 原文);
  ok('未闭合段原样留着', 输入.recent[0].正文.includes('AM0999'));
  check('原文照样完整', 输入.recent[0].原文, 原文);
}

console.log('\n[8] 扫描材料按楼层时序, 且包含锚点前那条 user 的原文');
{
  const messages = [
    造层(3, 'user', '我的输入, 带码 AM0400 | 5d'),
    造层(6, 'assistant', '回复正文。'),
  ];
  const 输入 = 收集推进输入(messages, 选项({ anchorFloor: 6, recentCount: 1, initialized: false }));
  ok('扫描材料里有 user 原文', 输入.scanText.includes('我的输入, 带码 AM0400 | 5d'));
  ok('扫描材料按楼层时序(user 在 assistant 之前)',
    输入.scanText.indexOf('AM0400') >= 0 && 输入.scanText.indexOf('AM0400') < 输入.scanText.indexOf('回复正文。'));
  check('recall 记下带码的那一层(楼层 + 角色)', 输入.recall.map(条 => [条.楼层, 条.角色]), [[3, 'user']]);
  ok('没有码的楼层不凭空造回忆证据', !输入.recall.some(条 => 条.楼层 === 6));
}

console.log('\n[9] 空窗口 / 坏锚点: 都要有明确告警, 不抛异常');
{
  const 空 = 收集推进输入([], 选项({ anchorFloor: 10, initialized: false }));
  check('空窗口: recent 为空', 空.recent, []);
  check('空窗口: reply 为空', 空.reply, '');
  check('空窗口: 上下文为空', 空.context, '');
  ok('空窗口: 有告警', 空.warnings.length > 0);

  const 坏锚点 = 收集推进输入([造层(3, 'assistant', '正文。')], 选项({ anchorFloor: -1 }));
  ok('坏锚点: 有告警', 坏锚点.warnings.some(w => w.includes('锚点')));
}

console.log('\n[10] 纯函数: 不改输入, 不改选项; 未初始化时不追补更早的旧回复');
{
  const messages = [造层(1, 'assistant', '旧回复。'), 造层(3, 'assistant', '次旧回复。'), 造层(5, 'assistant', '最新回复。')];
  const 快照 = JSON.stringify(messages);
  const 输入 = 收集推进输入(messages, 选项({ anchorFloor: 5, recentCount: 1, processedFloor: 0, initialized: false }));
  check('输入数组没有被改写', JSON.stringify(messages), 快照);
  check('初始化只取最近 N 条, 不追补旧回复', ids(输入.recent), [5]);
  ok('初始化告警写明"只取最近 N 条"', 输入.warnings.some(w => w.includes('起点')));
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
