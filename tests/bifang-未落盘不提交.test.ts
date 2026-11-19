// 彼方 · 没落盘的数据不许提交给界面 —— 批次 2026-11-19 波2（复查「发现2」）。
//
// ── 这个 bug 是什么 ──
//  自动更新算完想写快照 → 发现锚点之后有手动保存 → `允许覆盖 = false` → `writeStateSnapshot` 返回 false
//  → **而 else 分支仍然 `stateStore.data = newData`**（那是**没存进去的那份**）。
//
//  后果有两层：
//    ① **抹掉用户刚手动保存的显示**：他在更新期间改了卡并保存，界面却显示回 AI 的结果；
//    ② **世界书也用这份同步** → 世界书里写的是"没进库的那份"，刷新后又变回用户那份，**前后不一致**。
//
// ── 为什么这条判据要查"顺序" ──
//  只查"有没有 `loadData(host)`"是不够的：如果回读在 `toastSuccess` **之后**，
//  用户已经看到绿字了，回读再对也没用。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const 源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/update.ts'), 'utf8');
/** 去掉注释行 —— 注释里写着反例（比如 `stateStore.data = newData;` 那句"原来错在哪"） */
const 代码行 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

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
console.log('\n[落盘] 没落盘时：不提交给界面 / 不同步世界书 / 不弹成功');
{
  // ① 落盘结果必须存进变量（不是直接当 if 条件用 —— 后面还要用它）
  ok('[落盘] 结果存进 `已落盘` 变量', /const 已落盘 = writeStateSnapshot\(/.test(代码行));

  // ② **不许**无条件提交 newData
  ok('[落盘] 没有 `stateStore.data = newData;`（无条件提交）',
     !/stateStore\.data = newData;/.test(代码行), '这一句就是那个 bug');

  // ③ 没落盘时回读库里那份
  ok('[落盘] 没落盘时用 `loadData(host)` 回读', /stateStore\.data = loadData\(host\)/.test(代码行));

  // ④ 世界书只用 stateStore.data（= 库里真实那份）
  ok('[落盘] 世界书用 `stateStore.data` 同步（不是 newData）',
     /syncNpcStatesWorldbook\(host, stateStore\.data,/.test(代码行));
  ok('[落盘] 世界书不再用 newData 同步', !/syncNpcStatesWorldbook\(host, newData,/.test(代码行));

  // ⑤ 没落盘时不弹成功
  ok('[落盘] 没落盘时有 return 挡住成功提示',
     /if \(!已落盘\)[\s\S]{0,200}?return;/.test(代码行));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[落盘] 顺序：回读必须在成功提示之前');
{
  // ── 为什么查顺序 ──
  //  如果 `loadData(host)` 在 `toastSuccess` 之后，用户已经看到"已更新 N 个NPC"了。
  //  那回读再正确也没用 —— 他已经在心里记下"成功了"。
  const 回读位 = 代码行.indexOf('stateStore.data = loadData(host)');
  const 成功位 = 代码行.indexOf('toastSuccess(摘要.更新.length');
  ok('[落盘] 找得到回读语句', 回读位 > 0, String(回读位));
  ok('[落盘] 找得到成功提示', 成功位 > 0, String(成功位));
  ok('[落盘] 回读在成功提示之前', 回读位 > 0 && 成功位 > 回读位,
     `回读=${回读位} 成功=${成功位}`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[落盘] 自证：正常落盘时三件事都要照常发生');
{
  // ── 这条防什么 ──
  //  如果代码写成「无论如何都不提交、都不弹成功」，上面所有断言照样绿 ——
  //  但那是**把功能删了**，不是修 bug。
  ok('[自证] 有「已落盘 → 提交 newData」这一支',
     /if \(已落盘\) \{[\s\S]{0,120}?stateStore\.data = \{ \.\.\.newData/.test(代码行));
  ok('[自证] 成功提示在 `!已落盘` 的 return 之后（正常路径仍会弹）',
     /if \(!已落盘\)[\s\S]{0,200}?return;[\s\S]{0,40}?\}\s*toastSuccess/.test(代码行));

  // ── 从 git 取旧版本，证明这个 bug 真实存在过 ──
  let 旧版 = '';
  try {
    旧版 = execFileSync('git', ['show', 'HEAD~2:src/彼方_NPC幕后生命状态系统/update.ts'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  }
  catch {
    // 取不到就跳过（比如浅克隆）—— **但要打出来，不能静默**
    console.log('  (跳过 git 对照：取不到旧版本)');
  }
  if (旧版) {
    const 旧代码行 = 旧版.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    ok('[自证] 旧版确实有无条件提交（这就是那个 bug）',
       /stateStore\.data = newData;/.test(旧代码行));
    ok('[自证] 新版没有（这是修复）', !/stateStore\.data = newData;/.test(代码行));
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
