// 彼方 · 保存/清空失败必须能被调用方拿到 —— 批次 0 的先红后绿骨架(派活单 reviews/派活-2026-11-14-批0.md §2/§3)。
//
// 为什么是这几条: 写盘失败时调用方(界面)现在什么都拿不到 —— saveData 两条路径都返回 undefined,
// 变更返回 里没有失败位, 界面只能靠"返回的数据自己变了没"来猜; clearAllData 读不到楼层时把
// 清空层写成 0, 等于下一轮把整条聊天重新分析一遍。这份用例按已裁定的契约钉住**外部可见的行为**,
// 实现没改时它必须红; 实现交了之后它必须绿。
//
// 变异验收(派活单 §3.1): 把 saveData 的 return true/false 改回隐式 undefined → 本文件必须红([1] 两条)。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { 建变更环境, 更新状态卡 } from '../src/彼方_NPC幕后生命状态系统/数据变更';
import { clearAllData, emptyData, saveData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';
import { useStateStore } from '../src/彼方_NPC幕后生命状态系统/数据仓';

// 卡合并 的判定型尾部用酒馆注入的 _; 用例里给真的
(globalThis as any)._ = lodash;

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

/**
 * 假平台: 变量表(global/chat/message 三层, 与 host.vars 同语义) + 楼层。
 * `楼层炸` = chat.lastMessageId() 抛错, 即"读不到当前楼层"的写盘失败注入点。
 * worldbook 用 getter 当绊线: 世界书写入=关闭 时谁都不该碰它, 碰了就该炸出声。
 */
function 假宿主(选项: { 楼层?: number; 楼层炸?: boolean; 旧清空层?: number } = {}) {
  const 存: any = { global: {}, chat: {}, message: {} };
  // 彼方_settings 预置成 关闭档: 变更后不重同步世界书, 本用例才能只盯着"写盘"这一件事
  存.global['彼方_settings'] = { 更新: { 世界书写入: '关闭' } };
  存.chat[STORAGE_KEY] = { 版本: 3, 快照楼层: [3], 清空层: 选项.旧清空层 ?? 5 };
  存.message[3] = {};
  const 变量表 = (arg: any) => (arg?.type === 'global' ? 存.global : arg?.type === 'chat' ? 存.chat : 存.message[arg?.message_id]);
  return {
    存,
    host: {
      vars: {
        get: (arg: any) => 变量表(arg),
        update: (fn: any, arg: any) => {
          const 新 = fn(变量表(arg));
          if (arg?.type === 'global') 存.global = 新;
          else if (arg?.type === 'chat') 存.chat = 新;
          else 存.message[arg.message_id] = 新;
        },
        del: (key: string, arg: any) => {
          delete 变量表(arg)[key];
        },
      },
      chat: {
        lastMessageId: () => {
          if (选项.楼层炸) throw new Error('楼层读不到(测试注入)');
          return 选项.楼层 ?? 3;
        },
        messages: (id: number) => [{ id, is_hidden: false, message: `第${id}楼正文`, content: `第${id}楼正文` }],
      },
      get worldbook(): any {
        throw new Error('世界书写入=关闭 的用例不该碰世界书');
      },
      toast: { success: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    },
  };
}

const 基础数据 = () => ({ ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭', 位置: '客厅' } } }) as any;

console.log('\n[1] saveData 的返回值: 成功 true / 失败 false(变异验收 §3.1 的靶心)');
{
  const { host } = 假宿主();
  ok('写成功 → 返回 true', saveData(host as any, 基础数据()) === true);
  const 坏 = 假宿主({ 楼层炸: true });
  ok('写失败(读不到楼层) → 返回 false', saveData(坏.host as any, 基础数据()) === false);
}

console.log('\n[2] 变更返回: 失败时 界面拿得到失败位、原引用, 且 store 不被提交');
{
  // 失败路径: saveData 失败 → 返回值必须带 失败, 数据 必须是入参原引用, 界面据此判"没变"
  setActivePinia(createPinia());
  const { host } = 假宿主({ 楼层炸: true });
  const 环境 = 建变更环境(host as any);
  const 原数据 = 基础数据();
  const 返回: any = 更新状态卡(原数据, '甲', { 位置: '厨房' }, 环境);
  ok('失败有值(界面据此弹失败提示, 不弹"已保存")', Boolean(返回.失败));
  ok('失败时 数据 是入参原引用(界面据此判"没变")', 返回.数据 === 原数据);
  const store = useStateStore();
  ok('store 没被提交(界面看到的还是旧卡, 不是"厨房")', (store.data as any).NPC?.['甲']?.位置 !== '厨房');
  ok('失败路径不得出现成功语义(说明不得是"已…")', !String(返回.说明 ?? '').startsWith('已'));
}
{
  // 成功对照(派活单 §3.5: 成功路径行为不变): 快照落盘 + store 提交 + 无失败位
  setActivePinia(createPinia());
  const { host, 存 } = 假宿主();
  const 环境 = 建变更环境(host as any);
  const 原数据 = 基础数据();
  const 返回: any = 更新状态卡(原数据, '甲', { 位置: '厨房' }, 环境);
  ok('成功没有失败位', 返回.失败 === undefined);
  const store = useStateStore();
  eq('store 提交了新卡', (store.data as any).NPC?.['甲']?.位置, '厨房');
  ok('快照落盘(楼层变量里有这份)', 存.message[3]?.[STORAGE_KEY] !== undefined);
  ok('成功路径说明仍是成功语义', String(返回.说明).startsWith('已'));
}

console.log('\n[3] clearAllData: 读不到楼层时 清空层 不得被写成 0(那等于下一轮重分析整条聊天)');
{
  const { host, 存 } = 假宿主({ 楼层炸: true, 旧清空层: 5 });
  const 返回: any = clearAllData(host as any);
  ok('失败: 返回 成功 === false', 返回?.成功 === false);
  eq('失败: 返回 清空层 保持旧值 5', 返回?.清空层, 5);
  eq('失败: 存储里的清空层也没被写成 0', 存.chat[STORAGE_KEY]?.清空层, 5);
}
{
  const { host } = 假宿主({ 楼层: 42, 旧清空层: 5 });
  const 返回: any = clearAllData(host as any);
  ok('成功对照: 返回 成功 === true', 返回?.成功 === true);
  eq('成功对照: 清空层 = 当前楼层 42', 返回?.清空层, 42);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
