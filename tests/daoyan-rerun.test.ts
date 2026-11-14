// 剧情导演 · 面板「重新推进」的撤销语义(2026-11-08)
//
// 用户报告:「正文输出完了之后没调用 AI, 我点重新推进 —— 会像正常推进一样推进这一层吗, 还是会重新?
//              难怪我已经推了好几层了, 还是一直卡在冷启动 3」
//
// 根因: 自动推进被跳过(正文不足 500 字 / 更新频率取模 / 熔断)时锚点没前进, 而旧版 `重新推进`
// 无条件 `discardSnapshotAt(锚点楼层)` —— 撤掉的是**上一轮成功**的快照, 于是
// 已分析轮数 k → k−1 → k 原地打转: 冷启动(默认第 4 轮起下令)**永远到不了**。
//
// 现在: 只有"锚点停在最新正文上"(= 这一层真推过)才撤; 否则直接推进, 不碰上一轮的账。
import { createPinia, setActivePinia } from 'pinia';
import { 最新AI回复楼层 } from '../src/剧情导演/取料';
import { 取撤销楼层 } from '../src/剧情导演/update';
import 源 from '../src/剧情导演/update.ts?raw';

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

/** 假聊天: 只实现 取料 用到的 lastMessageId / messages(range, { role }) */
function 假聊天(楼层: Record<number, any>, 选项: { 抛错?: boolean } = {}) {
  const ids = Object.keys(楼层)
    .map(Number)
    .sort((a, b) => a - b);
  return {
    lastMessageId: () => (选项.抛错 ? -1 : Math.max(0, ...ids)),
    messages(range: string | number, opts?: any) {
      if (选项.抛错) throw new Error('楼层读不到');
      const [lo, hi] = String(range)
        .split('-')
        .map(Number);
      return ids
        .filter(id => id >= lo && id <= hi)
        .map(id => ({
          message_id: id,
          role: 楼层[id].role,
          message: 楼层[id].message ?? '',
          is_hidden: !!楼层[id].is_hidden,
        }))
        .filter(m => !opts?.role || m.role === opts.role);
    },
  } as any;
}

// ---------------------------------------------------------------------------
// ① 最新AI回复楼层: 只认"最后一条非隐藏的 assistant"
// ---------------------------------------------------------------------------
check(
  '最新AI回复楼层 = 4(跳过用户楼)',
  最新AI回复楼层({
    chat: 假聊天({
      1: { role: 'user', message: '玩家说的话' },
      2: { role: 'assistant', message: '第一段正文' },
      3: { role: 'user', message: '玩家又说话' },
      4: { role: 'assistant', message: '第二段正文' },
    }),
  }),
  4,
);
check('空聊天 → -1', 最新AI回复楼层({ chat: 假聊天({}) }), -1);
check('楼层读不到 → -1', 最新AI回复楼层({ chat: 假聊天({}, { 抛错: true }) }), -1);
check(
  '最后一条 assistant 是隐藏楼 → 跳过, 取上一条',
  最新AI回复楼层({
    chat: 假聊天({
      2: { role: 'assistant', message: '正文' },
      3: { role: 'assistant', message: '隐藏的', is_hidden: true },
    }),
  }),
  2,
);

// ---------------------------------------------------------------------------
// ② 取撤销楼层: 这一层推过才撤
// ---------------------------------------------------------------------------
check('锚点 = 最新楼(这一层推过)→ 撤它', 取撤销楼层(10, 10), 10);
check('锚点 = 12 而最新楼 10(删楼残留)→ 撤锚点', 取撤销楼层(12, 10), 12);
check('锚点 10 而最新楼 12(这一层没推过)→ 不撤', 取撤销楼层(10, 12), -1);
check('差一层没推过(10 → 11)→ 不撤', 取撤销楼层(10, 11), -1);
check('从没推进过(锚点 -1)→ 不撤', 取撤销楼层(-1, 12), -1);
check('读不到最新楼 → 不撤(别顺手破坏账本)', 取撤销楼层(10, -1), -1);

// ---------------------------------------------------------------------------
// ③ 重新推进 真的按上面的判断走(源码级钉子, 防止有人改回无条件撤销)
// ---------------------------------------------------------------------------
const 起点 = 源.indexOf('export async function 重新推进');
const 段 = 源.slice(起点, 起点 + 480);
ok('找得到 重新推进', 起点 >= 0);
ok('重新推进 先算 取撤销楼层', 段.includes('取撤销楼层('));
ok('只撤 >= 0 的那一层', /if \(撤 >= 0\) discardSnapshotAt\(撤\)/.test(段));
ok('没有残留的旧写法(无条件撤锚点)', !段.includes('discardSnapshotAt(data.锚点楼层)'));

console.log(`\n${fail === 0 ? '全部通过' : '有失败'}  ${pass} pass / ${fail} fail\n`);
if (fail > 0) process.exit(1);
