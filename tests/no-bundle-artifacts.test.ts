// 彼方 · 形态守卫: src/ 下不许再出现"从导出脚本还原出来的打包形态"。
//
// 为什么要有这一条: 彼方的 16 个文件曾经是**从酒馆导出的打包产物逐字还原**出来的, 带着
// `import * as zod__WEBPACK_IMPORTED_MODULE_0__ from 'zod'`、`/* harmony export */` 这类编译
// 中间形态, 以及还原时写在文件头的那句标记。这些形态能跑, 但没人能读; 更要紧的是——一旦它们
// 回来, 下一次还原就会以这份产物为准, 越滚越远(本次改造只改写法、不改行为, 靠的就是"人写的样子")。
//
// 所以这里把四类标记钉死: 谁(人或脚本)把它们写回 src/ 就红。这是**形态**守卫, 不是行为守卫——
// 行为由其余用例(api-host / update-pipeline / settings / worldbook-eval …)负责。
//
// 范围: src/ 下的 .ts 与 .vue —— 发布产物只由这两类源文件构成, 所以只扫它们。
//   (src/自定义状态栏/index.js 是一份**导出脚本本身**, 整份 webpack 产物, 不属于"源文件";
//    真要清它得先有它的源码, 不在本守卫的范围内。)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库根目录。注意: 用例会被打包进 tests/.build 再执行, 所以 import.meta.url 的上一级是 tests/ 而不是仓库根
 * (照 platform-usage.mjs 那种"取上一级"的写法会去找 tests/src, 直接 ENOENT)。这里从本文件所在目录往上找
 * 第一个同时有 package.json 与 src 的目录: 原地执行与打包执行都成立。
 */
function 找仓库根(起点: string): string {
  let 目录 = 起点;
  for (let 层 = 0; 层 < 6; 层++) {
    if (existsSync(join(目录, 'package.json')) && existsSync(join(目录, 'src')))
      return 目录;
    const 上一级 = dirname(目录);
    if (上一级 === 目录)
      break;
    目录 = 上一级;
  }
  throw new Error(`找不到仓库根目录(从 ${起点} 往上找了 6 层)`);
}

const ROOT = 找仓库根(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

/** 四类被禁止的标记: 都是编译中间产物或还原脚本留下的字面量, 人手写代码不会写出它们 */
const 禁止标记 = [
  { 名: 'webpack 模块名', 正则: /__WEBPACK_/ },
  { 名: 'harmony 导出标记', 正则: /harmony export/ },
  { 名: 'harmony 导入标记', 正则: /harmony import/ },
  { 名: '还原时的文件头标记', 正则: /已从酒馆导出的打包产物恢复/ },
];

/** 递归收集 src/ 下的 .ts 与 .vue */
function 找源文件(dir: string): string[] {
  const 结果: string[] = [];
  for (const name of readdirSync(dir)) {
    const 路径 = join(dir, name);
    if (statSync(路径).isDirectory())
      结果.push(...找源文件(路径));
    else if (/\.(ts|vue)$/.test(路径))
      结果.push(路径);
  }
  return 结果;
}

/** 扫一段文本: 逐行认出标记, 返回「标记名 + 行号」——注释里的标记同样算命中(文件头标记本身就是注释) */
function 扫文本(text: string): { 标记: string; 行号: number }[] {
  const 命中: { 标记: string; 行号: number }[] = [];
  text.split('\n').forEach((行, index) => {
    for (const { 名, 正则 } of 禁止标记) {
      if (正则.test(行))
        命中.push({ 标记: 名, 行号: index + 1 });
    }
  });
  return 命中;
}

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
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

console.log('\n[1] 守卫自身有效: 四类标记都认得出来, 正常写法不误伤');
{
  const 样例: [string, string][] = [
    ["import * as zod__WEBPACK_IMPORTED_MODULE_0__ from 'zod';", 'webpack 模块名'],
    ['/* harmony export */ export { a };', 'harmony 导出标记'],
    ['/* harmony import */ import x from "y";', 'harmony 导入标记'],
    ['// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)', '还原时的文件头标记'],
  ];
  for (const [文本, 期望标记] of 样例)
    check(`样例命中「${期望标记}」`, 扫文本(文本).map(命中 => 命中.标记), [期望标记]);
  check('正常写法一处都不命中', 扫文本("import { z } from 'zod';\nimport { ref } from 'vue';\nconst a = 1;\n"), []);
}

console.log('\n[2] 整个 src/ 的 .ts 与 .vue 里一处都没有');
{
  const 源文件 = 找源文件(SRC);
  const 全部命中: string[] = [];
  for (const 文件 of 源文件) {
    for (const 命中 of 扫文本(readFileSync(文件, 'utf8')))
      全部命中.push(`${relative(SRC, 文件).replace(/\\/g, '/')}:${命中.行号}  [${命中.标记}]`);
  }
  if (全部命中.length > 0) {
    console.log(`  命中 ${全部命中.length} 处(这些文件又回到了打包形态):`);
    for (const 一处 of 全部命中)
      console.log(`    ${一处}`);
  }
  ok(`确实扫到了源文件(共 ${源文件.length} 个)`, 源文件.length > 0);
  ok('扫到 .ts', 源文件.some(文件 => 文件.endsWith('.ts')));
  ok('扫到 .vue', 源文件.some(文件 => 文件.endsWith('.vue')));
  check('四类标记零命中', 全部命中, []);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
