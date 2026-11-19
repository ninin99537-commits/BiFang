// 一次性探针（只读）: `\b` 之外，还有哪些**对中文静默失效**的正则写法？
//
// 为什么查（需求方 #245 的话）:
//   "**它是一个类别**：任何 `中文\b` 的写法，正则永远不匹配 → 断言永远绿
//    → 看起来在守，实际什么都没守。"
//
//   所以同一类里还有谁？JS 正则里只匹配 ASCII 的字符类：
//     · `\w`  = [A-Za-z0-9_]        ← **不匹配中文**
//     · `\d`  = [0-9]               ← 不匹配全角数字 ０-９
//     · `\b`  = ASCII 词边界        ← 已查过
//     · `\s`  = 空白（这个没问题，中文空格也是 \s）
//
//   `\w` 最危险：若代码用 `/\w+/` 去抓中文标识符，它会**静默抓不到**。
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

const 文件们 = [
  ...列文件(path.join(ROOT, 'tests'), n => n.endsWith('.ts')),
  ...列文件(path.join(ROOT, 'src'), n => /\.(ts|vue)$/.test(n)),
];

console.log('=== 先验证前提：`\\w` 真的不匹配中文吗 ===');
console.log('  /\\w+/.test("中文")      =', /\w+/.test('中文'));
console.log('  /\\w+/.test("abc")       =', /\w+/.test('abc'));
console.log('  /\\d+/.test("１２３")     =', /\d+/.test('１２３'), '（全角数字）');
console.log('  /\\d+/.test("123")       =', /\d+/.test('123'));
console.log('');

/** 找形如 `\w` 但**上下文里出现中文**的可疑写法 */
const 命中 = { w: [], d: [] };

for (const 全 of 文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    const t = 行.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;

    for (const [类, 记] of [['\\w', 命中.w], ['\\d', 命中.d]]) {
      let 位 = 0;
      while ((位 = 行.indexOf(类, 位)) >= 0) {
        // 跳过 `\\w`（字符串形式）
        if (行[位 - 1] === '\\') { 位 += 2; continue; }
        // 同一行里有没有中文？有就值得看一眼（可能想匹配中文却用了 ASCII 类）
        const 有中文 = /[\u4e00-\u9fa5]/.test(行);
        if (有中文) 记.push({ 文件: 相对, 行: i + 1, 片段: t.slice(0, 120) });
        位 += 2;
      }
    }
  });
}

console.log('=== 含 `\\w` 且同行有中文的（可能想匹配中文却用了 ASCII 类）===');
if (命中.w.length === 0) console.log('  ✅ 无');
else for (const h of 命中.w) console.log('  ' + h.文件 + ':' + h.行 + '\n      ' + h.片段);

console.log('');
console.log('=== 含 `\\d` 且同行有中文的（同理，但 \\d 的误用更少见）===');
if (命中.d.length === 0) console.log('  ✅ 无');
else for (const h of 命中.d) console.log('  ' + h.文件 + ':' + h.行 + '\n      ' + h.片段);

console.log('');
console.log('=== 汇总 ===');
console.log('  \\w 可疑 ' + 命中.w.length + ' 处，\\d 可疑 ' + 命中.d.length + ' 处');
console.log('');
console.log('⚠ 注意：这条判据是**宽口径**（同行有中文就算），所以命中不等于有问题。');
console.log('   真正要判的是"这个 \\w 是不是想匹配中文"。所以下面只列，不下结论。');
