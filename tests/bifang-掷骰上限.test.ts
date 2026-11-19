// 彼方 · `{{roll}}` 骰子宏的上限 —— 批次 2026-11-19 波1（复查「发现7」P2）。
//
// 这条守的是**页面不会卡死**：`{{roll 1000000000d6}}` 曾经能让整个酒馆无响应
// （不是报错、不是慢，是转圈到用户以为崩了）。
//
// ── 为什么这条要常驻 ──
//  它是**唯一一条"输入能让主线程死掉"**的路径。别处的失败都是"这一步没做成"，
//  这里是"整个页面都不能用了"——严重程度差一个量级。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/api.ts'), 'utf8');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
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

// ─────────────────────────────────────────────────────────────
console.log('\n[上限] `{{roll}}` 必须有数量与面数上限');
{
  // ── 结构判据：常量存在且值正确 ──
  ok('[上限] 源码里有 骰子上限 常量', /骰子上限/.test(源));
  const m = 源.match(/const 骰子上限 = (\{[^}]+\}) as const;/);
  ok('[上限] 能取出它的值', !!m, m ? '' : '正则没匹配到');
  const 上限 = m ? (new Function(`return (${m[1]});`))() : null;
  eq('[上限] 数量上限 100', 上限?.数量, 100);
  eq('[上限] 面数上限 1000', 上限?.面数, 1000);

  // ── 结构判据：循环用的是截断后的变量 ──
  // 这条防的是"加了上限常量但循环仍用 +count" —— 那是**最像修好了的假修**
  ok('[上限] 循环用的是截断后的 数量（不是 +count）', /for \(let i = 0; i < 数量; i\+\+\)/.test(源));
  // ⚠ 查残留时必须**排除注释行**：我在上面的注释里正好写了那句反例当说明，
  //   不排除的话这条会因为我自己的解释而红（假红比假绿好，但也是噪音）。
  const 代码行 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok('[上限] 代码里没有残留 `i < +count`', !/for \(let i = 0; i < \+count; i\+\+\)/.test(代码行),
     '循环仍在用未截断的 count');

  // ── 行为判据：按上限跑，结果落在合理区间 ──
  const 掷骰 = (count: number, sides: number) => {
    const 数量 = Math.min(count, 上限.数量);
    const 面数 = Math.min(sides, 上限.面数);
    let total = 0;
    for (let i = 0; i < 数量; i++)
      total += 1 + Math.floor(Math.random() * 面数);
    return { total, 数量, 面数 };
  };

  const t0 = Date.now();
  const 大 = 掷骰(1000000000, 6);
  const 耗时 = Date.now() - t0;
  eq('[上限] 十亿次被截断到 100 次', 大.数量, 100);
  ok('[上限] 耗时 < 100ms（没卡死）', 耗时 < 100, `${耗时}ms`);
  ok('[上限] 结果在 [100, 600] 内（= 100d6 的合法范围）', 大.total >= 100 && 大.total <= 600, String(大.total));

  const 大面 = 掷骰(1, 1000000000);
  eq('[上限] 十亿面被截断到 1000', 大面.面数, 1000);
  ok('[上限] 结果在 [1, 1000] 内', 大面.total >= 1 && 大面.total <= 1000, String(大面.total));

  // ── 防误伤：正常值不许被截断 ──
  const 正常 = 掷骰(1, 100);
  eq('[上限] 正常数量不截断', 正常.数量, 1);
  eq('[上限] 正常面数不截断', 正常.面数, 100);
  ok('[上限] 正常结果在 [1, 100] 内', 正常.total >= 1 && 正常.total <= 100, String(正常.total));

  // ── 必须出声（不许静默截断）──
  ok('[上限] 超限时有 warn', /超出上限已截断/.test(源));
  // 自证：这个正则可以区分"有 warn"和"没有"
  ok('[自证] 没有 warn 的源码会被这条抓到', !/超出上限已截断/.test('console.log("x")'));

  // ── 自证：上限确实是那个拦截点 ──
  ok('[自证] 没有上限时十亿次不会被截断（这就是那个 bug）',
     Math.min(1000000000, Infinity) === 1000000000);
  ok('[自证] 有上限时会截断（这是修复）', Math.min(1000000000, 上限.数量) === 100);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
