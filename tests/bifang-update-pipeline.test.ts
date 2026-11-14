// 彼方 · 更新主链路的**端到端**用例 —— 批次 2 第 1 件(派活: #79)。
//
// 为什么是它: README 宣称的 update-pipeline 用例在本工作区从未存在(验收盲区清单 P0 第 1 条),
// 主链路 updateNpcStates 取料 → 请求 → 应用 → 写快照 → 收尾整条只有零散纯函数用例兜着,
// 链路级回归全部静默。这份用例用假平台 + 假模型把整条链跑通:
//   updateNpcStates(host) → 收集输入(假 host 给楼层/人设) → 假模型返回合法 JSON → 应用 → 写快照。
//
// 三条主断言(缺一条就不算端到端):
//   [A] 状态写进**本次分析的最后一条楼层**的楼层变量(不是聊天变量 —— 聊天变量只存轻量元数据);
//   [B] 摘要.更新 / 摘要.移除 与假模型输出一致(经 debugStore.record 落日志页的那份);
//   [C] 模型返回坏 JSON → 原样重试 3 次后失败, 且**不留半截状态**(楼层变量没被写)。
// 假平台在 tests/helpers/彼方假宿主.ts(2-4 件共用; 它没模拟的面见那文件头注)。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { 彼方假宿主, 种已有状态, STORAGE_KEY } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

console.log('\n[A+B] 正常一轮: 假模型返回合法 JSON → 应用 → 快照写进最后分析楼层的楼层变量');
{
  setActivePinia(createPinia());
  const { host, 存, 记 } = 彼方假宿主({
    模型回复: [JSON.stringify({
      剧情时间: { 开始: '2026-01-02 12:00', 结束: '2026-01-02 12:30' },
      NPC: {
        乙: {
          身份锚点: '28岁巡逻队成员, 独居',
          当前在做: '在广场东角巡逻',
          当前状态: '警觉',
          位置: '广场',
          近期关键事件: '2026-01-02 广场集合',
          生活状态: '吃饭(2026-01-02 08:00); 睡眠(2026-01-01 23:00-次日07:00)',
          接下来想做: '换岗后去买菜',
          当前目标: '保住巡逻队的差事',
          未完成事项: [],
          心里惦记: '弟弟的学费',
          秘密想法: '想离开这座城',
          隐藏目标: '查清父亲失踪的真相',
        },
      },
      移除NPC: ['丙'],
    })],
  });
  种已有状态(host);
  await updateNpcStates(host as any);

  eq('[A] 模型调用次数 = 1', 记.rawCalls.length, 1);
  ok('[A] 状态写进本次分析的最后一条楼层(楼层 #3 的楼层变量)', 存.message[3]?.[STORAGE_KEY] !== undefined);
  const 快照 = 存.message[3]?.[STORAGE_KEY];
  eq('[A] 快照名单: 甲 留、丙 移除、乙 建档', [...快照.名单].sort(), ['乙', '甲']);
  ok('[A] 乙 的卡进了快照', 快照.NPC?.['乙']?.当前在做 === '在广场东角巡逻');
  ok('[A] 丙 的卡被移除', 快照.NPC?.['丙'] === undefined);
  const 聊天元数据 = 存.chat[STORAGE_KEY];
  ok('[A] 聊天变量只存轻量元数据(没有 名单/NPC 本体)', 聊天元数据?.名单 === undefined && 聊天元数据?.NPC === undefined);
  eq('[A] 元数据记下两份快照所在楼层', 聊天元数据?.快照楼层, [1, 3]);
  eq('[A] 清空层已生效清零', 聊天元数据?.清空层, 0);

  const 日志 = useDebugStore().log;
  eq('[B] 摘要.更新 与假模型输出一致', 日志?.updatedNpcs, ['乙']);
  eq('[B] 摘要.移除 与假模型输出一致', 日志?.removedNpcs, ['丙']);
  // 最近 3 条**可见 AI 回复** = 楼层 1 与 3(楼层 2 是用户输入); 锚点取末位 = #3
  eq('[B] 日志记下本轮分析的楼层', 日志?.replyIds, [1, 3]);
}

console.log('\n[C] 坏 JSON: 原样重试 3 次后失败, 且不留半截状态(楼层变量没被写)');
{
  setActivePinia(createPinia());
  const 坏 = '抱歉, 这里是人话不是 JSON。';
  const { host, 存, 记 } = 彼方假宿主({ 模型回复: [坏, 坏, 坏] });
  种已有状态(host);
  const 原log = console.error;
  console.error = () => undefined; // 失败路径会 console.error + toastError, 测试里收声
  try {
    await updateNpcStates(host as any);
  }
  catch {
    // updateNpcStates 内部吞错(失败走日志页+toast), 这里兜一层防编排意外
  }
  console.error = 原log;
  eq('[C] 坏 JSON → 模型恰好被原样重发 3 次', 记.rawCalls.length, 3);
  ok('[C] 三次请求发的是同一份提示词(原样重发, 不回喂)', 记.rawCalls[0]?.ordered_prompts?.length === 记.rawCalls[2]?.ordered_prompts?.length);
  ok('[C] 不留半截状态: 最后分析楼层(#3)的楼层变量没有被写', 存.message[3]?.[STORAGE_KEY] === undefined);
  eq('[C] 元数据也停在种子状态(快照楼层仍只有 [1])', 存.chat[STORAGE_KEY]?.快照楼层, [1]);
  const 日志 = useDebugStore().log;
  ok('[C] 失败进了日志页(带失败详情)', typeof 日志?.error === 'string' && 日志.error.includes('更新失败'));
}

console.log('\n[D] 空轮 {"NPC":{}} 是合法载荷: 1 次请求、不重试、不失败(真缺陷回归钉 —— 旧候选判据只认 剧情时间/移除NPC 时, 空轮被误判"没返回JSON"白重发三次)');
{
  setActivePinia(createPinia());
  const { host, 存, 记 } = 彼方假宿主({ 模型回复: [JSON.stringify({ NPC: {} })] });
  种已有状态(host);
  await updateNpcStates(host as any);
  eq('[D] 空轮恰好 1 次请求(不白重发)', 记.rawCalls.length, 1);
  const 日志 = useDebugStore().log;
  ok('[D] 不判失败: 日志页没有 error', 日志?.error === undefined || 日志?.error === '');
  ok('[D] 正常收尾: 快照照常写进最后分析楼层 #3', 存.message[3]?.[STORAGE_KEY] !== undefined);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
