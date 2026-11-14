// 剧情导演 · 去信封接线: 上游工具调用信封进来, 解析层要拿到真载荷(2026-10-16 真机, 烟火先撞上)。
//
// 导演的切分器在"最外那个 `{` 扫到末尾都没闭合"时直接收工(解析.ts 的 `if (!closed) break;`) ——
// 正是烟火 v2.8.4 修掉的那个旧行为。所以同一个信封, 导演报的是**同一条** "AI 没有返回 JSON 对象"。
import { 解析导演载荷 } from '../src/剧情导演/解析';
import 解析源 from '../src/剧情导演/解析.ts?raw';

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
const 载荷 = '{"下一幕":{"标题":"幕"},"伏笔":[{"标题":"f"}],"小结":"s"}';
const 取载荷 = (r: any) => (r.成功 ? r.载荷 : null);

console.log('\n[1] 真机形状: 信封进来, 出去的是导演载荷(不是信封本身)');
{
  const 形状: [string, string][] = [
    ['信封未闭合(真机那次)', `${信封头}{content:${载荷}`],
    ['信封闭合', `${信封头}{content:${载荷}}`],
    ['信封后面还跟着参考块', `${信封头}{content:${载荷}}\n<Reference_Example>{"示例":1}</Reference_Example>`],
  ];
  for (const [名, 文] of 形状) {
    const r: any = 解析导演载荷(文);
    ok(`${名}: 解析成功`, r.成功);
    check(`${名}: 小结对得上`, 取载荷(r)?.小结, 's');
    ok(`${名}: 载荷是导演那一套, 不是信封的 content`, !!取载荷(r)?.下一幕 && !('content' in (取载荷(r) ?? {})));
  }
  const 裸: any = 解析导演载荷(载荷);
  check('对照: 裸 JSON 与信封里剥出来的载荷逐字相同', JSON.stringify(取载荷(裸)), JSON.stringify(取载荷(解析导演载荷(`${信封头}{content:${载荷}`) as any)));
}

console.log('\n[2] 接线锚点: 解析入口确实调了去信封');
{
  ok('引了 共用/去信封', 解析源.includes("from '../共用/去信封'"));
  ok('入口调用了 去信封(', 解析源.includes('去信封(text)'));
}

console.log('\n[3] 元信息前缀(2026-10-21 真机): finishReason/finishMessage 后面才是载荷');
{
  const 元 = 'finishReason: STOP\nfinishMessage: Model generated function call(s).\n';
  const r: any = 解析导演载荷(`${元}${载荷}`);
  ok('解析成功', r.成功);
  check('载荷对得上', 取载荷(r)?.小结, 's');
  ok('顶层没有元信息残渣', !Object.keys(取载荷(r) ?? {}).some(k => /finish/i.test(k)));
}

console.log('\n[4] 截断诊断: 报错带括号/引号计数, 能区分真截断与字符串被打翻');
{
  const 截: any = 解析导演载荷('finishReason: STOP\nfinishMessage: x\n{"章回":{"章号":2,"主题":"半截');
  ok('失败', !截.成功);
  ok('原因里有「诊断:」计数', /诊断: '\{' \d+ \/ '\}' \d+ \/ '"' \d+/.test(截.原因));
  ok('判为截断(左括号多)', 截.截断 === true);
  // 引号奇数(第三个引号开启字符串后没闭合, 把 `}` 吞进去了) → 诊断要点明, 不让人去猜"是不是被截断"
  const 引号: any = 解析导演载荷('{"a":"b}');
  ok('引号奇数 → 诊断点明字符串被打翻', !引号.成功 && /'"' 3\(奇数←字符串状态被打翻\)/.test(引号.原因));
}

console.log(fail === 0 ? `\n导演去信封: 全部通过 (${pass} 断言)` : `\n导演去信封: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
