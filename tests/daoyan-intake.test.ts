// 剧情导演 · 取料
//
// 症状: 候选三把 81 行取料从 update.ts 抽进 取料.ts, 但**没带任何用例** —— 全仓 grep 不到
// `采集本轮输入`, 那个新接缝至今没被执行过一次。根因是它内部 6 处 useHost(), 依赖藏在实现里,
// Node 里的假宿主驱动不了(只能靠进程级单例)。
//
// 现在宿主从签名进(与 ADR-0001 方向一致), 一份假 chat/persona 就能把取料这条路跑通。
import { createPinia, setActivePinia } from 'pinia';
import { 采集本轮输入 } from '../src/剧情导演/取料';
import { SettingsSchema } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
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

interface 假楼层 {
  message_id: number;
  role: 'user' | 'assistant';
  message: string;
  is_hidden?: boolean;
}

/** 假宿主: 只实现取料真正用到的那两项(chat / persona) */
function 造宿主(楼层: 假楼层[], 人设 = { 名: '旅人', 描述: ' 一个路过的旅人 ' }): Pick<Host, 'chat' | 'persona'> {
  return {
    chat: {
      lastMessageId: () => (楼层.length ? Math.max(...楼层.map(楼 => 楼.message_id)) : -1),
      messages: (range: any, options: any = {}) => {
        const 部分 = String(range).split('-').map(Number);
        const [从, 到] = 部分.length === 2 ? 部分 : [部分[0], 部分[0]];
        return 楼层
          .filter(楼 => 楼.message_id >= 从 && 楼.message_id <= 到)
          .filter(楼 => !options.role || options.role === 'all' || 楼.role === options.role)
          .map(楼 => ({ ...楼, is_hidden: !!楼.is_hidden, data: {}, extra: {}, name: 'AI' }));
      },
    },
    persona: {
      name: () => 人设.名,
      description: () => 人设.描述,
    },
  } as any;
}

const 设置 = SettingsSchema.parse({});
const 离线世界书 = { ...设置, 导演: { ...设置.导演, 读取世界书: false, 读取最近回复数: 3 } };

console.log('\n[1] 没有可分析的 AI 回复 → 明确失败, 不是空输入');
{
  const 空 = await 采集本轮输入(造宿主([]), emptyData(), 离线世界书, false);
  check('空楼层 → 失败', 空.成功, false);
  check('失败原因', (空 as any).原因, '没有可分析的AI回复');

  const 只有用户 = await 采集本轮输入(造宿主([{ message_id: 1, role: 'user', message: '你好' }]), emptyData(), 离线世界书, false);
  check('只有用户发言 → 也算没有回复', 只有用户.成功, false);

  const 全是隐藏 = await 采集本轮输入(
    造宿主([{ message_id: 1, role: 'assistant', message: '隐藏的', is_hidden: true }]),
    emptyData(),
    离线世界书,
    false,
  );
  check('隐藏楼层不算', 全是隐藏.成功, false);
}

console.log('\n[2] 有回复: 按楼层序取, 最后一条标【最新回复】');
{
  const 宿主 = 造宿主([
    { message_id: 1, role: 'assistant', message: '第一段' },
    { message_id: 2, role: 'user', message: '玩家说话' },
    { message_id: 3, role: 'assistant', message: '第二段' },
  ]);
  const 取 = await 采集本轮输入(宿主, emptyData(), 离线世界书, false);
  ok('成功', 取.成功);
  if (取.成功) {
    check('recent 只含 AI 回复', 取.输入.recent.map(楼 => 楼.message_id), [1, 3]);
    ok('最后一条标【最新回复】', 取.输入.reply.includes('【最新回复】\n第二段'));
    ok('较早那条标【较早回复】', 取.输入.reply.includes('【较早回复 1】\n第一段'));
    ok('组了提示词消息', 取.输入.messages.length > 0);
  }
}

console.log('\n[3] 清空层: 之前的楼层不取; force 时不受约束');
{
  const 楼层: 假楼层[] = [
    { message_id: 1, role: 'assistant', message: '清空前' },
    { message_id: 5, role: 'assistant', message: '清空后' },
  ];
  const 账 = { ...emptyData(), 清空层: 3 };
  const 普通 = await 采集本轮输入(造宿主(楼层), 账, 离线世界书, false);
  ok('普通推进: 只留清空后的', 普通.成功 && 普通.输入.recent.every(楼 => 楼.message_id > 3));

  const 强推 = await 采集本轮输入(造宿主(楼层), 账, 离线世界书, true);
  ok('force: 清空前的也读', 强推.成功 && 强推.输入.recent.some(楼 => 楼.message_id === 1));
}

console.log('\n[4] 人设: 名字与描述进了提示词(描述去首尾空白)');
{
  const 取 = await 采集本轮输入(
    造宿主([{ message_id: 1, role: 'assistant', message: '正文' }], { 名: '林素问', 描述: '  首席信息官  ' }),
    emptyData(),
    离线世界书,
    false,
  );
  ok('成功', 取.成功);
  if (取.成功) {
    const 全部 = 取.输入.messages.map(消息 => 消息.content).join('\n');
    ok('名字出现在提示词里', 全部.includes('林素问'));
    ok('描述已去空白', 全部.includes('首席信息官') && !全部.includes('  首席信息官  '));
  }
}

console.log('\n[5] 读取最近回复数受设置控制');
{
  const 楼层: 假楼层[] = [1, 2, 3, 4, 5].map(号 => ({ message_id: 号, role: 'assistant' as const, message: `第${号}段` }));
  const 取 = await 采集本轮输入(造宿主(楼层), emptyData(), { ...离线世界书, 导演: { ...离线世界书.导演, 读取最近回复数: 2 } }, false);
  ok('只取最近 2 条', 取.成功 && 取.输入.recent.length === 2);
  ok('取的是最后两条', 取.成功 && 取.输入.recent.map(楼 => 楼.message_id).join(',') === '4,5');
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
