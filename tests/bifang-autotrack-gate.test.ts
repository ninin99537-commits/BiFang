// 彼方 · applyUpdate 的 autoTrack 闸门钉子 —— 批次 1 插队急活的重点件(派活: #55)。
//
// 为什么是这两条: 批次 1 删了从未被读的 `timeJump` 参数, tests/ 里按位置传参的调用点实参整体左移,
// `autoTrack` 收到 `null`(falsy, 等价"自动建档关闭") —— 用例还全绿, 只是因为用例里的 NPC 都在
// 名单内, 闸门(应用更新.ts: `if (!autoTrack && !isTrackedNpc(name))`)根本没被踩到。把闸门本身
// 钉死: 名单外新角色, 建档与跳过各一条 —— 将来任何实参错位, 红的是这里, 不再靠人想起来。
import { applyUpdate } from '../src/彼方_NPC幕后生命状态系统/应用更新';
import { emptyData } from '../src/彼方_NPC幕后生命状态系统/快照';

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

const 造数据 = () => ({ ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } } }) as any;

console.log('\n[1] 名单外新角色 + autoTrack=true → 建档(进名单、有卡、记入 摘要.更新)');
{
  const 结果 = applyUpdate(造数据(), { 乙: { 当前在做: '巡逻' } }, null, true);
  ok('新角色进了名单', (结果.数据.名单 ?? []).includes('乙'));
  ok('新角色有卡', 结果.数据.NPC?.['乙']?.当前在做 === '巡逻');
  ok('摘要.更新 记了它', (结果.摘要?.更新 ?? []).includes('乙'));
  ok('摘要.跳过 为空', (结果.摘要?.跳过 ?? []).length === 0);
}

console.log('\n[2] 名单外新角色 + autoTrack=false → 跳过(进 摘要.跳过), 名单内老人照常合并');
{
  const 结果 = applyUpdate(造数据(), { 甲: { 当前在做: '洗碗' }, 乙: { 当前在做: '巡逻' } }, null, false);
  ok('摘要.跳过 记了它', (结果.摘要?.跳过 ?? []).includes('乙'));
  ok('没建档: NPC 无乙', 结果.数据.NPC?.['乙'] === undefined);
  ok('没进名单', !(结果.数据.名单 ?? []).includes('乙'));
  ok('名单内老人(甲)不受闸门影响, 照常合并', (结果.摘要?.更新 ?? []).includes('甲') && 结果.数据.NPC?.['甲']?.当前在做 === '洗碗');
  ok('甲也不在跳过单里', !(结果.摘要?.跳过 ?? []).includes('甲'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
