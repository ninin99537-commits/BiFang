// 烟火 · 面板动作
//
// 这三件事(筛事件 / 推进记录 / 报错报告)以前都长在 悬浮球界面.vue 的同一个 setup 作用域里,
// 唯一能碰到它们的测试是把整个 .vue 当文本 import 做字符串匹配 —— 按字符串验, 不按行为验。
// 现在它们是纯函数: 吃数据、吐数据/文本。
import { 筛事件, 构建推进记录, 构建报错报告 } from '../src/烟火_世界运转/面板动作';
import type { WorldEvent } from '../src/烟火_世界运转/schema';

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

const 事件 = (标题: string, 规模: string, 阶段 = '进行'): WorldEvent =>
  ({ id: 标题, 标题, 规模, 阶段, 描述: '', 地点: '', 时间: '', 传播: '本埠', 渠道: '', 势力: '', 隐秘: '公开', 代表人物: '', 前情: '', 演变: [] }) as any;

const 时间文本 = (t?: number) => (t ? `T${t}` : '');

console.log('\n[1] 筛事件: 两个桶各自最新在前, 「全部」时活跃排在墓碑上面');
{
  const 活跃 = [事件('甲', '要事'), 事件('乙', '大事'), 事件('丙', '要事')];
  const 墓碑 = [事件('旧一', '要事', '已结束'), 事件('旧二', '大事', '已结束')];
  check('全部: 活跃倒序 + 墓碑倒序', 筛事件(活跃, 墓碑, '全部', '全部').map(e => e.标题), ['丙', '乙', '甲', '旧二', '旧一']);
  check('进行中: 只有活跃', 筛事件(活跃, 墓碑, '进行中', '全部').map(e => e.标题), ['丙', '乙', '甲']);
  check('已结束: 只有墓碑', 筛事件(活跃, 墓碑, '已结束', '全部').map(e => e.标题), ['旧二', '旧一']);
}

console.log('\n[2] 筛事件: 规模是第二道筛选, 与阶段叠加');
{
  const 活跃 = [事件('甲', '要事'), 事件('乙', '大事')];
  const 墓碑 = [事件('旧一', '大事', '已结束')];
  check('全部 + 大事', 筛事件(活跃, 墓碑, '全部', '大事').map(e => e.标题), ['乙', '旧一']);
  check('进行中 + 要事', 筛事件(活跃, 墓碑, '进行中', '要事').map(e => e.标题), ['甲']);
  check('已结束 + 要事 → 空', 筛事件(活跃, 墓碑, '已结束', '要事'), []);
  check('空输入不崩', 筛事件([], [], '全部', '全部'), []);
}

console.log('\n[3] 筛事件: 不改入参(视图那边是 computed, 不能动 store 里那份)');
{
  const 活跃 = [事件('甲', '要事'), 事件('乙', '要事')];
  const 快照 = JSON.stringify(活跃);
  筛事件(活跃, [], '全部', '全部');
  check('入参顺序没被 reverse 掉', JSON.stringify(活跃), 快照);
}

console.log('\n[4] 推进记录: 无记录给一句话, 有记录带全部字段');
{
  check('无记录', 构建推进记录(null, 时间文本), '(暂无推进记录)');
  const 文本 = 构建推进记录(
    {
      time: 123,
      model: 'm1',
      replyIds: [7, 9],
      小结: '无事',
      summary: '世界很安静',
      addedEvents: ['甲'],
      updatedEvents: ['乙'],
      removedEvents: ['丙'],
      request: 'REQ',
      response: 'RESP',
      error: 'BOOM',
      备注: ['一条备注'],
    } as any,
    时间文本,
  );
  ok('抬头', 文本.startsWith('[烟火] 推进记录'));
  ok('时间/模型/楼层/小结', 文本.includes('T123') && 文本.includes('m1') && 文本.includes('#7, #9') && 文本.includes('世界很安静'));
  ok('三段事件差异', 文本.includes('新增事件: 甲') && 文本.includes('推进事件: 乙') && 文本.includes('了结事件: 丙'));
  ok('请求/输出/报错', 文本.includes('REQ') && 文本.includes('RESP') && 文本.includes('BOOM'));
  ok('备注', 文本.includes('备注: 一条备注'));
}

console.log('\n[5] 尝试段落: 只有一次尝试时不单列(与 v2.8.5 D1 一致)');
{
  const 一次 = 构建推进记录({ time: 1, 尝试: [{ 次: 1, 原文: '只有一次', 错误: null }] } as any, 时间文本);
  ok('单次尝试不出现「第 1 次尝试」段', !一次.includes('第 1 次尝试'));

  const 两次 = 构建推进记录(
    { time: 1, 尝试: [{ 次: 1, 原文: '坏的原文', 错误: '超时' }, { 次: 2, 原文: '好的原文', 错误: null }] } as any,
    时间文本,
  );
  ok('两次尝试都留下', 两次.includes('第 1 次尝试（失败: 超时）') && 两次.includes('坏的原文'));
  ok('第二次标通过', 两次.includes('第 2 次尝试（通过）') && 两次.includes('好的原文'));
}

console.log('\n[6] 报错报告: 模型取传入的当前设置, 无报错时留提示');
{
  const 无错 = 构建报错报告({ time: 5 } as any, '当前模型', 'v9.9', 时间文本);
  ok('抬头带版本', 无错.startsWith('[烟火] 报错报告 · v9.9'));
  ok('模型用传入值(不是记录里的)', 无错.includes('当前模型'));
  ok('无报错时给提示', 无错.includes('(无报错记录——请描述你遇到的问题)'));

  const 有错 = 构建报错报告({ time: 5, error: '接口 500' } as any, '', 'v9.9', 时间文本);
  ok('有报错时原样带上', 有错.includes('接口 500'));
  ok('模型为空显示 (未选)', 有错.includes('(未选)'));
  ok('有报错时不再给提示', !有错.includes('(无报错记录'));
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
