// 检查: 每一处 `import { … } from './x'` 与 `export { … } from './x'` 里的名字, 目标模块是否真的导出。
//
// 为什么需要这条: webpack.config.ts 用 transpileOnly 打包(类型检查交给编辑器), 而 webpack 对
// "导入了一个不存在的导出"**只在名字被真正用到时**才报 warning —— 没被用到的导入会被整段
// tree-shake 掉, 于是编译期一片安静。真出事时的形态是: 有人在那个文件里补一句 `EVENT_LIMIT`,
// 拿到的是 undefined, 而构建、类型检查(没跑)、用例(没覆盖到那条分支)全绿。
// 这不是假想: 2026-10-18 收尾检查里, 烟火 update.ts 就从 ./state 导入了 8 个早已搬去
// 世界字段表.ts 的上限, 而且一个都没用过 —— 构建完全没吭声。
//
// 顺带盯住同一类问题的另一面: `export { X } from './y'` 里 X 已经从 y 搬走时, 这层转发就成了
// 一条指向空气的假路径(剧情导演 快照.ts 原先转发的 DATA_VERSION / sanitizeSnapshot / ChatMeta
// 就是这样: 没人消费, 也没人发现)。转发没人用的名字不在本检查范围内(那需要另一套判据),
// 但"转发了一个不存在的东西"这里会报。
//
// 边界: `export * from './y'` 的目标视为不透明(名字集合无法静态确定), 对它不判;
// 命名空间导入(`import * as X`)与默认导入不在检查范围。这两种情况都不会产生误报。
//
// 用法: node tests/import-exports.mjs          # 只报告
//       node tests/import-exports.mjs --check  # 有任何一处就退出码 1
//       node tests/import-exports.mjs --self-test  # 反面对照: 判据必须能报出一处假导入
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** .vue 只有 <script> 里是代码; 其余部分(模板/样式)里的花括号会干扰解析 */
function 取脚本(text, file) {
  if (!file.endsWith('.vue'))
    return text;
  const m = text.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : '';
}

/**
 * 一个模块导出了哪些名字。
 * `opaque` = 里面有 `export *`, 名字集合不可静态确定 → 调用方跳过它。
 */
function 解析导出(text) {
  const names = new Set();
  let opaque = false;
  // export const/let/var/function/class/interface/type/enum NAME
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$\u4e00-\u9fa5][\w$\u4e00-\u9fa5]*)/g))
    names.add(m[1]);
  // export { A, B as C }  —— 也覆盖 export { A } from './x' 与 export type { A }
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const 片段 = part.trim();
      if (!片段)
        continue;
      // `A as B` 导出的是 B; 只有 `A` 时导出 A
      const as = 片段.split(/\s+as\s+/);
      names.add((as[1] ?? as[0]).trim());
    }
  }
  if (/export\s+\*/.test(text))
    opaque = true;
  if (/export\s+default/.test(text))
    names.add('default');
  return { names, opaque };
}

/**
 * 这个模块里的所有具名绑定组:
 *   { kind: 'import', names: [{ 源, 本地 }], 来源 }
 *   { kind: 'reexport', names: [{ 源, 对外 }], 来源 }
 * 只会匹配带花括号的形式 —— 命名空间导入与纯默认导入不在范围内(见文件头的边界说明)。
 */
function 解析绑定组(text) {
  const groups = [];
  // import [默认,] { A, B as C } from '...'
  for (const m of text.matchAll(/import\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g)) {
    groups.push({ kind: 'import', 来源: m[2], 名字: 拆名字(m[1], '本地') });
  }
  // export [type] { A, B as C } from '...'
  for (const m of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g)) {
    groups.push({ kind: 'reexport', 来源: m[2], 名字: 拆名字(m[1], '对外') });
  }
  return groups;
}

function 拆名字(块, 键) {
  const out = [];
  for (const part of 块.split(',')) {
    // 行内 `type X`(TS 允许在具名导入里逐项标 type)与首尾空白都要去掉
    const 片段 = part.replace(/^\s*type\s+/, '').trim();
    if (!片段)
      continue;
    const as = 片段.split(/\s+as\s+/);
    const 源 = as[0].trim();
    if (!源)
      continue;
    out.push({ 源, [键]: (as[1] ?? as[0]).trim() });
  }
  return out;
}

/** './x' / '../x' 之类的相对路径 → 真实文件; 非相对路径(?raw、包名)与找不到的返回 null */
function 解析目标(文件表, 从, 规格) {
  if (!规格.startsWith('.'))
    return null;
  const base = resolvePath(dirname(从), 规格);
  for (const 候选 of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')]) {
    if (文件表.has(候选))
      return 候选;
    if (statSync(候选, { throwIfNoEntry: false })?.isFile())
      return 候选;
  }
  return null;
}

/**
 * 纯函数: 吃一张 { 绝对路径 → 源码 }, 吐出所有"指向不存在的导出"。
 * 抽成纯函数是为了 --self-test 能在内存里造反例(判据必须能失败)。
 */
function 检查(文件表) {
  const 缓存 = new Map();
  const 导出表 = 文件 => {
    if (!缓存.has(文件)) {
      const text = 文件表.has(文件) ? 取脚本(文件表.get(文件), 文件) : 取脚本(readFileSync(文件, 'utf8'), 文件);
      缓存.set(文件, 解析导出(text));
    }
    return 缓存.get(文件);
  };
  const 问题 = [];
  for (const [文件, 原文] of 文件表) {
    const text = 取脚本(原文, 文件);
    for (const 组 of 解析绑定组(text)) {
      const 目标 = 解析目标(文件表, 文件, 组.来源);
      if (!目标)
        continue;
      const { names, opaque } = 导出表(目标);
      if (opaque)
        continue;
      for (const 名 of 组.名字) {
        if (!names.has(名.源))
          问题.push({ 文件: relative(ROOT, 文件), 名: 名.源, 来源: 组.来源, 目标: relative(ROOT, 目标), 类型: 组.kind });
      }
    }
  }
  return 问题;
}

/** 从磁盘收源码: src 与 tests 下的 .ts/.vue(不含 .d.ts); 缺目录就跳过(投影仓只含部分项目) */
function 收文件() {
  const 表 = new Map();
  const walk = dir => {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory())
      return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.build')
          continue;
        walk(p);
      }
      else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        表.set(p, readFileSync(p, 'utf8'));
      }
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'tests'));
  return 表;
}

if (process.argv.includes('--self-test')) {
  // 反面对照: 目标只导出 有的, 调用方却导入了 有的 + 没有的 + 转发了一个不存在的。
  const 虚拟 = new Map([
    [join(ROOT, '虚拟', 'a.ts'), 'export const 有的 = 1;\n'],
    [join(ROOT, '虚拟', 'b.ts'), "import { 有的, 没有的 } from './a';\nexport { 也不存在 } from './a';\n"],
  ]);
  const 问题 = 检查(虚拟);
  const 名 = 问题.map(p => p.名).sort();
  const 期望 = ['没有的', '也不存在'].sort();
  if (JSON.stringify(名) !== JSON.stringify(期望)) {
    console.log(`反面对照失败: 期望报出 ${JSON.stringify(期望)}, 实际 ${JSON.stringify(名)}`);
    process.exit(1);
  }
  console.log(`反面对照通过: 判据能报出 ${期望.length} 处假导入（${期望.join(', ')}）`);
  process.exit(0);
}

const 文件表 = 收文件();
const 问题 = 检查(文件表);
const 按文件 = new Map();
for (const p of 问题) {
  if (!按文件.has(p.文件))
    按文件.set(p.文件, []);
  按文件.get(p.文件).push(p);
}

if (问题.length === 0) {
  console.log(`\n【导入/转发】指向不存在的导出: 没有 ✓  (扫了 ${文件表.size} 个源文件)`);
}
else {
  console.log('\n【导入/转发】指向不存在的导出:');
  for (const [文件, 列表] of [...按文件].sort())
    console.log(`  ${文件}\n    ${列表.map(p => `${p.名}  <-  ${p.来源}  (${p.目标} 未导出, ${p.类型 === 'import' ? '导入' : '转发'})`).join('\n    ')}`);
  console.log(`\n  合计 ${问题.length} 处, 涉及 ${按文件.size} 个文件`);
}
if (process.argv.includes('--check') && 问题.length > 0) {
  console.log('\n构建用的是 transpileOnly: 这些名字在使用时才会变成 undefined, 编译期不会报错。');
  process.exit(1);
}
