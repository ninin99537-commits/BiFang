// 彼方 · 去信封接线。
//
// 为什么这里只有"接线锚点 + 前提"，没有端到端行为断言：彼方的 `parseModelResponse` 是**内部函数**
// (模型请求.ts 只导出 请求并校验 / isReservedTopLevelKey / THINKING_FIELD_KEYS)，要驱动它就得把
// update-pipeline.test.ts 那套一百多行的假平台搬过来。函数本身的行为由 `去信封.test.ts` 覆盖，
// 这里钉两件事：① 入口确实调了它；② 剥完之后确实满足彼方切分器的判据(候选必须含 "剧情时间")。
import { 去信封 } from '../src/共用/去信封';
import 请求源 from '../src/彼方_NPC幕后生命状态系统/模型请求.ts?raw';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        实际 ${JSON.stringify(actual)}\n        期望 ${JSON.stringify(expected)}`);
  }
}
function ok(label: string, 条件: unknown) {
  check(label, !!条件, true);
}

const 信封头 = 'emit_complete_response_ff5b24e854bfad63f26efccd';
const 载荷 = '{"剧情时间":{"开始":"0004-01-01 08:00","结束":"0004-01-01 09:00"},"爱丽丝":{"位置":"书房"}}';

console.log('\n[1] 接线锚点: 解析入口确实调了去信封');
{
  ok('引了 共用/去信封', 请求源.includes("from '../共用/去信封'"));
  ok('解析入口调用了 去信封(', 请求源.includes('去信封(text)'));
}

console.log('\n[2] 剥完的信封文本满足彼方切分器的判据');
{
  const 剥后 = 去信封(`${信封头}{content:${载荷}}`);
  ok('剥完仍含 "剧情时间"(切分器就靠它认目标对象)', 剥后.includes('"剧情时间"'));
  ok('剥完不再以工具名开头', !剥后.startsWith('emit_'));
  // 前提: 未剥时最外那个 { 没闭合 —— 这正是彼方 `if (depth !== 0) break;` 收工、切不出候选的原因
  const 原始 = `${信封头}{content:${载荷}`;
  ok('对照: 未剥时大括号是失衡的(所以切分器会直接收工)', (原始.match(/\{/g) ?? []).length > (原始.match(/\}/g) ?? []).length);
}

console.log(fail === 0 ? `\n彼方去信封: 全部通过 (${pass} 断言)` : `\n彼方去信封: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
