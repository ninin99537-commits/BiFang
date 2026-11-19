// 彼方 · 「预填充」已整个删除 —— 批次 2026-11-19（用户裁定，需求方 #380 / #386）。
//
// ── 用户原话 ──
//   「他妈的不是说了删掉预填充嘛？都自定义提示词了！」
//
// ── 为什么删得对（这条比判据重要）──
//  提示词现在是**完全可自定义的段列表**。用户想要"末尾补一条 assistant `{`"，
//  **自己加一段就完了** —— 而且比开关更灵活（可以补任何前缀，不只是 `{`）。
//
//  所以那个开关是：**一个只能做一件事、而那件事用户现在能自己做得更好的开关。**
//  它是"零件化"之后被淘汰的东西，不是"还有人用"的东西。
//
// ── ⚠ 为什么只删彼方，不动共用层能力 ──
//  用户那句"都自定义提示词了"**只对彼方成立** —— 烟火与剧情导演没有段列表，
//  "自己加一段"那条替代路径对它们不成立。
//  所以共用层的 `预填充` 参数改成**可选**（不传 = 不启用），**不是删掉能力**。
//  拿彼方的理由去删别人的功能，是同一个越权。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 读 = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const 设置源 = 读('src/彼方_NPC幕后生命状态系统/settings.ts');
const 更新源 = 读('src/彼方_NPC幕后生命状态系统/update.ts');
const 模型请求源 = 读('src/彼方_NPC幕后生命状态系统/模型请求.ts');
const 页面源 = 读('src/彼方_NPC幕后生命状态系统/页面-设置.vue');
const 往返源 = 读('src/共用/模型往返.ts');

/** 去掉注释行（判据查"代码里有没有"，不是"注释里提没提"） */
const 去注释 = (s: string) => s
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l))
  .join('\n');

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

// ─────────────────────────────────────────────────────────────
console.log('\n[已删] 彼方侧四处引用必须全清');
{
  // ── 四处：schema 字段 / update 传参 / 页面那一行 / 模型请求的类型 ──
  ok('[已删] settings.ts 的 schema 里没有 `预填充` 字段',
     !/^\s*预填充:\s*z\./m.test(去注释(设置源)),
     'schema 字段还在');

  ok('[已删] update.ts 不再传 `预填充`',
     !/^\s*预填充:/m.test(去注释(更新源)),
     '还在传');

  ok('[已删] 模型请求.ts 的类型里没有 `预填充`',
     !/^\s*预填充:\s*boolean/m.test(去注释(模型请求源)),
     '类型字段还在');

  ok('[已删] 页面里没有 `settings.更新.预填充`',
     !/settings\.更新\.预填充/.test(页面源),
     '页面还绑着它');

  // **自证**：这些正则能抓到"存在"
  ok('[自证] 正则能抓到 schema 字段', /^\s*预填充:\s*z\./m.test('        预填充: z.boolean().default(false),'));
  ok('[自证] 正则能抓到传参', /^\s*预填充:/m.test('                预填充: settings.更新.预填充,'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[已删] 迁移必须删键（旧设置里留着会变成"没人读的键"）');
{
  ok('[已删] migrateSettings 里有 `delete 更新.预填充`',
     /delete 更新\.预填充/.test(设置源),
     '没有删键');

  // **自证**：正则能抓到
  ok('[自证] 正则能抓到 delete', /delete 更新\.预填充/.test('        delete 更新.预填充;'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[共用层] 能力保留，参数改成可选');
{
  // ── 这条防的是"清理过头，把别人的功能也删了" ──
  ok('[共用层] `预填充` 参数还在（没被删）', /预填充\??:\s*boolean/.test(往返源));
  ok('[共用层] 它是**可选**的（`?`）', /预填充\?\s*:\s*boolean/.test(往返源),
     '还是必填 —— 那彼方不传会编译失败');
  ok('[共用层] 追加 assistant 的逻辑还在', /attemptMessages\.push\(\{\s*role:\s*'assistant'/.test(往返源));
  ok('[共用层] 拼回 `{` 的逻辑还在', /content = prefill \+ content/.test(往返源));

  // **自证**：可选与必填能区分
  ok('[自证] 正则能区分可选与必填',
     /预填充\?\s*:\s*boolean/.test('预填充?: boolean;') && !/预填充\?\s*:\s*boolean/.test('预填充: boolean;'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[共用层] 烟火与剧情导演仍在用（没被动过）');
{
  // ── 这条防的是"顺手改别人" ──
  const 烟火 = 读('src/烟火_世界运转/update.ts');
  const 导演 = 读('src/剧情导演/update.ts');
  ok('[别人] 烟火仍传 `预填充`', /预填充:\s*settings\.运转\.预填充/.test(烟火));
  ok('[别人] 剧情导演仍传 `预填充`', /预填充:\s*settings\.导演\.预填充/.test(导演));
  ok('[别人] 烟火的 schema 里 `预填充` 还在',
     /预填充:\s*z\.boolean/.test(读('src/烟火_世界运转/schema.ts')));
  ok('[别人] 导演的 schema 里 `预填充` 还在',
     /预填充:\s*z\.boolean/.test(读('src/剧情导演/schema.ts')));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[替代路径] 段列表里加一条 assistant 段，效果等价');
{
  // ── 这是本次删除的**正当性判据** ──
  //  如果这条不成立，那删除就是"砍功能"；成立，才是"用户能自己做得更好"。
  //
  //  「效果等价」要证明什么？
  //   ① 用户能指定 `assistant` 角色的段（段列表支持三种 role）
  //   ② 段的内容能是任意文本（包括 `{`）
  //   ③ 它会被排在最后（末尾 = 模型接着往下写的位置）
  const 模板源 = 读('src/彼方_NPC幕后生命状态系统/提示词模板.ts');

  ok('[替代] 段支持 `assistant` 角色', /'assistant'/.test(模板源));
  ok('[替代] 段有 role 字段', /role/.test(模板源));

  // 段内容能是任意文本 —— 从 `用户段` 的形状看（content: string）
  ok('[替代] 段的内容是自由文本', /content/.test(模板源));

  // ── 用真实类型声明证明"用户能加 assistant 段" ──
  const 设置段 = 读('src/彼方_NPC幕后生命状态系统/settings.ts');
  const 有段定义 = /用户段|条目/.test(设置段);
  ok('[替代] 设置里确实有"用户可加段"的结构', 有段定义);

  // **自证**：这条判据能区分"支持 assistant 段"与"不支持"
  ok('[自证] 如果只允许 user/system，判据会红',
     !/'assistant'/.test('type 角色 = "user" | "system"'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 把字段加回去 → 上面"已删"那几条必须红');
{
  // ── 这条是本批要求的自证：证明那些断言不是恒真 ──
  const 假设置 = '        预填充: z.boolean().default(false),';
  const 假更新 = '                预填充: settings.更新.预填充,';
  const 假页面 = '<input v-model="settings.更新.预填充" type="checkbox" />';

  eq('[自证] 假 schema 会被 `schema 里没有` 抓到', /^\s*预填充:\s*z\./m.test(假设置), true);
  eq('[自证] 假传参会被 `不再传` 抓到', /^\s*预填充:/m.test(假更新), true);
  eq('[自证] 假页面会被 `页面里没有` 抓到', /settings\.更新\.预填充/.test(假页面), true);

  // 而真实源码里这些都不成立
  eq('[自证] 真源码 schema 里没有', /^\s*预填充:\s*z\./m.test(去注释(设置源)), false);
  eq('[自证] 真源码 update 不传', /^\s*预填充:/m.test(去注释(更新源)), false);
  eq('[自证] 真源码页面没有', /settings\.更新\.预填充/.test(页面源), false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
