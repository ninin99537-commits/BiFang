// 共用 · 去信封 —— 上游注入的工具调用信封(2026-10-16 真机, 烟火): 剥掉它, 解析层才看得到真载荷。
//
// 真机那次模型吐的是 `emit_complete_response_<nonce>{content:{…世界 JSON…}}`。三个插件的解析器
// 都会被打中(未闭合 → 0 候选; 闭合 → 收下信封本身)。这里只验这一层的契约, 接线由各插件自己的
// `*-envelope.test.ts` 盯。
import { 去信封 } from '../src/共用/去信封';

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
const 载荷 = '{"世界":{"时间":"2026年09月14日 15:20"},"小结":"w"}';

console.log('\n[1] 没有信封: 一个字节都不改');
{
  check('裸 JSON 原样', 去信封(载荷), 载荷);
  check('首尾空白也不动', 去信封(`  ${载荷}  `), `  ${载荷}  `);
  check('纯散文原样', 去信封('我觉得剧情应该这样发展'), '我觉得剧情应该这样发展');
  check('空串', 去信封(''), '');
  // 判据要求 `{` 前面有个标识符, 所以"合法载荷自己就有个顶层 content 键"不会被误伤
  check('合法载荷的顶层 content 键 → 不动', 去信封('{"content":{"a":1}}'), '{"content":{"a":1}}');
}

console.log('\n[2] 真机形状: 信封连前缀一起切掉, 载荷内联在里面');
{
  check('信封未闭合(真机那次)', 去信封(`${信封头}{content:${载荷}`), 载荷);
  check('信封闭合 → 剩载荷 + 信封自己的 }(多余的那个 } 解析层会忽略)', 去信封(`${信封头}{content:${载荷}}`), `${载荷}}`);
  check('键名带引号也认', 去信封(`${信封头}{"content":${载荷}}`), `${载荷}}`);
  check('冒号前后有空白也认', 去信封(`${信封头}{ content : ${载荷}}`), `${载荷}}`);
  check('信封前面还垫了一句散文 → 一起丢掉', 去信封(`好的, 结果如下: ${信封头}{content:${载荷}}`), `${载荷}}`);
  check('套了两层信封 → 两层都剥', 去信封(`emit_x{content:${信封头}{content:${载荷}}`), `${载荷}}`);
  check('工具名换成别的也认(键名才是判据)', 去信封(`some_other_tool_abc{content:${载荷}`), 载荷);
}

console.log('\n[3] 真工具调用的形状: 载荷被当成字符串传(arguments 是 JSON 串)');
{
  check('取出字符串本体', 去信封(`${信封头}{content:${JSON.stringify(载荷)}}`), 载荷);
  check('末尾挂着信封的 } 也认', 去信封(`${信封头}{content:${JSON.stringify(载荷)}`), 载荷);
  check('字符串里的转义也还原', 去信封(`${信封头}{content:"{\\"小结\\":\\"a\\nb\\"}"}`), '{"小结":"a\nb"}');
}

console.log('\n[4] 边界');
{
  check('只有前缀没有内容 → 空串', 去信封(`${信封头}{content:`), '');
  ok('剥完还是从 { 开始', 去信封(`${信封头}{content:${载荷}`).startsWith('{'));
  ok('载荷里的 content 键不会被当成信封(它前面没有标识符)', 去信封('{"小结":"x","content":1}').includes('"小结"'));
}

console.log('\n[5] 元信息前缀(2026-10-21 真机, 剧情导演): 上游把响应元信息当正文前置');
{
  const 元 = 'finishReason: STOP\nfinishMessage: Model generated function call(s).\n';
  check('两行元信息被剥掉', 去信封(`${元}${载荷}`), 载荷);
  check('CRLF 换行也认', 去信封(`finishReason: STOP\r\nfinishMessage: x\r\n${载荷}`), 载荷);
  check('行首有缩进也认', 去信封(`  finishReason: STOP\n${载荷}`), 载荷);
  check('元信息 + 信封叠在一起 → 两层都剥', 去信封(`${元}${信封头}{content:${载荷}`), 载荷);
  // 守卫: 前缀后面必须紧跟 `{` 才动手 —— 否则可能把散文吃掉
  check('中文散文原样(不是 ASCII 键)', 去信封('注意: 不要改动'), '注意: 不要改动');
  check('元信息行后面是散文 → 不改', 去信封('Note: 见下\n这段是正文'), 'Note: 见下\n这段是正文');
  check('裸 JSON 不会被当成元信息', 去信封(载荷), 载荷);
  check('合法载荷的顶层 content 键仍不动', 去信封('{"content":{"a":1}}'), '{"content":{"a":1}}');
  ok('剥完从 { 开始', 去信封(`${元}${载荷}`).startsWith('{'));
}

console.log(fail === 0 ? `\n去信封: 全部通过 (${pass} 断言)` : `\n去信封: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
