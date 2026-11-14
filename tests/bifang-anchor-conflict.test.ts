// 彼方 · 快照锚点冲突 —— 批次 2 第 2 件(派活: #82, 需求位裁定: 不静默覆盖)。
//
// 缺陷场景: 手动保存(saveData)锚在**最新层**(#5), 之后跑一轮自动更新锚在**取料末层**(#3) ——
// 两份快照落不同楼层, 读侧(loadData)只取最大层号 → 手动那份赢, **这一轮自动更新的结果静默消失**。
// 裁定: 自动更新写入前若发现"锚点之后有更新的手动快照", 不写入 + 给用户一条提示 + 日志页记一行。
// 本用例当前必须红(冲突检测还没实现); 修复落地后绿。反向验收: 去掉冲突检测 → [①] 必须红。
// 楼层编排: 1=AI(旧剧情) 2=用户 3=AI(最新回复, 取料末层) 4/5=用户(手动保存时的最新层)。
import lodash from 'lodash';
import { createPinia, setActivePinia } from 'pinia';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';
import { saveData } from '../src/彼方_NPC幕后生命状态系统/快照';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { 彼方假宿主, 种已有状态, 模型卡乙, 弹窗记录, STORAGE_KEY } from './helpers/彼方假宿主';

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

console.log('\n[锚点冲突] 手动快照在 #5, 自动更新锚在 #3 → 本轮不写入 + 有提示 + 日志页有一行');
{
  setActivePinia(createPinia());
  const 模型输出 = JSON.stringify({ 剧情时间: { 开始: '2026-01-02 12:00', 结束: '2026-01-02 12:30' }, NPC: { 乙: 模型卡乙() }, 移除NPC: ['丙'] });
  const { host, 存, 记, 楼层 } = 彼方假宿主({ 最后楼层号: 5, 模型回复: [模型输出] });
  // 补两层用户输入(4/5): 手动保存锚在最新层 #5, 而取料末层仍是 #3(最后一条 AI 回复)
  楼层.push(
    { message_id: 4, role: 'user', is_hidden: false, message: '玩家输入：等等, 我再想想。' },
    { message_id: 5, role: 'user', is_hidden: false, message: '玩家输入：先不动。' },
  );
  种已有状态(host);
  // 手动保存: 锚在最新层 #5
  ok('手动保存成功(锚 #5)', saveData(host, {
    ...{ 名单: ['甲', '丙'], NPC: { 甲: { 当前在做: '做饭', 位置: '家', 身份锚点: '面包师' }, 丙: { 当前在做: '看店' } } },
    统计: { 更新次数: 7 },
    剧情时间: '2026-01-01 20:00',
  } as any) === true);
  // 自动更新: 假模型给了新角色乙 + 移除丙 —— 这一轮的结果就是"会被静默丢掉"的东西
  存.global['彼方_settings'].更新.读取最近回复数 = 3;

  const 原warn = console.warn;
  const 原error = console.error;
  const 收集: string[] = [];
  console.warn = (...a: any[]) => 收集.push(a.map(String).join(' '));
  console.error = (...a: any[]) => 收集.push(a.map(String).join(' '));
  try {
    await updateNpcStates(host as any);
  }
  catch {
    // updateNpcStates 内部吞错(失败走日志页+toast)
  }
  console.warn = 原warn;
  console.error = 原error;

  ok('模型确实跑了一轮(不是没跑)', 记.rawCalls.length === 1);
  ok('① 该轮不写入锚点楼层 #3(现状: 写了 → 红)', 存.message[3]?.[STORAGE_KEY] === undefined);
  const 全部弹窗 = [...弹窗记录(存, 'warn'), ...弹窗记录(存, 'error'), ...弹窗记录(存, 'info'), ...弹窗记录(存, 'success')];
  ok('② 用户能看到一条"因手动修改未保存"的提示(现状: 没有 → 红)', 全部弹窗.some(t => /手动|未保存|未写入/.test(String(t?.text ?? ''))));
  const 日志文本 = JSON.stringify(useDebugStore().log ?? {});
  ok('③ 日志页有一行"本轮结果因手动修改未保存"(现状: 没有 → 红)', 日志文本.includes('手动') || 收集.some(s => s.includes('手动')));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
