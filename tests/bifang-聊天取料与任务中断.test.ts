// 彼方 · 聊天取料与任务中断直测 —— 批次 2 第 4 件(派活: #82/#85)。
//
// 这两个模块此前零用例(验收盲区清单 P0 第 3 条点过名), 且各自可注入假宿主直测:
// - 聊天取料: 隐藏楼层跳过、窗口扩够(从近到远扩窗找可见 AI 楼层 —— 旧版固定窗口在隐藏楼层多时会取不够);
// - 任务中断: 同名任务重复启动先中断旧的 —— 断言**旧 signal 真 aborted**(行为), 不看 tasks.size(内部状态)。
// 两条都是现有行为的钉子, 预期全绿; 哪条红了就是行为被改, 当场是回归。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { 最近回复 } from '../src/彼方_NPC幕后生命状态系统/聊天取料';
import { useUpdatingStore } from '../src/彼方_NPC幕后生命状态系统/任务中断';
import { 彼方假宿主 } from './helpers/彼方假宿主';

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

console.log('\n[聊天取料] 隐藏楼层跳过: 24 条隐藏 AI 回复挡在中间, 最近回复仍取到可见的 28/29/30');
{
  const { host, 楼层 } = 彼方假宿主({ 最后楼层号: 30 });
  for (let id = 4; id <= 27; id++)
    楼层.push({ message_id: id, role: 'assistant', is_hidden: true, message: `隐藏的旧回复 #${id}` });
  楼层.push(
    { message_id: 30, role: 'assistant', is_hidden: false, message: '可见回复 30' },
    { message_id: 29, role: 'assistant', is_hidden: false, message: '可见回复 29' },
    { message_id: 28, role: 'assistant', is_hidden: false, message: '可见回复 28' },
  );
  const 最近 = 最近回复(host as any, 3);
  eq('隐藏楼层全部跳过, 取到 [28,29,30]', 最近.map(m => m.message_id), [28, 29, 30]);
  ok('取的都是可见楼层', 最近.every(m => !m.is_hidden));
}

console.log('\n[聊天取料] 窗口扩够: 唯一的可见 AI 回复在 #1, 首窗(12)够不着, 必须扩到扫全聊天');
{
  const { host, 楼层 } = 彼方假宿主({ 最后楼层号: 30 });
  楼层[1].role = 'assistant';
  楼层[1].is_hidden = true;
  楼层[2].is_hidden = true;
  for (let id = 4; id <= 29; id++)
    楼层.push({ message_id: id, role: 'assistant', is_hidden: true, message: `隐藏 #${id}` });
  const 最近 = 最近回复(host as any, 3);
  eq('扩窗后够到唯一的可见回复 #1', 最近.map(m => m.message_id), [1]);
  ok('取的是可见楼层', 最近.every(m => !m.is_hidden));
}

console.log('\n[任务中断] 同名任务重复启动先中断旧的: 旧 signal 真 aborted(行为), 不是看 tasks.size');
{
  setActivePinia(createPinia());
  const store = useUpdatingStore();
  const 旧信号 = store.start('正在分析…', '幕后');
  ok('启动后 isActive(幕后)', store.isActive('幕后') === true);
  const 新信号 = store.start('正在重试…', '幕后');
  ok('同名重启: 旧 signal 真 aborted', 旧信号.aborted === true);
  ok('新 signal 未被中断', 新信号.aborted === false);
  const 甲任务 = store.start('X', 'X');
  const 乙任务 = store.start('Y', 'Y');
  ok('不同名任务互不中断', 甲任务.aborted === false && 乙任务.aborted === false);
  store.stop('X');
  ok('stop(名) 只移除该任务', store.isActive('X') === false && store.isActive('Y') === true);
  store.stop();
  ok('无参 stop 清空全部', store.isActive('Y') === false && store.isActive('幕后') === false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
