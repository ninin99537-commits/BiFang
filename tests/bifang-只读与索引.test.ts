// 彼方 · 只读模式必须真只读 + 认领不许丢索引 —— 批次 2026-11-19 波2（复查「发现4」「发现5」）。
//
// ── 发现4 是什么 ──
//  `loadData` 的**名字和形态都像读**，但它里面藏着**三处写盘**：
//    ① 索引里有已删楼层 → 剔掉 + saveMeta
//    ② 认领分支 → 改写那一楼的快照 + 重置索引 + saveMeta
//    ③ 兜底 → 再剔一次 + saveMeta
//
//  **预览（只读模式）走这条路时，用户的聊天变量被改了。** 而"预览"承诺一个字节都不写。
//
// ── 发现5 是什么 ──
//  认领分支写的是 `meta.快照楼层 = [floorId]` —— **把索引里其余快照全部丢弃**。
//  那些快照本体还在楼层变量里（没物理删），但索引不再指向它们
//  → `读取快照序列` 只读到 1 份 → `生成近期轨迹` 的跨轮 diff 此后为空。
//  **它们成了永久孤儿：数据还在，但再也没有代码会去找它们。**
//
// ── 为什么判据是「逐字节」而不是「没走那个分支」──
//  "没走那个分支"只证明**我知道的那条路**没写。而 `loadData` 里有**三处**写盘点，
//  漏掉任何一处都还是那个 bug。逐字节比较证明的是**整条路都没留下痕迹**
//  —— 包括将来新增的写点。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { loadData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';
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

/** 静默跑一段（loadData 会打 warn，不该刷屏测试输出） */
function 静默<T>(fn: () => T): T {
  const 原I = console.info;
  const 原W = console.warn;
  const 原E = console.error;
  const 原T = console.table;
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
}

/**
 * 造一个「索引里有失效楼层」的聊天。
 *
 * ⚠ 关键：**让 `chat.messages(3)` 返回空数组** —— 那才是 loadData 眼里"楼层不存在"。
 *   直接 `delete 存.message[3]` 不管用：假宿主会自动补一条消息。
 *   （我第一版就是这么错的，红了两条断言，查了半天。）
 */
function 造聊天(最后楼层号 = 5) {
  setActivePinia(createPinia());
  const { host, 存 } = 彼方假宿主({ 模型回复: [], 最后楼层号 });
  存.chat['彼方'] = { 版本: 3, 快照楼层: [3, 5], 清空层: 0 };
  存.message[5] = {
    [STORAGE_KEY]: {
      版本: 3,
      楼层: 5,
      原编号: 5,
      NPC: { 泰丝: { 当前在做: '整理货单' } },
      名单: ['泰丝'],
      剧情时间: '2026-01-02 12:30',
    },
  };
  const 原messages = host.chat.messages;
  host.chat.messages = (id: any) => (id === 3 ? [] : 原messages(id));
  return { host, 存 };
}

const 取聊天变量 = (存: any) => JSON.stringify(存.chat);

// ─────────────────────────────────────────────────────────────
console.log('\n[只读] 只读模式下，聊天变量必须逐字节不变');
{
  const { host, 存 } = 造聊天();
  const 前 = 取聊天变量(存);
  const data = 静默(() => loadData(host, true));
  const 后 = 取聊天变量(存);

  eq('聊天变量逐字节不变', 后, 前);
  // **自证**：证明它真的跑了一遍（不是"什么都没做所以没变"）
  eq('[自证] 读到了 NPC', Object.keys(data?.NPC ?? {}), ['泰丝']);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[只读] 自证：非只读时，同一场景必须写盘');
{
  // ── 这条防什么 ──
  //  如果代码写成「无论如何都不写」，上面那条照样绿 —— 但那是**把功能删了**。
  const { host, 存 } = 造聊天();
  const 前 = 取聊天变量(存);
  静默(() => loadData(host, false));
  const 后 = 取聊天变量(存);

  ok('[自证] 非只读时聊天变量变了（它本来会写）', 后 !== 前);
  eq('[自证] 失效楼层 3 被从索引里剔掉了', JSON.parse(后).彼方.快照楼层.includes(3), false);
  eq('[自证] 有效楼层 5 还在索引里', JSON.parse(后).彼方.快照楼层.includes(5), true);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[只读] 认领分支：只读不写，非只读写');
{
  // ── 认领是第二处写盘点，必须单独测 ──
  //  「清失效楼层」和「认领」是两条不同的路径，只测其中一条等于只覆盖一半。
  const 造认领场景 = () => {
    setActivePinia(createPinia());
    const { host, 存 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 5 });
    存.chat['彼方'] = { 版本: 3, 快照楼层: [5], 清空层: 0 };
    // 楼层 5 上的快照记的是旧编号 2 → 编号对不上 → 走认领
    存.message[5] = {
      [STORAGE_KEY]: {
        版本: 3,
        楼层: 2,
        原编号: 2,
        NPC: { 乔尔: { 当前在做: '巡逻' } },
        名单: ['乔尔'],
        剧情时间: '2026-01-02 13:00',
      },
    };
    return { host, 存 };
  };

  // ① 只读：不写
  {
    const { host, 存 } = 造认领场景();
    const 前 = 取聊天变量(存);
    const 前楼层 = JSON.stringify(存.message[5]);
    const data = 静默(() => loadData(host, true));

    eq('认领分支在只读时也不写聊天变量', 取聊天变量(存), 前);
    eq('认领分支在只读时也不改写快照', JSON.stringify(存.message[5]), 前楼层);
    // **自证**：但它必须仍然读到数据（否则预览会显示空状态）
    eq('[自证] 确实认领到了数据', Object.keys(data?.NPC ?? {}), ['乔尔']);
    eq('[自证] 锚点被改写成当前楼层 5', data?.锚点楼层, 5);
  }

  // ② 非只读：必须写
  {
    const { host, 存 } = 造认领场景();
    const 前楼层 = JSON.stringify(存.message[5]);
    静默(() => loadData(host, false));
    ok('[自证] 非只读时认领会改写那一楼的快照', JSON.stringify(存.message[5]) !== 前楼层);
    eq('[自证] 快照的楼层被改写成 5', 存.message[5][STORAGE_KEY].楼层, 5);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[索引] 认领后其余快照仍在索引里（发现5）');
{
  // ── 布置要点（踩过两次）──
  //  ① 假宿主只造了楼层 1/2/3，索引里写 7/10 会因"楼层不存在"走另一条分支
  //  ② **两层的快照编号都必须对不上**，否则会走"精确匹配"直接返回，到不了认领分支
  setActivePinia(createPinia());
  const { host, 存 } = 彼方假宿主({ 模型回复: [], 最后楼层号: 10 });
  const 原messages = host.chat.messages;
  host.chat.messages = (id: any) => ((id === 7 || id === 10)
    ? [{ message_id: id, role: 'assistant', is_hidden: false, message: `补的楼层 ${id}` }]
    : 原messages(id));

  存.chat['彼方'] = { 版本: 3, 快照楼层: [7, 10], 清空层: 0 };
  存.message[7] = {
    [STORAGE_KEY]: { 版本: 3, 楼层: 5, 原编号: 5, NPC: { 甲: {} }, 名单: ['甲'], 剧情时间: '' },
  };
  存.message[10] = {
    [STORAGE_KEY]: { 版本: 3, 楼层: 4, 原编号: 4, NPC: { 乙: {} }, 名单: ['乙'], 剧情时间: '' },
  };

  const data = 静默(() => loadData(host, false));
  const 索引 = 存.chat['彼方'].快照楼层;

  // **自证**：先证明真的走了认领分支（认到 10 上的乙）
  eq('[自证] 确实走了认领分支（认到 10 上的乙）', Object.keys(data?.NPC ?? {}), ['乙']);
  eq('认领后索引里仍有 7（其余快照没被丢）', 索引.includes(7), true);
  eq('认领到的 10 也在索引里', 索引.includes(10), true);
  ok('索引是升序的', JSON.stringify(索引) === JSON.stringify([...索引].sort((a, b) => a - b)));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[索引] 自证：旧写法会丢掉其余快照');
{
  // 旧代码是 `meta.快照楼层 = [floorId]` —— 用纯逻辑复刻，证明那个 bug 是真的
  const 旧 = (floorId: number) => [floorId];
  const 新 = (原索引: number[], floorId: number, missing: number[]) => {
    const 集合 = new Set(原索引.filter(f => !missing.includes(f) && f !== floorId));
    集合.add(floorId);
    return [...集合].sort((a, b) => a - b);
  };

  eq('[自证] 旧写法只剩 1 条（其余成了孤儿）', 旧(10), [10]);
  eq('[自证] 新写法保留 2 条', 新([7, 10], 10, []), [7, 10]);
  ok('[自证] 两者确实不同', JSON.stringify(旧(10)) !== JSON.stringify(新([7, 10], 10, [])));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
