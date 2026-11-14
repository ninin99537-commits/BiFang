// 剧情导演 · D-1 wiring（补推串档）—— 2026-11-13
//
// 需求方原话：「源码级判据只能证明守卫写了，不能证明守卫真的会拦住」——这条他说对了。
// 所以主判据改成**驱动回调 + 真写盘**：
//   · 注入一个**立即执行**的排程器（不用真等 1.5 秒）
//   · 注入一个"排程之后才变成已换聊天"的判定
//   · 执行体里放**真的落盘**（`writeStateSnapshot` + 假宿主）
//   · 断言用 `vars.update` 的**调用记录**：换聊天那次一条 message 写入都没有
//
// 反向对照同样重要：不换聊天时**必须真的写了一条** —— 否则"永远不写"也能让上面那条绿。
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { 安排补推 } from '../src/剧情导演/update';
import { injectHostForTest } from '../src/剧情导演/host';
import { emptyData, writeStateSnapshot } from '../src/剧情导演/快照';

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

// 假宿主：记录每次 vars.update 的 type / message_id（"有没有写盘"就看这个）
const 记录: { type: string; message_id?: number }[] = [];
const 宿主状态 = { 当前聊天: 'chat-A', 最新楼: 5 };
injectHostForTest({
  chat: {
    lastMessageId: () => 宿主状态.最新楼,
    messages: (id: number) => [{ message: `楼层 ${id} 的内容`, role: 'assistant' }],
    currentChatId: () => 宿主状态.当前聊天,
  },
  vars: {
    get: () => ({}),
    update: (fn: any, opt: any) => {
      记录.push({ type: opt?.type ?? '?', message_id: opt?.message_id });
      return fn({});
    },
    del: () => {},
  },
  worldbook: {},
  persona: {},
} as any);

const 清记录 = () => {
  记录.length = 0;
};
const 楼层写入次数 = () => 记录.filter(r => r.type === 'message').length;
/** 真落盘一次 —— 这就是"补推会不会污染账本"那个动作本身 */
const 真写盘 = () => writeStateSnapshot({ ...emptyData(), 锚点楼层: 3 } as any, 宿主状态.最新楼, 宿主状态.最新楼, true);

/** 立即执行的排程器：记录延迟，并在触发前执行 前置()（用来模拟"排程后用户切了聊天"） */
function 立即排程(前置?: () => void) {
  const 记录排程: { 延迟: number }[] = [];
  const 排程 = (fn: () => void, ms: number) => {
    记录排程.push({ 延迟: ms });
    前置?.();
    fn();
    return 'handle';
  };
  return { 排程, 记录排程 };
}

// ---------------------------------------------------------------------------
console.log('\n[D-1] 排程后换聊天 → 回调里**不许写盘**（看 vars.update 记录，不看源码）');
{
  宿主状态.当前聊天 = 'chat-A';
  清记录();
  const { 排程, 记录排程 } = 立即排程(() => {
    // 排程到触发之间用户切了聊天
    宿主状态.当前聊天 = 'chat-B';
  });
  const 句柄 = 安排补推({
    发起聊天: 'chat-A',
    已换聊天: () => 宿主状态.当前聊天 !== 'chat-A',
    延迟: 1500,
    排程: (fn, ms) => 排程(fn, ms),
    执行: 真写盘,
  });
  check('**一条 message 都没写**（串档被拦住）', 楼层写入次数(), 0);
  check('一条 vars.update 都没发生', 记录.length, 0);
  check('确实排过一次', 记录排程.length, 1);
  check('延迟 = 1500（1.5 秒）', 记录排程[0].延迟, 1500);
  ok('返回了句柄（能 clearTimeout）', 句柄 === 'handle');
}

console.log('\n[D-1 对照①] 没换聊天 → 回调里**必须真的写一条**（否则"永远不写"也能绿）');
{
  宿主状态.当前聊天 = 'chat-A';
  清记录();
  const { 排程 } = 立即排程();
  安排补推({
    发起聊天: 'chat-A',
    已换聊天: () => 宿主状态.当前聊天 !== 'chat-A',
    延迟: 1500,
    排程,
    执行: 真写盘,
  });
  check('写了 1 条 message（写盘真的发生了）', 楼层写入次数(), 1);
  ok('写的是当前最新楼层 #5', 记录.some(r => r.type === 'message' && r.message_id === 5));
}

console.log('\n[D-1 对照②] 发起聊天读不到(null) → 按"不拦"处理，写盘照常');
{
  宿主状态.当前聊天 = 'chat-B';
  清记录();
  const { 排程 } = 立即排程();
  安排补推({
    发起聊天: null,
    已换聊天: () => false, // 真实实现里 已换聊天(null) 恒 false
    延迟: 1500,
    排程,
    执行: 真写盘,
  });
  check('写盘照常发生（1 条）', 楼层写入次数(), 1);
}

console.log('\n[D-1 源码辅助] 守卫写在回调里、句柄在入口 clear（防回退）');
{
  const 源 = readFileSync('src/剧情导演/update.ts', 'utf8');
  ok('句柄是模块级变量', /let 补推定时器: ReturnType<typeof setTimeout> \| null = null;/.test(源));
  ok('入口 clearTimeout', /if \(补推定时器 !== null\) \{\s*clearTimeout\(补推定时器\)/.test(源));
  ok('排程走 安排补推（守卫集中在一处）', /补推定时器 = 安排补推\(/.test(源));
  ok('守卫在回调内（安排补推 里先判再执行）', /参数\.排程\(\(\) => \{\s*if \(参数\.已换聊天/.test(源));
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
