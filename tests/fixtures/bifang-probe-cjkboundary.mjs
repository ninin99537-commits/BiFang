// 一次性探针（只读）: 扫全部测试文件，找 `中文\b` 这类**对中文不生效**的词边界写法。
//
// 为什么必须扫（本批自曝的缺口 2）:
//   JS 的 `\b` 是 **ASCII 词边界**。`解析位置\b` 永远不成立 ——
//   于是那条断言**静默变成永远绿**（主断言期望空数组时，永远绿也是绿的）。
//
//   我在 `bifang-条目列表.test.ts` 里踩了一次，是自证把它抓出来的。
//   但别的测试文件可能也有同样的写法 —— 而它们**不会自己告诉你**。
//
// 判据: 在正则字面量或 RegExp 字符串里，`\b` 紧跟在**非 ASCII 字符**后面
//   （即中文/全角标点之后）。那种写法必然不成立。
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 测试目录 = path.join(ROOT, 'tests');

/** 一个字符是不是 ASCII 词字符（与 JS `\b` 的定义一致） */
const 是ASCII词字符 = (ch) => /[A-Za-z0-9_]/.test(ch);

/** 是不是非 ASCII（中文、全角标点等） */
const 是非ASCII = (ch) => ch !== undefined && ch.codePointAt(0) > 0x7F;

const 文件们 = readdirSync(测试目录).filter(f => f.endsWith('.ts'));
const 命中 = [];

for (const 文件 of 文件们) {
  const 全 = path.join(测试目录, 文件);
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    // 找 `\b`（在源码里是反斜杠 + b 两个字符）
    let 位 = 0;
    while ((位 = 行.indexOf('\\b', 位)) >= 0) {
      const 前 = 行[位 - 1];
      // `\\b`（转义的反斜杠 + b）不算
      if (行[位 - 1] === '\\') { 位 += 2; continue; }
      if (是非ASCII(前)) {
        命中.push({
          文件,
          行: i + 1,
          片段: 行.trim().slice(0, 110),
        });
      }
      位 += 2;
    }
  });
}

console.log('=== 扫了 ' + 文件们.length + ' 个测试文件 ===');
console.log('');
if (命中.length === 0) {
  console.log('✅ 没有 `中文\\b` 的写法');
} else {
  console.log('⚠ 找到 ' + 命中.length + ' 处（这些断言可能永远绿）：');
  for (const h of 命中) {
    console.log('  ' + h.文件 + ':' + h.行);
    console.log('      ' + h.片段);
  }
}

// ── 自证：判据抓得住 ──
console.log('');
console.log('=== 自证（判据本身有效吗）===');
const 假行 = 'ok("x", /export function 解析位置\\b/.test(s))';
let 位2 = 0;
let 抓到 = 0;
while ((位2 = 假行.indexOf('\\b', 位2)) >= 0) {
  if (假行[位2 - 1] !== '\\' && 是非ASCII(假行[位2 - 1]))
    抓到++;
  位2 += 2;
}
console.log('  假样本 `解析位置\\b` 被抓到?', 抓到 > 0 ? '✅ 是' : '❌ 否');

// 反向自证：ASCII 边界不该被抓
const 假行2 = 'ok("x", /\\bexport\\b/.test(s))';
let 位3 = 0;
let 误报 = 0;
while ((位3 = 假行2.indexOf('\\b', 位3)) >= 0) {
  if (假行2[位3 - 1] !== '\\' && 是非ASCII(假行2[位3 - 1]))
    误报++;
  位3 += 2;
}
console.log('  正常写法 `\\bexport\\b` 被误报?', 误报 > 0 ? '❌ 是（判据太糙）' : '✅ 否');
