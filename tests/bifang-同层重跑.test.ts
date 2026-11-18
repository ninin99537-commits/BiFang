// 彼方 · W3 同层重跑回退 —— 批次: 第二轮(方案 §23 W3)。
//
// 用户原话: 「同一层重复请求不应该是把当前层有的清掉再请求嘛，就像重来没填过一样」
//
// 覆盖:
//   [A] 判据本体: 锚点 >= 本轮锚点 → 回退到严格更早的最新一份
//   [B] 没有更早的快照 → 空状态(真"从没填过")
//   [C] 正常前进(锚点 < 本轮锚点) → 行为不变(这是最重要的回归)
//   [D] loadData 本身行为不变(界面/世界书那条路不该跟着回退)
//   [E] 端到端: 同一层重跑两次, 第二次的提示词里不带第一次的错名字
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { loadData, 读取基线, writeStateSnapshot, emptyData, STORAGE_KEY } from '../src/彼方_NPC幕后生命状态系统/快照';
import { 彼方假宿主, 种已有状态 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 备注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  FAIL ${名}${备注 ? `  (${备注})` : ''}`);
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
    console.log(`  FAIL ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

// ─────────────────────────────────────────────────────────────
console.log('\n[A] 判据本体: 锚点 >= 本轮锚点 → 回退到严格更早的最新一份');
{
  const { host } = 彼方假宿主();
  // 楼层 1 放一份旧状态, 楼层 3 放一份"这一层算过的"状态
  const 旧 = { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } } };
  const 本层 = { ...emptyData(), 名单: ['甲', '乙'], NPC: { 甲: { 当前在做: '做饭' }, 乙: { 当前在做: '看书' } } };
  writeStateSnapshot(host as any, 旧 as any, 1, 1, false);
  writeStateSnapshot(host as any, 本层 as any, 3, 3, false);

  // 同层重跑: 锚点 3, 现状的锚点也是 3
  const 基线 = 读取基线(host as any, 3);
  eq('[A] 回退到楼层 1 的名单', 基线.名单, ['甲']);
  eq('[A] 回退后锚点 = 1', 基线.锚点楼层, 1);
  ok('[A] 「乙」不在回退后的基线里', 基线.NPC['乙'] === undefined);

  // 正常前进: 锚点 4(比现状 3 大), 不该回退
  const 前进 = 读取基线(host as any, 4);
  eq('[A] 正常前进不回退(拿到的是楼层 3 那份)', 前进.锚点楼层, 3);
  eq('[A] 正常前进时「乙」还在', 前进.名单, ['甲', '乙']);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[B] 没有更早的快照 → 空状态');
{
  const { host } = 彼方假宿主();
  const 本层 = { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } } };
  writeStateSnapshot(host as any, 本层 as any, 3, 3, false);
  const 基线 = 读取基线(host as any, 3);
  eq('[B] 空状态: 名单为空', 基线.名单, []);
  eq('[B] 空状态: 没有 NPC', Object.keys(基线.NPC), []);
  eq('[B] 空状态: 锚点 -1', 基线.锚点楼层, -1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[C] 正常自动更新路径行为不变(最重要的回归)');
{
  const { host } = 彼方假宿主();
  // 模拟三轮自动更新: 锚点 1 → 2 → 3
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: 'a' } } } as any, 1, 1, false);
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: 'b' } } } as any, 2, 2, false);
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: 'c' } } } as any, 3, 3, false);
  // 下一轮锚点是 4 → 不回退, 拿到楼层 3
  const 基线 = 读取基线(host as any, 4);
  eq('[C] 逐层前进: 拿到最新那份', 基线.锚点楼层, 3);
  eq('[C] 逐层前进: 内容是最新的', 基线.NPC['甲'].当前在做, 'c');
}

// ─────────────────────────────────────────────────────────────
console.log('\n[D] loadData 本身行为不变(界面/世界书那条路不该回退)');
{
  const { host } = 彼方假宿主();
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲'], NPC: { 甲: {} } } as any, 1, 1, false);
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲', '乙'], NPC: { 甲: {}, 乙: {} } } as any, 3, 3, false);
  // loadData 永远是"现在是什么样" —— 拿到最新的楼层 3
  const 现状 = loadData(host as any);
  eq('[D] loadData 仍返回最新那份', 现状.锚点楼层, 3);
  eq('[D] loadData 的名单没被回退', 现状.名单, ['甲', '乙']);
  // 而 读取基线(3) 会回退 —— 两者行为不同, 正是设计意图
  eq('[D] 读取基线(3) 回退到 1', 读取基线(host as any, 3).锚点楼层, 1);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[E] 端到端: 同层重跑, 第二次基线不带第一次的错误');
{
  setActivePinia(createPinia());
  const { host, 楼层 } = 彼方假宿主({ 最后楼层号: 3 });
  // 楼层 1: 干净基线(只有"甲")
  writeStateSnapshot(host as any, { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } } } as any, 1, 1, false);
  // 楼层 3: 第一次跑出来的、带错名字的污染状态
  writeStateSnapshot(host as any, {
    ...emptyData(),
    名单: ['甲', '乙', '丙错'],
    NPC: { 甲: {}, 乙: {}, 丙错: {} },
  } as any, 3, 3, false);

  // 同层重跑: 基线应该是楼层 1(干净), 不是楼层 3(污染)
  const 基线 = 读取基线(host as any, 3);
  ok('[E] 基线里没有错名字「丙错」', !基线.名单.includes('丙错'), JSON.stringify(基线.名单));
  eq('[E] 基线名单 = 楼层 1 那份', 基线.名单, ['甲']);

  // 反向确认: 如果直接用 loadData, 就会读到污染那份(证明这个 bug 真实存在过)
  const 污染 = loadData(host as any);
  ok('[E] 对照: loadData 读到的是被污染的那份', 污染.名单.includes('丙错'), JSON.stringify(污染.名单));

  // 楼层变量确实还在(回退是"读的时候跳过", 不是"删掉")
  ok('[E] 回退不删数据(楼层 3 的快照还在)', host.vars.get({ type: 'message', message_id: 3 })?.[STORAGE_KEY] !== undefined);
  eq('[E] 楼层数据完好', host.vars.get({ type: 'message', message_id: 3 })?.[STORAGE_KEY]?.名单, ['甲', '乙', '丙错']);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
