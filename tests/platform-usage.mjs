// 统计: 除了各项目的 host.ts, 还有谁在直接调用酒馆助手的平台 API?
//
// 名字取自 @types/**/*.d.ts 的 declare 声明 —— 那是本仓库里平台 API 的权威清单,
// 所以这份统计不会漏掉"看着不像平台调用"的那些(getPersona / substitudeMacros / SillyTavern …)。
// 这是候选4的验收线: 目标是**除 host.ts 外一处都没有**; 候选5 把烟火也纳入同一条线;
// 候选8 又把 src/共用(两家共用的 module)纳入, 并补上了不在 @types 里、却同样是平台直连的
// 属性名清单(ACU 的 AutoCardUpdaterAPI: 它曾经藏在两家的世界书求值器里, 这条线看不见)。
//
// 用法: node tests/platform-usage.mjs          # 只报告
//       node tests/platform-usage.mjs --check  # 有任何一处就退出码 1
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** 每个项目各有自己的 host.ts(唯一允许直接碰平台的文件); 共用 module 没有 host, 所以一处都不许有 */
const 项目 = [
  { 名: '彼方', 目录: join(ROOT, 'src', '彼方_NPC幕后生命状态系统'), 允许: ['host.ts'] },
  { 名: '烟火', 目录: join(ROOT, 'src', '烟火_世界运转'), 允许: ['host.ts'] },
  { 名: '剧情导演', 目录: join(ROOT, 'src', '剧情导演'), 允许: ['host.ts'] },
  { 名: '共用', 目录: join(ROOT, 'src', '共用'), 允许: [] },
];
/** 太通用的名字(容易和本地函数撞名), 不计入 */
const 不要 = new Set(['generate', 'builtin', 'formatAsDisplayedMessage', 'replaceVariables', 'getCharacter']);
/**
 * @types 里没有 declare、却同样是平台专属名字的标识符: 出现即算直连。
 * ACU(自动卡片更新器)的 API 入口 AutoCardUpdaterAPI 就属于这类 —— 而且它是被读的**属性**
 * (`window.parent.AutoCardUpdaterAPI`)而不是被调用的函数, 上面那条"名字后面跟 . 或 ("的
 * 规则天然看不见它。这正是候选8 里那条漏网的直连: 两家的世界书求值器各有一条, 现在都收进了
 * 各自的 host.ts(acu 能力), 所以这里按"出现即算"来查, 名字后面跟什么都不放过。
 */
const 属性平台名 = ['AutoCardUpdaterAPI'];
/**
 * 边界文件: 只有它们可以构造真实宿主(host.ts 是平台适配层本身, 不算边界)。
 * 其余模块一律把宿主当参数接收 —— 见 docs/adr/0001-host-seam.md。
 * 没有列出的项目(烟火/剧情导演)还没迁移, 这条规则对它们跳过。
 */
const 边界 = {
  彼方: ['index.ts', '悬浮球界面.ts', '悬浮球界面.vue'],
};
/** 已删除的旧注入接口: 出现即说明有人把全局单例又加回来了 */
const 禁止名 = ['injectHostForTest', 'useHost'];

function walk(dir, 条件) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory())
      out.push(...walk(p, 条件));
    else if (条件(p))
      out.push(p);
  }
  return out;
}

const 平台名 = new Set();
for (const f of walk(join(ROOT, '@types'), p => p.endsWith('.d.ts'))) {
  for (const m of readFileSync(f, 'utf8').matchAll(/^\s*declare\s+(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm))
    平台名.add(m[1]);
}
for (const n of 不要)
  平台名.delete(n);

/** 去掉注释, 免得注释里提到的 API 名被算成调用 */
function 去注释(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 判断这一处命中是不是落在字符串里(警告文案里提到 API 名很常见); 按"本行前面的引号是否为奇数个"粗略判断 */
function 在字符串里(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const before = text.slice(lineStart, index);
  for (const quote of ['`', '\'', '"']) {
    const n = before.split(quote).length - 1;
    if (n % 2 === 1)
      return true;
  }
  return false;
}

function 扫一个项目(项目) {
  const 结果 = [];
  for (const f of walk(项目.目录, p => /\.(ts|vue)$/.test(p))) {
    const rel = relative(项目.目录, f).replace(/\\/g, '/');
    if (项目.允许.includes(rel))
      continue;
    const text = 去注释(readFileSync(f, 'utf8'));
    const 命中 = new Map();
    for (const name of 平台名) {
      const 调用 = new RegExp(`(?<![\\w.$])${name}\\s*[.(]`, 'g');
      for (const m of text.matchAll(调用)) {
        if (!在字符串里(text, m.index))
          命中.set(name, (命中.get(name) ?? 0) + 1);
      }
    }
    // @types 里没有 declare 的平台名字: 不要求后面跟 . 或 (, 出现即算(见 属性平台名)
    for (const name of 属性平台名) {
      const 出现 = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'g');
      for (const m of text.matchAll(出现)) {
        if (!在字符串里(text, m.index))
          命中.set(name, (命中.get(name) ?? 0) + 1);
      }
    }
    if (命中.size > 0)
      结果.push([rel, [...命中.entries()].sort((a, b) => b[1] - a[1])]);
  }
  结果.sort((a, b) => b[1].reduce((s, x) => s + x[1], 0) - a[1].reduce((s, x) => s + x[1], 0));
  return 结果;
}

let 总计 = 0;
let 总文件数 = 0;
let 边界违规 = 0;
for (const 一个 of 项目) {
  // 投影仓只含部分项目(例如 BiFang 只有彼方、YanHuo 没有剧情导演), 缺目录就跳过,
  // 不要抛 ENOENT —— 否则整道「平台直连检查」会因为一个与平台调用无关的原因变红。
  if (!statSync(一个.目录, { throwIfNoEntry: false })) {
    console.log(`\n【${一个.名}】不在本仓（投影仓只含部分项目），跳过`);
    continue;
  }
  const 结果 = 扫一个项目(一个);
  console.log(`\n【${一个.名}】除 host.ts 之外的平台直连:`);
  if (结果.length === 0)
    console.log('  没有 ✓');
  for (const [rel, 命中] of 结果) {
    const n = 命中.reduce((s, x) => s + x[1], 0);
    总计 += n;
    总文件数 += 1;
    console.log(`  ${String(n).padStart(3)} 处  ${rel}`);
    console.log(`           ${命中.map(([name, c]) => (c > 1 ? `${name}×${c}` : name)).join(', ')}`);
  }
  // 边界规则: 只有边界文件可以构造真实宿主; 旧注入接口全仓禁止
  const 允许 = 边界[一个.名];
  for (const f of walk(一个.目录, p => /\.(ts|vue)$/.test(p))) {
    const rel = relative(一个.目录, f).replace(/\\/g, '/');
    const text = 去注释(readFileSync(f, 'utf8'));
    const 问题 = [];
    // 旧接口禁令只约束已迁移的项目(烟火/剧情导演还没迁移, 仍合法使用 useHost)
    if (允许 && 禁止名.some(name => new RegExp(`\\b${name}\\s*\\(`).test(text)))
      问题.push('用了已删除的全局宿主接口');
    if (rel !== 'host.ts' && 允许 && !允许.includes(rel) && /\bcreateTavernHost\s*\(/.test(text))
      问题.push('在边界之外构造真实宿主');
    if (问题.length > 0) {
      边界违规 += 1;
      console.log(`  [边界] ${rel}: ${问题.join('; ')}`);
    }
  }
}
console.log(`\n  合计 ${总计} 处, 涉及 ${总文件数} 个文件; 边界违规 ${边界违规} 处`);
if (process.argv.includes('--check') && (总计 > 0 || 边界违规 > 0)) {
  console.log('\n候选4/5 未完成: 平台调用应当全部收在各自的 host.ts, 且宿主只能由边界文件构造');
  process.exit(1);
}

