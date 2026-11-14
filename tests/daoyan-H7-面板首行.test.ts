// 剧情导演 · H.7 面板可观测性（2026-11-13，zcode 报、需求方裁定成立不否决）
//
// 病根：P0.5 之后通道分了家 —— `硬约束` 才是**代码对演员下的裁定**（必须体现），
// `硬性要求` 降级成导演的**演法建议**。但面板「当前指令」那一行显示的还是
// `首行(硬性要求)`，于是真机上真正在管这一场的那句话**看不见**。
//
// 判据（需求方给的）：首行 = `硬约束[0] ?? 硬性要求 首行`。
// 本用例钉的是模板里的取值顺序（面板是 .vue，现有面板类用例也都用源码断言）。
import { readFileSync } from 'node:fs';

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

const 源 = readFileSync('src/剧情导演/悬浮球界面.vue', 'utf8');
/** 取出含 `首行(` 的那个 <p> 行（就是「当前指令」的首行显示） */
const 首行行 = 源.split('\n').find(行 => 行.includes('首行(账本.当前指令') || (行.includes('首行(') && 行.includes('当前指令'))) ?? '';

console.log('\n[H.7] 当前指令的首行：硬约束优先，硬性要求兜底');
{
  ok('找得到那一行（防空跑）', 首行行.length > 0);
  ok('取值里出现了 硬约束', 首行行.includes('硬约束'));
  ok('取值里出现了 硬性要求', 首行行.includes('硬性要求'));
  // 顺序：硬约束 必须排在 硬性要求 之前（`??` 的语义就是"前者有就用前者"）
  ok('硬约束 在 硬性要求 之前（?? 短路顺序正确）', 首行行.indexOf('硬约束') < 首行行.indexOf('硬性要求'));
  // 判据能失败：旧的写法（只读硬性要求）必须已经不存在
  ok('不再有"只显示 硬性要求"的旧写法', !/首行\(账本\.当前指令\.硬性要求\)/.test(源));
  // 有硬约束但没有硬性要求时，这一行仍然要显示（v-if 不能只看硬性要求）
  const vif = 首行行.slice(0, 首行行.indexOf('class='));
  ok('v-if 同时认 硬约束 与 硬性要求', vif.includes('硬约束') && vif.includes('硬性要求'));
}

console.log('\n[对照] 硬约束 确实是"裁定"通道（不是我以为的）');
{
  // 指令全文里 硬约束 排在本幕参考之前 —— 面板显示它才有"在管这一场"的意思
  const 引擎 = readFileSync('src/剧情导演/引擎规则.ts', 'utf8');
  ok('引擎规则里 硬约束 是本幕指令的字段', /硬约束:/.test(引擎));
  const 提示 = readFileSync('src/剧情导演/prompts.ts', 'utf8');
  ok('提示词里 硬约束 与 硬性要求 是两个通道', 提示.includes('本幕硬约束'));
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
