// 剧情导演 · 批次 H（落盘一致性）—— 2026-11-13
//
// 三条同源：**"写进去了"和"登记上了"不是一回事**，而以前的代码把两者当成一回事。
//   H-1 `saveMeta` 失败被吞 → `writeStateSnapshot` 仍返回 true → 快照在楼层里、索引里没有
//       → 下次 loadData 找不到它、回退到更早的快照：**面板说已保存，引擎用旧账本**
//   H-2 `保存推进结果` 先改内存再落盘 → 落盘失败也不回滚 → 内存已前进、磁盘没动
//   H-3 `saveData` 在"原锚点有效但写失败"时偷偷改写到最新楼 → 锚点漂移（删楼回退粒度错位）
//
// 本用例全部用**会失败的路径**（mock `vars.update` 抛错），不测 happy path。

import { createPinia, setActivePinia } from 'pinia';
import { emptyData } from '../src/剧情导演/快照';
import { injectHostForTest } from '../src/剧情导演/host';
import { writeStateSnapshot, saveData, 保存推进结果 } from '../src/剧情导演/快照';

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

// ---------------------------------------------------------------------------
// 假宿主：记录每次 vars.update 的 type / message_id，并能按类型抛错
const 记录: { type: string; message_id?: number }[] = [];
const 抛错 = { 楼层: false, 聊天: false };
/** 这些楼层"已经不存在"（`messages()` 返回空）—— 用来验"锚点那楼被删"的退回逻辑 */
const 宿主能力 = { 缺楼层: new Set<number>() };
injectHostForTest({
  chat: {
    lastMessageId: () => 5,
    messages: (id: number) => (宿主能力.缺楼层.has(id) ? [] : [{ message: `楼层 ${id} 的内容`, role: 'assistant' }]),
    currentChatId: () => 'chat-A',
  },
  vars: {
    get: () => ({}),
    update: (fn: any, opt: any) => {
      记录.push({ type: opt?.type ?? '?', message_id: opt?.message_id });
      if (opt?.type === 'message' && 抛错.楼层) throw new Error('楼层写入失败');
      if (opt?.type === 'chat' && 抛错.聊天) throw new Error('meta 写入失败');
      return fn({});
    },
    del: () => {},
  },
  worldbook: {},
  persona: {},
} as any);

const 清记录 = () => { 记录.length = 0; };
const 楼层写 = () => 记录.filter(r => r.type === 'message');
const 账本 = (部分: Record<string, any> = {}) => ({ ...emptyData(), 锚点楼层: 3, ...部分 }) as any;

// ---------------------------------------------------------------------------
console.log('\n[H-1] meta 登记失败 → writeStateSnapshot 必须返回 false（以前无条件 true）');
{
  抛错.聊天 = true;
  抛错.楼层 = false;
  清记录();
  const 结果 = writeStateSnapshot(账本(), 5, 5, true);
  check('返回 false', 结果, false);
  ok('确实尝试过写楼层（说明不是"楼层没写"导致的 false）', 楼层写().length === 1);
  ok('确实尝试过写 meta（chat 类型）', 记录.some(r => r.type === 'chat'));

  // 对照：不抛错时必须返回 true（证明这条不是恒 false）
  抛错.聊天 = false;
  清记录();
  check('对照: 不抛错 → true', writeStateSnapshot(账本(), 5, 5, true), true);
}

console.log('\n[H-2] 落盘失败 → 内存里的 处理到楼层 / 清空层 必须回到原值');
{
  抛错.聊天 = true;
  const data = 账本({ 处理到楼层: 2, 清空层: 3 });
  const 结果 = 保存推进结果(data, 5);
  check('落盘 = false', 结果.落盘, false);
  check('锚点楼层 = -1（没落盘就不记账）', 结果.锚点楼层, -1);
  check('data.处理到楼层 回到 2（不再是 5）', data.处理到楼层, 2);
  check('data.清空层 回到 3（不再是 0）', data.清空层, 3);

  // 对照：不抛错时应当前进（证明这条不是恒不变）
  抛错.聊天 = false;
  const 好 = 账本({ 处理到楼层: 2, 清空层: 3 });
  const 好结果 = 保存推进结果(好, 5);
  check('对照: 成功时 落盘 = true', 好结果.落盘, true);
  check('对照: 成功时 处理到楼层 = 5', 好.处理到楼层, 5);
  check('对照: 成功时 清空层 = 0', 好.清空层, 0);
}

console.log('\n[H-3] 原锚点有效但写失败 → 不许偷偷改写到最新楼');
{
  抛错.聊天 = true;
  const data = 账本({ 锚点楼层: 3 });
  清记录();
  const 结果 = saveData(data);
  check('返回 false', 结果, false);
  const 写过的楼层 = 楼层写().map(r => r.message_id);
  check('只对原锚点 #3 尝试写过一次', 写过的楼层, [3]);
  ok('**没有**以最新楼 #5 写过（旧代码会漂移到最新楼）', !写过的楼层.includes(5));

  // 对照②：原锚点数值有效但**那一楼已被删** → 仍要退回最新楼（这是既有纪律，H-3 不许弄丢）
  抛错.聊天 = false; // 这一组不测"写失败"，测"楼层没了"
  const 删过 = 账本({ 锚点楼层: 3 });
  清记录();
  // 让 messages(3) 返回空（= 那楼没了），messages(5) 正常
  宿主能力.缺楼层.add(3);
  check('对照: 原锚点那楼被删 → 退回最新楼并成功', saveData(删过), true);
  check('对照: 写的是最新楼 #5', 楼层写().map(r => r.message_id), [5]);
  宿主能力.缺楼层.delete(3);

  // 对照：锚点无效(-1)时才允许用最新楼占位
  抛错.聊天 = false;
  const 新 = 账本({ 锚点楼层: -1 });
  清记录();
  check('对照: 锚点 -1 → 用最新楼占位，返回 true', saveData(新), true);
  check('对照: 写的是最新楼 #5', 楼层写().map(r => r.message_id), [5]);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
