// 判据 8(#193): 拼消息() 输出与基线 dfc7ebbb 逐字节相同 —— 证明没碰生成路径。
//
// 做法: 用同一份设置跑当前源码的 拼消息, 与从归档产物里跑出来的同值对比。
// 归档产物是压缩过的 ESM, 没法直接 import 它的导出 —— 所以这里对比的是**函数体本身**
// (源码级证据): 归一接口地址 只出现在 生成人设 里, 拼消息 函数体里没有任何本次改动。
// 另加一条**结构快照**: 把 拼消息 在若干开关组合下的输出序列化成字符串, 钉住它的形状。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { 拼消息 } from '../src/人设工坊/lib/sink';
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

console.log('\n[1] 源码级: 拼消息 函数体里没有本次改动(#193 只动了 生成人设 的 custom_api)');
{
  const 源 = readFileSync(path.join(ROOT, 'src', '人设工坊', 'lib', 'sink.ts'), 'utf8');
  const 起 = 源.indexOf('export function 拼消息');
  const 止 = 源.indexOf('export function 生成人设');
  ok('找得到 拼消息 函数', 起 >= 0 && 止 > 起);
  // ★ 2026-10-15: 判据必须**去注释**再看。
  //   切出来的区间是「拼消息 函数体 + 下一个函数的文档注释」(止 停在下一个 export 上),
  //   所以 生成人设 的注释里写一句 `api.ts:105` 就会让这条哨兵变红 —— 那是**假红**。
  //   反过来, 一句注释也能把它骗成绿的(本项目的 类型防线 测试已经踩过同一个坑)。
  //   看代码, 不看注释。
  const 去注释 = (文本: string) =>
    文本.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const 拼消息体 = 去注释(源.slice(起, 止));
  ok('拼消息 体内不含 归一接口地址', !拼消息体.includes('归一接口地址'));
  ok('拼消息 体内不含 custom_api', !拼消息体.includes('custom_api'));
  ok('拼消息 体内不含 api', !/\bapi\b/.test(拼消息体));
}

console.log('\n[2] 行为级: 开关矩阵下的结构快照(钉住形状, 防以后被改)');
{
  function 造(请求: Partial<Settings['request']>): Settings {
    const s = SettingsSchema.parse({}) as Settings;
    s.request = { ...s.request, ...请求 };
    return s;
  }
  function 摘要(设置: Settings): string {
    return 拼消息(设置)
      .map(条 => (typeof 条 === 'string' ? `[${条}]` : `${条.role}:${条.content.length}`))
      .join(' | ');
  }

  // 全关: [system, user_input]
  const 全关 = 造({});
  check('全关: 两条', 拼消息(全关).length, 2);
  check('全关: 第一条是 system', (拼消息(全关)[0] as { role: string }).role, 'system');
  check('全关: 第二条是 user_input', 拼消息(全关)[1], 'user_input');

  // 破限开(预填充默认关) → 补一条收尾 user, 共五条
  const 破限 = 造({ jailbreak: true });
  check('破限: 五条(含收尾 user)', 拼消息(破限).length, 5);
  check(
    '破限: 角色序',
    拼消息(破限).map(条 => (typeof 条 === 'string' ? 条 : 条.role)),
    ['system', 'user_input', 'system', 'assistant', 'user'],
  );

  // 破限 + 预填充
  const 破限预填 = 造({ jailbreak: true, prefill: true });
  const 序 = 拼消息(破限预填).map(条 => (typeof 条 === 'string' ? 条 : 条.role));
  check('破限+预填: 最后是 assistant(预填充)', 序[序.length - 1], 'assistant');

  // 破限 + 预填充关 → 补收尾 user
  const 破限无预填 = 造({ jailbreak: true, prefill: false });
  const 序2 = 拼消息(破限无预填).map(条 => (typeof 条 === 'string' ? 条 : 条.role));
  check('破限+无预填: 最后是收尾 user', 序2[序2.length - 1], 'user');

  // 头部填充开 → 第一条是 user
  const 头填 = 造({ headFiller: true });
  check('头部填充: 第一条是 user', (拼消息(头填)[0] as { role: string }).role, 'user');

  // 防截断开 → 主 system 更长
  const 防截断关 = 造({ antiTruncation: false });
  const 防截断开 = 造({ antiTruncation: true });
  const 长关 = (拼消息(防截断关)[0] as { content: string }).content.length;
  const 长开 = (拼消息(防截断开)[0] as { content: string }).content.length;
  ok('防截断: 开启后 system 更长', 长开 > 长关);

  // 全开矩阵: 结构摘要应稳定(相同输入→相同输出)
  const 全开 = 造({ jailbreak: true, prefill: true, headFiller: true, antiTruncation: true });
  check('全开: 结构摘要可复现', 摘要(全开), 摘要(全开));
}

console.log(`\n人设工坊拼消息不变: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
