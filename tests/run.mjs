// 用例总入口(对应 `pnpm test`)
//
// 做三件事: 把 tests/*.test.ts 逐个打包成 node 能直接跑的 .mjs → 各自跑一遍 → 汇总结果。
// 用例用 stdio:'inherit' 直接往终端印东西, 不走管道(既省事, 也不受"不能开命名管道"的限制)。
//
// 产物新鲜度(2026-11-13 起: **内容指纹**, 不再看 mtime)
//
// 为什么换掉 mtime: `tests/.build/` 是共享目录, 打包产物会跨次复用。以前按 mtime 判断
// "产物比源新就跳过", 于是出现两类假红:
//   ① 只比测试文件 mtime → 改了 src/ 而测试没动时, 产物是旧的(2026-11-12 自查发现);
//   ② 换成"比 src/ 最新文件"之后还有洞 —— **还原文件会保住旧 mtime**:
//      `copyFileSync` 在这台机器上保留 mtime(复验方 2026-11-13 实测), 所以
//      "清空源文件 → 跑 → 用备份还原 → 再跑" 会复用**清空那次**的产物, 报出一批看似"恢复失败"的红。
//      mtime 看不见"内容变回去了、时间戳没变"这件事。
//
// 现在的判据是**内容指纹**: 打包前算 `src/` 全部文件 + 本测试文件的 sha1, 拼成一行戳,
// 与 `tests/.build/<用例>.stamp` 比对; 不同就重打包, 打包成功后写回新戳。
// 还原、回滚、git checkout、改时间戳都骗不过它。
// `src/` 的指纹一个进程只算一次(147 个用例不各算一遍)。
// 要强制全量重打包: 删掉 `tests/.build/` 再跑(或删对应的 .stamp)。
//
// 用例里 import 的是**真实源码**(src/ 下的原文件), 不是复制品:
// 打包器只是去掉类型、把 `?raw` 还原成文本, 没有替换任何逻辑。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, buildTest } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '.build');
mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(HERE).filter(name => name.endsWith('.test.ts')).sort();
if (files.length === 0) {
  console.error('tests/ 下没有找到任何 *.test.ts');
  process.exit(1);
}

let failed = 0;
let 跳过打包 = 0;

/**
 * `src/` 全部文件的内容指纹（**一次进程内只算一次** —— 147 个用例不该各算一遍）。
 *
 * 算的是"路径 + 内容"：路径参与哈希，所以改名/挪文件也算变化。
 * 排除项：`node_modules`、`.git`、`.codegraph`、`dist`、`.build`、以及任何点开头的目录
 * （那些是工具缓存，不是被测源码）。
 */
let 源指纹缓存 = null;
function 源指纹() {
  if (源指纹缓存 !== null) return 源指纹缓存;
  const h = createHash('sha1');
  const 走 = (目录, 前缀) => {
    const 项们 = readdirSync(目录, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const 项 of 项们) {
      if (项.name === 'node_modules' || 项.name === 'dist' || 项.name.startsWith('.')) continue;
      const p = path.join(目录, 项.name);
      if (项.isDirectory()) 走(p, `${前缀}${项.name}/`);
      else {
        h.update(`${前缀}${项.name}\0`);
        h.update(readFileSync(p));
        h.update('\0');
      }
    }
  };
  try {
    走(path.join(ROOT, 'src'), '');
  }
  catch (e) {
    console.error('[新鲜度] 算 src/ 指纹失败，退回"每次都重打包":', e?.message ?? e);
    源指纹缓存 = '';
    return 源指纹缓存;
  }
  源指纹缓存 = h.digest('hex');
  return 源指纹缓存;
}

/** 一个测试文件的内容指纹 */
const 测试指纹 = p => createHash('sha1').update(readFileSync(p)).digest('hex');

/**
 * 戳的格式（一行，便于人眼看懂是哪两样东西的指纹）：
 *   `v2 <src 全量 sha1> <tests/helpers 全量 sha1> <该用例文件 sha1>`
 * 存成 `tests/.build/<用例名>.stamp` —— 与产物同目录、同在 .gitignore 覆盖范围内。
 */
/** tests/helpers/ 全部文件的内容指纹(进程内只算一次): 假宿主这类共享基座不在 src/ 里,
 *  v1 戳看不见它 —— 只改 helper 不动用例会用到陈旧产物(2026-11-14 需求位裁定并入戳)。 */
let helpers指纹缓存 = null;
function helpers指纹() {
  if (helpers指纹缓存 !== null)
    return helpers指纹缓存;
  const 目录 = path.join(HERE, 'helpers');
  if (!existsSync(目录))
    return '';
  const h = createHash('sha1');
  for (const name of readdirSync(目录).sort()) {
    const p = path.join(目录, name);
    if (!statSync(p).isFile())
      continue;
    h.update(`${name}\0`);
    h.update(readFileSync(p));
    h.update('\0');
  }
  helpers指纹缓存 = h.digest('hex');
  return helpers指纹缓存;
}
const 期望戳 = (测试路径) => `v2 ${源指纹()} ${helpers指纹()} ${测试指纹(测试路径)}\n`;
const 戳路径 = name => path.join(OUT_DIR, name.replace(/\.ts$/, '.stamp'));

for (const name of files) {
  console.log(`\n===== ${name} =====`);
  const 源 = path.join(HERE, name);
  const outfile = path.join(OUT_DIR, name.replace(/\.ts$/, '.mjs'));
  const 戳 = 期望戳(源);
  let 需要打包 = true;
  try {
    // **两个条件都要满足才跳过**：产物在 + 戳与当前指纹一致。
    // 只看戳会漏掉"产物被删了但戳还在"；只看产物会漏掉"内容变了"。
    需要打包 = !(existsSync(outfile) && readFileSync(戳路径(name), 'utf8') === 戳);
  }
  catch {
    需要打包 = true; // 戳不存在/读不到 → 必须打包
  }
  try {
    if (需要打包) {
      await buildTest(源, outfile);
      writeFileSync(戳路径(name), 戳); // 只有打包成功才写戳
    } else {
      跳过打包++;
      console.log('  (指纹未变，跳过重打包)');
    }
  }
  catch {
    console.error(`  打包失败: ${name}`);
    failed++;
    continue;
  }
  const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit', cwd: ROOT });
  if (result.status !== 0)
    failed++;
}

// 候选4 的验收线: 平台调用必须全部收在 host.ts(只有它允许直接命名酒馆全局)。
// 放在最后跑, 所以前面用例的具体报错不会被它挤掉。
console.log('\n===== 平台直连检查 =====');
const 检查 = spawnSync(process.execPath, [path.join(HERE, 'platform-usage.mjs'), '--check'], { stdio: 'inherit', cwd: ROOT });
if (检查.status !== 0)
  failed++;

// 同一类"静默失败"的另一面: 构建走 transpileOnly, 所以"导入了不存在的导出"编译期不报错,
// 名字被真正用到时才是 undefined。这条检查扫 src 与 tests 的每一条具名导入/转发。
console.log('\n===== 导入/转发检查 =====');
const 导入检查 = spawnSync(process.execPath, [path.join(HERE, 'import-exports.mjs'), '--check'], { stdio: 'inherit', cwd: ROOT });
if (导入检查.status !== 0)
  failed++;

console.log(failed === 0
  ? `\n全部通过: ${files.length} 个用例文件${跳过打包 > 0 ? `（其中 ${跳过打包} 个指纹未变、跳过重打包）` : ''}`
  : `\n有 ${failed} 项失败(共 ${files.length} 个用例文件)`);
process.exit(failed === 0 ? 0 : 1);
