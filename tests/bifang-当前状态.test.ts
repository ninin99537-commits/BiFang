// 彼方 · 当前状态（C2）—— 批次 2026-11-20（需求方 #440）。
//
// ── 这个模块解决什么 ──
//  「界面当前显示的那份」与「落盘那份」是**两份数据**，而**没有任何模块拥有
//  「两者相等」这条不变量**：
//
//  | 谁 | 原来做什么 | 对不对 |
//  |---|---|---|
//  | `数据变更.ts` | 保存成功才赋 store | ✅ |
//  | `update.ts` | **失败也赋 store** | ❌ **bug** |
//  | `clearAllData` | 清 + 空 store | ✅ |
//  | `更新输入.ts` / `worldbook-inject.ts` | 直接 `loadData` | 各读各的 |
//  | `数据仓.ts` | `reload` | 又一条路 |
//
// ── 失败语义（本批最重要的判据）──
//  **提交失败时，界面显示"上一次落盘成功的那份"，不是这次没存下的那份。**
//
//  理由：
//    · 显示没存下的 → 用户看到"更新成功"的样子，刷新后没了 → **他会以为丢了数据**
//    · 显示上一次落盘的 → 刷新前后一样 → **他只会觉得"这次没更新"**
//
//  > **宁可界面落后于存储，不许界面超前于存储。**
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { 读当前, 提交下一份, 从存储重读, 清空全部 } from '../src/彼方_NPC幕后生命状态系统/当前状态';
import { useStateStore } from '../src/彼方_NPC幕后生命状态系统/数据仓';
import { STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';

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

/**
 * 造宿主。
 *
 * @param 选项.写楼层失败  让 message 作用域的 update 抛错（= 快照写不进去）
 * @param 选项.写聊天失败  让 chat 作用域的 update 抛错（= 索引登记失败）
 */
function 造宿主(选项: { 写楼层失败?: boolean; 写聊天失败?: boolean; 末层?: number } = {}) {
  const 末层 = 选项.末层 ?? 5;
  const 存: any = { global: {}, chat: {}, message: {} };
  存.chat['彼方'] = { 版本: 3, 快照楼层: [], 清空层: 0 };

  const 楼层存在 = new Set(Array.from({ length: 末层 + 1 }, (_, i) => i));

  const host: any = {
    vars: {
      get: (arg: any) => (arg?.type === 'chat'
        ? 存.chat
        : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global)),
      update: (fn: any, arg: any) => {
        if (arg?.type === 'chat') {
          if (选项.写聊天失败)
            throw new Error('模拟：索引登记失败');
          存.chat = fn(存.chat);
          return;
        }
        if (arg?.type === 'message') {
          if (选项.写楼层失败)
            throw new Error('模拟：楼层快照写不进去');
          存.message[arg.message_id] = fn(存.message[arg.message_id] ?? {});
          return;
        }
        存.global = fn(存.global);
      },
      del: (key: string, arg: any) => {
        delete 存.message[arg?.message_id]?.[key];
      },
      insertOrAssign: (数据: Record<string, any>, arg: any) => {
        if (arg?.type === 'message') {
          存.message[arg.message_id] ??= {};
          Object.assign(存.message[arg.message_id], 数据);
        }
      },
      scriptId: () => 't',
    },
    chat: {
      lastMessageId: () => 末层,
      messages: (id: number) => (楼层存在.has(id)
        ? [{ message_id: id, role: 'assistant', is_hidden: false, message: `第${id}楼` }]
        : []),
    },
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };

  return { host, 存 };
}

const 造数据 = (标记: string, 锚点 = 5): any => ({
  NPC: { 泰丝: { 当前在做: 标记 } },
  名单: ['泰丝'],
  统计: { 更新次数: 1, 最后更新: 1 },
  剧情时间: '2026-01-02 12:30',
  清空层: 0,
  锚点楼层: 锚点,
  处理到楼层: 锚点,
});

// ─────────────────────────────────────────────────────────────
console.log('\n[成功] 提交成功 → 界面 == 落盘那份（一条用例同时看两边）');
{
  // ── 这条就是 C2 的核心不变量 ──
  setActivePinia(createPinia());
  const { host, 存 } = 造宿主();
  const 数据 = 造数据('新状态');

  const 结果 = 静默(() => 提交下一份(host, 数据, '保存失败'));

  eq('提交成功', 结果.ok, true);
  // 界面侧
  eq('界面显示的是新状态', 读当前().NPC?.泰丝?.当前在做, '新状态');
  // 存储侧
  eq('楼层里存的也是新状态', 存.message[5]?.[STORAGE_KEY]?.NPC?.泰丝?.当前在做, '新状态');
  // **两边相等** —— 这就是那条不变量
  eq('★ 界面所见 == 楼层里那份',
    读当前().NPC?.泰丝?.当前在做,
    存.message[5]?.[STORAGE_KEY]?.NPC?.泰丝?.当前在做);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[失败] 落盘失败 → 界面必须回滚成"上一次落盘成功的那份"');
{
  // ── 这条是本批最重要的判据 ──
  //  原来 `update.ts` 在这一支写 `stateStore.data = newData` ——
  //  **把没存下的那份交给了界面**，用户看到"已更新"，刷新后全没了。
  setActivePinia(createPinia());
  const { host, 存 } = 造宿主();

  // 先成功落一份"好的"
  静默(() => 提交下一份(host, 造数据('好状态'), ''));
  eq('[前置] 界面是好状态', 读当前().NPC?.泰丝?.当前在做, '好状态');

  // 再让落盘失败，提交一份"新的"
  const { host: 坏host } = 造宿主({ 写楼层失败: true });
  // 让坏 host 也能读到刚才那份"好的"（模拟真实场景：盘上有旧数据）
  (坏host.vars as any).get = (arg: any) => (arg?.type === 'chat'
    ? 存.chat
    : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global));

  const 结果 = 静默(() => 提交下一份(坏host, 造数据('未存下的新状态'), '快照没能写进楼层'));

  eq('★ 返回失败', 结果.ok, false);
  ok('★ 原因带出来了', /没能写进楼层/.test(结果.ok ? '' : 结果.原因), 结果.ok ? '' : 结果.原因);
  eq('★ 界面**不是**未存下的那份', 读当前().NPC?.泰丝?.当前在做 === '未存下的新状态', false);
  eq('★ 界面回滚成上一次落盘成功的那份', 读当前().NPC?.泰丝?.当前在做, '好状态');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[失败] 索引登记失败（楼层写了但登记没成）→ 也算失败');
{
  // ── 这条要构造**真实**的失败形态：锚点是一层**新楼层**，索引里没有它 ──
  //
  //  ⚠ 如果写成"锚点就是索引里已有的那一层"，楼层变量会被覆盖 →
  //    旧数据在物理上已经没了 → 回滚**读不回**旧值（平台没有事务，这是做不到的）。
  //    那种情况见文件末尾「已知缺口」。
  setActivePinia(createPinia());
  const { host } = 造宿主();
  静默(() => 提交下一份(host, 造数据('好状态'), ''));

  const { host: 坏host, 存: 坏存 } = 造宿主({ 写聊天失败: true, 末层: 6 });
  // 索引里只有第 5 层（好状态那份）；锚点会落在第 6 层
  坏存.chat['彼方'] = { 版本: 3, 快照楼层: [5], 清空层: 0 };
  坏存.message[5] = { [STORAGE_KEY]: { 版本: 3, 楼层: 5, NPC: { 泰丝: { 当前在做: '好状态' } }, 名单: ['泰丝'], 统计: {}, 剧情时间: '' } };

  const 结果 = 静默(() => 提交下一份(坏host, 造数据('未存下的新状态'), '索引登记失败'));

  eq('★ 返回失败', 结果.ok, false);
  eq('★ 界面不是未存下的那份', 读当前().NPC?.泰丝?.当前在做 === '未存下的新状态', false);
  eq('★ 界面回滚成索引里那份（第 5 层的好状态）', 读当前().NPC?.泰丝?.当前在做, '好状态');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[读当前] 读的是 store，不是存储');
{
  setActivePinia(createPinia());
  const { host } = 造宿主();

  静默(() => 提交下一份(host, 造数据('界面这份'), ''));
  // 手动把 store 改成别的东西（模拟"界面超前于存储"的坏状态）
  useStateStore().data = 造数据('界面被手改了');

  eq('读当前() 拿到的是 store 那份', 读当前().NPC?.泰丝?.当前在做, '界面被手改了');
}

console.log('\n[从存储重读] 把界面拉回盘上那份');
{
  setActivePinia(createPinia());
  const { host } = 造宿主();

  静默(() => 提交下一份(host, 造数据('盘上这份'), ''));
  useStateStore().data = 造数据('界面被手改了');

  const 数据 = 静默(() => 从存储重读(host));

  eq('返回值是盘上那份', 数据.NPC?.泰丝?.当前在做, '盘上这份');
  eq('界面也被拉回来了', 读当前().NPC?.泰丝?.当前在做, '盘上这份');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 清空成功 → 界面变空；清空失败 → 界面不动');
{
  setActivePinia(createPinia());
  const { host } = 造宿主();

  静默(() => 提交下一份(host, 造数据('有数据'), ''));
  const 结果 = 静默(() => 清空全部(host));

  eq('清空成功', 结果.成功, true);
  eq('界面变空', Object.keys(读当前().NPC ?? {}), []);
}

{
  // 清空失败（索引写不进去）→ 界面不该变空
  setActivePinia(createPinia());
  const { host: 坏host, 存 } = 造宿主({ 写聊天失败: true });
  存.chat['彼方'] = { 版本: 3, 快照楼层: [5], 清空层: 0 };
  存.message[5] = { [STORAGE_KEY]: { 版本: 3, 楼层: 5, NPC: { 泰丝: { 当前在做: '好状态' } }, 名单: ['泰丝'], 统计: {}, 剧情时间: '' } };

  // 先把界面设成"有数据"
  useStateStore().data = 造数据('好状态');

  const 结果 = 静默(() => 清空全部(坏host));

  eq('清空失败', 结果.成功, false);
  eq('★ 界面没被清空（还是原来那份）', 读当前().NPC?.泰丝?.当前在做, '好状态');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 把"失败时回滚"改成"失败时保留新数据" → 必须红');
{
  // ── 纯逻辑复刻两种语义，证明它们确实不同 ──
  const 好 = { 值: '好状态' };
  const 新 = { 值: '未存下的新状态' };

  // 正确语义：失败 → 回滚到好
  const 正确 = (落盘成功: boolean, 当前: any) => (落盘成功 ? 新 : 好);
  // 旧语义（update.ts 原来的写法）：失败也赋新
  const 旧 = (落盘成功: boolean, 当前: any) => (落盘成功 ? 新 : 新);

  eq('[自证] 正确语义：失败时回滚', 正确(false, 好), 好);
  eq('[自证] 旧语义：失败时保留新（这就是那个 bug）', 旧(false, 好), 新);
  ok('[自证] 两者确实不同', JSON.stringify(正确(false, 好)) !== JSON.stringify(旧(false, 好)));

  // **真实实现**也要符合正确语义
  setActivePinia(createPinia());
  const { host, 存 } = 造宿主();
  静默(() => 提交下一份(host, 造数据('好状态'), ''));
  const { host: 坏host } = 造宿主({ 写楼层失败: true });
  (坏host.vars as any).get = (arg: any) => (arg?.type === 'chat' ? 存.chat : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global));
  静默(() => 提交下一份(坏host, 造数据('未存下的新状态'), ''));
  eq('[自证] 真实实现也是"回滚"语义', 读当前().NPC?.泰丝?.当前在做, '好状态');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] update.ts 不再自己配对"落盘 + 赋 store"');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 更新源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/update.ts'), 'utf8');
  const 代码行 = 更新源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] update.ts 调了 提交下一份', /提交下一份\(/.test(代码行));
  ok('[结构] update.ts **不再**直接写 stateStore.data = newData',
     !/stateStore\.data = newData/.test(代码行),
     '还在自己赋 store');
  ok('[结构] update.ts 不再直接调 writeStateSnapshot',
     !/writeStateSnapshot\(/.test(代码行),
     '还在自己落盘');

  // ── 判据①（需求方 #440）：写失败时不许显示"已保存" ──
  //
  //  原来 `toastSuccess('已更新 N 个NPC')` 是**无条件**执行的 ——
  //  于是失败时玩家先看到红字"没能存进楼层"，紧接着又看到绿字"已更新 2 个NPC"。
  //  **两句互相矛盾，玩家会信后一句。** 那就是"看起来成功了"。
  ok('[结构] 成功提示被 提交结果.ok 守着（失败时不弹"已更新"）',
     /if \(提交结果\.ok\)[\s\S]{0,400}?toastSuccess\(/.test(代码行),
     'toastSuccess 还是无条件执行');

  // **自证**：正则可以抓到"无条件 toastSuccess"的旧写法
  const 旧写法 = `        toastSuccess('彼方: 已更新 2 个NPC的幕后状态', '彼方');`;
  ok('[自证] 正则能抓到无条件 toastSuccess',
     !/if \(提交结果\.ok\)[\s\S]{0,400}?toastSuccess\(/.test(旧写法));

  // **自证**：正则可以抓到旧写法
  ok('[自证] 正则能抓到旧写法', /stateStore\.data = newData/.test('stateStore.data = newData;'));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[补 A] 回滚发生时必须解释"界面变了"（否则用户以为数据被吃掉）');
{
  // ── 这条对应需求方 #445 的补 A ──
  //  提交失败 → 界面回滚到上一次落盘那份 → 但"界面自己变了"如果不解释，
  //  用户看到人物页退回上一轮，会以为**数据被吃掉了**。
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/update.ts'), 'utf8');
  const 代码行 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  // 两条失败文案都要带这句
  ok('[补 A] 冲突那条带"回到上一次保存"',
     /本轮结果因手动修改未保存[\s\S]{0,260}?界面已回到上一次保存的状态/.test(代码行));
  ok('[补 A] 写入失败那条也带"回到上一次保存"',
     /本轮状态没能存进楼层[\s\S]{0,260}?界面已回到上一次保存的状态/.test(代码行));

  // 出现次数：只该在失败分支的两条文案里
  eq('[补 A] 只在失败文案里出现（2 条文案各一次）', (代码行.split('回到上一次保存').length - 1), 2);

  // **成功分支不许有**：成功时界面没回滚，这么说会误导
  const 成功段 = 代码行.match(/if \(提交结果\.ok\) \{([\s\S]*?)\n        \}/);
  ok('[补 A] 成功分支里没有这句',
     成功段 ? !/回到上一次保存/.test(成功段[1]) : true);

  // **自证**：旧文案（只说"不会被保存"、不提界面变了）确实缺这句
  const 旧文案 = '本轮状态没能存进楼层 #37(楼层可能已被删除或变量写入失败), 界面上的状态不会被保存, 请重新更新一次。';
  ok('[自证] 旧文案确实没有这句', !/回到上一次保存/.test(旧文案));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] 六个调用方各走哪个入口（需求方 #440 那张表）');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 读 = (f: string) => {
    const 源 = readFileSync(path.join(process.cwd(), `src/彼方_NPC幕后生命状态系统/${f}`), 'utf8');
    return {
      源,
      代码: 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'),
    };
  };

  // ① update.ts —— 已接（上面断言过）
  // ② 数据变更.ts —— 保存/清空都走 当前状态
  const 变更 = 读('数据变更.ts');
  ok('[结构] 数据变更.ts 的保存走 提交下一份', /提交下一份\(/.test(变更.代码));
  ok('[结构] 数据变更.ts 的清空走 清空全部', /清空全部\(/.test(变更.代码));
  ok('[结构] 数据变更.ts **不再**自己赋 store',
     !/useStateStore\(\)\.data\s*=/.test(变更.代码),
     '还在自己写 store');
  ok('[结构] 数据变更.ts **不再**直接调 saveData / clearAllData',
     !/\bsaveData\(/.test(变更.代码) && !/\bclearAllData\(/.test(变更.代码));

  // ③ 更新输入.ts —— 走 从存储重读（它同时要把界面拉到同一份）
  const 输入 = 读('更新输入.ts');
  ok('[结构] 更新输入.ts 走 从存储重读', /从存储重读\(/.test(输入.代码));
  ok('[结构] 更新输入.ts **不再**直接 loadData',
     !/\bloadData\(/.test(输入.代码),
     '还在自己读盘');

  // ④ worldbook-inject.ts —— **故意**不接（纯后台读盘，不该动界面）
  const 注入 = 读('worldbook-inject.ts');
  ok('[结构] worldbook-inject.ts **保留** loadData（纯后台读盘，不该换界面）',
     /\bloadData\(/.test(注入.代码));
  ok('[结构] 它没有走 从存储重读（走了就会顺手改界面）',
     !/从存储重读\(/.test(注入.代码));

  // ⑤ 数据仓.ts —— reload 与 从存储重读 是同一个底层调用
  const 仓 = 读('数据仓.ts');
  ok('[结构] 数据仓 reload 走 loadData（与 从存储重读 同一个底层）',
     /data\.value = loadData\(host\)/.test(仓.代码));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
