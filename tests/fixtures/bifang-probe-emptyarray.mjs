// 一次性探针（只读）: 查另一类"断言根本没在测东西"的形状 —— **空数组恒真**。
//
// 为什么查（同一条思路的延续）:
//   今晚已经抓到三次假绿：`\b`（对中文不成立）、`\w`（同）、负样本挑了空世界书。
//   共同点：**断言根本没在测东西**，所以它永远是绿的。
//
//   JS 里还有一类经典的同形状：
//     [].every(f)  === true      ← 空数组永远"全部满足"
//     [].some(f)   === false     ← 空数组永远"没有一个满足"
//
//   所以这两种写法都可能永远绿：
//     ok('...', 数组.every(x => 条件))     ← 数组为空时恒真
//     ok('...', !数组.some(x => 条件))     ← 数组为空时也恒真
//
// 判据: 找出"主断言用 every/some 且**没有**断言数组非空"的地方。
//   ⚠ 这是宽口径 —— 很多 every 用法是安全的（数组来源保证非空）。所以只列，不下结论。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function 列文件(目录, 过滤) {
  const 结果 = [];
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory()) {
      if (名 === 'node_modules' || 名 === '.build' || 名 === '.mimosa')
        continue;
      结果.push(...列文件(全, 过滤));
    }
    else if (过滤(名)) 结果.push(全);
  }
  return 结果;
}

const 文件们 = 列文件(path.join(ROOT, 'tests'), n => n.endsWith('.test.ts'));

console.log('=== 前提验证 ===');
console.log('  [].every(() => false)  =', [].every(() => false), '  ← 空数组恒真');
console.log('  [].some(() => true)    =', [].some(() => true), '  ← 空数组恒 false');
console.log('');

const every命中 = [];
const some命中 = [];

for (const 全 of 文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    const t = 行.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    // 只看 ok(...) / eq(...) 这类断言行
    if (!/\b(ok|eq)\s*\(/.test(行)) return;

    if (/\.every\s*\(/.test(行))
      every命中.push({ 文件: 相对, 行: i + 1, 片段: t.slice(0, 130) });
    if (/!\s*[\w.]+\.some\s*\(/.test(行))
      some命中.push({ 文件: 相对, 行: i + 1, 片段: t.slice(0, 130) });
  });
}

console.log('=== 断言里用 `.every(...)` 的（' + every命中.length + ' 处）===');
console.log('  空数组时恒真 —— 若那个数组可能是空的，这条断言就没在测东西');
console.log('');
for (const h of every命中) console.log('  ' + h.文件 + ':' + h.行 + '\n      ' + h.片段);

console.log('');
console.log('=== 断言里用 `!数组.some(...)` 的（' + some命中.length + ' 处）===');
console.log('  空数组时也恒真');
console.log('');
for (const h of some命中) console.log('  ' + h.文件 + ':' + h.行 + '\n      ' + h.片段);

console.log('');
console.log('=== 汇总 ===');
console.log('  every ' + every命中.length + ' 处，!some ' + some命中.length + ' 处');
console.log('');
console.log('⚠ 宽口径：多数 every 是安全的（数组来源保证非空）。');
console.log('   真正要判的是"这个数组能不能为空、为空时这条断言还成立吗"。');
