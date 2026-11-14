// 剧情导演 · 调试记录的两条语义(v2.8.5 D7 / D1) —— 只在导演侧补的缺口。
//
// 同一批改动在烟火那边有整条推进链路的端到端用例(`world-pipeline.test.ts` 的 [2d]~[2g]),
// 导演侧从来没有那样的测试台, 所以这里直接盯导演自己那几处:
//
//  1. `开始新记录` ≠ `record` —— 新一轮**不合并**上一轮。症状是四轮全部落盘成功、日志页的
//     `error` 却全是"推进已中断": 因为 `record` 是合并写, 一次中断写下的 error 会一直粘在后面
//     每一轮身上。恒定假红会训练人忽略报错, 所以中断改记备注 + 开新一轮换不合并的那个。
//  2. `update.ts` 的接线 —— 新一轮开头用 `开始新记录`; 用户中断记备注、不再冒充失败。
//  3. D1 依赖的接缝 —— 每次尝试各留一份账由 `共用/模型往返.ts` 经"写日志的唯一出口"带进来,
//     导演这边没有别的用例盯它, 这里补一条最薄的守卫。
import { createPinia, setActivePinia } from 'pinia';
import { useDebugStore } from '../src/剧情导演/state';
import update源 from '../src/剧情导演/update.ts?raw';
import 往返源 from '../src/共用/模型往返.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

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
/** 每节一个干净的仓, 免得上一节写下的记录串到下一节 */
function 新仓() {
  setActivePinia(createPinia());
  return useDebugStore();
}
const 取日志 = () => useDebugStore().log as any;

console.log('\n[D7-1] record 是「同一轮里各步补记」: 后写的并进前写的, 谁也不丢');
{
  const s = 新仓();
  s.record({ model: 'm1', response: '输出1' });
  s.record({ error: '错1', 备注: ['一句备注'] });
  check('第一步写的字段还在', [取日志()?.model, 取日志()?.response], ['m1', '输出1']);
  check('第二步写的字段也进来了', [取日志()?.error, 取日志()?.备注], ['错1', ['一句备注']]);
}

console.log('\n[D7-2] 开始新记录 是「新一轮」: 上一轮的报错/输出/备注/尝试一律不串过来');
{
  const s = 新仓();
  s.record({
    model: '上一轮',
    response: '上一轮的输出',
    error: '上一轮的错',
    备注: ['上一轮的备注'],
    尝试: [{ 次: 1, 原文: '上一轮的原文', 错误: '上一轮的错因' }],
  });
  check('前提: 上一轮确实留下了脏东西', [取日志()?.error !== '', (取日志()?.尝试 ?? []).length], [true, 1]);

  s.开始新记录({ model: '这一轮' });
  check('error 被清空(不再恒定假红)', 取日志()?.error, '');
  check('response 被清空(不挂到这一轮头上)', 取日志()?.response, '');
  check('备注 被清空', 取日志()?.备注, []);
  check('尝试 被清空(账按轮算, 上一轮的重试不算这一轮的)', 取日志()?.尝试, []);
  check('这一轮自己带的东西在', 取日志()?.model, '这一轮');
  ok('time 自动补上(调用方不必每次给)', Number(取日志()?.time ?? 0) > 0);
}

console.log('\n[D7-3] 两者对同一个字段的处理必须不同(合并 vs 不合并) —— 这就是 D7 的根');
{
  const s = 新仓();
  s.record({ error: '旧错' });
  s.record({ model: 'x' });
  check('record 之后再 record: 旧错还在(「补记」就该这样)', 取日志()?.error, '旧错');

  s.开始新记录({ model: 'y' });
  check('开始新记录 之后: 旧错没了(这正是 D7 要的)', 取日志()?.error, '');
}

console.log('\n[D1] 尝试 的落点: 空记录里是空数组, 传进来的按次账原样保留');
{
  const s = 新仓();
  check('还没写过: log 是 null', 取日志(), null);

  s.开始新记录({ model: 'm' });
  check('空记录的默认值: 尝试 = [] 而不是 undefined(面板判 .length 用)', 取日志()?.尝试, []);

  const 账 = [
    { 次: 1, 原文: '坏输出的完整原文', 错误: '结构不合格' },
    { 次: 2, 原文: '好输出', 错误: null },
  ];
  s.开始新记录({ model: 'm', 尝试: 账 });
  check('按次的账原样进日志', 取日志()?.尝试, 账);
  check('失败那次的完整原文一个字都没被切', (取日志()?.尝试 ?? [])[0]?.原文, '坏输出的完整原文');
  check('失败那次的错因挂在同一条上', (取日志()?.尝试 ?? [])[0]?.错误, '结构不合格');
  check('成功那次没有错因', (取日志()?.尝试 ?? [])[1]?.错误, null);
}

console.log('\n[D1-接缝] 账是共用的往返模块经「写日志的唯一出口」带进来的(导演侧没有别的用例盯它)');
{
  ok('写日志的唯一出口带上 尝试 快照', /记日志\(\{[^}]*尝试: 尝试快照\(\)/.test(往返源));
  ok('每次尝试都进账(不是覆盖同一个字段)', 往返源.includes('尝试记录.push('));
  ok('接口调用失败也记一笔(原文为空但"第几次、什么错"留下)', /尝试记录\.push\(\{ 次: attempt, 原文: null/.test(往返源));
  ok('重试成功的一轮不留红灯, 只在备注里交代一声', /记这次\(\{ error: '', 备注:/.test(往返源));
}

console.log('\n[D7-4] update.ts 的接线: 新一轮用 开始新记录; 中断记备注、不再冒充失败');
{
  ok('新一轮开头用 开始新记录(不合并上一轮)', /debugStore\.开始新记录\(\{/.test(update源));
  ok('同一轮里的各步补记仍然用 record', /debugStore\.record\(/.test(update源));
  ok('中断不再写 error: 推进已中断(旧写法)', !update源.includes("error: '推进已中断'"));
  ok('中断改成记备注(写明"不是失败")', update源.includes('用户中断了本次推进(不是失败)'));
  ok('中断那笔记的是 error 空串 + 备注', /error: '',\s*备注: \['用户中断了本次推进/.test(update源));
}

console.log(fail === 0 ? `\n调试记录语义: 全部通过 (${pass} 断言)` : `\n调试记录语义: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);
