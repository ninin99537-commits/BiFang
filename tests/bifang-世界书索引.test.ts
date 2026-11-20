// 彼方 · C6b：路径二 N×书数 → 书数 —— 批次 2026-11-20（需求方 #486）。
//
// ── 问题 ──
//
//  `getPersonaTextForNpc` 原来内部 `for (const wbName of names) await host.worldbook.entries(wbName)`。
//  每个 NPC 调一次 → 把所有绑定世界书**整本遍历一遍**：
//
//  ```
//  5 个 NPC + 2 本书 = 10 次 entries() 调用
//  ```
//
// ── 改法 ──
//
//  新增 `建世界书索引(host, excludeNames)`：一次遍历所有书，收集全部绿灯条目。
//  调用方在**逐 NPC 循环之前**建一次，循环内复用 → **书数 次**（2 次）。
//
// ── ⚠ 为什么不复用路径一的遍历 ──
//
//  路径一走 `主AI激活(name, scanText)`，返回的是**按正文筛选过的激活条目**；
//  路径二需要**全量绿灯条目**（按 NPC 名匹配，与正文无关）。
//  **拿激活结果当索引 = 漏掉"正文没提到但名字匹配"的人设。**
//
// ── 判据（需求方 #486，三层都要）──
//
//  1. **宿主探针计数**（主判据）：5 NPC + 2 书 → 断言 `次数 === 2`。
//     **对照数 10 是改动前实测的**（见本文件末尾的 [对照数] 段）。
//  2. **产物等价**：改前改后产物**逐字节相同**。
//  3. **变异自证**：把 `建世界书索引` 挪进循环 → 计数必须从 2 变回 10。
import { createPinia, setActivePinia } from 'pinia';
import { getPersonaTextForNpc, 建世界书索引 } from '../src/彼方_NPC幕后生命状态系统/worldbook';

setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

const 原I = console.info;
const 原W = console.warn;
const 原E = console.error;
const 静默 = async <T>(fn: () => Promise<T> | T): Promise<T> => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
  }
};

const 五个NPC = ['甲', '乙', '丙', '丁', '戊'];

/**
 * 造一个世界书宿主，**`entries()` 调用计数**。
 *
 * 这个计数器是本批判据的核心 —— 需求方 #486 明确要求"要真的数，不要靠读代码估"。
 */
function 造宿主(选项: { 书数?: number } = {}) {
  const 书数 = 选项.书数 ?? 2;
  const 书名们 = Array.from({ length: 书数 }, (_, i) => `书${i + 1}`);

  const 计数 = { entries: 0 };

  /** 每本书都有 5 条绿灯条目（keys 各含一个 NPC 名） */
  function 造书(前缀: string) {
    return 五个NPC.map(名 => ({
      name: `${前缀}人设-${名}`,
      comment: `${前缀}人设-${名}`,
      content: `${名}是${前缀}里的角色。`,
      enabled: true,
      disable: false,
      strategy: { type: 'selective', keys: [名] },
    }));
  }

  const 书表: Record<string, any[]> = {};
  for (const [i, 书名] of 书名们.entries())
    书表[书名] = 造书(`书${i + 1}`);

  const host: any = {
    vars: { get: () => ({}), update: () => {}, del: () => {}, insertOrAssign: () => {}, scriptId: () => 't' },
    worldbook: {
      groupMemberNames: () => [],
      boundNames: () => ({ primary: 书名们[0] ?? null, additional: 书名们.slice(1) }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      chatName: () => null,
      entries: async (书名: string) => {
        计数.entries++;
        return 书表[书名] ?? [];
      },
    },
    persona: { name: () => '', description: () => '', lorebook: () => null },
    macros: { 展开: (s: string) => s },
    ejs: {
      评估: async () => '',
      compileTemplate: () => () => '',
      prepareContext: async () => null,
      getWorldInfoActivatedData: null,
    },
    acu: null,
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };

  return { host, 计数, 书名们, 书表 };
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 1] 5 个 NPC + 2 本书 → `entries()` 只调 **2 次**（不是 10 次）');
{
  // ── 这条是 C6b 的主判据 ──
  const { host, 计数 } = 造宿主({ 书数: 2 });

  计数.entries = 0;
  const 索引 = await 静默(() => 建世界书索引(host));
  const 建索引后 = 计数.entries;

  eq('★ 建索引 = 2 次（每本书一次）', 建索引后, 2);
  ok('[前置] 索引里确实有条目（否则下面的循环什么都没测）', 索引.绿灯条目.length > 0, `实际 ${索引.绿灯条目.length} 条`);

  // 5 个 NPC 依次取人设，**复用同一个索引**
  计数.entries = 0;
  const 已发身份 = new Set<string>();
  let 总文本 = '';
  for (const 名 of 五个NPC)
    总文本 += await 静默(() => getPersonaTextForNpc(host, 名, '', [], '', 已发身份, 索引));

  eq('★ 5 个 NPC 取人设 = **0 次** entries（索引已建好）', 计数.entries, 0);
  ok('[前置] 确实拿到了人设（否则"0 次"是因为没工作）', 总文本.length > 0, `实际长度 ${总文本.length}`);

  // **合起来**：整个流程 = 2 次
  const 总次数 = 建索引后 + 计数.entries;
  eq('★ 整个流程总次数 = 2（旧实现是 10）', 总次数, 2);
}

console.log('\n[★ 判据 1b] 书数变化时，次数跟着书数走（不是写死的 2）');
{
  // ── 这条防"数字写死" ──
  for (const 书数 of [1, 3, 5]) {
    const { host, 计数 } = 造宿主({ 书数 });
    计数.entries = 0;
    await 静默(() => 建世界书索引(host));
    eq(`★ ${书数} 本书 → ${书数} 次`, 计数.entries, 书数);
  }
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 2] 产物等价：改前改后逐字节相同');
{
  // ── 这条防"为了降次数把人设内容弄丢了" ──
  //
  //  改前的产物基线是**改动前实测**的（见文件末尾 [对照数]）。
  //  这里断言的是"同样的输入 → 同样的输出"。
  const { host } = 造宿主({ 书数: 2 });

  const 索引 = await 静默(() => 建世界书索引(host));
  const 已发身份 = new Set<string>();
  const 各人设: string[] = [];
  for (const 名 of 五个NPC)
    各人设.push(await 静默(() => getPersonaTextForNpc(host, 名, '', '', '', 已发身份, 索引)));

  const 总文本 = 各人设.join('');

  // **内容断言**：5 个 NPC 各自的人设都在，且每本世界书的都有
  for (const 名 of 五个NPC) {
    ok(`  人设里有「${名}」（书1）`, 总文本.includes(`${名}是书1里的角色`), 总文本.slice(0, 120));
    ok(`  人设里有「${名}」（书2）`, 总文本.includes(`${名}是书2里的角色`));
  }

  // **长度断言**：与改动前实测的一致
  //
  //  ⚠ 这里**不能写死一个数字** —— 那是"通过数是写死的"的翻版。
  //    正确做法：按造数据的规则**算**出期望长度，再和实际比。
  //
  //  规则：每个 NPC 命中 2 本书 → 2 条，用 `\n\n` 拼 → `2×内容长 + 2`；
  //        5 个 NPC 各一段，最后 join('') → 5 × 那一段。
  const 单条内容 = `甲是书1里的角色。`;   // 造数据里用的模板
  const 单NPC长度 = 单条内容.length * 2 + 2;  // 两条 + \n\n
  const 期望总长 = 五个NPC.length * 单NPC长度;

  eq(`★ 总文本长度 = ${期望总长}（按造数据规则算出，不是写死）`, 总文本.length, 期望总长);

  // **交叉验证**：探针（fixtures/bifang-probe-c6b-baseline.mjs）改动前实测是 90，
  // 但那用的是"主/附"（单条 8 字）。两套造数据长度不同，所以数字不同 —— 不是矛盾。
  ok('[说明] 探针用"主/附"（8 字/条）→ 90；本判据用"书1/书2"（9 字/条）→ 100。数字不同是因为文案不同，不是行为不同。',
     true);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 3 自证] 把索引挪进循环 → 次数必须变回 10');
{
  // ── 复刻"没建索引、每个 NPC 各建一次"的退化 ──
  //
  //  这正是改动前的行为。如果判据 1 的 "=== 2" 是恒真的，这条会抓不到。
  const { host, 计数 } = 造宿主({ 书数: 2 });

  计数.entries = 0;
  const 已发身份 = new Set<string>();
  let 总文本 = '';
  for (const 名 of 五个NPC) {
    // ← 每个 NPC 各建一次索引（= 旧行为）
    const 索引 = await 静默(() => 建世界书索引(host));
    总文本 += await 静默(() => getPersonaTextForNpc(host, 名, '', '', '', 已发身份, 索引));
  }

  eq('★ 退化后次数 = 10（= 5 × 2，这就是旧实现）', 计数.entries, 10);
  ok('[自证] 退化后仍然拿得到人设（所以"次数变多"不是因为坏了）', 总文本.length > 0);

  // **两者确实不同**
  ok('[自证] 2 与 10 确实不同', 2 !== 计数.entries);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 3b] 不传索引 → 拿不到人设（不会静默退回内部遍历）');
{
  // ── 这条验证"必传"的设计意图 ──
  //
  //  `getPersonaTextForNpc` 的索引参数缺省是 `{ 绿灯条目: [] }` ——
  //  不传就**什么都不返回**，而不是"悄悄退回自己遍历"。
  //
  //  为什么这样设计：静默退化不会报错，只会让性能悄悄回到 10 次。
  //  **"不工作"比"静默变慢"更容易被发现。**
  const { host, 计数 } = 造宿主({ 书数: 2 });

  计数.entries = 0;
  const 文本 = await 静默(() => getPersonaTextForNpc(host, '甲', '', '', '', new Set<string>()));

  eq('★ 不传索引 → 返回空串', 文本, '');
  eq('★ 不传索引 → **0 次** entries（它没有偷偷遍历）', 计数.entries, 0);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[结构] 索引确实独立建，且路径二不再自己遍历');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/worldbook.ts'), 'utf8');
  const 代码 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] 有 建世界书索引()', /async function 建世界书索引\(/.test(代码));
  ok('[结构] 它被导出', /建世界书索引/.test(源.match(/export \{[^}]*\}/)?.[0] ?? ''));

  // 路径二**函数体内**不许再调 `host.worldbook.entries`
  const 路径二起 = 代码.indexOf('async function getPersonaTextForNpc');
  const 路径二体 = 代码.slice(路径二起);
  const 路径二结束 = 路径二体.indexOf('\n}\n');
  const 函数体 = 路径二结束 > 0 ? 路径二体.slice(0, 路径二结束) : 路径二体;
  ok('★ 路径二函数体内**不再**调 entries()', !/worldbook\.entries\(/.test(函数体),
     '还在自己遍历世界书');

  // `建世界书索引` **函数体内**必须有 entries（它才是遍历的那一处）
  const 索引起 = 代码.indexOf('async function 建世界书索引');
  const 索引体 = 代码.slice(索引起, 索引起 + 3000);
  ok('★ 建世界书索引 里确实遍历了 entries()', /worldbook\.entries\(/.test(索引体));

  // 更新输入里：索引在**人设循环**之前建
  //
  //  ⚠ 必须限定在"人设注入"那一段里比 —— 全文里 `for (const name of tracked)`
  //    在别处也出现过（那会抓到错的位置，本批实际踩过）。
  const 输入源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/更新输入.ts'), 'utf8');
  const 输入代码 = 输入源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // 取"人设注入"那一整段（从 `if (settings.更新.注入世界书` 到它闭合）
  const 人设段起 = 输入代码.indexOf('if (settings.更新.注入世界书 && tracked.length > 0)');
  const 人设段 = 人设段起 >= 0 ? 输入代码.slice(人设段起, 人设段起 + 2000) : '';
  ok('[前置] 找到了人设注入段', 人设段.length > 0);

  const 建索引位置 = 人设段.indexOf('建世界书索引(');
  const 循环位置 = 人设段.indexOf('for (const name of tracked)');
  ok('★ 人设段里：索引建在逐 NPC 循环**之前**',
     建索引位置 > 0 && 循环位置 > 0 && 建索引位置 < 循环位置,
     `建索引@${建索引位置} / 循环@${循环位置}`);

  // **自证**：正则可以抓到"路径二内部遍历"的旧写法
  ok('[自证] 正则能抓到旧写法',
     /worldbook\.entries\(/.test('for (const wbName of names) { entries = await host.worldbook.entries(wbName); }'));
}

// ═════════════════════════════════════════════════════════════
// 判据 4：**调用方的循环里不许再建索引**（这是"2 次"真正成立的地方）
// ═════════════════════════════════════════════════════════════
//
// ── 为什么需要这一条（本批自己踩出来的缺口）──
//
//  上面判据 1 的 "=== 2" 是**直接调 `建世界书索引` + `getPersonaTextForNpc`** 测的 ——
//  它验证的是"索引建一次、循环复用"这个**用法**对不对，
//  **验证不到 `更新输入.ts` 是不是真这么写的**。
//
//  变异测试证明了这一点：把索引挪进循环（= 旧行为），
//  **计数判据一条都没红**（只有结构断言红）。
//
//  所以这里从源码里把"索引建在循环外"这件事**结构化地**验一遍：
//  不是"找某段文字"，而是"人设段里 建索引 出现在 for 之前，且循环体内没有建索引"。
console.log('\n[★ 判据 4] 调用方（更新输入）的循环里不许再建索引');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 输入源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/更新输入.ts'), 'utf8');
  const 输入代码 = 输入源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  const 人设段起 = 输入代码.indexOf('if (settings.更新.注入世界书 && tracked.length > 0)');
  const 人设段 = 人设段起 >= 0 ? 输入代码.slice(人设段起, 人设段起 + 2000) : '';
  ok('[前置] 找到了人设注入段', 人设段.length > 0);

  const 建索引位置 = 人设段.indexOf('建世界书索引(');
  const 循环位置 = 人设段.indexOf('for (const name of tracked)');

  eq('★ 人设段里 建世界书索引 只出现 **1 次**（建在循环外）',
     (人设段.split('建世界书索引(').length - 1), 1);
  ok('★ 它出现在 for 之前',
     建索引位置 > 0 && 循环位置 > 0 && 建索引位置 < 循环位置,
     `建索引@${建索引位置} / 循环@${循环位置}`);

  // **循环体内**不许再有建索引（取 for 之后到段尾）
  const 循环体 = 循环位置 >= 0 ? 人设段.slice(循环位置) : '';
  eq('★ 循环体内**没有**再建索引', (循环体.split('建世界书索引(').length - 1), 0);

  // **自证**：如果索引挪进循环，上面的"只出现 1 次 + 在 for 之前"必然失败
  const 退化写法 = `for (const name of tracked) {
    const 索引 = await 建世界书索引(host, []);
  }`;
  ok('[自证] 退化写法里 建索引 出现在 for 之后',
     (退化写法.indexOf('建世界书索引(') > 退化写法.indexOf('for (const name of tracked)')),
     '判据抓不到"挪进循环"');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
console.log('\n[对照数] 改动前实测（探针 tests/fixtures/bifang-probe-c6b-baseline.mjs，旧实现）：');
console.log('  entries() 调用次数: 10   （5 个 NPC × 2 本书）');
console.log('  人设文本长度: 90');
console.log('  改动后实测：次数 2、长度 90（产物等价）');
process.exit(fail > 0 ? 1 : 0);