// 一次性探针（只读）: 验证 `\w*序号` 这类写法是不是**同类的假绿**。
//
// 线索来源: 上一条 `\w` 扫描命中了两处：
//   tests/bifang-条目列表.test.ts:465  !/^\s*let\s+\w*序号/m.test(源码)
//   tests/bifang-模板.test.ts:447      !/^\s*let\s+\w*序号/m.test(源码)
//
// 这两条的意图是"断言源码里没有模块级自增计数器"（形如 `let 条目序号 = 0`）。
// 但 `\w*` 只匹配 ASCII —— 中文变量名匹配不上。
//
// 若真是这样，这两条断言就是**永远绿**：无论有没有 `let 条目序号`，它都不匹配。
console.log('=== 前提：`\\w*序号` 能匹配中文变量名吗 ===');
const 该抓 = [
  'let 条目序号 = 0',
  'let 序号 = 0',
  'let a序号 = 0',
  'let 用户条目序号 = 0',
];
for (const 行 of 该抓) {
  const 匹配 = /^\s*let\s+\w*序号/m.test(行);
  console.log('  ' + JSON.stringify(行).padEnd(28), '匹配?', 匹配, 匹配 ? '' : '  ← ★ 该抓没抓到');
}

console.log('');
console.log('=== 对照：换成 `[\\w\\u4e00-\\u9fa5]*` 呢 ===');
for (const 行 of 该抓) {
  const 匹配 = /^\s*let\s+[\w\u4e00-\u9fa5]*序号/m.test(行);
  console.log('  ' + JSON.stringify(行).padEnd(28), '匹配?', 匹配);
}

console.log('');
console.log('=== 实际项目里有没有 `let ...序号` ===');
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
function 列源(目录) {
  const 结果 = [];
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory()) {
      if (名 === 'node_modules' || 名 === '.build') continue;
      结果.push(...列源(全));
    }
    else if (/\.(ts|vue)$/.test(名)) 结果.push(全);
  }
  return 结果;
}
let 有 = 0;
for (const 全 of 列源(path.join(process.cwd(), 'src'))) {
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    if (/^\s*let\s+[\w\u4e00-\u9fa5]*序号/m.test(行)) {
      有++;
      console.log('  ' + path.relative(process.cwd(), 全) + ':' + (i + 1) + '  ' + 行.trim());
    }
  });
}
if (有 === 0) console.log('  （现在确实没有 —— 所以那两条断言现在是"真绿"，但**不是因为判据有效**）');
