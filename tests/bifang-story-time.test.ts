// 彼方 · 剧情时间的年份位数: 世界纪年不一定四位(0137 / 12640), 不能写死 4 位
//
// 回归线来自真实报错: 模型输出 "12640-03-01 10:19", 旧校验按 \d{4} 判成"格式不正确",
// 于是重试 3 次后整轮更新失败(白等 68 秒)。现在 3~6 位年份都认, 2 位/7 位仍按格式错误处理。
import { fmtStoryTime, parseStoryTime, parseStoryTimeRange, withStoryDate } from '../src/彼方_NPC幕后生命状态系统/剧情时间';
import { 生活状态相对化 } from '../src/彼方_NPC幕后生命状态系统/生活状态';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`); }
}

console.log('\n[1] 3~6 位年份都认, 2 位/7 位不认');
{
  check('4 位年(0137)', parseStoryTime('0137-06-12 06:30') !== null, true);
  check('5 位年(12640)', parseStoryTime('12640-03-01 10:19') !== null, true);
  check('6 位年(126403)', parseStoryTime('126403-03-01 10:19') !== null, true);
  check('2 位年不当日期(37-06-12)', parseStoryTime('37-06-12 06:30'), null);
  check('7 位年不认', parseStoryTime('1264031-03-01 10:19'), null);
  check('中文年月日也认(模型常这么写)', parseStoryTime('0137年6月12日 06:30') !== null, true);
  check('没有数字的纪年仍不认(天启三年)', parseStoryTime('天启三年 三月初五'), null);
}

console.log('\n[2] 5 位年能原样往返');
{
  const ts = parseStoryTime('12640-03-01 10:19');
  check('解析出的年份', new Date(ts as number).getFullYear(), 12640);
  check('格式化回来(年份不截断)', fmtStoryTime(ts as number), '12640-03-01 10:19');
}

console.log('\n[3] 时间段的 5 位年');
{
  const 区 = parseStoryTimeRange({ 开始: '12640-03-01 10:19', 结束: '12640-03-01 10:26' });
  check('开始', fmtStoryTime(区.startTs as number), '12640-03-01 10:19');
  check('结束', fmtStoryTime(区.endTs as number), '12640-03-01 10:26');
  check('区间文本', 区.text, '12640-03-01 10:19 至 12640-03-01 10:26');
}

console.log('\n[4] 今天/昨天按 5 位年的剧情日期补全');
{
  check('今天', withStoryDate('吃饭(今天 18:20)', '12640-03-01 10:19'), '吃饭(12640-03-01 18:20)');
  check('昨天', withStoryDate('洗漱(昨天 22:10)', '12640-03-01 10:19'), '洗漱(12640-02-29 22:10)');
}

console.log('\n[5] 生活状态的相对时间也认 5 位年');
{
  check('吃饭 8 小时前', 生活状态相对化('吃饭(12640-03-01 02:19)', '12640-03-01 10:19'), '吃饭(12640-03-01 02:19；约 8 小时前，饿了)');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
