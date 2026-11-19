// 一次性探针 v2（只读）: 补齐 v1 的盲区。
//
// v1 为什么不够（§十二 #22 要求写清上一版错因）:
//   v1 只查 `\b` **紧跟在**非 ASCII 字符**之后**（`解析位置\b`）。
//   但 `\b` 永远不成立的情形有两种：
//     ① 前面是中文：`解析位置\b`  —— 中文不是词字符，右边若也是非词字符则无边界
//     ② **后面**是中文：`\b解析`   —— 同理
//   而且 v1 漏了 `\B`（非词边界）与 `RegExp('\\b')` 字符串形式。
//
// v2 判据（严格版）:
//   一个 `\b` 只有在「它两侧的字符一个是 ASCII 词字符、另一个不是」时才可能成立。
//   所以：**只要它任一侧紧邻的是非 ASCII 字符，这个 `\b` 就永远不成立**
//   （除非另一侧也不是词字符 —— 那本来就不该写 `\b`）。
//
//   简化判据：`\b` 的**左侧或右侧**紧邻非 ASCII 字符 → 可疑。
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
    else if (过滤(名)) {
      结果.push(全);
    }
  }
  return 结果;
}

const 测试文件们 = 列文件(path.join(ROOT, 'tests'), n => n.endsWith('.test.ts'));
const 源文件们 = 列文件(path.join(ROOT, 'src'), n => /\.(ts|vue|mjs)$/.test(n));

/**
 * 扫一个文件里的可疑 `\b`。
 * @returns {{行:number, 片段:string, 哪侧:string}[]}
 */
function 扫文件(全, 跳过注释) {
  const 命中 = [];
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    const t = 行.trim();
    if (跳过注释 && (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')))
      return;
    // 找所有 `\b`（源码里是反斜杠 + b）
    let 位 = 0;
    while ((位 = 行.indexOf('\\b', 位)) >= 0) {
      // `\\b`（转义的反斜杠后跟 b）不是词边界 —— 跳过
      if (行[位 - 1] === '\\') { 位 += 2; continue; }
      const 左 = 行[位 - 1];
      const 右 = 行[位 + 2];
      const 左坏 = 是非ASCII(左);
      const 右坏 = 是非ASCII(右);
      if (左坏 || 右坏) {
        命中.push({
          行: i + 1,
          片段: t.slice(0, 120),
          哪侧: 左坏 && 右坏 ? '两侧' : (左坏 ? '左侧' : '右侧'),
        });
      }
      位 += 2;
    }
  });
  return 命中;
}

console.log('=== 扫测试文件（' + 测试文件们.length + ' 个）===');
let 测试命中 = 0;
for (const 全 of 测试文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  for (const h of 扫文件(全, false)) {
    测试命中++;
    console.log('  ' + 相对 + ':' + h.行 + '  [' + h.哪侧 + ']');
    console.log('      ' + h.片段);
  }
}
if (测试命中 === 0) console.log('  ✅ 无');

console.log('');
console.log('=== 扫源文件（' + 源文件们.length + ' 个，跳过纯注释行）===');
let 源命中 = 0;
for (const 全 of 源文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  for (const h of 扫文件(全, true)) {
    源命中++;
    console.log('  ' + 相对 + ':' + h.行 + '  [' + h.哪侧 + ']');
    console.log('      ' + h.片段);
  }
}
if (源命中 === 0) console.log('  ✅ 无');

console.log('');
console.log('=== 汇总 ===');
console.log('测试文件命中 ' + 测试命中 + ' 处，源文件命中 ' + 源命中 + ' 处');

// ── 自证：判据抓得住两种方向 ──
console.log('');
console.log('=== 自证 ===');
const 假1 = 'ok("x", /解析位置\\b/.test(s))';      // 左侧中文
const 假2 = 'ok("x", /\\b解析位置/.test(s))';      // 右侧中文
const 假3 = 'ok("x", /\\bexport\\b/.test(s))';     // 正常 ASCII，不该被抓

const 测 = (行) => {
  let 位 = 0;
  const 出 = [];
  while ((位 = 行.indexOf('\\b', 位)) >= 0) {
    if (行[位 - 1] === '\\') { 位 += 2; continue; }
    const 左坏 = 是非ASCII(行[位 - 1]);
    const 右坏 = 是非ASCII(行[位 + 2]);
    if (左坏 || 右坏) 出.push(行[位 - 1] + '\\b' + (行[位 + 2] ?? ''));
    位 += 2;
  }
  return 出;
};
console.log('  左侧中文 `解析位置\\b` 被抓到?', 测(假1).length > 0 ? '✅' : '❌');
console.log('  右侧中文 `\\b解析位置` 被抓到?', 测(假2).length > 0 ? '✅' : '❌');
console.log('  正常 ASCII `\\bexport\\b` 被误报?', 测(假3).length > 0 ? '❌ 是' : '✅ 否');
