// 剧情导演 · 超期 1 场以上无条件说「该收章」—— 2026-11-13（用户拍板）
//
// 病根：`提醒.ts` 的 `幕纲落后或该收章` 分两支，只有 `到头了 === true`（幕号到最后一幕/收束）
// 才说「该收章」；`到头了 === false`（幕号 3/5）只说"推幕号/重写幕纲"。
// 而**幕号可以无限推**：5 幕的章卡在第 3 幕演到 41 场，它就一路劝"往前推"，章永远不结束 ——
// 章不结束，按章计的伏笔窗口就永远等不到。
//
// 用户拍板：超期 1 场以上**无条件**说「该收章」（不管幕号推到哪）。
// 约束：`到头了 === true` 那一支**一个字都不许改**（真机 5/5 逐字不变）；不新增第二条消息；
//      不动 `判收章`；不动让位链。
//
// ⚠️ 判据词纪律：`该收章` 在 `提醒.ts` 里出现十几次（多数在注释），所以这里用**整句锚定**
//    （`幕纲明显落后于实际进展, **该收章了**`），不用 `/该收章/` 单独判。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 结构提醒 } from '../src/剧情导演/提醒';

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

const 幕纲 = Array.from({ length: 5 }, (_, i) => `第${i + 1}幕｜类型: 事件｜目标:t`);
/** 已分析轮数 = 轮，取料传的场号 = 轮 + 1（D-2 的 +1） */
const 造账 = (轮: number, 当前幕号: number): 导演账本 =>
  ({
    ...emptyData(),
    已分析轮数: 轮,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 1, 幕纲, 当前幕号 } as any,
  } as 导演账本);

/** 收章语义：两种说法都算（`演了` = 章长度 / `已演` = 幕纲落后） */
const 收章语义 = (行: string[]) => 行.filter(x => /该收章|收束预算|开新章|演了 \d+ 场|已演 \d+ 场/.test(x));
const 那一行 = (行: string[]) => 收章语义(行).join('\n');

// ---------------------------------------------------------------------------
console.log('\n[1] 幕号 3/5：超期之后必须**同时**说「幕纲明显落后」与「该收章」');
{
  for (const 轮 of [40, 41]) {
    const 场 = 轮 + 1;
    const 行 = 结构提醒(造账(轮, 3), 场);
    const 收 = 收章语义(行);
    check(`场 ${场}: 收章语义恰好 1 条`, 收.length, 1);
    ok(`场 ${场}: 保留既有短语「幕纲明显落后于实际进展」`, 那一行(收).includes('幕纲明显落后于实际进展'));
    ok(`场 ${场}: 说「该收章了」（整句锚定，防注释误命中）`, 那一行(收).includes('**该收章了**'));
    ok(`场 ${场}: 给出收章动作（计划高潮落地 + 开下一章）`, 那一行(收).includes('计划高潮落地') && 那一行(收).includes('开下一章'));
    ok(`场 ${场}: 旧的两条出路仍在文案里（推幕号）`, 那一行(收).includes('把「当前幕号」往前推'));
  }
}

console.log('\n[2] 幕号 3/5、还没超期 → 一条都不许说（不误伤）');
{
  check('场 39 → 0 条', 收章语义(结构提醒(造账(38, 3), 39)).length, 0);
  check('场 40 → 1 条（40 场正好到达章长度阈值）', 收章语义(结构提醒(造账(39, 3), 40)).length, 1);
}

console.log('\n[3] 幕号 5/5（真机形态）：`到头了` 那一支**逐字不变**');
{
  const 行 = 结构提醒(造账(40, 5), 41);
  const 收 = 收章语义(行);
  check('场 41: 收章语义恰好 1 条', 收.length, 1);
  const 文本 = 那一行(收);
  ok('含「幕号已经推不动了」（到头了 分支的固定短语）', 文本.includes('幕号已经推不动了'));
  ok('含「该收章」', 文本.includes('该收章'));
  ok('**不含**「幕纲明显落后于实际进展」（那是另一支的话）', !文本.includes('幕纲明显落后于实际进展'));
  ok('含「停在最后一幕不出章」（到头了 分支的结尾）', 文本.includes('停在最后一幕不出章'));
}

console.log('\n[4] 任一场：收章语义条数 == 1（互斥仍成立，不新增第二条消息）');
{
  for (const 幕号 of [3, 5]) {
    for (const 轮 of [38, 39, 40, 41, 45]) {
      const 条数 = 收章语义(结构提醒(造账(轮, 幕号), 轮 + 1)).length;
      ok(`幕号 ${幕号}/5 · 场 ${轮 + 1} → ${条数} 条（<=1）`, 条数 <= 1);
    }
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
