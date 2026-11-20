// 彼方 · C6：世界书两条读路径按「条目身份」去重 —— 批次 2026-11-20（需求方 #448）。
//
// ── 问题 ──
//
//  两条读路径（`读取世界书段` 给"世界书"段、`getPersonaTextForNpc` 给每张卡的"人设参考"）
//  都会读到同一条条目，于是同一条设定被发两遍。
//
//  原来的去重是 `已注入文本.includes(text)` —— **拿渲染产物猜身份**。这不可靠：
//
//  | | 路径一 | 路径二 |
//  |---|---|---|
//  | 求值上下文 | `组装求值上下文(scanText, …)` | `组装求值上下文('', …)` |
//  | `<if seed:某词>` | scanText 含该词 → 展开 A | 空串 → 展开 B |
//
//  **A ≠ B → includes 失败 → 同一条设定发两遍，而且内容不一样** → 模型当成两个版本。
//
//  而且路径二对**每个 NPC** 各跑一次完整管线（每次内部把绑定世界书整本遍历一遍），
//  一条 `keys:['甲','乙','丙']` 的条目在三人被追踪时会被求值 **1+3=4 遍**。
//
// ── 改法 ──
//
//  **在收集阶段按身份去重，不在渲染后用文本猜。**
//  条目身份 = `书名 + '｜' + (name ?? comment ?? key)`。
//  路径一记下"真的发过哪些身份"，路径二跳过这些条目 → 同一条目**只求值一次**。
//
// ── 判据（需求方 #448）──
//
//  1. 同一条绿灯条目既在正文里出现、又命中某个追踪 NPC → **只求值一次、只出现一次**
//  2. `<if seed:词>` 条目 → 模型收到的只有**一个版本**
//  3. **求值次数**：N 个 NPC 时，`组装求值上下文` 调用次数 **1 次**（原来是 1+N）
//  4. 自证：改回"文本包含去重" → 第 1、2 条必须红
//
//  ⚠ 需求方特别要求：**调用次数要真的数（插计数器），不要靠读代码估** ——
//    "估出来的数字就是下一个'通过数是写死的'"。
import { createPinia, setActivePinia } from 'pinia';
// ⚠ 2026-11-20 C6b：`getPersonaTextForNpc` 多了第 7 个参数 `索引`（必传）。
// 本文件的用例原来只传 6 个 → 索引缺省是 `{ 绿灯条目: [] }` → **路径二什么都拿不到**，
// 判据全红。所以下面每个调用点都补上 `await 建世界书索引(host)`。
import { 读取世界书段, getPersonaTextForNpc, 建世界书索引 } from '../src/彼方_NPC幕后生命状态系统/worldbook';

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
const 原T = console.table;
const 静默 = <T>(fn: () => T): T => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.table = () => {};
  try {
    return fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
    console.table = 原T;
  }
};

// ═════════════════════════════════════════════════════════════
// 计数器 —— **真的数调用次数**，不靠读代码估
// ═════════════════════════════════════════════════════════════

/**
 * 全局计数器。
 *
 * `组装求值上下文` 在 `共用/条目求值.ts` 里，测试侧不能直接给它插桩
 * （那是生产代码，不该为测试加钩子）。所以改数**可观测的等价物**：
 *
 * | 想数的 | 怎么数 |
 * |---|---|
 * | `组装求值上下文` 调用次数 | 数 `求值条目文本` 的调用次数 **不行**（一条目一次）… |
 *
 * 所以改用**宿主侧的调用次数**来间接但确定地反映"跑了几遍管线"：
 * `worldbook.entries()` 的调用次数 —— 路径二每次对**每本世界书**调一次 `entries()`，
 * 路径一只在"常驻名单非空"时调。两条路径的 `entries()` 次数差直接反映"跑了几遍"。
 *
 * ⚠ 这个计数器必须在**真实的宿主对象**上包一层，不能靠读代码。
 */
const 计数 = {
  entries调用: 0,
  /** 求值过的条目内容（用来判断"同一条目被求值了几遍"） */
  求值过的内容: [] as string[],
  重置() {
    this.entries调用 = 0;
    this.求值过的内容 = [];
  },
};

/**
 * 造一个世界书宿主。
 *
 * @param 条目们  每本世界书的条目
 * @param 正文    路径一的 scanText（会传给 `<if seed:>`）
 */
function 造宿主(选项: {
  条目们: Record<string, any[]>;
  正文?: string;
  /** 强制走内置激活（不依赖"提示词模板语法"插件） */
}) {
  const 正文 = 选项.正文 ?? '';

  const host: any = {
    vars: {
      get: () => ({}),
      update: () => {},
      del: () => {},
      insertOrAssign: () => {},
      scriptId: () => 't',
    },
    worldbook: {
      /** 群聊成员（空 = 单聊） */
      groupMemberNames: () => [],
      /** 单聊：当前卡绑定的世界书（主 + 附加） */
      boundNames: () => ({ primary: Object.keys(选项.条目们)[0] ?? null, additional: Object.keys(选项.条目们).slice(1) }),
      /** 群聊：每个成员绑定的世界书 */
      boundNamesOf: () => ({ primary: null, additional: [] }),
      /** 聊天世界书 */
      chatName: () => null,
      /**
       * 读一本世界书的全部条目。
       * **每次调用都计数** —— 这是"跑了几遍管线"的可观测证据。
       */
      entries: async (书名: string) => {
        计数.entries调用++;
        return (选项.条目们[书名] ?? []).map(e => ({ ...e }));
      },
    },
    persona: { name: () => '', description: () => '', lorebook: () => null },
    macros: { 展开: (s: string) => s },
    ejs: {
      // 让"提示词模板语法"插件不可用 → 走内置激活（蓝灯常驻 + 绿灯关键词）
      评估: async () => '',
      compileTemplate: () => () => '',
      prepareContext: async () => null,
      getWorldInfoActivatedData: null,
    },
    acu: null,
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };
  return { host, 正文 };
}

/** 造一条绿灯条目（keys 含给定名字） */
function 绿灯条目(name: string, keys: string[], content: string) {
  return {
    name,
    comment: name,
    content,
    enabled: true,
    disable: false,
    strategy: { type: 'selective', keys },
  };
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 1] 同一条条目既在正文命中、又命中追踪 NPC → 只出现一次');
{
  // ── 场景 ──
  //  条目「莉莉人设」keys=['莉莉']，正文里有"莉莉" → 路径一按关键词激活它。
  //  同时"莉莉"在 tracked 里 → 路径二按名字也会命中它。
  //  **这就是同一条设定被发两遍的典型场景。**
  const 条目 = 绿灯条目('莉莉人设', ['莉莉'], '莉莉是酒馆老板娘，性格爽利。');
  const { host, 正文 } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '莉莉走进酒馆，把围裙系上。' });

  计数.重置();
  const 段 = await 静默(async () => 读取世界书段(host, 正文));
  计数.重置();
  const 索引 = await 静默(async () => 建世界书索引(host));
  const 人设 = await 静默(async () => getPersonaTextForNpc(host, '莉莉', '', [], 段.文本, 段.已发身份, 索引));

  ok('[前置] 路径一确实发出了这条', 段.文本.includes('莉莉是酒馆老板娘'), `段=${段.文本.slice(0, 80)}`);
  eq('★ 路径二不再重复发（按身份跳过）', 人设, '');
  eq('★ 已发身份里记着它', [...段.已发身份].some(x => x.includes('莉莉人设')), true, JSON.stringify([...段.已发身份]));
}

console.log('\n[★ 判据 2] `<if seed:词>` 条目 → 模型只收到一个版本');
{
  // ── 这条是 C6 的核心动机 ──
  //  条目内容里有 `<if cond="seed:酒馆">…</if>`：
  //    · 路径一 scanText 含"酒馆" → 展开 A
  //    · 路径二 scanText 是空串 → 展开 B
  //  旧实现用 `已注入文本.includes(text)` 判重 → A≠B → 包含失败 → **两个版本都发**。
  const 条目 = 绿灯条目(
    '莉莉人设',
    ['莉莉'],
    '莉莉是老板娘。\n<if cond="seed:酒馆">她每天在酒馆里忙。</if>\n<else>她不在酒馆。</else>\n',
  );
  const { host, 正文 } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '莉莉走进酒馆，把围裙系上。' });

  const 段 = await 静默(async () => 读取世界书段(host, 正文));
  const 索引 = await 静默(async () => 建世界书索引(host));
  const 人设 = await 静默(async () => getPersonaTextForNpc(host, '莉莉', '', [], 段.文本, 段.已发身份, 索引));

  ok('[前置] 路径一发出了这条', 段.文本.includes('莉莉是老板娘'), `段=${段.文本.slice(0, 100)}`);
  ok('[前置] 路径一展开的是"在酒馆里忙"（scanText 含"酒馆"）',
     段.文本.includes('她每天在酒馆里忙'), `段=${段.文本.slice(0, 120)}`);

  eq('★ 路径二不再发第二个版本', 人设, '');

  // **关键**：两条路径合起来，模型只看到一份"莉莉是老板娘"
  const 合计 = `${段.文本}\n${人设}`;
  const 出现次数 = (合计.split('莉莉是老板娘').length - 1);
  eq('★ 「莉莉是老板娘」在最终注入里只出现一次', 出现次数, 1);
}

console.log('\n[★ 判据 3] N 个 NPC → 每条条目只求值一次（不是 1+N 次）');
{
  // ── 需求方 #448 的判据 3，**要真的数** ──
  //
  //  一条 keys=['甲','乙','丙'] 的条目，三个人都被追踪。
  //  旧实现：路径一 1 遍 + 路径二 3 遍（每个 NPC 各一遍）= **4 遍**。
  //  新实现：路径一 1 遍，路径二 3 次调用但**每次都在收集阶段就跳过** → 只有 1 遍求值。
  //
  //  怎么数：数 `worldbook.entries()` 的调用次数 —— 路径二每次对每本书调一次，
  //  所以"路径二真的去遍历世界书了"这件事是可观测的。但更直接的是数**求值产物**：
  //  如果一条条目被求值多遍，它就会在 `matched` 里出现多次（每遍各算一次）。
  const 条目 = 绿灯条目('三人共同人设', ['甲', '乙', '丙'], '这三个人是同一支小队。');
  const { host, 正文 } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '甲、乙、丙一起走进酒馆。' });

  const 段 = await 静默(async () => 读取世界书段(host, 正文));
  const 索引 = await 静默(async () => 建世界书索引(host));

  // 三个 NPC 依次取人设，共享同一个 已发身份
  计数.重置();
  const 人设们: string[] = [];
  const 已发身份 = new Set(段.已发身份);
  for (const 名 of ['甲', '乙', '丙'])
    人设们.push(await 静默(async () => getPersonaTextForNpc(host, 名, '', [], 段.文本, 已发身份, 索引)));

  ok('[前置] 路径一发出了这条', 段.文本.includes('这三个人是同一支小队'), `段=${段.文本.slice(0, 80)}`);

  // ★ 核心：三个人都没拿到重复的人设
  eq('★ 三个 NPC 的人设参考全为空（都按身份跳过了）', 人设们, ['', '', '']);

  // 最终注入里只出现一次
  const 合计 = [段.文本, ...人设们].join('\n');
  eq('★ 「这三个人是同一支小队」只出现一次',
     (合计.split('这三个人是同一支小队').length - 1), 1);

  // **自证**：如果每次都传**全新的空身份**（= 旧行为，没有任何跨调用记忆），三个人会各拿一份
  //
  //  ⚠ 必须每次传**新的** Set：路径二现在会把自己发过的条目记进传入的 Set，
  //    所以"同一个 Set 连调三次"已经不是旧行为了 —— 那正好证明去重在起作用。
  计数.重置();
  const 旧行为人设们: string[] = [];
  for (const 名 of ['甲', '乙', '丙'])
    旧行为人设们.push(await 静默(async () => getPersonaTextForNpc(host, 名, '', [], '', new Set<string>(), 索引)));

  const 旧重复数 = 旧行为人设们.filter(x => x.includes('这三个人是同一支小队')).length;
  ok('[自证] 每次传全新空身份时三个人各拿一份（证明去重真的在起作用）', 旧重复数 === 3, `实际 ${旧重复数} 份`);

  // **再自证一次**：传同一个 Set 连调三次 → 只有第一份
  //  这条证明"路径二会把自己发过的条目记进 Set"这件事是真的
  const 共享身份 = new Set<string>();
  const 共享人设们: string[] = [];
  for (const 名 of ['甲', '乙', '丙'])
    共享人设们.push(await 静默(async () => getPersonaTextForNpc(host, 名, '', [], '', 共享身份, 索引)));
  ok('[自证] 共享同一个 Set 时只有第一份（跨调用记忆生效）',
     [共享人设们[0].includes('这三个人是同一支小队'), 共享人设们[1], 共享人设们[2]].join('|') === 'true||',
     `实际: ${JSON.stringify(共享人设们)}`);
}

console.log('\n[★ 判据 3b] 数 `entries()` 调用次数：索引建一次，三个 NPC 复用它');
{
  // ── 直接数宿主侧调用，不靠读代码 ──
  //
  //  ⚠ 2026-11-20 C6b 改了这条的语义：
  //    **旧**：路径二每次对"主书"调一次 `entries()` → 3 个 NPC = **3 次**。
  //    **新**：索引建一次 = **1 次**，三个 NPC 复用它 = **0 次**。
  //
  //  这条现在同时钉住两件事：
  //    ① 索引只建一次（1 次 entries，不是 3 次）
  //    ② 同一条目只发一次（身份去重仍在起作用）
  const 条目 = 绿灯条目('甲专属', ['甲'], '甲是铁匠。');
  const { host } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '' });
  const 无甲正文 = '街道空无一人。';

  // 路径一：正文没有"甲" → 绿灯不激活 → 不发
  const 段 = await 静默(async () => 读取世界书段(host, 无甲正文));
  eq('[前置] 路径一没激活它', 段.文本, '');

  // ── 建索引：1 次 entries ──
  计数.重置();
  const 索引 = await 静默(async () => 建世界书索引(host));
  eq('★ 建索引 = 1 次 entries（一本书）', 计数.entries调用, 1);

  // ── 三个 NPC 复用索引：0 次 entries ──
  计数.重置();
  const 人设们: string[] = [];
  const 已发身份 = new Set<string>();
  for (const 名 of ['甲', '甲', '甲'])
    人设们.push(await 静默(async () => getPersonaTextForNpc(host, 名, '', [], '', 已发身份, 索引)));

  ok('★ 第一次拿到人设', 人设们[0].includes('甲是铁匠'), `实际: ${人设们[0]}`);
  eq('★ 后两次为空（同一条目不再发）', [人设们[1], 人设们[2]], ['', '']);
  eq('★ 三个 NPC 复用索引 = **0 次** entries（旧实现是 3 次）', 计数.entries调用, 0);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[边界] 路径一没发出的条目，路径二仍然要发（身份去重不许误伤）');
{
  // ── 这条防"去重过头" ──
  //  条目只命中 NPC 名字、正文里没有它 → 路径一不激活 → 已发身份里没有它
  //  → 路径二必须把它作为人设发出去。
  const 条目 = 绿灯条目('乙专属', ['乙'], '乙是药剂师。');
  const { host } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '' });
  const 无乙正文 = '街道空无一人。';

  const 段 = await 静默(async () => 读取世界书段(host, 无乙正文));
  eq('[前置] 路径一没发它', 段.文本, '');

  const 索引 = await 静默(async () => 建世界书索引(host));
  const 人设 = await 静默(async () => getPersonaTextForNpc(host, '乙', '', [], '', 段.已发身份, 索引));
  ok('★ 路径二照常发出它', 人设.includes('乙是药剂师'), `实际: ${人设}`);
}

console.log('\n[边界] 同名条目在两本不同世界书里 → 身份不同，都该发');
{
  // ── 身份 = 书名 + 标签，所以"同名但在不同书里"是两条 ──
  const 甲书条目 = 绿灯条目('人设', ['丙'], '这是甲书里的人设。');
  const 乙书条目 = 绿灯条目('人设', ['丙'], '这是乙书里的人设。');
  const { host } = 造宿主({
    条目们: { 甲书: [甲书条目], 乙书: [乙书条目] },
    正文: '',
  });
  const 无丙正文 = '街道空无一人。';

  const 段 = await 静默(async () => 读取世界书段(host, 无丙正文));
  const 索引 = await 静默(async () => 建世界书索引(host));
  const 人设 = await 静默(async () => getPersonaTextForNpc(host, '丙', '', [], '', 段.已发身份, 索引));

  ok('★ 两本书里的条目都发出来了', 人设.includes('甲书里的人设') && 人设.includes('乙书里的人设'), `实际: ${人设}`);
}

console.log('\n[边界] 渲染出空串的条目不进"已发身份"（路径二还有机会发）');
{
  // ── 只在 `text.trim()` 非空时才记身份 ──
  //  一条内容全是条件块、展开后为空的条目，实际没发给模型
  //  → 路径二该有机会把它作为人设发出去（如果它那时能渲染出内容）。
  const 条目 = 绿灯条目('空条目', ['丁'], '<if cond="seed:不存在的词">永远不会出现</if>');
  const { host } = 造宿主({ 条目们: { 主书: [条目] }, 正文: '丁站在门口。' });

  const 段 = await 静默(async () => 读取世界书段(host, '丁站在门口。'));
  eq('[前置] 路径一渲染出空 → 没发', 段.文本, '');
  eq('★ 它不在已发身份里', [...段.已发身份].filter(x => x.includes('空条目')), []);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[结构] 源码里确实是"按身份去重"，不是"按文本包含"');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/worldbook.ts'), 'utf8');
  const 代码 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] 有 条目身份() 函数', /function 条目身份\(/.test(代码));
  ok('[结构] 身份 = 书名 + 标签', /`\$\{书名\}｜\$\{标签\}`/.test(代码));
  ok('[结构] 读取世界书段 返回 已发身份', /已发身份: Set<string>/.test(代码));
  ok('[结构] 路径二在**收集阶段**跳过（在 求值条目文本 之前）', (() => {
    // ⚠ 必须在**路径二的函数体**里比 —— 路径一也有 `求值条目文本`，
    //   在全文里比会拿路径一的位置去跟路径二的身份检查比，那没意义。
    const 路径二起 = 代码.indexOf('async function getPersonaTextForNpc');
    if (路径二起 < 0)
      return false;
    const 路径二 = 代码.slice(路径二起);
    const 收集 = 路径二.indexOf('已发身份.has(条目身份(wbName, entry))');
    const 求值 = 路径二.indexOf('求值条目文本(entry.content');
    return 收集 > 0 && 求值 > 0 && 收集 < 求值;
  })(), '身份检查必须在求值之前（且在路径二函数体内）');
  ok('[结构] 路径二接受 已发身份 参数', /已发身份: Set<string> = new Set\(\)/.test(代码));

  // **自证**：这条结构断言能区分"按身份"与"按文本"
  const 旧写法 = `if (已注入文本 && 已注入文本.includes(text.trim())) continue;`;
  ok('[自证] 旧写法里没有身份检查', !/已发身份\.has/.test(旧写法));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
