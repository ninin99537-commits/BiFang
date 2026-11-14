// 彼方 · 批次 3-3 日志落盘 —— 断言先行(接口由需求位 #133 钉死: 聊天变量键 彼方_日志, 值 {时间,请求,响应,错误?}, 只留 1 份)。
//
// 契约: 日志持久化到聊天变量; 模拟重载后仍能读到上次更新; 清空数据时一并清; 空日志时"复制报错内容"禁用。
// 当前必须红(实现还没落)；落地后绿。变异(去掉落盘)在落地后做: 第一条必红。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { 彼方假宿主, 种已有状态 } from './helpers/彼方假宿主';

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

console.log('\n[1] 一轮更新后, 聊天变量 彼方_日志 有 {时间, 请求, 响应}, 且请求体与日志页同源');
{
  setActivePinia(createPinia());
  const { host, 存 } = 彼方假宿主({ 模型回复: [JSON.stringify({ NPC: {} })] });
  种已有状态(host);
  await updateNpcStates(host as any);
  const 日志变量 = 存.chat['彼方_日志'];
  ok('彼方_日志 变量存在(落盘了)', !!日志变量);
  ok('有时间', 日志变量?.时间 !== undefined);
  ok('有请求体(与 debugStore 的请求同源)', typeof 日志变量?.请求 === 'string' && 日志变量.请求.length > 0 && 日志变量.请求 === (useDebugStore().log?.request ?? 日志变量.请求));
  ok('有响应体', typeof 日志变量?.响应 === 'string' && 日志变量.响应.length > 0);
}

console.log('\n[2] 第二轮更新后仍只留 1 份(覆盖, 不堆历史), 内容换成第二轮的');
{
  setActivePinia(createPinia());
  const 第二轮标记 = '第二轮专属剧情标记';
  const { host, 存, 楼层 } = 彼方假宿主({
    模型回复: [JSON.stringify({ NPC: {} }), JSON.stringify({ NPC: {} })],
  });
  楼层[0].message = `（较早的剧情）${第二轮标记}`;
  种已有状态(host);
  await updateNpcStates(host as any);
  await updateNpcStates(host as any);
  const 日志变量 = 存.chat['彼方_日志'];
  ok('仍只有一份(对象, 不是历史数组)', !!日志变量 && !Array.isArray(日志变量));
  ok('内容是第二轮的(请求体含第二轮楼层标记)', String(日志变量?.请求 ?? '').includes(第二轮标记));
}

console.log('\n[3] 清空数据 → 彼方_日志 一并被清');
{
  setActivePinia(createPinia());
  const { host, 存 } = 彼方假宿主({ 模型回复: [JSON.stringify({ NPC: {} })] });
  种已有状态(host);
  await updateNpcStates(host as any);
  ok('清空前日志在', !!存.chat['彼方_日志']);
  const { clearAllData } = await import('../src/彼方_NPC幕后生命状态系统/快照');
  clearAllData(host);
  ok('清空数据后 彼方_日志 一并清掉', 存.chat['彼方_日志'] === undefined);
}

console.log('\n[4] 空日志时"复制报错内容"禁用 —— 渲染层用源码钉辅助(明标: 非行为证据)');
{
  const 面板源码 = (await import('../src/彼方_NPC幕后生命状态系统/日志面板.ts?raw')).default;
  ok('复制按钮有禁用条件(空日志不可复制, 不再复制空串报成功)', /disabled/.test(面板源码) && /日志/.test(面板源码));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
