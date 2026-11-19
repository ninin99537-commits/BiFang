// 一次性探针 v3（只读）: 补 v2 的最后一类盲区 —— `RegExp('...\\b...')` 字符串构造。
//
// v2 为什么不够:
//   v2 在**源码文本**里找 `\b` 两个字符。但字符串形式的正则写的是 `'\\b'`
//   （源码里是 4 个字符：反斜杠 反斜杠 b）—— 而我的 v2 里有一句
//   `if (行[位-1] === '\\') { 位 += 2; continue; }` 会**跳过**它们。
//
//   所以 v2 对 `new RegExp('解析位置\\b')` 是**完全瞎的**。
//
// v3 判据: 先找出所有"字符串里的正则片段"，在**解码后**的文本上判断 `\b` 的两侧。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 是ASCII词字符 = (ch) => ch !== undefined && /[A-Za-z0-9_]/.test(ch);
const 是非ASCII = (ch) => ch !== undefined && ch.codePointAt(0) > 0x7F;

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

const 命中 = [];

for (const 全 of 文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    const t = 行.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;

    // ── 情形 A: 正则字面量 /.../ ──
    // 在**原文**上找 `\b`（单个反斜杠 + b）
    let 位 = 0;
    while ((位 = 行.indexOf('\\b', 位)) >= 0) {
      if (行[位 - 1] === '\\') { 位 += 2; continue; }   // 这是 `\\b`（字符串形式）
      const 左 = 行[位 - 1];
      const 右 = 行[位 + 2];
      if (是非ASCII(左) || 是非ASCII(右)) {
        命中.push({ 文件: 相对, 行: i + 1, 形式: '字面量', 片段: t.slice(0, 120) });
      }
      位 += 2;
    }

    // ── 情形 B: 字符串形式的正则 `'...\\b...'` ──
    // 找 `\\b`（源码里 4 字符：反斜杠 反斜杠 b），按**解码后**判断
    let 位2 = 0;
    while ((位2 = 行.indexOf('\\\\b', 位2)) >= 0) {
      // 解码后，`\b` 在字符串里的位置对应源码 `\\b` 的起点
      const 左 = 行[位2 - 1];
      const 右 = 行[位2 + 3];
      if (是非ASCII(左) || 是非ASCII(右)) {
        命中.push({ 文件: 相对, 行: i + 1, 形式: '字符串', 片段: t.slice(0, 120) });
      }
      位2 += 3;
    }
  });
}

console.log('=== 扫了 ' + 文件们.length + ' 个文件（tests + src）===');
console.log('');
if (命中.length === 0) {
  console.log('✅ 没有 `中文\\b`（字面量或字符串形式）');
}
else {
  console.log('⚠ 找到 ' + 命中.length + ' 处：');
  for (const h of 命中) {
    console.log('  ' + h.文件 + ':' + h.行 + '  [' + h.形式 + ']');
    console.log('      ' + h.片段);
  }
}

// ── 自证 ──
console.log('');
console.log('=== 自证 ===');
const 样本 = [
  ['字面量·左侧中文', 'const re = /解析位置\\b/;', true],
  ['字面量·右侧中文', 'const re = /\\b解析位置/;', true],
  ['字符串·左侧中文', "const re = new RegExp('解析位置\\\\b');", true],
  ['字符串·右侧中文', "const re = new RegExp('\\\\b解析位置');", true],
  ['正常 ASCII', 'const re = /\\bexport\\b/;', false],
];
for (const [名, 行, 该抓] of 样本) {
  let 抓到 = false;
  let 位 = 0;
  while ((位 = 行.indexOf('\\b', 位)) >= 0) {
    if (行[位 - 1] === '\\') { 位 += 2; continue; }
    if (是非ASCII(行[位 - 1]) || 是非ASCII(行[位 + 2])) { 抓到 = true; break; }
    位 += 2;
  }
  let 位2 = 0;
  while ((位2 = 行.indexOf('\\\\b', 位2)) >= 0) {
    if (是非ASCII(行[位2 - 1]) || 是非ASCII(行[位2 + 3])) { 抓到 = true; break; }
    位2 += 3;
  }
  const 对 = 抓到 === 该抓;
  console.log('  ' + 名.padEnd(16), 该抓 ? (抓到 ? '✅ 抓到' : '❌ 漏了') : (抓到 ? '❌ 误报' : '✅ 没误报'), 对 ? '' : '  ← 判据有问题');
}
