// 彼方 · 数据备份: 导出成文本 / 从文本导入。
//
// 状态只活在楼层变量里, 一次大范围删楼(/cut、批量删)就是净损失。这条通道是唯一的抓手。
import { 导出数据, 导入数据 } from '../src/彼方_NPC幕后生命状态系统/数据变更';
import type { 变更环境 } from '../src/彼方_NPC幕后生命状态系统/数据变更';

let pass = 0;
let fail = 0;
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

const 原数据 = {
  名单: ['甲', '乙'],
  NPC: { 甲: { 位置: '厨房', 当前在做: '做饭' }, 乙: { 位置: '公司' } },
  卡字段计数: {},
  统计: { 更新次数: 7, 最后更新: 999 },
  剧情时间: '2026-01-02 12:00',
  清空层: 3,
  锚点楼层: 40,
  处理到楼层: 40,
} as any;

function 假环境() {
  const 记 = { 保存: [] as any[], 同步: [] as any[] };
  const 环境: 变更环境 = {
    世界书写入: '角色卡主世界书',
    保存: (数据) => { 记.保存.push(数据); },
    清空: () => undefined,
    同步世界书: (数据, 写入) => { 记.同步.push({ 数据, 写入 }); return undefined; },
    现在: () => 4242,
  };
  return { 环境, 记 };
}

console.log('\n[1] 导出: 一份可粘贴的文本, 带封套与导出时间');
{
  const 文本 = 导出数据(原数据);
  ok('是合法 JSON', (() => { try { JSON.parse(文本); return true; } catch { return false; } })());
  const 解析 = JSON.parse(文本);
  eq('封套字段', Object.keys(解析), ['备份版本', '导出时间', '数据']);
  eq('名单在', 解析.数据.名单, ['甲', '乙']);
  eq('NPC 在', 解析.数据.NPC.甲.位置, '厨房');
  eq('统计在', 解析.数据.统计.更新次数, 7);
  eq('剧情时间在', 解析.数据.剧情时间, '2026-01-02 12:00');
  // 空数据也不炸
  ok('空数据也能导出', 导出数据(undefined as any).includes('"名单": []'));
}

console.log('\n[2] 回合: 导出 → 导入, 内容一致');
{
  const { 环境, 记 } = 假环境();
  const 结果 = 导入数据(导出数据(原数据), { ...原数据, 名单: [], NPC: {} } as any, 环境);
  eq('名单恢复', 结果.数据.名单, ['甲', '乙']);
  eq('NPC 恢复', 结果.数据.NPC.甲.当前在做, '做饭');
  eq('统计恢复', 结果.数据.统计.更新次数, 7);
  eq('说明', 结果.说明, '已导入 2 个人物');
  eq('走了一次保存', 记.保存.length, 1);
  eq('同步了一次世界书(有 NPC → 写入)', 记.同步.map(s => s.写入), [true]);
}

console.log('\n[3] 兼容: 直接粘一份裸数据也能导入');
{
  const { 环境 } = 假环境();
  const 结果 = 导入数据(JSON.stringify({ 名单: ['丙'], NPC: { 丙: { 位置: '家' } } }), 原数据, 环境);
  eq('裸数据导入成功', 结果.数据.名单, ['丙']);
}

console.log('\n[4] 该拒绝的都拒绝, 且**一个字段都不动**');
{
  const 空 = { ...原数据 };
  for (const [名, 文本] of [
    ['不是 JSON', '这不是 JSON'],
    ['不是对象', '[1,2,3]'],
    ['缺名单', JSON.stringify({ NPC: {} })],
    ['缺 NPC', JSON.stringify({ 名单: [] })],
    ['NPC 是数组', JSON.stringify({ 名单: [], NPC: [] })],
  ] as Array<[string, string]>) {
    const { 环境, 记 } = 假环境();
    const 结果 = 导入数据(文本, 空, 环境);
    ok(`${名}: 原数据原样返回(界面据此提示而非假装成功)`, 结果.数据 === 空);
    ok(`${名}: 没保存、没同步`, 记.保存.length === 0 && 记.同步.length === 0);
    ok(`${名}: 说明里说清了`, 结果.说明.startsWith('未导入'));
  }
}

console.log('\n[5] 导入后世界书按"有 NPC 就写"走(与其它变更同一口径)');
{
  const { 环境, 记 } = 假环境();
  导入数据(JSON.stringify({ 名单: [], NPC: {} }), 原数据, 环境);
  eq('空数据 → 同步是删除条目', 记.同步.map(s => s.写入), [false]);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
