// 类型检查门 —— 2026-11-20 C9（需求方 #464）。
//
// ── 这条判据在防什么 ──
//
//  `.vue` 模板原来**根本不进 TS 管线**（vue-loader 编 render 函数、ts-loader transpileOnly、
//  tsc 不认 .vue）。于是"模板里用了不存在的名字"编译期永远看不见 ——
//  「NPC 详情区永远空着」「仪表盘一行从 11-16 起从未显示」都是这一类。
//  **它活了一周，因为没有任何东西会报它。**
//
// ── 判据 ──
//
//  ① 门限内（彼方）全绿
//  ② **自证**：在彼方某个模板里写一个不存在的名字 → **门必须红**
//  ③ 门限外的报错**仍在打印**（不是静默吞掉）
//  ④ 待纳入清单与实际报错的项目一致（不是"想当然的清单"）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 门 = path.join(ROOT, 'tests', 'typecheck-gate.mjs');

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

/** 跑一次门，返回 { 退出码, 输出 } */
function 跑门() {
  const r = spawnSync(process.execPath, [门], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { 退出码: r.status, 输出: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ═════════════════════════════════════════════════════════════
console.log('\n[① 门限内全绿] 彼方目录 0 条类型错误，门通过');
{
  const { 退出码, 输出 } = 跑门();
  const 彼方错误 = 输出.split(/\r?\n/).filter(l => /src\/彼方.*error TS\d+:/.test(l));
  ok('[前置] 门跑起来了（有输出）', 输出.length > 0);
  ok('★ 门限内（彼方）0 条错误', 彼方错误.length === 0, 彼方错误.slice(0, 3).join(' | '));
  ok('★ 门通过（退出码 0）', 退出码 === 0, `实际 ${退出码}`);
  ok('[汇总] 打印了"门限内 0 条"', /门限内 0 条/.test(输出), 输出.split(/\r?\n/).slice(-6).join(' | '));
}

// ═════════════════════════════════════════════════════════════
console.log('\n[③ 门限外仍在打印] 其余三个项目的报错不许被静默吞掉');
{
  const { 输出 } = 跑门();
  // 这三个项目在"待纳入"清单里 —— 它们的报错必须出现在输出里
  for (const 目录 of ['src/剧情导演', 'src/自定义状态栏', 'src/烟火_世界运转'])
    ok(`  ${目录} 的报错仍在输出里`, new RegExp(`${目录.replace(/\//g, '\\/')}.*error TS\\d+:`).test(输出), '被静默吞掉了');

  ok('[汇总] 有"另有 N 条在待纳入项目里"', /另有 \d+ 条在待纳入项目里/.test(输出));
  ok('[汇总] 写明了"待各自修完后再纳入门限"', /待各自修完后再纳入门限/.test(输出));
}

// ═════════════════════════════════════════════════════════════
console.log('\n[④ 待纳入清单是如实的] 清单里写的条数 = 实际报的条数');
{
  // ── 这条防"清单是拍脑袋写的" ──
  //  清单里写"剧情导演 19 条"，如果实际是 25 条，那这份清单就是旧的 ——
  //  而"旧的清单"会让"谁还没修"这件事重新变成猜。
  const 源码 = readFileSync(门, 'utf8');
  const { 输出 } = 跑门();

  // 从门的源码里读清单（不硬编码在判据里，否则判据自己会漂）
  const 清单 = [...源码.matchAll(/\{ 目录: '([^']+)', 条数: (\d+) \}/g)]
    .map(m => ({ 目录: m[1], 条数: +m[2] }));
  ok('[前置] 从源码里读到了待纳入清单', 清单.length > 0, `实际 ${清单.length} 条`);

  for (const { 目录, 条数 } of 清单) {
    const 实际 = 输出.split(/\r?\n/)
      .filter(l => l.includes(`${目录}/`) && /error TS\d+:/.test(l)).length;
    ok(`  清单说「${目录} ${条数} 条」= 实际 ${实际} 条`, 实际 === 条数, `对不上`);
  }
}

// ═════════════════════════════════════════════════════════════
console.log('\n[② 自证] 在彼方模板里写一个不存在的名字 → 门必须红');
{
  // ── 这条是整个 C9 的验收核心 ──
  //  如果这条不红，那这个门就是"看起来在检查、实际什么都没检查"。
  //
  // ── ⚠ 这条判据会**改真实源码文件**（必须小心）──
  //
  //  2026-11-20 出过一次事故：这条判据把 `页面-日志.vue` 写脏了，
  //  而 `finally` 没执行（进程被超时 kill）→ **污染留在磁盘上**，
  //  下一次 `run.mjs` / `typecheck` 全红，查了半天才发现是判据自己干的。
  //
  //  现在三重保障：
  //    ① **开始先自愈** —— 发现遗留备份就立刻恢复（上次被 kill 的后果）
  //    ② `finally` 还原
  //    ③ `process.on('exit')` 兜底（正常退出路径之外的最后一道）
  const 目标 = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统', '页面-日志.vue');
  const 备份 = `${目标}.gate-test-backup`;

  // ── ① 自愈：上次如果被 kill，文件里可能还留着自证变量 ──
  //
  //  ⚠ **不要用"有备份就恢复"** —— 那会把"本轮刚创建的备份"当成遗留，
  //    结果刚写进去的变异被覆盖回去，门就不红了（本批实际踩过）。
  //    判据应该是"**文件里有没有自证变量**"，而不是"有没有备份文件"。
  const 读原文 = () => readFileSync(目标, 'utf8');
  if (读原文().includes('门限自证变量xyz')) {
    // 文件被污染 → 优先从备份恢复；没有备份就清掉那一行
    if (existsSync(备份))
      writeFileSync(目标, readFileSync(备份, 'utf8'), 'utf8');
    else
      writeFileSync(目标, 读原文().replace(/\n\s*<div>\{\{ 门限自证变量xyz \}\}<\/div>/, ''), 'utf8');
    console.log('  [自愈] 发现上次遗留的自证变量，已清理');
  }
  // 无论怎么来的，遗留备份都删掉（后面会重新建）
  if (existsSync(备份)) {
    try {
      unlinkSync(备份);
    }
    catch { /* 清理失败不影响 */ }
  }

  // 记录原文（内存）
  const 原文 = 读原文();
  // **先确认原文件是干净的**
  ok('[前置] 目标文件本身是干净的（没有上次的残留）',
     !原文.includes('门限自证变量xyz'),
     '文件里已经有自证变量 —— 上次的还原失败了');

  // ── ③ exit 兜底：不管怎么退出，都写回原文 ──
  const 还原 = () => {
    try {
      writeFileSync(目标, 原文, 'utf8');
    }
    catch { /* 兜底失败也只能这样 */ }
  };
  process.on('exit', 还原);

  try {
    writeFileSync(目标, 原文.replace('<template>', '<template>\n  <div>{{ 门限自证变量xyz }}</div>'), 'utf8');

    const { 退出码, 输出 } = 跑门();
    ok('★ 门变红了（退出码 1）', 退出码 === 1, `实际 ${退出码}`);
    ok('★ 报错里点名了这个不存在的变量', /门限自证变量xyz/.test(输出), 输出.split(/\r?\n/).filter(l => /error TS/.test(l)).slice(0, 2).join(' | '));
    ok('★ 它被归到了门限内（彼方）', /src\/彼方.*门限自证变量xyz|门限自证变量xyz.*src\/彼方/s.test(输出));
  }
  finally {
    // ── ② finally 还原 ──
    还原();
  }

  // **还原后必须回到绿** —— 否则"红了"可能是别的原因
  const { 退出码 } = 跑门();
  ok('[自证] 还原后门重新变绿', 退出码 === 0, `实际 ${退出码}`);

  // **再确认一次磁盘是干净的**
  ok('[自证] 磁盘上确实没有残留的自证变量',
     !读原文().includes('门限自证变量xyz'),
     '还原之后文件里还有自证变量');
}

// ═════════════════════════════════════════════════════════════
console.log('\n[结构] package.json 的 typecheck 确实走了这个门');
{
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok('[结构] typecheck = node tests/typecheck-gate.mjs', pkg.scripts?.typecheck === 'node tests/typecheck-gate.mjs', `实际 ${pkg.scripts?.typecheck}`);
  ok('[结构] vue-tsc 在 devDependencies 里', !!pkg.devDependencies?.['vue-tsc'], '没装');

  // **自证**：旧的 `tsc --noEmit` 不可能检查模板
  ok('[自证] 旧脚本（tsc --noEmit）不含 vue-tsc', !/vue-tsc/.test('tsc --noEmit -p tsconfig.json'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
