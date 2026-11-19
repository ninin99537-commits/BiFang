// 彼方 · 读不到设置 ≠ 用户关掉了 —— 批次 2026-11-19 波2（复查「发现6」P2）。
//
// ── 这个 bug 是什么 ──
//  `getVariables({global})` 抛错 → `getSettings` 返回 store 里那份，而它可能是
//  `Settings.parse({})`（**全默认值**），其中 `更新.世界书写入 = '关闭'`。
//
//  于是任一触发器调 `maybeInjectNpcStates` 都判出 `目标 = '关闭'`
//  → `syncNpcStatesWorldbook` 把两本世界书里的彼方条目**删掉**。
//
//  **全程没有任何提示**：同步本身"成功"了，所以 `报告世界书失败` 那条链也不触发。
//  用户只看到主 AI 读不到幕后状态了。
//
// ── 为什么这条判据必须真跑 ──
//  "读失败 → 不删"读代码能看出来，但**它会不会被别的路径绕过**只有跑起来才知道。
//  而且这里有个陷阱：读失败时返回的设置对象**看起来完全正常**
//  （`世界书写入: '关闭'` 是个合法值），不跑一遍根本看不出那是降级。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { maybeInjectNpcStates } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { getSettings, invalidateReadCache, 设置读取可信 } from '../src/彼方_NPC幕后生命状态系统/settings';
import { BIFANG_WORLDBOOK_ENTRY_NAME } from '../src/彼方_NPC幕后生命状态系统/彼方条目';

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

const 等 = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 造一本假世界书，里面预置一条彼方条目（带 extra.bifang = 结构化标记） */
function 造世界书() {
  const 书 = {
    条目: [{
      name: BIFANG_WORLDBOOK_ENTRY_NAME,
      content: '[彼方 · 幕后NPC状态]\n甲 | 位置: 家',
      enabled: true,
      extra: { bifang: true },
    }],
  };
  let 删次数 = 0;
  const host: any = {
    worldbook: {
      boundNames: () => ({ primary: '主世界书', additional: [] }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      groupMemberNames: () => [] as string[],
      chatName: () => null,
      getOrCreateChat: async () => '聊天世界书',
      entries: async () => 书.条目.map(e => ({ ...e })),
      update: async (_n: string, fn: any) => { 书.条目 = fn(书.条目); },
      create: async (_n: string, 新增: any[]) => { 书.条目.push(...新增); },
      remove: async (_n: string, 谓词: any) => { 删次数++; 书.条目 = 书.条目.filter(e => !谓词(e)); },
    },
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };
  return { host, 书, 取删次数: () => 删次数 };
}

/** 让 `getVariables({global})` 抛错 —— 这就是那个 bug 的触发条件 */
function 让全局读失败(host: any) {
  host.vars = {
    get: (arg: any) => {
      if (arg?.type === 'global')
        throw new Error('模拟：全局变量读不到');
      return {};
    },
    update: () => {},
    scriptId: () => 'fake',
  };
}

/** 正常能读的 vars */
function 让全局可读(host: any, 设置: any) {
  host.vars = {
    get: (arg: any) => (arg?.type === 'global' ? { 彼方_settings: 设置 } : {}),
    update: () => {},
    scriptId: () => 'fake',
  };
}

// ─────────────────────────────────────────────────────────────
console.log('\n[读失败] 读不到时 `设置读取可信()` 必须是 false');
{
  // ── 这条是整套判据的地基 ──
  //  如果它恒为 true，后面所有"读失败不删"的断言都是空转。
  const { host } = 造世界书();
  让全局读失败(host);
  invalidateReadCache();
  const s = getSettings(host);

  // **自证**：先确认这个陷阱真的存在 —— 读失败时返回的确实是个合法值
  eq('读失败时 世界书写入 是默认值「关闭」（这就是陷阱）', s.更新.世界书写入, '关闭');
  eq('读失败 → 设置读取可信() 为 false', 设置读取可信(), false);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[读失败] 读不到时，一条世界书条目都不许删');
{
  // ── 这条是本次修复的核心 ──
  const { host, 书, 取删次数 } = 造世界书();
  让全局读失败(host);
  invalidateReadCache();
  getSettings(host); // 先把「读失败」这个状态建立起来
  maybeInjectNpcStates(host);
  await 等(80); // 等 fire-and-forget 那条链跑完

  ok('彼方条目没被删', 书.条目.some(e => e.extra?.bifang === true));
  eq('remove 一次都没被调', 取删次数(), 0);

  // **自证**：证明"条目还在"不是因为世界书是空的
  ok('[自证] 测试开始时条目确实存在', 书.条目.length === 1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[读失败] 自证：读成功时，两种正常路径都要照常工作');
{
  // ── 为什么需要这一段 ──
  //  如果代码写成「无论如何都不删」，上面那条照样绿 —— 但那是**把功能删了**。
  //  所以必须证明闸门只挡"读失败"，没顺手把正常删除也挡掉。
  //
  // ① 读成功 + 用户真的关掉 → **必须删**
  {
    const { host, 书, 取删次数 } = 造世界书();
    让全局可读(host, { 启用幕后: true, 更新: { 世界书写入: '关闭' } });
    invalidateReadCache();
    getSettings(host);
    eq('读成功 → 设置读取可信() 为 true', 设置读取可信(), true);
    maybeInjectNpcStates(host);
    await 等(80);
    eq('[自证] 真关闭时条目被删了', 书.条目.length, 0);
    ok('[自证] 真关闭时 remove 被调过', 取删次数() > 0);
  }

  // ② 读成功 + NPC 为空 → **必须删**（条目是当前状态的镜像，没状态就该删；可逆）
  {
    const { host, 取删次数 } = 造世界书();
    让全局可读(host, { 启用幕后: true, 更新: { 世界书写入: '角色卡主世界书' } });
    invalidateReadCache();
    getSettings(host);
    maybeInjectNpcStates(host); // 没布置 NPC 数据 → 合法地删掉条目
    await 等(80);
    ok('[自证] 读成功时合法删除照常发生（闸门没把正常路径也挡掉）', 取删次数() > 0);
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
