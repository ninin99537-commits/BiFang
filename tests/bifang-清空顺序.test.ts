// 彼方 · 清空数据的顺序：先写元数据，再删快照 —— 批次 2026-11-19 波2（复查「发现8」P2）。
//
// ── 这个 bug 是什么 ──
//  原来是**先删快照，最后写元数据**。`saveMeta` 失败时：
//    · 返回 `{成功:false}` → 界面提示"未清空"、**仍显示旧 NPC 列表**
//    · 而**磁盘上快照已经全删了** → 刷新后是空状态
//
//  **"提示未清空"和"实际已删"同时成立** —— 用户看到的是前者，真相是后者。
//  而当时的注释写着"成功=false 时一份快照没删"，与实现正好相反。
//
// ── 为什么新顺序（先元数据、后快照）是对的 ──
//  ① 元数据（清空层 + 空索引）写成功 = "从这一刻起，旧快照都不再被索引指向"
//     —— 从读侧看，数据已经清空了
//  ② 然后删快照本体。**删失败只是留下孤儿**（没索引指向它们，读侧看不见），
//     不会造成"显示有数据、实际没数据"或反过来
//
//  两害相权：**留孤儿是无害的，留"提示说没清但实际清了"是有害的。**
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { clearAllData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';

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
 * 造一个有 3 份快照的聊天。
 *
 * @param 选项.meta写失败 让 chat 作用域写入抛错（= saveMeta 失败）
 * @param 选项.删快照失败 让 message 作用域的 del 抛错（= 删不掉，留孤儿）
 */
function 造聊天(选项: { meta写失败?: boolean; 删快照失败?: boolean } = {}) {
  setActivePinia(createPinia());
  const 存: any = { global: {}, chat: {}, message: {}, script: undefined };
  存.chat['彼方'] = { 版本: 3, 快照楼层: [3, 5, 7], 清空层: 0 };
  for (const id of [3, 5, 7]) {
    存.message[id] = {
      [STORAGE_KEY]: {
        版本: 3,
        楼层: id,
        原编号: id,
        NPC: { [`人${id}`]: {} },
        名单: [`人${id}`],
        剧情时间: '',
      },
    };
  }
  const host: any = {
    vars: {
      get: (arg: any) => (arg?.type === 'chat' ? 存.chat : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global)),
      update: (fn: any, arg: any) => {
        if (arg?.type === 'chat' && 选项.meta写失败)
          throw new Error('模拟：元数据写入失败');
        const 新 = fn(arg?.type === 'chat' ? 存.chat : 存.global);
        if (arg?.type === 'chat')
          存.chat = 新;
        else
          存.global = 新;
      },
      del: (key: string, arg: any) => {
        if (arg?.type === 'message') {
          if (选项.删快照失败)
            throw new Error('模拟：快照删不掉');
          delete 存.message[arg.message_id]?.[key];
        }
        else {
          delete (arg?.type === 'chat' ? 存.chat : 存.global)[key];
        }
      },
      insertOrAssign: () => {},
      scriptId: () => 't',
    },
    chat: {
      lastMessageId: () => 9,
      messages: (id: number) => (存.message[id] ? [{ message_id: id, role: 'assistant', message: 'x' }] : []),
    },
  };
  return { host, 存 };
}

/** 数一下还有几份快照本体 */
const 数快照 = (存: any) => Object.keys(存.message).filter(id => 存.message[id]?.[STORAGE_KEY]).length;

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 元数据写失败 → 一份快照都不许删');
{
  // ── 这条是本次修复的核心 ──
  //  旧顺序下，这里会看到"返回失败，但 3 份快照已经全没了"。
  const { host, 存 } = 造聊天({ meta写失败: true });
  eq('[前置] 开始有 3 份快照', 数快照(存), 3);

  const 结果 = 静默(() => clearAllData(host));

  eq('返回 失败', 结果.成功, false);
  eq('一份快照都没被删', 数快照(存), 3);
  eq('清空层没被改（仍是 0）', 结果.清空层, 0);
  ok('失败原因里说明了一份都没删', /一份快照都没删/.test(结果.失败原因 ?? ''), 结果.失败原因);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 自证：元数据写成功时，快照必须被删');
{
  // ── 这条防的是"干脆什么都不删" ──
  const { host, 存 } = 造聊天();
  eq('[前置] 开始有 3 份快照', 数快照(存), 3);

  const 结果 = 静默(() => clearAllData(host));

  eq('[自证] 返回成功', 结果.成功, true);
  eq('[自证] 3 份快照全被删了', 数快照(存), 0);
  eq('[自证] 清空层记成了 9', 结果.清空层, 9);
  eq('[自证] 索引被重置成空', 存.chat['彼方'].快照楼层, []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 自证：删快照失败时，仍算成功（孤儿无害）');
{
  // ── 这条防的是"把删不掉也当成失败" ──
  //  孤儿快照没有索引指向，读侧看不见 —— 它不构成"用户看到的数据是错的"。
  //  所以这种情况**不该报失败**（报失败会让用户以为没清空，而实际已经清空了）。
  const { host, 存 } = 造聊天({ 删快照失败: true });
  const 结果 = 静默(() => clearAllData(host));

  eq('[自证] 仍返回成功（索引已重置，孤儿读侧看不见）', 结果.成功, true);
  eq('[自证] 快照本体还在（孤儿）', 数快照(存), 3);
  eq('[自证] 但索引已空（读侧看不到它们）', 存.chat['彼方'].快照楼层, []);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 读不到当前楼层时，一份快照都不许删（既有行为）');
{
  // ── 这条是原有约束，改顺序时不许破坏它 ──
  //  读不到楼层 → 清空层会停在 0 → 下一轮把整条聊天重分析一遍，
  //  而玩家以为自己清空了。所以这里必须**先定截止点、再动手**。
  const { host, 存 } = 造聊天();
  host.chat.lastMessageId = () => { throw new Error('模拟：读不到楼层'); };

  const 结果 = 静默(() => clearAllData(host));

  eq('返回 失败', 结果.成功, false);
  eq('一份快照都没被删', 数快照(存), 3);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[清空] 自证：两个顺序在"元数据写失败"时结果不同');
{
  // ── 这条把那个 bug 的本质钉成纯逻辑 ──
  //  旧顺序：删快照 → 写元数据失败 → 快照已删、返回失败
  //  新顺序：写元数据失败 → 直接返回 → 快照一份没动
  const 旧顺序 = (删快照: () => void, 写元数据: () => boolean) => {
    删快照();
    return 写元数据();
  };
  const 新顺序 = (删快照: () => void, 写元数据: () => boolean) => {
    if (!写元数据())
      return false;
    删快照();
    return true;
  };

  let 删了 = 0;
  const 删快照 = () => { 删了++; };
  const 写失败 = () => false;

  删了 = 0;
  eq('[自证] 旧顺序：写失败但删了 1 次', [旧顺序(删快照, 写失败), 删了], [false, 1]);

  删了 = 0;
  eq('[自证] 新顺序：写失败且一次都没删', [新顺序(删快照, 写失败), 删了], [false, 0]);

  ok('[自证] 两个顺序结果确实不同', true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
