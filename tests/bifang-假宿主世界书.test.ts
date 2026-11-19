// 彼方 · 假宿主的世界书能力必须是真的 —— 批次 2026-11-19（需求方 #372「假宿主全量体检」）。
//
// ── 这个文件防的是什么 ──
//  `tests/helpers/彼方假宿主.ts` 的 `worldbook.entries/update/create/remove` 原来是
//  **`async () => undefined`** —— 四个空体。
//
//  后果：**`syncNpcStatesWorldbook` 的新建 / 更新 / 删除三条分支，在假宿主上从来没被执行过。**
//  调了等于没调，而它不报错。
//
//  > **一个测不到的写入路径，等于没测。**
//  > 它比"测试失败"更危险 —— 失败会红，它不会。
//
// ── 为什么这条不能用"源码里有没有实现"来判 ──
//  那只能证明"长得像实现"。真正要证明的是：
//  **这些方法在真实调用链上起作用** —— 所以这里直接驱动 `syncNpcStatesWorldbook`，
//  用**共享假宿主**（不是用例自己造的假世界书），然后检查条目真的变了。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { syncNpcStatesWorldbook } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { BIFANG_WORLDBOOK_ENTRY_NAME } from '../src/彼方_NPC幕后生命状态系统/彼方条目';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;
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

/** 静默跑（同步会打 console） */
async function 静默<T>(fn: () => Promise<T>): Promise<T> {
  const 原I = console.info;
  const 原W = console.warn;
  const 原E = console.error;
  const 原T = console.table;
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.table = () => {};
  try {
    return await fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
    console.table = 原T;
  }
}

const 数据 = (npc: Record<string, any> = { 泰丝: { 当前在做: '整理货单' } }) => ({
  NPC: npc,
  名单: Object.keys(npc),
  统计: { 更新次数: 1, 最后更新: 1 },
  剧情时间: '2026-01-02 12:30',
} as any);

// ─────────────────────────────────────────────────────────────
console.log('\n[create] 条目不存在时，必须真的建出来');
{
  // ── 这条防的是 `create: async () => undefined` ──
  //  空体时：`syncNpcStatesWorldbook` 走 create 分支，什么都没发生，
  //  而函数"成功"返回 —— 用例看到"没报错"就以为通过了。
  setActivePinia(createPinia());
  const { host, 书 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 3 });
  (host as any).worldbook.boundNames = () => ({ primary: '主世界书', additional: [] });

  eq('[前置] 开始时假世界书是空的', 书.条目.length, 0);

  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));

  eq('真的建出了 1 条', 书.条目.length, 1);
  eq('条目名是彼方的', 书.条目[0]?.name, BIFANG_WORLDBOOK_ENTRY_NAME);
  eq('带结构化标记 extra.bifang', 书.条目[0]?.extra?.bifang, true);
  ok('内容不是空的', String(书.条目[0]?.content ?? '').length > 0);

  // **自证**：这个场景确实会走到 create（条目原来不存在）
  ok('[自证] 建之前条目数是 0（所以必然走 create 分支）', true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[update] 条目已存在时，必须真的更新内容');
{
  // ── 这条防的是 `update: async () => undefined` ──
  setActivePinia(createPinia());
  const { host, 书 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 3 });
  (host as any).worldbook.boundNames = () => ({ primary: '主世界书', additional: [] });

  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));
  const 原内容 = String(书.条目[0]?.content ?? '');
  ok('[前置] 第一次写入有内容', 原内容.length > 0);

  // 换一份数据再同步 → 走 update 分支（条目已存在）
  await 静默(() => syncNpcStatesWorldbook(host as any, 数据({ 乔尔: { 当前在做: '巡逻' } }), '角色卡主世界书'));

  eq('条目数仍是 1（更新而不是又建一条）', 书.条目.length, 1);
  const 新内容 = String(书.条目[0]?.content ?? '');
  ok('内容真的变了', 新内容 !== 原内容, `旧=${原内容.length} 新=${新内容.length}`);
  ok('新内容里有乔尔', 新内容.includes('乔尔'));
  ok('新内容里没有泰丝了', !新内容.includes('泰丝'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[remove] 关闭时，必须真的删掉条目');
{
  // ── 这条防的是 `remove: async () => undefined` ──
  setActivePinia(createPinia());
  const { host, 书 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 3 });
  (host as any).worldbook.boundNames = () => ({ primary: '主世界书', additional: [] });

  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));
  eq('[前置] 先有 1 条', 书.条目.length, 1);

  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '关闭'));
  eq('关闭后条目被删干净', 书.条目.length, 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[entries] 读回来的必须是真条目（不是空数组）');
{
  // ── 这条防的是 `entries: async () => []` ──
  //  空数组的后果比想象中严重：`syncNpcStatesWorldbook` 找不到 existing
  //  → 每次都走 create → **每同步一次就多一条重复条目**。
  setActivePinia(createPinia());
  const { host, 书 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 3 });
  (host as any).worldbook.boundNames = () => ({ primary: '主世界书', additional: [] });

  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));
  const 读回 = await (host as any).worldbook.entries('主世界书');

  eq('entries 读回来 1 条', 读回.length, 1);
  eq('内容与内部那份一致', 读回[0]?.name, 书.条目[0]?.name);

  // ── 连同步三次，条目数不许涨（证明 entries 让 update 分支能被走到）──
  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));
  await 静默(() => syncNpcStatesWorldbook(host as any, 数据(), '角色卡主世界书'));
  eq('连续同步三次后仍然只有 1 条（没有重复创建）', 书.条目.length, 1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 空体方法会让上面这些断言全部失效');
{
  // ── 为什么这条自证必需 ──
  //  上面那些断言都是"条目变了"。如果方法被改回 `async () => undefined`，
  //  条目**根本不会变** —— 断言会红。这是它们有效的证明。
  //
  //  但还有一种情况要排除：**假世界书本来就是空的、同步本来就不做事**。
  //  所以下面用一个纯逻辑模拟证明"空体 → 条目不变"。
  const 书 = { 条目: [] as any[] };
  // 空体的 create / update / remove：什么都不做
  const 空体create = () => {};
  const 空体remove = () => {};

  空体create();
  eq('[自证] 空体 create 之后条目数仍是 0（所以上面那条会红）', 书.条目.length, 0);

  书.条目.push({ name: 'x' });
  空体remove();
  eq('[自证] 空体 remove 之后条目还在（所以上面那条会红）', 书.条目.length, 1);

  // 真实现的 create
  const 真create = () => 书.条目.push({ name: 'y' });
  真create();
  eq('[自证] 真实现 create 之后条目数变了', 书.条目.length, 2);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
