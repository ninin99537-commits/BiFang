// 剧情导演 · 快照字段差集（2026-11-13 P0 插队）
//
// 病根（需求方真机 + 可执行脚本双证）: `账本迁移.账本字段表` 是快照读写的**唯一白名单**
// （写盘 `快照载荷()`、读回 `sanitizeSnapshot()` / `规范化章回()` → `规范化条目()` 全都只遍历它）。
// **schema 里声明了、字段表没列**的字段 → 落盘后下一轮读回就没了，而且一声不响。
//
// 已经因此丢过的:
//   · `章回.收束起始场` → 读回 undefined → `收束起始 > 0` 那段整段跳过 → 「收束出口」一条都没生效
//   · `冲突.最后行动幕 / 最后行动天` → 读回 undefined → 对手节流永远以为"刚行动过"
// 真机 1539 楼快照原文: `章回进度=收束`, `收束起始场_存在=false`。
//
// 为什么原有用例全绿还是漏了: `daoyan-收束出口` 测的是 `应用引擎输出()` **内存里**的值，
// 从没跑过 `快照载荷 → sanitizeSnapshot` 这一趟 —— 机制在内存里成立，一落盘就没了，而真机每轮都落盘。
//
// 所以这条用例是**结构性的**：不逐字段断言，而是对每一层做 `schema 接口字段 ⊆ 字段表` 的差集。
// 谁来加字段忘了登记，这条就红。
import { readFileSync } from 'node:fs';
import { 取层 } from '../src/剧情导演/字段表';

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
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

const 源码 = readFileSync('src/剧情导演/schema.ts', 'utf8');

/** 从 schema.ts 里抽一个 interface 的**顶层**字段名（JSDoc / 嵌套对象都不算） */
function 接口字段(名: string): string[] {
  const 起 = 源码.search(new RegExp(`export interface ${名} \\{`));
  if (起 < 0) return [];
  const 体起 = 源码.indexOf('{', 起);
  const 体止 = 源码.indexOf('\n}', 体起);
  const 体 = 源码.slice(体起 + 1, 体止);
  // 顶层字段 = 恰好两个空格缩进 + 名字 + : 或 ?:
  return [...体.matchAll(/^ {2}([A-Za-z_\u4e00-\u9fa5][\w\u4e00-\u9fa5]*)\??:/gm)].map(m => m[1]);
}

/** 差集：接口里有、字段表里没有的（= 落盘会丢的） */
function 差集(接口名: string): string[] {
  const 表 = 取层(接口名 as any).字段.map(f => f.键);
  return 接口字段(接口名).filter(键 => !表.includes(键));
}

// ---------------------------------------------------------------------------
console.log('\n[1] 五层：schema 接口字段必须全部登记在 字段表 里（否则落盘即丢）');
{
  for (const 层 of ['章回', '伏笔', '冲突', '弧线', '角色命运']) {
    const 接口们 = 接口字段(层);
    ok(`${层}: 抽得到接口字段（防空跑，>=3 个）`, 接口们.length >= 3);
    check(`${层}: 没有"schema 有、字段表没列"的字段`, 差集(层), []);
  }
}

console.log('\n[2] 两个具体的历史伤疤（这条能失败：删掉字段表那行就红）');
{
  const 章回表 = 取层('章回').字段.map(f => f.键);
  ok('章回.收束起始场 已登记（真机就是丢这个 → 收束出口全哑）', 章回表.includes('收束起始场'));
  const 冲突表 = 取层('冲突').字段.map(f => f.键);
  ok('冲突.最后行动幕 已登记', 冲突表.includes('最后行动幕'));
  ok('冲突.最后行动天 已登记', 冲突表.includes('最后行动天'));
}

console.log('\n[3] 比较器本身不是空转（自证能失败）');
{
  // 构造一个"接口多了一个字段"的情形：把 章回 的接口字段里加一个假的，差集必须非空
  const 真 = 接口字段('章回');
  ok('对照组：真接口字段里没有 __假字段__', !真.includes('__假字段__'));
  const 假接口 = [...真, '__假字段__'];
  const 表 = 取层('章回').字段.map(f => f.键);
  const 假差集 = 假接口.filter(键 => !表.includes(键));
  check('多一个未登记字段 → 差集报出它（比较器有效）', 假差集, ['__假字段__']);
}

console.log('\n[4] 往返实测：收束起始场 落盘再读回仍在（机制级，不只是登记）');
{
  // 直接调快照那两个函数，走一遍"写盘 → 读回"，这才是真机每轮都做的事
  const { 快照载荷 } = await import('../src/剧情导演/账本迁移');
  const { sanitizeSnapshot } = await import('../src/剧情导演/账本迁移');
  const { emptyData } = await import('../src/剧情导演/快照');
  const { 收束已用场数 } = await import('../src/剧情导演/提醒');

  const 账本: any = {
    ...emptyData(),
    已分析轮数: 5,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '收束', 起始场: 1, 收束起始场: 5, 幕纲: ['第1幕｜类型: 事件'], 当前幕号: 1 },
    冲突: [{ 名: '北坡', 对立面: 'WLF', 赌注: 'x', 强度: 7, 阶段: '僵持', 下一步: 'x', 顶回次数: 0, 最后行动幕: 2, 最后行动天: 5 }],
  };
  const 盘 = 快照载荷(账本);
  ok('写盘含 收束起始场', '收束起始场' in (盘.章回 ?? {}));
  const 读回 = sanitizeSnapshot(盘 as any);
  check('读回 章回.收束起始场 = 5', 读回.章回?.收束起始场, 5);
  // 收束已用场数 = 当前场 - 收束起始场 + 1：场 10 → 6（真机上这一项以前恒为 0，因为字段被丢了）
  check('读回 收束已用场数(场 10) = 6', 收束已用场数(读回, 10), 6);
  check('读回 收束已用场数(场 6) = 2', 收束已用场数(读回, 6), 2);
  check('读回 冲突.最后行动幕 = 2', (读回.冲突[0] as any)?.最后行动幕, 2);
  check('读回 冲突.最后行动天 = 5', (读回.冲突[0] as any)?.最后行动天, 5);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
