// 彼方 · 条目列表 —— 批次: 2026-11-19（批 B 收尾：列表路径已删）
//
// ── 这个文件现在守什么 ──────────────────────────────────────────────
// 列表路径（`解析位置` / `造内置列表` / `合并成块` …）**已经删了** ——
// 实测（`bifang-probe-listdead.mjs`）证明 `input.条目` 对产物零作用。
//
// 所以本文件只守**仍然生效**的四件事：
//
//   [墓碑] 删掉的那些符号**真的不再导出**（删除也需要墓碑，只是立在测试里）
//   [迁移] `迁移旧段`：自定义段 → 条目，内容一字不改（**不按锚点排**）
//   [转模板] `条目转模板`：条目 → 模板，幂等、不盖已有模板
//   [id] `生成条目id` / `去重条目id`：uuid + 存量去重（撞 id 会删一条删两条）
//
// 外加：
//   [落盘] 迁移必须真的写进存储（不落盘 = 没迁）
//   [临时通道] `input.条目` 已死：拼装函数里不读它
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { buildUpdateMessages } from '../src/彼方_NPC幕后生命状态系统/prompts';
import { 默认模板 } from '../src/彼方_NPC幕后生命状态系统/提示词模板';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

const ROOT = process.cwd();
const 彼方目录 = path.join(ROOT, 'src', '彼方_NPC幕后生命状态系统');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 备注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  FAIL ${名}${备注 ? `  (${备注})` : ''}`);
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
    console.log(`  FAIL ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 去注释（与 人设工坊-形态.test.ts 同一套写法） */
function 去注释(源码: string): string {
  return 源码
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function 列源文件(目录: string): string[] {
  const 结果: string[] = [];
  for (const 名 of readdirSync(目录)) {
    const 全 = path.join(目录, 名);
    if (statSync(全).isDirectory())
      结果.push(...列源文件(全));
    else if (/\.(ts|vue)$/.test(名))
      结果.push(全);
  }
  return 结果;
}

// ─────────────────────────────────────────────────────────────
console.log('\n[墓碑] 列表路径的符号真的不再导出（删除也要有墓碑）');
{
  // ── 这条为什么存在（需求方 #243）──
  //  "以后有人看到 `git log` 里'删了一大堆'会怀疑是不是误删。"
  //  所以把"删掉了什么"也写成断言 —— **删除也需要墓碑，只不过墓碑应该立在测试里，
  //  不是立在界面上。**
  //
  //  ⚠ 判据要能**区分"删了"和"从来没存在过"**：
  //    只断言"现在的文件里没有 X"是不够的 —— 一个从来没写过的符号也满足它。
  //    所以下面每条都配一个**自证**：那段源码确实曾经出现过（用注释里的墓碑段落证明）。
  const 源码 = readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8');
  const 码 = 去注释(源码);

  /** 这些是列表路径的全部导出，2026-11-19 批 B 删除 */
  const 已删 = [
    '造内置列表', '解析位置', '合并成块', '块内用户文本', '零件所在块',
    '零件默认role', '原位序号', '规范条目', '默认列表顺序',
    '用户条目键', '条目输入', '列表项', '内置条目', '用户条目',
    '解析段', '解析输入', '解析结果',
  ];
  // ⚠ 判据用**原文**（`去注释` 会把注释剥掉，而墓碑段落正是注释）
  // ⚠ 边界不能用 `\b` —— JS 的 `\b` 是 **ASCII 词边界**，中文名（`解析位置`）后面
  //   永远不成立，整条断言会静默变成"永远绿"。用 `(?![A-Za-z0-9_])`。
  const 名边界 = (名: string) => `${名}(?![A-Za-z0-9_])`;
  const 还导出 = 已删.filter(名 => new RegExp(`export (?:function|const|type|interface) ${名边界(名)}`).test(源码));
  eq('[墓碑] 这 17 个符号都不再导出', 还导出, []);

  // **自证**：墓碑段落确实在源码里（证明它们真的存在过，不是我从没写过）
  ok('[墓碑/自证] 源码里有墓碑段落（说明它们真的存在过）',
     /条目列表"模型的类型与常量|列表路径已删除/.test(源码), 源码.slice(0, 900));

  // **自证 ②**：判据抓得住 —— 喂一个"还导出"的假源码给它，必须红
  const 假源码 = 'export function 解析位置(输入: any) { return {}; }';
  ok('[墓碑/自证] 判据抓得住"还导出"的写法',
     new RegExp(`export (?:function|const|type|interface) ${名边界('解析位置')}`).test(假源码));

  // 留下的四个**必须还在**（它们是仍然生效的）
  const 必须留 = ['迁移旧段', '条目转模板', '生成条目id', '去重条目id'];
  const 缺 = 必须留.filter(名 => !new RegExp(`export function ${名边界(名)}`).test(源码));
  eq('[墓碑] 仍然生效的四个函数都还在', 缺, []);
  // 且**只有这四个** —— 没有残留的第五个导出
  // ⚠ 名字要取到 `(` 之前：`\S+` 会连参数一起吃掉（`生成条目id(已用?:`），
  //   那样"恰好只剩这四个"会永远红。用 `[A-Za-z0-9_一-龥]+` 限定。
  const 全部导出 = [...源码.matchAll(/^export (?:function|const|type|interface) ([A-Za-z0-9_\u4e00-\u9fa5]+)/gm)].map(m => m[1]);
  eq('[墓碑] 文件里恰好只剩这四个导出', 全部导出.sort(), [...必须留].sort());
}

// ─────────────────────────────────────────────────────────────
console.log('\n[墓碑] 列表路径不再被任何生产代码引用');
{
  // 上一条验"不再导出"，这条验"没人 import"—— 两者不是一回事：
  // 符号可能已经删了，但某个文件还写着 `import { 解析位置 }`（那会编译失败）。
  // 所以这条扫全部源文件的 import 语句。
  const 死名 = ['造内置列表', '解析位置', '合并成块', '块内用户文本', '零件所在块', '零件默认role', '原位序号'];
  // ⚠ 同一条坑：`\b` 对中文不生效，用 `(?![A-Za-z0-9_])`
  const 名边界 = (名: string) => `${名}(?![A-Za-z0-9_])`;
  const 命中: string[] = [];
  for (const 文件 of 列源文件(path.join(ROOT, 'src'))) {
    const 相对 = path.relative(ROOT, 文件).replace(/\\/g, '/');
    const 码 = 去注释(readFileSync(文件, 'utf8'));
    for (const 名 of 死名) {
      // 只看 import 语句里有没有它（避免误伤注释与字符串）
      if (new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*${名边界(名)}[^}]*\\}\\s*from`).test(码))
        命中.push(`${相对} import 了 ${名}`);
    }
  }
  eq('[墓碑] 没有源文件 import 已删的符号', 命中, []);
  // 自证：判据抓得住
  ok('[墓碑/自证] import 已删符号会被抓到',
     new RegExp(`import\\s+(?:type\\s+)?\\{[^}]*${名边界('解析位置')}[^}]*\\}\\s*from`)
       .test("import { 解析位置 } from './条目列表';"));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[临时通道] input.条目 已死：拼装函数里不读它');
{
  const 源码 = 去注释(readFileSync(path.join(彼方目录, 'prompts.ts'), 'utf8'));
  ok('[临时通道] prompts.ts 里没有 (input as any).条目', !/\(input as any\)\.条目/.test(源码));
  ok('[临时通道/自证] 旧写法会被抓到', /\(input as any\)\.条目/.test('const x = (input as any).条目;'));

  // ── 核心判据：**行为断言**比类型断言更硬 ──
  const 拼装段 = 源码.slice(源码.indexOf('function 拼装并收尾'), 源码.indexOf('export function buildUpdateMessages'));
  ok('[临时通道] 拼装函数里不读 input.条目', !/input\.条目/.test(拼装段),
    (拼装段.match(/input\.条目[^\n]*/g) || []).join(' | '));
  ok('[临时通道] 拼装函数里不读 input.条目顺序', !/input\.条目顺序/.test(拼装段));
  // **且没有"内置内容"这类字段**（C11 的结构保证：外部传不进内置内容）
  const 入参段 = 源码.slice(源码.indexOf('interface 更新提示词入参'), 源码.indexOf('interface 内部入参'));
  ok('[临时通道] 入参里没有 内置内容/覆写 这类字段',
    !/内置内容|覆写|内置条目/.test(入参段), 入参段.slice(-400));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[迁移] 自定义段 → 条目：内容一字不改（**不按锚点排**）');
{
  // ── 这条 2026-11-19 改过一次，原因要写清 ──
  //  原来断言"按块边界插"（最前在最前、主提示词之后紧跟 R5…）。
  //  实测（`bifang-probe-ordering.mjs`）证明那套**从来没生效**：
  //  `条目转模板` 只读 `条目` 数组，**从不读 `条目顺序`**。
  //
  //  所以现在断言的是**真实行为**：按数组顺序追加，**不按锚点**。
  //  ⚠ 这件事**删之前就已经如此** —— 这批不改变任何用户可见行为。
  const { 迁移旧段 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');

  // ① 五段全迁过去，内容一字不改
  {
    const 提示词: any = {
      自定义段: [
        { 锚点: '最前', role: 'system', content: '【最前段】', 启用: true },
        { 锚点: '主提示词之后', role: 'user', content: '【规则后段】', 启用: true },
        { 锚点: '任务之前', role: 'assistant', content: '【任务前段】', 启用: true },
        { 锚点: '任务之后', role: 'system', content: '【任务后段】', 启用: false },
        { 锚点: '最后', role: 'system', content: '【最后段】', 启用: true },
      ],
    };
    const 数 = 迁移旧段(提示词);
    eq('[迁移] 五段全迁过去', 数, 5);
    eq('[迁移] 条目数 = 5', 提示词.条目.length, 5);
    eq('[迁移] 五段内容逐字保留',
      [...提示词.条目].map((x: any) => x.content).sort(),
      ['【最前段】', '【规则后段】', '【任务前段】', '【任务后段】', '【最后段】'].sort());
    const 按内容 = (s: string) => 提示词.条目.find((x: any) => x.content === s);
    eq('[迁移] role 原样保留(user)', 按内容('【规则后段】').role, 'user');
    eq('[迁移] role 原样保留(assistant)', 按内容('【任务前段】').role, 'assistant');
    eq('[迁移] 启用=false 原样保留', 按内容('【任务后段】').启用, false);
    eq('[迁移] 启用=true 原样保留', 按内容('【最前段】').启用, true);
    eq('[迁移] 旧段已清空', 提示词.自定义段, []);
    ok('[迁移] 每条都有 id', 提示词.条目.every((x: any) => typeof x.id === 'string' && x.id.length > 0));
    ok('[迁移] id 互不相同', new Set(提示词.条目.map((x: any) => x.id)).size === 5);
  }

  // ② **按数组顺序追加，不按锚点**（这是真实行为，不是缺陷）
  {
    const 提示词: any = {
      自定义段: [
        // 故意把"最后"写在最前面 —— 若真按锚点排，它会跑到末尾
        { 锚点: '最后', role: 'system', content: 'E' },
        { 锚点: '最前', role: 'system', content: 'A' },
        { 锚点: '任务之后', role: 'system', content: 'D' },
      ],
    };
    迁移旧段(提示词);
    eq('[迁移] 按数组顺序，不按锚点', 提示词.条目.map((x: any) => x.content), ['E', 'A', 'D']);
    // ⚠ 这条**故意断言"没排序"**：它记录的是真实行为。
    //   若以后有人把锚点排序加回来，这条会红 —— 那时他应该先问"为什么要加"。
    ok('[迁移] 不按锚点排（E 在最前，而不是最后）', 提示词.条目[0].content === 'E');
    // 锚点字段仍然留着（数据没丢，只是没人读它）
    eq('[迁移] 锚点字段原样保留', 提示词.条目[0].锚点, '最后');
    // 不再写 `条目顺序`（那是"白算"的产物）
    eq('[迁移] 不再写 条目顺序', 提示词.条目顺序, undefined);
  }

  // ③ 幂等
  {
    const 提示词: any = { 自定义段: [{ 锚点: '最后', role: 'system', content: 'X' }] };
    迁移旧段(提示词);
    const 快照 = JSON.stringify(提示词);
    eq('[迁移] 第二次跑返回 0（幂等）', 迁移旧段(提示词), 0);
    eq('[迁移] 第二次跑数据不变', JSON.stringify(提示词), 快照);
  }

  // ④ 没有旧段时什么都不做
  {
    const 提示词: any = { 自定义段: [], 条目: [{ id: 'a', content: 'A' }] };
    const 快照 = JSON.stringify(提示词);
    eq('[迁移] 没有旧段 → 0', 迁移旧段(提示词), 0);
    eq('[迁移] 没有旧段 → 数据不变', JSON.stringify(提示词), 快照);
  }

  // ⑤ 坏数据不炸
  {
    eq('[迁移] null → 0', 迁移旧段(null), 0);
    eq('[迁移] 自定义段不是数组 → 0', 迁移旧段({ 自定义段: 'nope' }), 0);
    eq('[迁移] 段里有 null → 不炸', 迁移旧段({ 自定义段: [null] }), 0);
  }

  // ⑥ 旧的「零件位置」字段已彻底删除 —— 传了也没反应
  {
    const 提示词: any = { 零件位置: { D2: '最前' }, 自定义段: [] };
    eq('[迁移] 零件位置 不再触发迁移', 迁移旧段(提示词), 0);
    eq('[迁移] 它不再产出条目', 提示词.条目, undefined);
    ok('[迁移/自证] 认它的旧版本会产出 1 条', 迁移旧段({
      自定义段: [{ 锚点: '最前', role: 'system', content: 'x' }],
    }) === 1);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[转模板] 条目 → 模板：幂等、不盖已有模板、内容一字不改');
{
  const { 条目转模板 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');

  // ① 有条目、没模板 → 迁
  {
    const 提示词: any = {
      条目: [
        { id: 'a', role: 'system', content: '【系统一】', 启用: true },
        { id: 'b', role: 'user', content: '【用户一】', 启用: true },
      ],
      条目顺序: ['a', 'b'],
    };
    eq('[转模板] 迁了 2 条', 条目转模板(提示词), 2);
    ok('[转模板] 模板生成了', Array.isArray(提示词.模板) && 提示词.模板.length > 0);
    ok('[转模板] 系统条目的内容在段列表里', 提示词.模板.some((段: any) => 段.content.includes('【系统一】')));
    ok('[转模板] 用户条目的内容在段列表里', 提示词.模板.some((段: any) => 段.content.includes('【用户一】')));
    eq('[转模板] 条目已清空', 提示词.条目, []);
    eq('[转模板] 条目顺序已清空', 提示词.条目顺序, []);
    // ② 幂等
    const 快照 = JSON.stringify(提示词);
    eq('[转模板] 第二次跑返回 0（幂等）', 条目转模板(提示词), 0);
    eq('[转模板] 第二次跑数据不变', JSON.stringify(提示词), 快照);
  }

  // ③ 已有模板 → 不动（迁错比不迁更糟：会盖掉用户手改的东西）
  {
    const 提示词: any = {
      模板: [{ id: 'x', role: 'system', content: '我改过的' }],
      条目: [{ id: 'a', role: 'system', content: '【不该并入】', 启用: true }],
      条目顺序: ['a'],
    };
    eq('[转模板] 已有模板时不动', 条目转模板(提示词), 0);
    eq('[转模板] 已有模板没被盖掉', 提示词.模板[0].content, '我改过的');
    ok('[转模板] 条目也没被清（留给用户自己看）', 提示词.条目.length === 1);
    // ⚠ 这个"不动"正是拼装页「并入模板」按钮存在的理由（需求方 #239 ①）
  }

  // ④ 全是禁用/空条目 → 清空但不生成模板
  {
    const 提示词: any = {
      条目: [{ id: 'a', role: 'system', content: '', 启用: true }],
      条目顺序: ['a'],
    };
    eq('[转模板] 全空条目 → 0', 条目转模板(提示词), 0);
    eq('[转模板] 但条目已清空（避免每次白跑）', 提示词.条目, []);
  }

  // ⑤ 坏数据不炸
  {
    eq('[转模板] null → 0', 条目转模板(null), 0);
    eq('[转模板] 条目不是数组 → 0', 条目转模板({ 条目: 'nope' }), 0);
    eq('[转模板] 条目里有 null → 不炸', 条目转模板({ 条目: [null] }), 0);
  }

  // ⑥ 迁移链真的接上了（自定义段 → 条目 → 模板，内容活到最后）
  {
    const { 迁移旧段 } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');
    const 提示词: any = { 自定义段: [{ 锚点: '最后', role: 'system', content: '迁移标记-末段' }] };
    迁移旧段(提示词);
    ok('[迁移链] 自定义段变成了条目', Array.isArray(提示词.条目) && 提示词.条目.length > 0);
    const 转了 = 条目转模板(提示词);
    eq('[迁移链] 条目转成了模板', 转了, 1);
    ok('[迁移链] 模板里含旧段的内容',
       提示词.模板.some((段: any) => String(段.content).includes('迁移标记-末段')));

    // 端到端：那个模板真的能产出含该内容的产物
    const 原I = console.info;
    const 原T = console.table;
    console.info = () => {};
    console.table = () => {};
    let r;
    try {
      r = buildUpdateMessages({
        reply: '剧情', replyCount: 1, context: '', timeJump: '', tracked: ['甲'], inSceneHint: [],
        currentCards: { 甲: { 当前在做: 'x' } }, autoTrackEnabled: true, physioEnabled: false,
        恋爱对象名单: [], 自定义段: [], 预填充: false, worldbook: '', currentStoryTime: '',
        storyTimeHint: '', storySpan: '', recentTrace: '', playerName: 'P', playerDescription: '',
        展开宏: (t: string) => t,
        模板: 提示词.模板,
      } as any);
    }
    finally {
      console.info = 原I;
      console.table = 原T;
    }
    ok('[迁移链] 迁完的内容确实进了产物', r.messages.some(m => m.content.includes('迁移标记-末段')),
      JSON.stringify(r.messages.map(m => m.content.slice(0, 20))));
  }

  // ⑦ 迁移真的调了它们（源码断言）
  const 设置源码 = readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8');
  ok('[迁移链] migrateSettings 调了 迁移旧段', /迁移旧段\s*\(/.test(设置源码));
  ok('[迁移链] migrateSettings 调了 条目转模板', /条目转模板\s*\(/.test(设置源码));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[id] 条目 id 用 uuid；存量重复 id 在加载时清掉');
{
  const { 生成条目id, 去重条目id } = await import('../src/彼方_NPC幕后生命状态系统/条目列表');

  // ① 连造 200 个 id 必须全部不同
  const 已见 = new Set<string>();
  for (let i = 0; i < 200; i++) 已见.add(生成条目id());
  eq('[id] 连造 200 个全部不同', 已见.size, 200);

  // ② 源码：不许有模块级自增计数器（重挂会归零）
  const 源码 = 去注释(readFileSync(path.join(彼方目录, '条目列表.ts'), 'utf8'));
  ok('[id] 没有模块级自增计数器', !/^\s*let\s+\w*序号/m.test(源码));
  ok('[id] 用 crypto.randomUUID', /randomUUID/.test(源码));

  // ③ 存量去重：两条同 id → 清成两个不同 id
  {
    const 提示词: any = {
      条目: [
        { id: 'dup', role: 'system', content: 'A', 启用: true },
        { id: 'dup', role: 'user', content: 'B', 启用: true },
      ],
      条目顺序: ['dup', 'dup'],
    };
    const 数 = 去重条目id(提示词);
    eq('[存量] 发现了 1 条重复', 数, 1);
    eq('[存量] 去重后 id 互不相同', new Set(提示词.条目.map((x: any) => x.id)).size, 2);
    // 内容没丢（这是"去重不是删数据"的硬证据）
    eq('[存量] 两条内容都在', 提示词.条目.map((x: any) => x.content).sort(), ['A', 'B']);
    // ⚠ `去重条目id` 本身**不打日志**（它是个纯函数，函数注释里写明了"为什么不在这里 warn"）。
    //   留痕由调用方 `settings.ts` 的 `只喊一次` 负责 —— 所以断言打在那边。
    const 设置源码 = readFileSync(path.join(彼方目录, 'settings.ts'), 'utf8');
    ok('[存量] 留痕在调用方（settings.ts 有 warn）',
       /重复.*已重新分配|已重新分配/.test(设置源码),
       (设置源码.match(/[^\n]*重新分配[^\n]*/g) || []).join(' | '));
    // 幂等：再跑一次什么都不做
    eq('[存量] 再跑一次返回 0', 去重条目id(提示词), 0);
  }

  // ④ 没有重复时不动
  {
    const 提示词: any = { 条目: [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }] };
    const 快照 = JSON.stringify(提示词);
    eq('[存量] 没重复 → 0', 去重条目id(提示词), 0);
    eq('[存量] 没重复 → 数据不变', JSON.stringify(提示词), 快照);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[落盘] 迁移必须真的写进存储（不落盘 = 没迁）');
{
  // ── 为什么这两条必须单独测（验收 2026-11-19 登记的缺口）──
  //  迁移改的是 `getVariables()` 返回的**深拷贝**（酒馆助手 variables.ts 里 `klona`）。
  //  所以"改完不落盘"就等于**什么都没做** —— 下次读到的还是旧数据，再迁一遍再丢掉。
  //  这是我自己写断言时才发现的 bug（此前只看到 warn 刷屏那个表象）。
  const { getSettings, invalidateReadCache } = await import('../src/彼方_NPC幕后生命状态系统/settings');
  const { 彼方假宿主 } = await import('./helpers/彼方假宿主');

  /** 造一个带旧数据的假宿主：`自定义段` 里有一段 */
  const 造旧宿主 = () => {
    const { host, 存 } = 彼方假宿主({ 模型回复: [] });
    存.global['彼方_settings'] = {
      提示词: {
        自定义段: [{ 锚点: '最后', role: 'system', content: '旧段-标记' }],
      },
    };
    invalidateReadCache();
    return { host, 存 };
  };

  // ① 再读是迁移后的（判据：自定义段已空、**模板**有内容）
  {
    const { host, 存 } = 造旧宿主();
    getSettings(host); // 第一次读 → 触发迁移 → 落盘
    const 落盘后 = 存.global['彼方_settings'];
    eq('[落盘] 存储里的 自定义段 已清空', 落盘后?.提示词?.自定义段, []);
    const 模板 = 落盘后?.提示词?.模板 ?? [];
    ok('[落盘] 存储里出现了 模板', Array.isArray(模板) && 模板.length > 0);
    const 内容们 = 模板.map((x: any) => String(x.content));
    ok('[落盘] 旧段的内容仍在模板里（迁移不是删除数据）',
      内容们.some((t: string) => t.includes('旧段-标记')),
      JSON.stringify(内容们.map((t: string) => t.slice(0, 30))));

    // 再读一次必须看到迁移后的（不是又回到旧数据）
    invalidateReadCache();
    const 再读 = getSettings(host);
    eq('[落盘] 再读时 自定义段 仍是空的（没有回到旧数据）', 再读.提示词?.自定义段, []);
    ok('[落盘] 再读时 模板 还在', (再读.提示词?.模板 ?? []).length > 0);
  }

  // ② 只写一次（幂等：第二次读不该再写）
  {
    const { host } = 造旧宿主();
    let 写入次数 = 0;
    const 原update = host.vars.update;
    host.vars.update = (fn: any, arg: any) => {
      if (arg?.type === 'global')
        写入次数++;
      return 原update(fn, arg);
    };
    getSettings(host);
    const 首次 = 写入次数;
    ok('[落盘] 迁移时写了盘', 首次 > 0, `写入 ${首次} 次`);
    invalidateReadCache();
    getSettings(host);
    eq('[落盘] 第二次读不再写（幂等）', 写入次数, 首次);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[并页] 设置页 04 提示词 有引导，不静默消失');
{
  const 设置页 = readFileSync(path.join(彼方目录, '页面-设置.vue'), 'utf8');
  ok('[并页] 设置页提到了拼装页', /拼装/.test(设置页));
  ok('[并页] 有指向拼装页的入口或说明', /提示词/.test(设置页));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[样式] 拼装页沿用设置页那套 class，不另起一套');
{
  const 拼装源码 = readFileSync(path.join(彼方目录, '页面-拼装.vue'), 'utf8');
  const 样式表 = readFileSync(path.join(彼方目录, '面板样式.css'), 'utf8');
  const 共享 = ['bf-setting-group', 'bf-set-group', 'bf-set-head', 'bf-set-index', 'bf-set-aside',
    'bf-select', 'bf-select-sm', 'bf-textarea', 'bf-btn', 'bf-btn-sm', 'bf-hint'];
  const 拼装缺 = 共享.filter(类 => !拼装源码.includes(类));
  eq('[样式] 拼装页用齐了那套 class', 拼装缺, []);
  const 未定义 = 共享.filter(类 => !new RegExp(`\\.${类}[\\s,{:]`).test(样式表));
  eq('[样式] 这些 class 都定义在 面板样式.css（全项目同一套）', 未定义, []);
  ok('[样式/自证] 未定义的类会被抓到', new RegExp('\\.bf-不存在[\\s,{:]').test(样式表) === false);
  const 模板 = 拼装源码.slice(拼装源码.indexOf('<template>'), 拼装源码.indexOf('<style'));
  ok('[样式] 模板里不再用 bf-entry-list（自造清单）', !/bf-entry-list/.test(模板));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
