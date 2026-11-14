// 人设工坊 · 类型标注防线(#246)
//
// 根因不是「写错了字段名」, 是「TypeScript 本该报错却没报」:
//   `createWorldbookEntries` 的参数类型是 `PartialDeep<WorldbookEntry>[]` —— 对象字面量多写字段
//   本该是编译错误。它没报, 因为字面量先赋给了变量, **freshness 一过变量就丢了**,
//   excess property check 不再生效, 多出来的字段按结构类型合法通过。
//   `excludeRecursion: true` 就是这样一段**完全合法的 TypeScript**, tsc/eslint/test 三道门全放它过去。
//
// 防线 = 给这些字面量加**类型标注**, 让它们重新变 fresh。
// 本用例是**源码级哨兵**: 标注被删掉就红 —— 因为「删标注」不会让任何行为测试变红。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

const 源 = readFileSync(path.join(ROOT, 'src', '人设工坊', 'lib', 'sink.ts'), 'utf8');

console.log('\n[1] 四处写世界书的字面量都带类型标注(否则静默丢弃会回来)');
{
  ok('条目位置 标注 WorldbookEntry[\'position\']', /const 条目位置:\s*WorldbookEntry\['position'\]\s*=/.test(源));
  ok('造策略 返回类型 WorldbookEntry[\'strategy\']', /function 造策略\([^)]*\):\s*WorldbookEntry\['strategy'\]\s*\{/.test(源));
  ok('条目递归 标注 WorldbookEntry[\'recursion\']', /const 条目递归:\s*WorldbookEntry\['recursion'\]\s*=/.test(源));
  ok('完整 标注 TypeFest.PartialDeep<WorldbookEntry>', /const 完整:\s*TypeFest\.PartialDeep<WorldbookEntry>\s*=/.test(源));
}

console.log('\n[2] 错层的字段名不许回到源码(注释里的历史说明不算)');
{
  // 去掉注释再查: 允许注释里提「excludeRecursion 曾写错」, 不许代码里真有它
  const 去注释 = 源
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok('代码里没有 excludeRecursion', !去注释.includes('excludeRecursion'));
  ok('代码里没有 preventRecursion', !去注释.includes('preventRecursion'));
  ok('造策略 里用的是正确字段名', 去注释.includes('scan_depth') && 去注释.includes('keys_secondary'));
  ok('条目递归 里用的是正确字段名', 去注释.includes('prevent_incoming') && 去注释.includes('prevent_outgoing'));
}

console.log('\n[3] 递归三个子字段给全(缺字段会因 {...项, ...完整} 残留旧值)');
{
  ok('prevent_incoming 在', 源.includes('prevent_incoming: true'));
  ok('prevent_outgoing 在', 源.includes('prevent_outgoing: true'));
  ok('delay_until 在(给 null 而不是省略)', /delay_until:\s*null/.test(源));
}

console.log(`\n人设工坊类型防线: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
