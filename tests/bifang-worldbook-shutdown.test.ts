// 彼方 · 世界书写入=关闭: 彼方自己的常驻条目必须清得掉; 同步失败必须能被上游拿到 —— 批次 0 先红后绿骨架(派活单 reviews/派活-2026-11-14-批0.md §2 行为约束 3/4)。
//
// 为什么是这几条: 关掉写入后, 上次写的常驻条目会一直留在世界书里(现在只有"变更"才会触发同步,
// 启动/切聊天不清理); 而且整个同步函数被 try/catch 吞成 resolved, 三处调用方的 .catch 全是死路径 ——
// 世界书坏了用户永远不知道。实现改完前 [3] 必须红; [1]/[2] 是行为钉子, 现在就该绿, 改完还得绿。
// 变异验收(派活单 §3.2): 把 worldbook-inject 的 catch 改回吞成 resolved → 本文件必须红([3] 两条)。
//
// 覆盖边界: 这里钉的是 syncNpcStatesWorldbook 函数本身; index.ts 的"启动/切聊天接线"是宿主编排,
// 在 node 用例里摆不出来, 由实现交付时自行验证(见派活单 claim 表)。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { syncNpcStatesWorldbook } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { BIFANG_WORLDBOOK_ENTRY_NAME, isBifangEntry, isBifangEntryDeletable } from '../src/彼方_NPC幕后生命状态系统/彼方条目';
import { BIFANG_ENTRY_CONTENT_PREFIX } from '../src/彼方_NPC幕后生命状态系统/prompts';

// 写入档的注入表由 卡合并/注入渲染 的判定型尾部经 _ 完成; 关闭档用不到, 备着
(globalThis as any)._ = lodash;
setActivePinia(createPinia()); // 写入档会经 日志仓 记录条目内容, 需要 pinia 在位

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
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

const 彼方条目样本 = () => ({
  name: BIFANG_WORLDBOOK_ENTRY_NAME,
  content: '【NPC幕后生活】\n甲 | 位置: 家',
  comment: '',
  enabled: true,
  extra: { bifang: true },
});
const 人设条目样本 = () => ({ name: '艾莉人设', content: '艾莉, 19岁。', comment: '艾莉', enabled: true });
const 普通条目样本 = () => ({ name: '世界规则', content: '末日生存规则。', comment: '', enabled: true });

/**
 * 假世界书: 按 host.worldbook 的真实语义忠实实现 —— remove 按判定过滤、不主动建书,
 * 这样"只删命中那条"断言的是**源码怎么用 remove**(比如改成不带判定全删就会红), 不是假件自己。
 */
function 假世界(书: Record<string, any[]>, 选项: { remove炸?: boolean; create炸?: boolean } = {}) {
  const 条目 = 书;
  const 记 = { remove: [] as any[], create: [] as string[], getOrCreate: 0 };
  const host = {
    worldbook: {
      boundNames: () => ({ primary: '主书', additional: [] }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      groupMemberNames: () => [] as string[],
      chatName: () => '聊天书',
      getOrCreateChat: async () => {
        记.getOrCreate++;
        return '聊天书';
      },
      entries: async (name: string) => 条目[name] ?? [],
      update: async (name: string, updater: any) => {
        条目[name] = updater(条目[name] ?? []);
      },
      create: async (name: string, list: any[]) => {
        if (选项.create炸)
          throw new Error('建条目失败(测试注入)');
        记.create.push(name);
        条目[name] = [...(条目[name] ?? []), ...list];
      },
      remove: async (name: string, predicate?: (entry: any) => boolean) => {
        if (选项.remove炸)
          throw new Error('世界书同步炸了(测试注入)');
        记.remove.push({ name, 带判定: typeof predicate === 'function' });
        条目[name] = (条目[name] ?? []).filter(entry => !predicate?.(entry));
      },
    },
    toast: { success: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
  };
  return { host, 记, 条目 };
}

console.log('\n[1] 关闭档: 两本都清一遍彼方条目, 且不建新书');
{
  const { host, 记, 条目 } = 假世界({ 主书: [彼方条目样本(), 人设条目样本()], 聊天书: [普通条目样本()] });
  await syncNpcStatesWorldbook(host as any, { NPC: {} } as any, '关闭');
  eq('主书里彼方条目没了', (条目.主书 ?? []).filter(isBifangEntry).length, 0);
  eq('聊天书里没有彼方条目', (条目.聊天书 ?? []).filter(isBifangEntry).length, 0);
  eq('关闭档两本都试过(主书+聊天书)', 记.remove.map(r => r.name).sort(), ['主书', '聊天书']);
  eq('关闭档不建新书(getOrCreateChat 没被调)', 记.getOrCreate, 0);
}

console.log('\n[2] 只删 isBifangEntry 命中那条, 其它条目原样保留');
{
  const 人设 = 人设条目样本();
  const 普通 = 普通条目样本();
  const { host, 记, 条目 } = 假世界({ 主书: [彼方条目样本(), 人设], 聊天书: [普通] });
  await syncNpcStatesWorldbook(host as any, { NPC: {} } as any, '关闭');
  eq('主书剩的就是原来那个人设条目(逐字段)', 条目.主书, [人设]);
  eq('聊天书原样', 条目.聊天书, [普通]);
  ok('remove 收到了判定函数(不是无差别全删)', 记.remove.every(r => r.带判定));
}

console.log('\n[3] 同步中途抛错 → 上游能拿到失败(不再吞成 resolved)');
{
  // 关闭档: remove 炸 —— 清理失败也得让上游知道
  const { host } = 假世界({ 主书: [彼方条目样本()] }, { remove炸: true });
  let 关闭档炸出来 = false;
  try {
    await syncNpcStatesWorldbook(host as any, { NPC: {} } as any, '关闭');
  }
  catch {
    关闭档炸出来 = true;
  }
  ok('关闭档同步抛错时上游能拿到失败', 关闭档炸出来);
}
{
  // 写入档: 建条目炸 —— 变更后重同步正是三处调用方挂着 .catch 的那条路
  const { host } = 假世界({ 主书: [] }, { create炸: true });
  let 写入档炸出来 = false;
  try {
    await syncNpcStatesWorldbook(host as any, { NPC: { 甲: { 位置: '厨房' } }, 剧情时间: '' } as any, '角色卡主世界书');
  }
  catch {
    写入档炸出来 = true;
  }
  ok('写入档同步抛错时上游能拿到失败(.catch 不再是死路径)', 写入档炸出来);
}

console.log('\n[4] 删除端只认结构化标记/精确名, 不认「正文前缀」(2026-11-19 #325)');
{
  // ── 这条防的是什么 ──
  //  旧判据 `isBifangEntry` 认「正文以 `[彼方 · 幕后NPC状态]` 开头」——
  //  那是**文本启发式**：用户自己写一条笔记，正文第一个字就是那个字符串，
  //  删条目时会被当成彼方的删掉。**删除不可逆，所以删除端必须严格。**
  //
  //  实测（`tests/fixtures/bifang-probe-prefix-hurt.mjs`）：
  //      用户：正文以真实前缀开头 → isBifangEntry = true   ★ 会被误删
  const 用户同前缀条目 = () => ({
    name: '我的笔记',
    // 正文第一个字就是真实前缀（从源码常量取，不手抄）
    content: BIFANG_ENTRY_CONTENT_PREFIX + ' 我也想要这种格式',
    comment: '',
    enabled: true,
  });

  // ① 用户条目（正文同前缀、无 extra、名字不是原名）→ **不许被删**
  {
    const 笔记 = 用户同前缀条目();
    const 普通 = 普通条目样本();
    const { host, 条目 } = 假世界({ 主书: [彼方条目样本(), 笔记], 聊天书: [普通] });
    await syncNpcStatesWorldbook(host as any, { NPC: {} } as any, '关闭');
    ok('用户笔记(正文以前缀开头)没被删', 条目.主书.some((e: any) => e.name === '我的笔记'));
    eq('主书只剩用户那条笔记', 条目.主书.map((e: any) => e.name), ['我的笔记']);
    ok('彼方条目仍被删了', !条目.主书.some((e: any) => e.extra?.bifang === true));
  }

  // ② 彼方条目（有 extra.bifang）→ **必须被删**
  {
    const { host, 条目 } = 假世界({ 主书: [彼方条目样本()] });
    await syncNpcStatesWorldbook(host as any, { NPC: {} } as any, '关闭');
    eq('彼方条目被删干净', 条目.主书.length, 0);
  }

  // ③ 自证：两个判据对同一条用户条目的结论**必须不同**
  //    否则说明"改成严格判据"这件事根本没生效 —— 断言绿了也没有意义。
  {
    const 笔记 = 用户同前缀条目();
    ok('严格判据放过用户条目', isBifangEntryDeletable(笔记) === false);
    ok('宽松判据会误伤(这就是被修掉的 bug)', isBifangEntry(笔记) === true);
    ok('两个判据确实不同(否则改动没生效)', isBifangEntryDeletable(笔记) !== isBifangEntry(笔记));
  }

  // ④ 写入端：不许把用户的同前缀条目**覆盖**掉（比删更糟 —— 原文没了）
  {
    const 笔记 = 用户同前缀条目();
    const { host, 条目 } = 假世界({ 主书: [笔记] });
    await syncNpcStatesWorldbook(host as any, { NPC: { 甲: { 位置: '厨房' } }, 剧情时间: '' } as any, '角色卡主世界书');
    const 笔记后 = 条目.主书.find((e: any) => e.name === '我的笔记');
    ok('用户笔记原文没被覆盖', String(笔记后?.content ?? '').includes('我也想要这种格式'));
    ok('另建了一条彼方条目(没复用用户那条)', 条目.主书.some((e: any) => e.extra?.bifang === true));
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
