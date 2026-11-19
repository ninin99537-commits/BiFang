// 一次性探针: 删掉「列表路径」会影响哪些东西?
//
// 需求方 #223 ③: 模板成为唯一路径之后，`input.条目` 那条删掉。
// 但"删列表路径"的实际范围可能比想象大 —— 先量清，别盲删。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 彼方目录 = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统');
const 测试目录 = path.join(ROOT, 'tests');

/** 条目列表模块的导出（这些是"列表路径"的核心） */
const 列表导出 = [
  '造内置列表', '解析位置', '合并成块', '块内用户文本', '零件所在块',
  '零件默认role', '原位序号', '规范条目', '生成条目id', '去重条目id',
  '迁移旧段', '条目转模板', '默认列表顺序', '用户条目键',
];

console.log('=== 条目列表.ts 的导出，各自被谁用 ===');
const 源文件们 = [];
function 列源(目录) {
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory()) {
      if (名 === 'node_modules' || 名 === '.build')
        continue;
      列源(全);
    }
    else if (/\.(ts|vue|mjs)$/.test(名)) {
      源文件们.push(全);
    }
  }
}
列源(path.join(ROOT, 'src'));
列源(测试目录);

for (const 名 of 列表导出) {
  const 用者 = [];
  for (const 文件 of 源文件们) {
    const 相对 = path.relative(ROOT, 文件).replace(/\\/g, '/');
    if (相对.includes('条目列表.ts'))
      continue;
    const 内容 = readFileSync(文件, 'utf8');
    // 粗判：出现这个名字就算（会有些误报，但够用来估规模）
    if (内容.includes(名))
      用者.push(相对);
  }
  console.log('  ' + 名.padEnd(14), 用者.length ? 用者.join(', ') : '（无）');
}

console.log('');
console.log('=== 测试文件里提到"条目列表"的 ===');
for (const 文件 of 源文件们) {
  if (!文件.includes('tests'))
    continue;
  const 相对 = path.relative(ROOT, 文件).replace(/\\/g, '/');
  const 内容 = readFileSync(文件, 'utf8');
  const 命中 = 列表导出.filter(名 => 内容.includes(名));
  if (命中.length)
    console.log('  ' + 相对 + '  →  ' + 命中.join(', '));
}
