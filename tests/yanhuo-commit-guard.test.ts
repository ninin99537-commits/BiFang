import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import lodash from 'lodash';
import { injectHostForTest } from '../src/烟火_世界运转/host';
import { resetSettingsReadCacheForTest } from '../src/烟火_世界运转/settings';
import * as 存档 from '../src/烟火_世界运转/保存世界状态';

(globalThis as any)._ = lodash;
const copy = <T>(x: T): T => structuredClone(x);
function platform() {
  let chat = 'A';
  let swipe = 0;
  let failMeta = false;
  let failFloor = false;
  let failRollback = false;
  let writes = 0;
  const chats: Record<string, any> = { A: {}, B: {} };
  const messages: Record<string, any> = {
    A: { 1: '原始第一楼', 3: '原始第三楼', 5: '原始第五楼' },
    B: { 1: 'B第一楼', 3: 'B第三楼', 5: 'B第五楼' },
  };
  const floorVars: Record<string, any> = {};
  const key = (id: number) => `${chat}:${id}:${swipe}`;
  const host: any = {
    chat: {
      currentChatId: () => chat,
      currentSwipe: () => swipe,
      lastMessageId: () => 5,
      messages: (range: number | string) => {
        const [from, end] = String(range).split('-').map(Number);
        return Object.entries(messages[chat]).filter(([id]) => +id >= from && +id <= (end ?? from))
          .map(([id, message]) => ({ message_id: +id, role: 'assistant', is_hidden: false, message, swipe_id: swipe, data: {}, extra: {}, name: 'AI' }));
      },
    },
    vars: {
      get: (option: any) => option.type === 'chat' ? copy(chats[chat]) : option.type === 'global'
        ? { 烟火_settings: { 运转: { 快照保留份数: 1 } } } : copy(floorVars[key(option.message_id)] ?? {}),
      update: (updater: any, option: any) => {
        if (option.type === 'chat') {
          if (failMeta) throw Error('测试：索引保存失败');
          chats[chat] = updater(copy(chats[chat]));
          return copy(chats[chat]);
        }
        if (failFloor || (failRollback && writes > 0)) throw Error('测试：楼层保存失败');
        writes++;
        floorVars[key(option.message_id)] = updater(copy(floorVars[key(option.message_id)] ?? {}));
        return copy(floorVars[key(option.message_id)]);
      },
      del: (field: string, option: any) => {
        const target = floorVars[key(option.message_id)] ?? {};
        delete target[field];
        return { variables: target, delete_occurred: true };
      },
    },
  };
  injectHostForTest(host);
  setActivePinia(createPinia());
  resetSettingsReadCacheForTest();
  return {
    host, chats, floorVars, messages,
    switchChat: (next: string) => { chat = next; },
    switchSwipe: (next: number) => { swipe = next; },
    failMeta: (next: boolean) => { failMeta = next; },
    failFloor: (next: boolean) => { failFloor = next; },
    failRollback: () => { failRollback = true; writes = 0; },
  };
}
const world = (text: string) => ({ ...存档.emptyData(), 世界: { 时间: '2039-07-13 11:35', 氛围: '平静', 总览: text }, 小结: text });

{
  const p = platform();
  assert.equal(存档.writeStateSnapshot(world('最后一份好状态'), 3, 3, false), true);
  const before = copy(p.chats.A);
  p.failMeta(true);
  assert.equal(存档.writeStateSnapshot(world('不得发布的候选'), 5, 5, false), false, '索引失败不能返回成功');
  assert.deepEqual(p.chats.A, before);
  assert.equal(存档.loadData().小结, '最后一份好状态');
  assert.ok(p.floorVars['A:3:0']?.烟火, '新索引未成功前不得裁掉旧快照');
}
console.log('PASS 索引失败保留上次可读状态');

{
  const p = platform();
  assert.equal(存档.writeStateSnapshot(world('好状态'), 3, 3, false), true);
  p.failMeta(true);
  p.failRollback();
  assert.equal(存档.writeStateSnapshot(world('未提交候选'), 3, 3, false), false);
  assert.equal(存档.loadData().小结, '好状态', '回滚写失败仍不得读取未提交候选');
}
console.log('PASS 同层失败候选不能顶掉最后好版本');

{
  const p = platform();
  assert.equal(存档.writeStateSnapshot(world('A原世界'), 3, 3, false), true);
  const origin = 存档.绑定楼层(3);
  p.switchChat('B');
  assert.equal(存档.归属仍有效(origin), false);
  assert.equal(存档.writeStateSnapshot(world('A迟到输出'), 3, 3, false, null, origin), false);
  assert.deepEqual(p.chats.B, {});
  p.switchChat('A'); p.switchSwipe(1);
  assert.equal(存档.归属仍有效(origin), false);
  p.switchSwipe(0); p.messages.A[3] = '用户编辑后的完整正文';
  assert.equal(存档.归属仍有效(origin), false);
}
console.log('PASS 聊天、swipe、正文归属守卫');

{
  const p = platform();
  存档.writeStateSnapshot(world('原世界'), 3, 3, false);
  const origin = 存档.绑定楼层(3);
  存档.writeStateSnapshot(world('人工修改'), 3, 3, false);
  assert.equal(存档.归属仍有效(origin), false);
  const saved = copy(p.floorVars);
  const base = 存档.读取重推基准(3);
  assert.equal(base.锚点楼层, -1);
  assert.deepEqual(p.floorVars, saved, '准备重推不删除旧快照');
}
console.log('PASS 修订号阻止旧响应，重推准备不破坏好状态');

{
  const p = platform();
  存档.writeStateSnapshot(world('清空前'), 3, 3, false);
  const staleSwipe = copy(p.floorVars['A:3:0']);
  const cutoff = 存档.clearAllData();
  assert.equal(cutoff, 5);
  p.messages.A[7] = '清空后第一轮'; p.host.chat.lastMessageId = () => 7;
  assert.equal(存档.writeStateSnapshot(world('第一轮'), 7, 7, true), true);
  assert.equal(存档.loadData().清空层, 5, '清空截止不能首轮消失');
  p.switchSwipe(1); p.floorVars['A:3:1'] = staleSwipe;
  p.chats.A.烟火.快照楼层.push(3);
  assert.notEqual(存档.loadData().小结, '清空前', '旧swipe也不能跨清空世代复活');
}
console.log('PASS 持久清空截止及跨swipe世代');

{
  const p = platform();
  const marker = '末尾不是同意，而是明确拒绝。';
  const long = '完整前情，'.repeat(2000) + marker;
  const data = world(long);
  assert.equal(存档.writeStateSnapshot(data, 3, 3, false), true);
  assert.equal(存档.loadData().世界.总览, long);
  assert.equal(存档.loadData().小结, long);
  const before = copy(p.chats.A);
  p.failFloor(true);
  const candidate = world('失败候选');
  const original = copy(candidate);
  assert.equal(存档.保存推进结果(candidate, 5).落盘, false);
  assert.deepEqual(candidate, original, '失败不推进调用者的游标或清空层');
  assert.deepEqual(p.chats.A, before);
}
console.log('PASS 长内容完整往返与失败不修改调用者');

// ── 汇总行（2026-11-19 补）──
// 为什么必须有: run.mjs 靠这行把本文件的通过数计入 TOTAL。
// 没有它 = 这个文件的断言数**从来没进过账**（run.mjs 的自检现在会把这种情况报出来）。
// 失败时 node:assert 会抛错 → 进程非零退出 → run.mjs 的 code!==0 能抓到，所以这里只报通过数。
console.log(`结果: ${6} 通过, 0 失败`);
