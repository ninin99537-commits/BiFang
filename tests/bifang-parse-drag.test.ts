// 彼方 · 解析诊断与移动端拖动(2026-10-21)。
//
// 为什么是**源码级**断言: 彼方的 `parseModelResponse` 是内部函数(只导出 请求并校验 /
// isReservedTopLevelKey / THINKING_FIELD_KEYS), 要驱动它得搬 update-pipeline.test.ts 那套
// 一百多行的假平台 —— 与 bifang-envelope.test.ts 同一条边界。这里钉"两份实现都接上了线"
// 与"拖动的不变量没被改回去", 行为本身由共用的 去信封.test.ts / panel-drag-mobile.test.ts 覆盖。
//
// 这三份实现(请求解析 / 界面 / 样式)必须一起钉住, 只改一份 = 另一处继续坏。
import { 去信封 } from '../src/共用/去信封';
import 正式请求源 from '../src/彼方_NPC幕后生命状态系统/模型请求.ts?raw';
import 正式界面源 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';
import 正式样式源 from '../src/彼方_NPC幕后生命状态系统/面板样式.css?raw';

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

const 份 = [
  ['正式版', 正式请求源, 正式界面源, 正式样式源] as const,
];

const 载荷 = '{"剧情时间":{"开始":"0004-01-01 08:00","结束":"0004-01-01 09:00"},"爱丽丝":{"位置":"书房"}}';
const 元 = 'finishReason: STOP\nfinishMessage: Model generated function call(s).\n';

console.log('\n[1] 解析诊断接线: 两份实现都带「括号诊断」并挂在"没有 JSON 对象"那条报错上');
{
  for (const [名, 请求源] of 份) {
    ok(`${名}: 定义了 括号诊断`, 请求源.includes('function 括号诊断(text: string): string {'));
    ok(`${名}: 报错里调用了它`, 请求源.includes('${括号诊断(content)}'));
    ok(`${名}: 判据一(引号奇数)在`, 请求源.includes('(奇数←字符串状态被打翻)'));
    ok(`${名}: 判据二(左括号多)在`, 请求源.includes('(左多←截断)'));
    ok(`${名}: 去信封仍在入口`, 请求源.includes('去信封(text)'));
    // 原文案必须保留在前 —— 既有断言按前缀匹配, 不能为了加诊断改掉它
    ok(`${名}: 原报错前缀没被改掉`, 请求源.includes('AI 没有返回 JSON 对象（只输出了文字/推理内容, 或大括号不配平可能被截断）'));
  }
}

console.log('\n[2] 元信息前缀: 彼方载荷在"finishReason 两行"之后也能被剥出来');
{
  check('剥完就是纯载荷', 去信封(`${元}${载荷}`), 载荷);
  ok('剥完仍含 "剧情时间"(彼方切分器的判据)', 去信封(`${元}${载荷}`).includes('"剧情时间"'));
  const 信封头 = 'emit_complete_response_ff5b24e854bfad63f26efccd';
  ok('元信息 + 信封叠在一起 → 两层都剥', 去信封(`${元}${信封头}{content:${载荷}`) === 载荷);
}

console.log('\n[3] 截断前提: 真截断的文本确实左括号多(所以诊断会标「截断」)');
{
  const 截 = 'finishReason: STOP\nfinishMessage: x\n{"剧情时间":{"开始":"0004-01-01 08:00';
  ok('左括号多于右括号', (截.match(/\{/g) ?? []).length > (截.match(/\}/g) ?? []).length);
  const 剥后 = 去信封(截);
  ok('去信封只剥前缀, 不"修好"截断', 剥后.startsWith('{') && (剥后.match(/\{/g) ?? []).length > (剥后.match(/\}/g) ?? []).length);
  ok('前缀确实被剥掉了', !剥后.includes('finishReason'));
}

console.log('\n[4] 移动端拖动: 两份 .vue 的起点/收尾/锁指针/主键 四条都在');
{
  for (const [名, , 界面源] of 份) {
    ok(`${名}: 起点走 parentClient`, 界面源.includes('const start = parentClient(e);'));
    ok(`${名}: 旧的手写起点已删`, !/startX = \(rect\?\.left \?\? 0\) \+ e\.clientX/.test(界面源));
    ok(`${名}: 挂 pointercancel ×2`, (界面源.match(/addEventListener\('pointercancel', onUp\)/g) || []).length === 2);
    ok(`${名}: 摘 pointercancel ×2`, (界面源.match(/removeEventListener\('pointercancel', onUp\)/g) || []).length === 2);
    ok(`${名}: 收尾复位 isDragging`, /function onUp\(\) \{\s*\n\s*isDragging\.value = false/.test(界面源));
    ok(`${名}: setPointerCapture`, 界面源.includes('setPointerCapture?.(e.pointerId)'));
    ok(`${名}: 主键守卫`, 界面源.includes("e.pointerType === 'mouse' && e.button !== 0"));
  }
}

console.log('\n[5] 球的 touch-action: none(彼方原本就有, 防止被顺手删掉)');
{
  for (const [名, , , 样式源] of 份) {
    ok(`${名}: .bf-orb 有 touch-action: none`, /\.bf-orb\s*\{[^}]*touch-action:\s*none/.test(样式源));
  }
}

console.log(fail === 0 ? `\n彼方解析/拖动: 全部通过 (${pass} 断言)` : `\n彼方解析/拖动: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);


