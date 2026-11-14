// 剧情导演 · 导演台「改这一层」(2026-11-08)
//
// 用户原话:「导演台好像不能编辑, 是吗? 我想改一点东西都不行」
//
// 导演台展示的字段全是引擎产物, 以前只有「书纲 / 伏笔状态 / 弧线阶段」能改,
// 节拍、本幕已确定、硬性要求 —— 这三个**真进注入**的字段反而改不了。
// 现在它们走 命令.改当前指令 → 应用指令补丁 → 提交({ 重注本幕 }) —— 下一段正文按改后的演。
import { createPinia, setActivePinia } from 'pinia';
import { 应用指令补丁, 建导演命令 } from '../src/剧情导演/导演命令';
import type { 命令依赖, 指令补丁 } from '../src/剧情导演/导演命令';
import { emptyData } from '../src/剧情导演/快照';
import { SettingsSchema } from '../src/剧情导演/schema';

(globalThis as any)._ = {
  clamp: (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
  cloneDeep: (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
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
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}

/** 一条已下发的本幕指令(字段取 schema 的必填项) */
function 造指令(补: Record<string, unknown> = {}): any {
  return {
    编号: 5,
    节拍: '受挫',
    硬性要求: '原来的演法建议',
    伏笔现场: '',
    禁止事项: '',
    生成楼层: 30,
    核验升级次数: 0,
    已跳过: false,
    代码调整: [],
    档位: 3,
    红线: [],
    ...补,
  };
}

function 造账本(补: Record<string, unknown> = {}): any {
  return { ...emptyData(), 指标: undefined, 伏笔: [], 冲突: [], 弧线: [], ...补 };
}

function 造(账本: any, 设置: any) {
  const 记录: string[] = [];
  const 依赖: 命令依赖 = {
    账本: () => 账本,
    设置: () => 设置,
    提交: 副作用 => {
      记录.push(`提交:${JSON.stringify(副作用 ?? null)}`);
      return true;
    },
    写已剧终: 值 => {
      记录.push(`写已剧终:${值}`);
      return true;
    },
    同步备忘: 要写 => 记录.push(`同步备忘:${要写}`),
    撤本幕指令: () => 记录.push('撤本幕指令'),
    重注本幕: 暂停 => 记录.push(`重注本幕:${暂停}`),
    清空并重载: () => {
      记录.push('清空并重载');
      return 账本;
    },
    结算死亡: () => 记录.push('结算死亡'),
    设自动暂停: 值 => {
      记录.push(`设自动暂停:${值}`);
      return { 连续失败: 0 } as any;
    },
    清推进失败: () => {
      记录.push('清推进失败');
      return { 连续失败: 0 } as any;
    },
    提示: 消息 => 记录.push(`提示:${消息}`),
    日志: 消息 => 记录.push(`日志:${消息}`),
  };
  return { 命令: 建导演命令(依赖), 记录 };
}

const 默认设置 = SettingsSchema.parse({});

console.log('\n[1] 节拍: 只认枚举内的值');
{
  const 指令 = 造指令();
  check('改成「高潮」', 应用指令补丁(指令, { 节拍: '高潮' }), ['节拍 → 高潮']);
  check('真的写进去了', 指令.节拍, '高潮');
  check('改成同一个值 → 没变化', 应用指令补丁(指令, { 节拍: '高潮' }), []);
  check('枚举外的值被忽略', 应用指令补丁(指令, { 节拍: '第七幕' }), []);
  check('枚举外的值没写进去', 指令.节拍, '高潮');
}

console.log('\n[2] 硬性要求: 改了就记一笔');
{
  const 指令 = 造指令();
  check('改文字', 应用指令补丁(指令, { 硬性要求: '这一层必须写到她掉头就走' }), ['改了硬性要求']);
  check('文案已落', 指令.硬性要求, '这一层必须写到她掉头就走');
  check('原样传回 → 没变化', 应用指令补丁(指令, { 硬性要求: '这一层必须写到她掉头就走' }), []);
}

console.log('\n[3] 本幕已确定: 新增 / 改 / 删, 三个方向都要干净');
{
  const 指令 = 造指令();
  check('原来没有 → 新增', 应用指令补丁(指令, { 必演内容: '  Lim 当场翻脸  ', 必演镜头外: true }), ['新增了「本幕已确定」']);
  check('内容去掉首尾空格', 指令.必演.内容, 'Lim 当场翻脸');
  check('手写的必演不是命运事件', [指令.必演.命运, 指令.必演.角色ID, 指令.必演.未执行轮], [false, '', 0]);
  check('镜头外标记跟着走', 指令.必演.镜头外, true);

  check('改内容', 应用指令补丁(指令, { 必演内容: 'Lim 当场翻脸，把信撕了' }), ['改了「本幕已确定」']);
  check('改成正面演', 应用指令补丁(指令, { 必演镜头外: false }), ['改成正面演']);
  check('改成按既成事实写', 应用指令补丁(指令, { 必演既成事实: true }), ['改成按既成事实写']);

  check('清空 = 删掉整条', 应用指令补丁(指令, { 必演内容: '   ' }), ['删掉了「本幕已确定」']);
  check('真的没了(不留空壳)', 指令.必演, null);
  check('再清一次 → 没变化', 应用指令补丁(指令, { 必演内容: '' }), []);
}

console.log('\n[4] 被「跳过本幕」作废的指令: 一改就恢复生效');
{
  const 跳过 = 造指令({ 已跳过: true });
  check('有改动才恢复', 应用指令补丁(跳过, { 节拍: '阴影' }), ['节拍 → 阴影', '恢复生效(原来是「跳过本幕」)']);
  check('已跳过 被清掉', 跳过.已跳过, false);

  const 没改 = 造指令({ 已跳过: true });
  check('没改动就不动它', 应用指令补丁(没改, { 节拍: '受挫' }), []);
  check('仍然跳过', 没改.已跳过, true);
}

console.log('\n[5] 命令: 改完必须提交 + 重注, 并把"会不会真注入"说清楚');
{
  const 空 = 造账本();
  const a = 造(空, 默认设置);
  check('没有当前指令 → false', a.命令.改当前指令({ 节拍: '高潮' }), false);
  check('没有当前指令 → 一次提交都没有', a.记录.filter(项 => 项.startsWith('提交:')), []);

  const 账 = 造账本({ 当前指令: 造指令() });
  const b = 造(账, 默认设置);
  check('有指令 → true', b.命令.改当前指令({ 节拍: '高潮', 硬性要求: '照这个演' }), true);
  check('账本被改了', [账.当前指令.节拍, 账.当前指令.硬性要求], ['高潮', '照这个演']);
  check('提交时带「重注本幕」', b.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重注本幕":false}']);
  check('日志记了改了什么', b.记录.some(项 => 项.startsWith('日志:修笔：本幕指令')), true);
  check(
    '提示说清楚"下一段按改后的演"',
    b.记录.filter(项 => 项.startsWith('提示:')),
    ['提示:已改：下一段正文按改后的指令演（节拍 → 高潮、改了硬性要求）'],
  );

  // 死亡待决期间: 改得动, 但不注入 —— 提交里必须带暂停标记
  const 待决 = 造账本({ 当前指令: 造指令(), 待决死亡: true });
  const c = 造(待决, 默认设置);
  check('死亡待决 → 仍返回 true(改得动)', c.命令.改当前指令({ 节拍: '余波' }), true);
  check('提交时带上暂停标记', c.记录.filter(项 => 项.startsWith('提交:')), ['提交:{"重注本幕":true}']);
  check('提示说明现在不会注入', c.记录.some(项 => 项.startsWith('提示:') && 项.includes('不会注入')), true);

  // 总开关关着: 账本照改, 但不注入(提示要说到)
  const 关账 = 造账本({ 当前指令: 造指令() });
  const d = 造(关账, { ...默认设置, 启用导演: false });
  check('总开关关 → 仍返回 true', d.命令.改当前指令({ 硬性要求: 'x' }), true);
  check('提示说明现在不会注入', d.记录.some(项 => 项.startsWith('提示:') && 项.includes('不会注入')), true);
}

console.log('\n[6] 什么都没改: 不提交、不重注、不发提示');
{
  const 账 = 造账本({ 当前指令: 造指令() });
  const t = 造(账, 默认设置);
  const 补丁: 指令补丁 = { 节拍: '受挫', 硬性要求: '原来的演法建议', 必演内容: '' };
  check('返回 false', t.命令.改当前指令(补丁), false);
  check('没有提交', t.记录.filter(项 => 项.startsWith('提交:')), []);
  check('没有重注', t.记录.filter(项 => 项.startsWith('重注本幕:')), []);
}

console.log(`\n${fail === 0 ? '全部通过' : '有失败'}  ${pass} pass / ${fail} fail\n`);
if (fail > 0) process.exit(1);
