// 一次性探针（只读）: 验 `run.mjs` 的汇总解析（2026-11-19，`fileFailed=1` 那条）。
//
// ── 要验的 ──
//  ① 旧句式 `结果: 51 通过, 0 失败` 仍能解析（不能改坏）
//  ② 新句式 `3 项失败 (36 项通过)` 现在能解析（这是修的）
//  ③ **自证**：用旧正则跑 ②，必须解析失败（证明那个 bug 是真的）
import { readFileSync } from 'node:fs';
import path from 'node:path';

const 源 = readFileSync(path.join(process.cwd(), 'tests/run.mjs'), 'utf8');

let 通过 = 0, 失败 = 0;
const 断言 = (名, 实际, 期望) => {
  const ok = JSON.stringify(实际) === JSON.stringify(期望);
  if (ok) 通过++; else 失败++;
  console.log('  ' + (ok ? '✅' : '★ ') + '  ' + 名 + (ok ? '' : '  实际=' + JSON.stringify(实际) + ' 期望=' + JSON.stringify(期望)));
};

// ── 从真实源码里取出那个函数（不手抄）──
const 起 = 源.indexOf('function 解析末行汇总(');
const 止 = 源.indexOf('\n}', 起) + 2;
const 函数源 = 源.slice(起, 止);
console.log('=== 取出的函数（前 3 行）===');
console.log(函数源.split('\n').slice(0, 3).join('\n'));
console.log('');

// eslint-disable-next-line no-new-func
const 解析 = new Function(`${函数源}; return 解析末行汇总;`)();

console.log('=== ① 旧句式（多数文件用这个）===');
断言('`结果: 51 通过, 0 失败`', 解析('...\n结果: 51 通过, 0 失败\n'), { pass: 51, fail: 0 });
断言('`结果: 5 通过, 2 失败`', 解析('...\n结果: 5 通过, 2 失败\n'), { pass: 5, fail: 2 });

console.log('');
console.log('=== ② 新句式（bifang-panel-contract 用这个）===');
断言('`3 项失败 (36 项通过)` 能解析出失败数', 解析('...\n3 项失败 (36 项通过)\n'), { pass: 36, fail: 3 });
断言('`全部通过: 176 个用例文件` 不误判成失败', (解析('全部通过: 176 个用例文件') ?? {}).fail ?? 0, 0);

console.log('');
console.log('=== ③ 自证：旧正则跑新句式会失败 ===');
// 复刻修前的正则
const 旧通过 = '3 项失败 (36 项通过)'.match(/(\d+)\s*(?:通过|断言)/);
const 旧失败 = '3 项失败 (36 项通过)'.match(/(\d+)\s*失败/);
console.log('  旧 /(\\d+)\\s*(?:通过|断言)/ → ' + JSON.stringify(旧通过));
console.log('  旧 /(\\d+)\\s*失败/         → ' + JSON.stringify(旧失败));
断言('[自证] 旧正则两个都匹配不到（这就是那个假绿）', 旧通过 === null && 旧失败 === null, true);

// 新正则
const 新失败 = '3 项失败 (36 项通过)'.match(/(\d+)\s*[项个条]?\s*失败/);
断言('[自证] 新正则可以匹配到 3', 新失败?.[1], '3');
断言('[自证] 新旧确实不同', 旧失败 === null && 新失败 !== null, true);

console.log('');
console.log('=== ④ 源码里确实改成了新正则 ===');
断言('源码含 `[项个条]?`', /\[项个条\]\?/.test(源), true);
断言('源码里没有旧的裸 `\\s*失败`（在解析函数内）', !/match\(\/\(\\d\+\)\\s\*失败\//.test(函数源), true);

console.log('');
console.log('结果: ' + 通过 + ' 通过, ' + 失败 + ' 失败');
process.exit(失败 > 0 ? 1 : 0);
