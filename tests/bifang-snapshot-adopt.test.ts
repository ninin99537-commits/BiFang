// 彼方 · 楼层号对不上时按快照认领 —— 修 /cut 之后"人物被清空"。
//
// 背景: 状态快照存在**楼层变量**里(跟着那一楼走), 里面记着写入时的楼层号。`/cut` 删掉前段楼层后,
// 后面每一楼的编号整体前移, 于是"编号对不上" → 以前的实现直接判失效 → 扫尽 → 空状态 → 人物全没。
// 现在: 没有任何一份编号精确对得上时, 认领**编号最大**的那份(离现在最近), 并把 楼层/处理到楼层
// 改写成本楼 —— 之后一切自洽, 不会反复触发。
//
// 这一份同时钉住"多次删除"也一样能认: 认领不需要知道删了几层, 只需要"这一楼自己的快照"。
import { loadData, saveData, writeStateSnapshot } from '../src/彼方_NPC幕后生命状态系统/快照';

let pass = 0;
let fail = 0;
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
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

// ---- 假宿主: 楼层(按编号) + 楼层变量 + 聊天变量 ----
const 聊天变量: Record<string, any> = {};
let 楼层变量: Record<number, Record<string, any>> = {};
let 楼层们: number[] = [];

function 造宿主() {
  return {
    vars: {
      get: (option: any) => (option.type === 'chat'
        ? { ...聊天变量 }
        : { ...(楼层变量[option.message_id] ?? {}) }),
      // writeFloorVariables / saveMeta 都走 update: 必须按 option 区分"楼层变量"还是"聊天变量"
      update: (fn: any, option: any) => {
        if (option?.type === 'message') {
          const id = option.message_id;
          const 新 = fn({ ...(楼层变量[id] ?? {}) });
          楼层变量[id] = 新;
          return 新;
        }
        const 新 = fn({ ...聊天变量 });
        Object.assign(聊天变量, 新);
        return 新;
      },
      insertOrAssign: (patch: Record<string, any>, option: any) => {
        if (option?.type === 'message') {
          const id = option.message_id;
          楼层变量[id] = { ...(楼层变量[id] ?? {}), ...patch };
        }
        else {
          Object.assign(聊天变量, patch);
        }
      },
      del: (key: string, option: any) => {
        if (option?.type === 'message')
          delete 楼层变量[option.message_id]?.[key];
        else
          delete 聊天变量[key];
      },
    },
    chat: {
      messages: (range: any) => {
        const id = typeof range === 'number' ? range : Number(String(range).split('-').pop());
        return 楼层们.includes(id) ? [{ message_id: id, role: 'assistant', message: `第${id}楼正文`, is_hidden: false }] : [];
      },
      lastMessageId: () => (楼层们.length ? Math.max(...楼层们) : -1),
      currentChatId: () => '测试聊天',
    },
  } as any;
}

/** 把第 从 楼的变量搬到第 到 楼(模拟删除前段楼层: 消息带着自己的变量一起前移), 然后删掉原楼层 */
function 搬楼层(从: number, 到: number) {
  楼层变量[到] = { ...(楼层变量[从] ?? {}) };
  delete 楼层变量[从];
}

function 重置(楼层数: number) {
  楼层变量 = {};
  楼层们 = Array.from({ length: 楼层数 }, (_, i) => i);
  for (const 键 of Object.keys(聊天变量))
    delete 聊天变量[键];
}

function 写一份快照在(楼层: number, 名单: string[]) {
  const 数据 = {
    ...({} as any),
    名单,
    NPC: Object.fromEntries(名单.map(名 => [名, { 位置: `${名}的地方`, 当前在做: '发呆' }])),
    卡字段计数: {},
    统计: { 更新次数: 3, 最后更新: 123 },
    剧情时间: '2026-01-02 12:00',
    清空层: 0,
    锚点楼层: 楼层,
    处理到楼层: 楼层,
  };
  const 成 = writeStateSnapshot(造宿主(), 数据, 楼层, 楼层, true);
  ok(`（夹具）快照写入 #${楼层} 成功`, 成 === true);
}

console.log('\n[1] 编号精确对得上: 走老路, 不改任何东西');
{
  重置(20);
  写一份快照在(12, ['甲', '乙']);
  const 数据 = loadData(造宿主());
  eq('名单读出来', 数据.名单, ['甲', '乙']);
  eq('锚点楼层 = 12', 数据.锚点楼层, 12);
  eq('快照里的楼层号没被改写', 楼层变量[12]['彼方'].楼层, 12);
}

console.log('\n[2] /cut 删前 100 楼(消息带着变量前移): 认领, 不再清空');
{
  重置(200);
  写一份快照在(190, ['甲', '乙']);
  eq('（夹具）索引记的是旧编号', 聊天变量['彼方'].快照楼层, [190]);
  // 模拟 /cut 0-99: 剩下的楼层重排, 原来在 190 的那条现在在 90
  楼层们 = Array.from({ length: 100 }, (_, i) => i);
  搬楼层(190, 90);
  // 索引里仍然是旧编号 190 —— 那一楼已经不存在了
  const 数据 = loadData(造宿主());
  eq('认领后名单回来了', 数据.名单, ['甲', '乙']);
  eq('锚点楼层改成当前这一楼', 数据.锚点楼层, 90);
  eq('处理到楼层也跟着改成当前楼', 数据.处理到楼层, 90);
  eq('写入的楼层号被改写(之后不再反复认领)', 楼层变量[90]['彼方'].楼层, 90);
  eq('索引重建为当前这一楼', 聊天变量['彼方'].快照楼层, [90]);
  eq('NPC 卡内容完整', 数据.NPC['甲'].位置, '甲的地方');
  eq('统计与剧情时间都在', [数据.统计.更新次数, 数据.剧情时间], [3, '2026-01-02 12:00']);
  // 再读一次: 走精确匹配, 结果一致(认领是幂等的)
  const 再读 = loadData(造宿主());
  eq('第二次读结果一样', 再读.名单, ['甲', '乙']);
  eq('第二次读锚点不变', 再读.锚点楼层, 90);
}

console.log('\n[3] 多次删除: 再删一次(90 → 40), 仍然认得出');
{
  // 接着上一段的状态: 快照现在在 90, 索引也是 90
  楼层们 = Array.from({ length: 100 }, (_, i) => i);
  搬楼层(90, 40);
  楼层们 = Array.from({ length: 50 }, (_, i) => i); // 又 /cut 掉前 50 楼
  const 数据 = loadData(造宿主());
  eq('第二次删除后仍然认领成功', 数据.名单, ['甲', '乙']);
  eq('锚点 = 40', 数据.锚点楼层, 40);
  eq('楼层号再次被改写', 楼层变量[40]['彼方'].楼层, 40);
}

console.log('\n[4] 什么都没有: 仍然是空状态(不编造)');
{
  重置(10);
  const 数据 = loadData(造宿主());
  eq('名单为空', 数据.名单, []);
  eq('NPC 为空', 数据.NPC, {});
}

console.log('\n[5] 认领不越过"这一楼自己没有快照"的情况');
{
  重置(20);
  写一份快照在(15, ['丙']);
  楼层们 = Array.from({ length: 10 }, (_, i) => i);
  // 原来 15 楼那条被整条删掉了(没有变量搬过来) → 楼层变量里没有任何彼方快照
  delete 楼层变量[15];
  const 数据 = loadData(造宿主());
  eq('没有快照就是空, 不猜', 数据.名单, []);
}

console.log('\n[6] 清空层(聊天级)保留');
{
  重置(20);
  写一份快照在(18, ['丁']);
  聊天变量['彼方'].清空层 = 5;
  楼层们 = Array.from({ length: 10 }, (_, i) => i);
  搬楼层(18, 8);
  const 数据 = loadData(造宿主());
  eq('认领后名单在', 数据.名单, ['丁']);
  eq('清空层原样保留', 数据.清空层, 5);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
