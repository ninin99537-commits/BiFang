// 一次性探针: 假宿主全量体检 —— 每个方法要么真实现、要么调用即抛。
//
// ── 为什么需要这条（需求方 #372）──
//  `insertOrAssign: () => undefined` 让整条写入路径**从没被执行过**，而且不报错。
//  **这不是一个 bug，这是一个「测试替身可能在撒谎」的信号。**
//
//  同一个病在假宿主里可能有多处：`update: async () => undefined`、`create: async () => undefined`、
//  `remove: async () => undefined` —— 每一个都让对应的生产路径**测了等于没测**。
//
// ── 判据（机械可查）──
//  ① 假宿主的每个方法，**不许**是 `() => undefined` / `async () => undefined` 这种空体
//  ② 要么有真实现，要么**调用即抛**（"假宿主没实现这个能力"）
//  ③ 例外：`model.stop`（真的就是"什么都不做"的语义）、`toast`（写入记录表，是真实现）
//
// ── 为什么"调用即抛"比"静默返回 undefined"好 ──
//  一个没人用的占位不该留着；一个**有人在用**的占位，应该炸出来而不是静默返回。
//  静默返回 = 测试通过 = 那条路径永远没人验。
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 源 = readFileSync(path.join(ROOT, 'tests/helpers/彼方假宿主.ts'), 'utf8');

let pass = 0;
let fail = 0;
function ok(名, 条件, 附注) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}

console.log('=== ① 扫描所有「空体方法」===');
{
  const 空体 = [
    ...源.matchAll(/^\s{4,8}([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:\s*(?:async\s*)?\(\s*\)\s*=>\s*(?:undefined|\{\s*\})\s*,?\s*$/gm),
  ].map(m => ({ 名: m[1], 行: 源.slice(0, m.index).split('\n').length }));

  console.log(`  找到 ${空体.length} 个空体方法:`);
  空体.forEach(x => console.log(`    L${x.行}  ${x.名}`));

  // ── 白名单：这些"空体"是**真语义**，不是占位 ──
  const 允许 = new Set([
    'stop', // model.stop: 中断请求 —— 假宿主没有在飞的请求，什么都不做是对的
  ]);

  const 违规 = 空体.filter(x => !允许.has(x.名));
  ok('没有未经允许的空体方法', 违规.length === 0,
    违规.map(x => `${x.名}(L${x.行})`).join(', '));

  // **自证**：这个扫描器能抓到 `() => undefined`
  ok('[自证] 扫描器能抓到 `() => undefined`',
     /^\s{4,8}([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:\s*(?:async\s*)?\(\s*\)\s*=>\s*undefined\s*,?\s*$/m
       .test('      insertOrAssign: () => undefined,'));
}

console.log('');
console.log('=== ② worldbook 的四个写方法必须是真实现 ===');
{
  // ── 这四个是「发现4/5」那条链的战场 ──
  //  它们原来是 `async () => undefined`，于是 `syncNpcStatesWorldbook` 的
  //  新建 / 更新 / 删除三条分支在测试里**从来没被执行过**。
  for (const 方法 of ['entries', 'update', 'create', 'remove']) {
    const 正则 = new RegExp(`${方法}\\s*:\\s*async\\s*\\(`);
    ok(`worldbook.${方法} 是函数（不是 undefined）`, 正则.test(源));
    const 空体正则 = new RegExp(`${方法}\\s*:\\s*async\\s*\\([^)]*\\)\\s*=>\\s*undefined`);
    ok(`worldbook.${方法} 不是空体`, !空体正则.test(源), '仍然是 async () => undefined');
  }
}

console.log('');
console.log('=== ③ 假宿主必须提供生产代码用到的每一个能力 ===');
{
  // ── 怎么列出"生产代码用到的能力" ──
  //  扫 src/彼方 里所有 `host.xxx` 与 `host.xxx.yyy`，逐个对假宿主。
  //  缺失的能力 = 那条路径在假宿主上**根本跑不起来**（会抛 TypeError），
  //  而用例可能用 try/catch 吞掉，于是"测试通过"。
  const 目录 = path.join(ROOT, 'src/彼方_NPC幕后生命状态系统');
  const 用到 = new Set();
  for (const f of readdirSync(目录)) {
    if (!/\.(ts|vue)$/.test(f))
      continue;
    const 文本 = readFileSync(path.join(目录, f), 'utf8');
    for (const m of 文本.matchAll(/host\.([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)(?:\.([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*))?/g))
      用到.add(m[2] ? `${m[1]}.${m[2]}` : m[1]);
  }

  // 假宿主提供了什么（顶层 + 二级 + **行内对象里的键**）
  const 提供 = new Set();
  // 缩进 4 空格 = 顶层；缩进 6 空格 = 二级
  for (const m of 源.matchAll(/^\s{4}([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:/gm))
    提供.add(m[1]);
  for (const m of 源.matchAll(/^\s{6}([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:/gm))
    提供.add(m[1]);
  // ⚠ **行内对象也要认**（2026-11-19 自查）：
  //   `persona: { name: () => '玩家', description: () => ..., lorebook: () => '' }`
  //   这种写法的键在**同一行**里，上面的按行首缩进匹配抓不到 → 会误报"缺失"。
  //   我第一版就是这样，报了 persona.name / character.name / macros.expand 三个假阳性。
  for (const m of 源.matchAll(/\{\s*([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:/g))
    提供.add(m[1]);
  for (const m of 源.matchAll(/,\s*([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\s*:\s*(?:\(|async)/g))
    提供.add(m[1]);

  // 生产用到、假宿主没有的
  const 缺 = [...用到].filter(k => {
    // `host.ts` 这种是**文件名**不是能力（`import ... from './host'` 里出现过 `host.`）
    if (k === 'ts')
      return false;
    const 全 = k.split('.');
    if (全.length === 1)
      return !提供.has(全[0]);
    return !提供.has(全[1]);
  }).sort();

  console.log(`  生产用到 ${用到.size} 个能力，假宿主缺 ${缺.length} 个:`);
  缺.forEach(k => console.log(`    ${k}`));

  // ── 缺的那些里，哪些**有专测**（不在假宿主职责内）──
  const 有专测 = new Set([
    'acu.tables', 'ejs.evaluate', 'ejs.prepareContext', 'ejs.syntaxError',
    'events.onChatChanged', 'events.onGenerationAfterCommands', 'events.onMessageDeleted',
    'events.onMessageReceived', 'events.onMessageSwiped',
    'script.注册按钮', 'script.监听按钮', 'script',
    'chat.currentChatId',
    'groupMemberNames',
  ]);
  const 该有 = 缺.filter(k => !有专测.has(k));
  ok('没有「生产在用、假宿主没有、又没专测」的能力', 该有.length === 0, 该有.join(', '));

  // **自证**：扫描器能抓到缺失
  ok('[自证] 扫描器能识别"假宿主没有 acu"', 缺.includes('acu.tables'));
}

console.log('');
console.log('=== ④ worldbook 四个写方法必须有真实现 ===');
{
  const 目标 = 'remove: async (';
  ok('[自证] worldbook.remove 有真实现（不是空体）', 源.includes(目标),
    '找不到 remove 的真实现');
}

console.log('');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
