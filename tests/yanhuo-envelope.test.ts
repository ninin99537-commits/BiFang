// 烟火 · 去信封接线: 上游工具调用信封进来, 解析层要拿到真载荷(2026-10-16 真机那次)。
//
// 真机症状: 模型吐 `emit_complete_response_<nonce>{content:{…世界 JSON…}}`, 最外那个 `{` 没闭合,
// 而世界 JSON 的每个 `{` 都紧跟在冒号后面(值位置) → 被 下一个顶层开括号 全跳过 → 0 候选 →
// 报 "AI 没有返回 JSON 对象"。剥掉信封前缀后, 世界 JSON 重新成为顶层对象。
import { 解析世界载荷 } from '../src/烟火_世界运转/解析';
import 解析源 from '../src/烟火_世界运转/解析.ts?raw';

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
const 载荷 =
  '{"世界":{"时间":"2026年09月14日 15:20","总览":"x"},' +
  '"地域":{"中央区":{"概况":"y","局势":"z"}},' +
  '"大势":{},"伏笔":[],"节令":[],"指标":{},"事件":[],"势力":{},"小结":"w"}';
const 取载荷 = (r: any) => (r.成功 ? r.载荷 : null);

console.log('\n[1] 真机形状: 信封进来, 出去的是世界载荷(不是信封本身)');
{
  const 形状: [string, string][] = [
    ['信封未闭合(真机那次)', `${信封头}{content:${载荷}`],
    ['信封闭合', `${信封头}{content:${载荷}}`],
    ['信封后面还跟着参考块', `${信封头}{content:${载荷}}\n<Reference_Example>{"示例":1}</Reference_Example>`],
  ];
  for (const [名, 文] of 形状) {
    const r: any = 解析世界载荷(文);
    ok(`${名}: 解析成功`, r.成功);
    check(`${名}: 小结对得上`, 取载荷(r)?.小结, 'w');
    ok(`${名}: 载荷是世界那一套, 不是信封的 content`, !!取载荷(r)?.世界 && !('content' in (取载荷(r) ?? {})));
  }
  const 裸: any = 解析世界载荷(载荷);
  check('对照: 裸 JSON 与信封里剥出来的载荷逐字相同', JSON.stringify(取载荷(裸)), JSON.stringify(取载荷(解析世界载荷(`${信封头}{content:${载荷}`) as any)));
}

console.log('\n[2] 接线锚点: 解析入口确实调了去信封');
{
  ok('引了 共用/去信封', 解析源.includes("from '../共用/去信封'"));
  ok('入口调用了 去信封(', 解析源.includes('去信封(text)'));
}

console.log(fail === 0 ? `\n烟火去信封: 全部通过 (${pass} 断言)` : `\n烟火去信封: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
