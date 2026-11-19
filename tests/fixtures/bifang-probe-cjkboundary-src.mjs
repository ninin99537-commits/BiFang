// 一次性探针（只读）: 上一条只扫了 tests/，这条补扫 src/。
//
// 为什么补（自曝缺口 2 的另一半）:
//   源码里的正则也会踩同一个坑。而且源码里的正则**更危险** ——
//   测试断言永远绿只是"没测到"，而源码正则不匹配会让**功能静默失效**。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 是ASCII词字符 = (ch) => /[A-Za-z0-9_]/.test(ch);
const 是非ASCII = (ch) => ch !== undefined && ch.codePointAt(0) > 0x7F;

function 列源(目录) {
  const 结果 = [];
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory()) {
      if (名 === 'node_modules' || 名 === '.build')
        continue;
      结果.push(...列源(全));
    }
    else if (/\.(ts|vue|mjs)$/.test(名)) {
      结果.push(全);
    }
  }
  return 结果;
}

const 文件们 = 列源(path.join(ROOT, 'src'));
const 命中 = [];

for (const 全 of 文件们) {
  const 相对 = path.relative(ROOT, 全).replace(/\\/g, '/');
  const 行们 = readFileSync(全, 'utf8').split('\n');
  行们.forEach((行, i) => {
    // 跳过纯注释行（注释里的 \b 不执行）
    const t = 行.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
      return;
    let 位 = 0;
    while ((位 = 行.indexOf('\\b', 位)) >= 0) {
      if (行[位 - 1] === '\\') { 位 += 2; continue; }
      if (是非ASCII(行[位 - 1])) {
        命中.push({ 文件: 相对, 行: i + 1, 片段: t.slice(0, 110) });
      }
      位 += 2;
    }
  });
}

console.log('=== 扫了 ' + 文件们.length + ' 个源文件 ===');
console.log('');
if (命中.length === 0)
  console.log('✅ src/ 里没有 `中文\\b` 的写法');
else {
  console.log('⚠ 找到 ' + 命中.length + ' 处：');
  for (const h of 命中) {
    console.log('  ' + h.文件 + ':' + h.行);
    console.log('      ' + h.片段);
  }
}

// 顺便：统计源码里一共有多少个 `\b`（看看这个坑的"接触面"有多大）
let 总b = 0;
for (const 全 of 文件们) {
  const 内容 = readFileSync(全, 'utf8');
  总b += (内容.match(/\\b/g) || []).length;
}
console.log('');
console.log('src/ 里 `\\b` 总共出现 ' + 总b + ' 次（ASCII 边界多数是正确的，这里只查中文前的那种）');
