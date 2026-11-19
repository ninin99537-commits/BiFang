// 彼方 · 索引登记失败 = 这次快照白写（I-S5）—— 批次 2026-11-20 C1 第 2 步（需求方 #433 ②）。
//
// ── 这个 bug 是什么 ──
//  `writeStateSnapshot` 里写的是：
//      saveMeta(host, meta);      // ← 返回值被丢弃
//      ...
//      return true;               // ← 无条件成功
//
//  而 `saveMeta` 内部是 `try { ... } catch { return false }`。
//
//  后果：楼层变量写成功了、但索引没登记成功 → 下次 `loadData` 从索引往前找**找不到它**
//  → 回退到更早的快照。**用户以为更新成功了，其实这轮结果被丢弃。**
//
// ── 对照：导演那份早就写对了 ──
//  `剧情导演/快照.ts` 写成 `if (!saveMeta(meta)) return false;`，
//  注释还写着「索引登记失败 = 这次快照白写」。**彼方这份一直缺。**
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { saveData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';

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
 * 造宿主：`末层` 有效、楼层都在、但 **chat 作用域的 update 会抛错**（= 索引登记失败）。
 *
 * 为什么用 "chat 作用域抛错" 来模拟：`saveMeta` 就是往 chat 作用域写索引。
 * 而楼层变量写的是 message 作用域 —— 那条路要**照常成功**，
 * 否则测的就不是"楼层写成功但索引失败"这个具体情形了。
 */
function 造宿主(选项: { 索引登记失败?: boolean; 楼层: number[] } = { 楼层: [3, 5] }) {
  const 存: any = { global: {}, chat: {}, message: {}, script: undefined };
  存.chat['彼方'] = { 版本: 3, 快照楼层: [...选项.楼层], 清空层: 0 };

  const 消息在 = new Set(选项.楼层);
  let 楼层写成功 = 0;

  const host: any = {
    vars: {
      get: (arg: any) => (arg?.type === 'chat'
        ? 存.chat
        : (arg?.type === 'message' ? 存.message[arg.message_id] : 存.global)),
      update: (fn: any, arg: any) => {
        if (arg?.type === 'chat') {
          if (选项.索引登记失败)
            throw new Error('模拟：索引登记失败');
          存.chat = fn(存.chat);
          return;
        }
        if (arg?.type === 'message') {
          存.message[arg.message_id] = fn(存.message[arg.message_id] ?? {});
          楼层写成功++;
          return;
        }
        存.global = fn(存.global);
      },
      del: () => {},
      insertOrAssign: () => {},
      scriptId: () => 't',
    },
    chat: {
      lastMessageId: () => Math.max(...选项.楼层, 0),
      messages: (id: number) => (消息在.has(id)
        ? [{ message_id: id, role: 'assistant', is_hidden: false, message: `第${id}楼` }]
        : []),
    },
    toast: { warn: () => {}, success: () => {}, info: () => {} },
  };

  return { host, 存, 取楼层写成功次数: () => 楼层写成功 };
}

const 数据: any = {
  NPC: { 泰丝: { 当前在做: '整理货单' } },
  名单: ['泰丝'],
  统计: { 更新次数: 1, 最后更新: 1 },
  剧情时间: '2026-01-02 12:30',
  清空层: 0,
  锚点楼层: 5,
  处理到楼层: 5,
};

// ─────────────────────────────────────────────────────────────
console.log('\n[I-S5] 索引登记失败 → saveData 必须返回 false（不许当成功）');
{
  // ── 这条是本次要修的 bug ──
  const { host, 取楼层写成功次数 } = 造宿主({ 索引登记失败: true, 楼层: [5] });

  const 结果 = 静默(() => saveData(host, 数据));

  eq('★ 返回 false（不是 true）', 结果, false);
  // **自证**：楼层变量确实写成功了 —— 证明失败的原因是"索引没登记"，不是"楼层没写"
  ok('★ 楼层变量确实写成功了（所以失败点就是索引）', 取楼层写成功次数() > 0);
}

console.log('\n[I-S5] 自证：索引登记正常时，saveData 返回 true');
{
  // ── 这条防的是"干脆永远返回 false" ──
  const { host, 取楼层写成功次数 } = 造宿主({ 楼层: [5] });

  const 结果 = 静默(() => saveData(host, 数据));

  eq('[自证] 返回 true', 结果, true);
  ok('[自证] 楼层变量写了', 取楼层写成功次数() > 0);
}

console.log('\n[I-S5] 自证：楼层不存在时也返回 false（既有行为不许被破坏）');
{
  const { host } = 造宿主({ 楼层: [] });
  // 末层 0，锚点 5 那楼不存在
  host.chat.lastMessageId = () => 0;
  host.chat.messages = () => [];

  const 结果 = 静默(() => saveData(host, 数据));
  eq('[自证] 楼层不存在 → false', 结果, false);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] 源码里 saveMeta 的返回值必须被检查');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 源 = readFileSync(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/快照.ts'), 'utf8');
  const 代码行 = 源.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  ok('[结构] writeStateSnapshot 里检查了 saveMeta 的返回值',
     /if \(!saveMeta\(host, meta\)\)/.test(代码行),
     '还是裸调用 saveMeta');
  ok('[结构] 失败时 return false', /if \(!saveMeta\(host, meta\)\)[\s\S]{0,300}?return false;/.test(代码行));
  ok('[结构] 失败时说了"下次读回会跳过它"', /索引没登记成功/.test(源));

  // **自证**：这条正则可以抓到旧写法
  ok('[自证] 正则能抓到"裸调用 saveMeta"的写法',
     !/if \(!saveMeta\(host, meta\)\)/.test('    saveMeta(host, meta);\n    return true;'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
