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
import { spawn, spawnSync } from 'node:child_process';
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
let 断言通过总数 = 0;
let 断言失败总数 = 0;
/** 跑完了但解析不到汇总的文件（这些文件的数字**没进 TOTAL**，必须让人看见） */
const 解析失败文件 = [];

// ── 机读汇总(复盘 C6: 计数口径只此一家) ──
//
// 以前三方各数各的: 数 `PASS` 行的实现得到 5372, 数"结果:"行的验收得到 4667 —— 因为
// 用例有两种句式: 129 个文件每条断言打 `  PASS  ` / `  FAIL  `, 另 26 个成功时**什么都不打**
// (只 pass++), 只在末行报 "结果: N 通过, M 失败"。数标记行的口径天生看不见后者的通过数。
//
// 现在由 run.mjs 统一计数: 接管子的同时**实时转发**输出(现场直播不丢), 子进程退出后解析
// 它输出的**末行汇总**(两种句式都含"通过/断言/失败 + 数字"), 全部跑完输出一行 TOTAL。
// 此后交付书 / 判定书只准引用 TOTAL 行, 不再各自数行。
//
// ⚠ **2026-11-19 修：句式的量词必须吃掉**（`3 项失败` 曾让整个套件被静默吞掉）。
//
//  ── 原来错在哪 ──
//  正则写的是 `/(\d+)\s*失败/` —— 要求数字与"失败"之间**只有空白**。
//  而 `bifang-panel-contract.test.ts` 的末行是：
//      `3 项失败 (36 项通过)`
//  **数字和"失败"之间有一个「项」字**，`\s*` 匹配不到 → 两个正则都返回 null →
//  整个套件的 3 条失败被当成"没有汇总行"静默跳过。
//
//  于是 `TOTAL failed=0` 而那个套件**明明有 3 条 FAIL**。
//  **这是计数器的假绿 —— 比被测代码出错更危险，因为它让所有"全绿"结论都不可信。**
//
//  ── 修法 ──
//  把量词吃进去：`(\d+)\s*[项个条]?\s*(?:通过|断言|失败)`。
//  **两种句式都要兼容**，因为仓库里确实并存：
//      `结果: 51 通过, 0 失败`        ← 多数文件
//      `3 项失败 (36 项通过)`         ← bifang-panel-contract
const 汇总句式 = [
  // ── 通过数 ──
  //  `51 通过` / `36 项通过` / `174 项断言` / `通过 20` / `30 pass` / `14 pass`
  /(\d+)\s*[项个条]?\s*(?:通过|断言)/,
  /(\d+)\s*(?:pass|passed)\b/i,
  /(?:通过|pass)\s*[:：]?\s*(\d+)/i,
  // ── 失败数 ──
  /(\d+)\s*[项个条]?\s*失败/,
  /(\d+)\s*(?:fail|failed)\b/i,
  /(?:失败|fail)\s*[:：]?\s*(\d+)/i,
];
function 解析末行汇总(输出) {
  const 行们 = 输出.split('\n').map(s => s.trimEnd()).filter(s => s.trim() !== '');
  // 从末行往前找几行（有些文件的汇总行后面还跟一句"全部通过"之类）
  for (let i = 行们.length - 1; i >= 0 && i >= 行们.length - 4; i--) {
    const 通过 = 行们[i].match(汇总句式[0]) ?? 行们[i].match(汇总句式[1]) ?? 行们[i].match(汇总句式[2]);
    const 失败 = 行们[i].match(汇总句式[3]) ?? 行们[i].match(汇总句式[4]) ?? 行们[i].match(汇总句式[5]);
    if (通过 || 失败) return { pass: 通过 ? Number(通过[1]) : 0, fail: 失败 ? Number(失败[1]) : 0 };
  }
  return null;
}

/**
 * **裁判自检**（2026-11-19，需求方 #368 ②）。
 *
 * ── 为什么需要它 ──
 *  上面那个 bug（`3 项失败` 匹配不到）让 `TOTAL failed=0` 是假的，**持续了整整一天**。
 *  而这一天里所有"全绿"的判断都建立在那个数字上。
 *
 *  > **我们把"跑测试的脚本"当成了裁判，而裁判自己没被检查过。**
 *  > **一个坏的裁判比没有裁判更糟 —— 因为你会相信它的判决。**
 *
 * ── 它检三件事 ──
 *  ① 每一种真实存在的汇总句式，都必须能解析出**正确的数字**（不是"能解析"，是"数字对"）
 *  ② 解析不出来的句式必须返回 null（不许"随便匹配一个数字凑数"）
 *  ③ **每个用例文件跑完必须被解析出汇总** —— 解析不到就报错退出，不许静默跳过
 */
function 自检汇总解析() {
  /** 用例: [说明, 输入末行, 期望的 {pass, fail}] —— null 表示**必须解析不出来** */
  const 用例 = [
    ['标准句式', '结果: 51 通过, 0 失败', { pass: 51, fail: 0 }],
    ['标准句式（有失败）', '结果: 5 通过, 2 失败', { pass: 5, fail: 2 }],
    ['量词句式（本次修复的）', '3 项失败 (36 项通过)', { pass: 36, fail: 3 }],
    ['量词句式（全通过）', '0 项失败 (39 项通过)', { pass: 39, fail: 0 }],
    ['断言句式', '共 174 项断言, 0 失败', { pass: 174, fail: 0 }],
    ['前面有别的输出', '一些输出\n更多输出\n结果: 12 通过, 1 失败', { pass: 12, fail: 1 }],
    // ── 自检第一次跑就抓出来的三种（它们原来全都没进 TOTAL）──
    ['前置数字句式', '通过 20, 失败 0', { pass: 20, fail: 0 }],
    ['英文句式', '全部通过  30 pass / 0 fail', { pass: 30, fail: 0 }],
    ['英文句式（有失败）', '14 pass / 2 fail', { pass: 14, fail: 2 }],
    // ── 负样本：这些**必须**解析不出来（否则说明判据太宽，会把噪音当结论）──
    ['没有汇总行（只有 PASS 行）', 'PASS 甲\nPASS 乙\nPASS 丙', null],
    ['只有数字没有关键词', '3 项 (36 项)', null],
    ['空输出', '', null],
  ];

  const 错 = [];
  for (const [说明, 输入, 期望] of 用例) {
    const 实际 = 解析末行汇总(输入);
    if (期望 === null) {
      if (实际 !== null)
        错.push(`${说明}: 期望解析不出，实际得到 ${JSON.stringify(实际)}`);
      continue;
    }
    if (!实际) {
      错.push(`${说明}: 期望 ${JSON.stringify(期望)}，实际 null`);
      continue;
    }
    if (实际.pass !== 期望.pass || 实际.fail !== 期望.fail)
      错.push(`${说明}: 期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }

  if (错.length > 0) {
    console.error('\n===== 裁判自检失败：汇总解析不可信 =====');
    错.forEach(e => console.error('  ✗ ' + e));
    console.error('\n**这一行以上的所有 TOTAL 数字都不可信。先修 解析末行汇总。**');
    process.exit(1);
  }
  console.log(`(裁判自检: ${用例.length} 组句式全部解析正确)`);
}
自检汇总解析();

/**
 * **裁判自检 ②：通过数必须是算出来的，不能是编的**（2026-11-19，需求方 #370 ①）。
 *
 * ── 为什么需要它 ──
 *  上一批我给三个 yanhuo 文件补汇总行时写的是 `结果: ${6} 通过` —— **6 是字面量**。
 *  加了断言忘更新 → 数字偏小，而上面那个句式自检**只验句式、不验条数**，发现不了。
 *
 *  > 这是"裁判不检查"的第四种形态：**句式能解析，但数字本身是编的。**
 *  > **一个编出来的数字，比没有数字更危险 —— 它看起来是统计结果。**
 *
 * ── 判据（源码级，一次扫描就够）──
 *  凡是 `console.log(\`结果: ${N} 通过...\`)` 里 N 是**数字字面量**的，都报出来。
 *  正确写法是 `${通过}` 这种运行时变量。
 *
 *  ⚠ **这条有假阳性风险**：真有文件是"常量通过数"（比如固定跑 N 条）。
 *    所以报出来是**警告**而不是失败 —— 但**每次跑都打**，让写的人知道自己在写什么。
 *    （如果将来有人确认某文件就该写死，在这里加白名单并写理由。）
 */
function 自检通过数非字面量() {
  const 命中 = [];
  for (const 名 of files) {
    const 路径 = path.join(HERE, 名);
    let 源;
    try {
      源 = readFileSync(路径, 'utf8');
    }
    catch {
      continue;
    }
    // 只找**汇总行**里的字面量：`结果: ${6} 通过` 或 `结果: 6 通过`
    for (const m of 源.matchAll(/结果:\s*(?:\$\{)?(\d+)(?:\})?\s*通过/g)) {
      // 跳过注释行
      const 行首 = 源.lastIndexOf('\n', m.index ?? 0) + 1;
      const 行 = 源.slice(行首, 源.indexOf('\n', m.index ?? 0));
      if (/^\s*(\/\/|\*|\/\*)/.test(行))
        continue;
      命中.push(`${名}: ${行.trim().slice(0, 70)}`);
    }
  }
  if (命中.length > 0) {
    console.log('\n===== 裁判自检 ②：以下文件的通过数是**字面量**（不是算出来的）=====');
    命中.forEach(h => console.log('  ! ' + h));
    console.log('  → 加了断言忘更新时，这些数字不会跟着变，而 TOTAL 会**看起来正常**。');
    console.log('  → 正确写法：`console.log(`结果: ${通过} 通过, 0 失败`)`（运行时计数）。');
    console.log('  → 若某文件确实该写死，在 run.mjs 的 自检通过数非字面量() 里加白名单并写理由。');
  }
}
自检通过数非字面量();



/** 跑一个用例产物: stdout 接管子(实时转发 + 捕获解析), stderr/stdin 保持直连。 */
function 跑用例(outfile) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [outfile], { stdio: ['inherit', 'pipe', 'inherit'], cwd: ROOT });
    let out = '';
    child.stdout.on('data', d => { process.stdout.write(d); out += d; });
    child.on('close', code => resolve({ code, out }));
  });
}

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
  const { code, out } = await 跑用例(outfile);
  const 汇总 = 解析末行汇总(out);
  if (汇总) {
    断言通过总数 += 汇总.pass;
    断言失败总数 += 汇总.fail;
  }
  else {
    // ⚠ **解析不到汇总 = 这个文件的数字没被计入**（2026-11-19，需求方 #368 ②）。
    //
    //  这正是那个 `3 项失败` bug 的形态：**文件跑了、报错了，而汇总没被解析** ——
    //  于是它的失败数从来没进过 TOTAL。**不许静默跳过。**
    //
    //  为什么"报错退出"而不是"警告后继续"：
    //  继续跑会让 TOTAL 看起来正常（数字偏小），而**偏小的数字比没有数字更危险** ——
    //  你会拿它当结论。宁可整轮红，也不要一个"看起来绿"的错数字。
    console.error(`\n  ★ ${name}: 跑完了但**解析不到汇总行** —— 这个文件的通过/失败数没有计入 TOTAL。`);
    console.error(`     末 3 行输出: ${JSON.stringify(out.split('\n').filter(l => l.trim()).slice(-3))}`);
    console.error('     该文件的断言句式需要兼容 解析末行汇总()，或它根本没输出汇总。');
    failed++;
    解析失败文件.push(name);
  }
  if (code !== 0)
    failed++;
}

// 候选4 的验收线: 平台调用必须全部收在 host.ts(只有它允许直接命名酒馆全局)。
// 放在最后跑, 所以前面用例的具体报错不会被它挤掉。
//
// ⚠ **2026-11-19：每一项检查必须自己说"本项通过/失败"**（需求方 #368 ③）。
//
//  ── 原来为什么误导 ──
//  以前这里只有一行 `有 N 项失败(共 176 个用例文件)`，而 N 是**全局总数**。
//  它紧跟在 `===== 导入/转发检查 =====` 标题下面，
//  **读起来像"这个检查有 N 项失败"** —— 我这次读它就差点误判。
//
//  现在每项检查自己打印 `本项：通过 ✓ / 失败 ✗`，全局数字单独一行、带 `全局：` 前缀。
console.log('\n===== 平台直连检查 =====');
const 检查 = spawnSync(process.execPath, [path.join(HERE, 'platform-usage.mjs'), '--check'], { stdio: 'inherit', cwd: ROOT });
const 平台检查过 = 检查.status === 0;
console.log(`  本项：${平台检查过 ? '通过 ✓' : '失败 ✗'}`);
if (!平台检查过)
  failed++;

// 同一类"静默失败"的另一面: 构建走 transpileOnly, 所以"导入了不存在的导出"编译期不报错,
// 名字被真正用到时才是 undefined。这条检查扫 src 与 tests 的每一条具名导入/转发。
console.log('\n===== 导入/转发检查 =====');
const 导入检查 = spawnSync(process.execPath, [path.join(HERE, 'import-exports.mjs'), '--check'], { stdio: 'inherit', cwd: ROOT });
const 导入检查过 = 导入检查.status === 0;
console.log(`  本项：${导入检查过 ? '通过 ✓' : '失败 ✗'}`);
if (!导入检查过)
  failed++;

// ── 全局汇总：单独一段，带明确前缀，不与上面任何一项的标题相邻 ──
console.log('\n===== 全局汇总 =====');
if (解析失败文件.length > 0) {
  console.log(`  ★ 有 ${解析失败文件.length} 个文件的汇总解析不到（它们的数字没进 TOTAL）:`);
  解析失败文件.forEach(n => console.log(`      - ${n}`));
}
console.log(failed === 0
  ? `  全部通过: ${files.length} 个用例文件${跳过打包 > 0 ? `（其中 ${跳过打包} 个指纹未变、跳过重打包）` : ''}`
  : `  有 ${failed} 项失败(共 ${files.length} 个用例文件)`);
// 机读汇总: 全员只引用这一行(复盘 C6 / 复盘三方共识 P0-3)。failed=断言级失败, fileFailed=文件级失败(含打包失败与两项检查)。
console.log(`TOTAL files=${files.length} asserts=${断言通过总数} failed=${断言失败总数} fileFailed=${failed} skipped=${跳过打包}`);
process.exit(failed === 0 ? 0 : 1);
