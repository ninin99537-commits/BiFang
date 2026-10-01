// 彼方 · 数据层(候选4 的第二块接缝) —— 用假平台跑真实源码
//
// 快照.ts 通过一个可替换的宿主访问平台(见那边的注释), 所以不装酒馆也能把数据层跑一遍:
// 空状态 / 写快照读回 / 快照上限与物理清理 / 楼层被删回退 / 重roll 回退 / 清空层 /
// 撤销快照 / 旧版数据迁移 / 迁移失败保留旧数据 / saveData 的锚点。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import {
  clearAllData,
  DATA_VERSION,
  discardSnapshotAt,
  emptyData,
  loadData,
  saveData,
  SNAPSHOT_LIMIT,
  STORAGE_KEY,
  updateClearLayer,
  writeStateSnapshot,
} from '../src/彼方_NPC幕后生命状态系统/快照';

setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/**
 * 假平台: 一本聊天楼层 + 变量表, 尽量照酒馆助手的行为来 ——
 * 关键在于"读取不存在的楼层会抛错", 数据层正是靠这个判定楼层已被删除。
 */
function makeFakePlatform(初始楼层: Record<string, any> = {}, 初始聊天变量: Record<string, any> = {}) {
  const floors: Record<string, any> = { ...初始楼层 };
  const floorVars: Record<string, any> = {};
  const deleted: string[] = [];
  let chatVars: Record<string, any> = { ...初始聊天变量 };

  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat')
          return chatVars;
        const id = String(option.message_id);
        if (!(id in floors))
          throw new Error(`楼层 #${id} 不存在`);
        return floorVars[id] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        const id = String(option.message_id);
        if (!(id in floors))
          throw new Error(`楼层 #${id} 不存在`);
        floorVars[id] = updater(floorVars[id] ?? {}) ?? floorVars[id];
        return floorVars[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete chatVars[path];
          return { variables: chatVars, delete_occurred: true };
        }
        const id = String(option.message_id);
        deleted.push(id);
        if (floorVars[id])
          delete floorVars[id][path];
        return { variables: floorVars[id] ?? {}, delete_occurred: true };
      },
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out = [];
        for (let i = from; i <= to; i++) {
          const m = floors[String(i)];
          if (!m)
            continue;
          if (options.role && options.role !== 'all' && m.role !== options.role)
            continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId() {
        const ids = Object.keys(floors).map(Number);
        return ids.length > 0 ? Math.max(...ids) : -1;
      },
    },
  };

  return {
    host,
    floors,
    floorVars,
    deleted,
    chatVars: () => chatVars,
    addFloor(id: number, message = `第${id}楼正文`, role = 'assistant') {
      floors[String(id)] = { role, message, is_hidden: false };
    },
  };
}

console.log('\n[1] 空聊天 → 空状态');
{
  const p = makeFakePlatform();
  injectHostForTest(p.host);
  const d = loadData();
  check('锚点楼层 = -1', d.锚点楼层, -1);
  check('名单为空', d.名单, []);
  check('NPC 为空', d.NPC, {});
  check('清空层 = 0', d.清空层, 0);
  check('处理到楼层 = 0', d.处理到楼层, 0);
}

console.log('\n[2] 写一份快照 → 读回来是同一份');
{
  const p = makeFakePlatform();
  p.addFloor(5, '第五楼正文');
  injectHostForTest(p.host);
  const data = {
    ...emptyData(),
    名单: ['甲'],
    NPC: { 甲: { 当前在做: '砍柴', 最后更新: 123, 人设参考: '不该入库' } },
    统计: { 更新次数: 3, 最后更新: 111 },
    剧情时间: '2026-10-01 12:00',
    处理到楼层: 5,
    清空层: 4,
  };
  check('写入成功', writeStateSnapshot(data, 5, 5, true), true);
  const back = loadData();
  check('锚点楼层 = 5', back.锚点楼层, 5);
  check('名单', back.名单, ['甲']);
  check('NPC 卡(调试字段已剔除)', back.NPC, { 甲: { 当前在做: '砍柴' } });
  check('更新次数', back.统计.更新次数, 3);
  check('剧情时间', back.剧情时间, '2026-10-01 12:00');
  check('处理到楼层', back.处理到楼层, 5);
  check('清空层被本次写入消费掉', back.清空层, 0);
}

console.log(`\n[3] 快照上限 ${SNAPSHOT_LIMIT} 份: 超额的最早楼层被物理删除`);
{
  const p = makeFakePlatform();
  for (let i = 1; i <= 12; i++)
    p.addFloor(i);
  injectHostForTest(p.host);
  for (let i = 1; i <= 12; i++)
    writeStateSnapshot({ ...emptyData(), 名单: [`N${i}`] }, i, i, false);
  const meta = p.chatVars()[STORAGE_KEY];
  check('索引只留上限份数', meta.快照楼层.length, SNAPSHOT_LIMIT);
  check('留下的是最新的 10 层', meta.快照楼层, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  check('超额楼层变量被物理删除', p.deleted, ['1', '2']);
  check('最早那份快照键已删除', p.floorVars['1'][STORAGE_KEY], undefined);
  check('读回仍是最新那份', loadData().名单, ['N12']);
}

console.log('\n[4] 楼层不存在 → 写入失败, 索引不动');
{
  const p = makeFakePlatform();
  p.addFloor(3);
  injectHostForTest(p.host);
  check('返回 false', writeStateSnapshot(emptyData(), 9, 9, false), false);
  check('没有留下索引', p.chatVars()[STORAGE_KEY], undefined);
}

console.log('\n[5] 楼层被删(或重roll) → 自动回退到更早快照, 并清掉失效索引');
{
  const p = makeFakePlatform();
  p.addFloor(3);
  p.addFloor(7);
  injectHostForTest(p.host);
  writeStateSnapshot({ ...emptyData(), 名单: ['老状态'] }, 3, 3, false);
  writeStateSnapshot({ ...emptyData(), 名单: ['新状态'] }, 7, 7, false);
  check('当前读到的是最新快照', loadData().名单, ['新状态']);
  delete p.floors['7'];
  const rolled = loadData();
  check('回退到更早快照', rolled.名单, ['老状态']);
  check('锚点楼层跟着回退', rolled.锚点楼层, 3);
  check('失效楼层已从索引清掉', p.chatVars()[STORAGE_KEY].快照楼层, [3]);
}

console.log('\n[6] 楼层还在但快照键没了(重roll出新页) → 回退, 但索引保留');
{
  const p = makeFakePlatform();
  p.addFloor(3);
  p.addFloor(7);
  injectHostForTest(p.host);
  writeStateSnapshot({ ...emptyData(), 名单: ['老状态'] }, 3, 3, false);
  writeStateSnapshot({ ...emptyData(), 名单: ['新状态'] }, 7, 7, false);
  delete p.floorVars['7'];
  const back = loadData();
  check('回退到更早快照', back.名单, ['老状态']);
  check('索引保留 7(切回该 swipe 页时快照会回来)', p.chatVars()[STORAGE_KEY].快照楼层, [3, 7]);
}

console.log('\n[7] 清空全部数据 → 快照物理删除 + 记录清空层');
{
  const p = makeFakePlatform();
  p.addFloor(2);
  p.addFloor(9);
  injectHostForTest(p.host);
  writeStateSnapshot({ ...emptyData(), 名单: ['甲'] }, 2, 2, false);
  writeStateSnapshot({ ...emptyData(), 名单: ['乙'] }, 9, 9, false);
  const layer = clearAllData();
  check('清空层 = 最后一个楼层', layer, 9);
  check('所有楼层快照被删', p.deleted, ['2', '9']);
  check('元数据重置', p.chatVars()[STORAGE_KEY], { 版本: DATA_VERSION, 快照楼层: [], 清空层: 9 });
  check('清空后读到空状态', loadData().名单, []);
  check('清空层对新状态仍生效', loadData().清空层, 9);
}

console.log('\n[8] 撤销指定楼层快照 / 单独改清空层');
{
  const p = makeFakePlatform();
  p.addFloor(3);
  p.addFloor(8);
  injectHostForTest(p.host);
  writeStateSnapshot({ ...emptyData(), 名单: ['甲'] }, 3, 3, false);
  writeStateSnapshot({ ...emptyData(), 名单: ['乙'] }, 8, 8, false);
  check('撤销存在的快照 → true', discardSnapshotAt(8), true);
  check('撤销后回落到更早快照', loadData().名单, ['甲']);
  check('撤销不存在的楼层 → false', discardSnapshotAt(999), false);
  updateClearLayer(5);
  check('清空层被单独改成 5', p.chatVars()[STORAGE_KEY].清空层, 5);
  check('读回带着新的清空层', loadData().清空层, 5);
}

console.log('\n[9] 旧版数据(v2: 本体存在聊天变量) → 迁移成楼层快照');
{
  const p = makeFakePlatform({}, {});
  p.addFloor(4);
  p.addFloor(8);
  p.addFloor(9, '玩家发言', 'user');
  p.addFloor(12);
  injectHostForTest(p.host);
  p.chatVars()[STORAGE_KEY] = {
    版本: 2,
    名单: ['旧甲'],
    NPC: { 旧甲: { 当前在做: '旧事' } },
    清空层: 0,
    快照: [{ 层数: 1, 名单: ['历史1'], NPC: { 历史1: { 当前在做: '一' } }, 统计: { 更新次数: 1, 最后更新: 1 }, 剧情时间: '2026-01-01 00:00' }],
  };
  const d = loadData();
  check('索引 = 历史快照层 + 当前状态层', p.chatVars()[STORAGE_KEY].快照楼层, [4, 12]);
  check('元数据换成新结构', p.chatVars()[STORAGE_KEY].版本, DATA_VERSION);
  check('历史快照按"第1条AI回复"换算到 4 楼', p.floorVars['4'][STORAGE_KEY].名单, ['历史1']);
  check('当前状态写到最后一个 AI 楼层(用户楼层被跳过)', p.floorVars['12'][STORAGE_KEY].名单, ['旧甲']);
  check('读回当前状态', d.名单, ['旧甲']);
  check('锚点楼层 = 12', d.锚点楼层, 12);
  check('迁移成功后删掉兜底备份', p.chatVars()['彼方_旧版备份'], undefined);
}

console.log('\n[10] 迁移失败 → 旧数据原样保留, 下次访问重试');
{
  const p = makeFakePlatform({}, {});
  p.addFloor(4);
  p.addFloor(12);
  injectHostForTest(p.host);
  const 旧结构 = { 版本: 2, 名单: ['旧甲'], NPC: { 旧甲: { 当前在做: '旧事' } }, 清空层: 0, 快照: [] };
  p.chatVars()[STORAGE_KEY] = 旧结构;
  const 真更新 = p.host.vars.update;
  p.host.vars.update = (updater: any, option: any) => {
    if (option.type === 'message' && option.message_id === 12)
      throw new Error('写入楼层失败');
    return 真更新(updater, option);
  };
  const d = loadData();
  check('本次按空状态运行', d.名单, []);
  check('旧结构没被覆盖', p.chatVars()[STORAGE_KEY].版本, 2);
  check('兜底备份还在(留着重试)', p.chatVars()['彼方_旧版备份'].版本, 2);
  p.host.vars.update = 真更新;
  const 重试 = loadData();
  check('下次访问重试成功', 重试.名单, ['旧甲']);
  check('重试后旧结构被覆盖', p.chatVars()[STORAGE_KEY].版本, DATA_VERSION);
}

console.log('\n[11] saveData(界面手动编辑) 以最后一个楼层为锚点');
{
  const p = makeFakePlatform();
  p.addFloor(1);
  p.addFloor(2);
  p.addFloor(5);
  injectHostForTest(p.host);
  saveData({ ...emptyData(), 名单: ['手改的'], 处理到楼层: 3 });
  const back = loadData();
  check('锚点 = 最后一个楼层', back.锚点楼层, 5);
  check('内容已保存', back.名单, ['手改的']);
  check('进度(处理到楼层)保持传入值', back.处理到楼层, 3);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
