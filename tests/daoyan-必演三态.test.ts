// 剧情导演 · P2 2.5「必演」三态（2026-11-13）
//
// 病根：`必演` 以前是 `事件 | null`，`null` 同时表示两件事 ——
//   ① 本幕确实没有确定要发生的事件（导演想清楚了）
//   ② 导演根本没填这个字段（漏写）
// `提醒.ts` 的 `上一道缺必演` 判 `if (… || 上一道.必演) return []` —— 两种情况都不响。
// 真机上模型多数时候不填，于是这条提醒**等于哑的**。
//
// 现在三态：对象 = 有事件 / `'无'` = 明确声明没有 / `null` 或字段缺失 = 没说（照响）。
//
// ⚠️ 最容易搞错的地方（需求方点名）：`'无'` **不是空事件**。
// `规范化必演('无')` 必须返回 `null`（那是"给有事件用的"），但**指令上这个字符串要保住** ——
// 提醒靠它区分"想清楚了"和"漏了"。下面 [1] 和 [4] 各钉一头。
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { 结构提醒 } from '../src/剧情导演/提醒';
import { 规范化必演, 构造本幕指令 } from '../src/剧情导演/引擎规则';

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
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 判据用**整句**锚定（`上一道指令没有「必演」` 是那条规则自己的开头，别用 /必演/ 泛词） */
const 缺必演句 = (行: string[]) => 行.filter(x => x.includes('上一道指令没有「必演」'));

const 造账 = (指令: any): 导演账本 =>
  ({
    ...emptyData(),
    已分析轮数: 9,
    章回: { 章号: 1, 主题: 'x', 计划高潮: '', 进度: '推进', 起始场: 1, 幕纲: ['第1幕｜类型: 事件｜目标:t'], 当前幕号: 1 } as any,
    当前指令: 指令,
  } as 导演账本);
const 基础指令 = { 编号: 1, 节拍: '受挫', 生成楼层: 9, 已跳过: false, 核验升级次数: 0, 档位: 3, 红线: [] };

// ---------------------------------------------------------------------------
console.log('\n[1] `规范化必演` 遇到 `\'无\'` 必须返回 null（它不是一条内容叫"无"的事件）');
{
  check("规范化必演('无') = null", 规范化必演('无'), null);
  check("规范化必演(' 无 ') = null（带空格也算）", 规范化必演(' 无 '), null);
  ok('规范化必演(对象) 仍是对象', 规范化必演({ 内容: '她来了' })?.内容 === '她来了');
  check('规范化必演(null) = null', 规范化必演(null), null);
}

console.log('\n[2] 提醒：三态各走各的（这是本批的核心行为）');
{
  const 没说 = 缺必演句(结构提醒(造账({ ...基础指令, 必演: null }), 10));
  check('必演 = null（没说）→ **有**这句提醒', 没说.length, 1);

  const 明确无 = 缺必演句(结构提醒(造账({ ...基础指令, 必演: '无' }), 10));
  check('必演 = "无"（明确声明没有）→ **没有**这句', 明确无.length, 0);

  const 有事件 = 缺必演句(结构提醒(造账({ ...基础指令, 必演: { 内容: '她来了', 命运: false, 角色ID: '', 镜头外: false, 既成事实: false, 未执行轮: 0 } }), 10));
  check('必演 = 对象（有事件）→ **没有**这句', 有事件.length, 0);

  // 老账本：整个字段缺失 → 按 null 处理（照响），且不许抛错
  const 缺字段 = 缺必演句(结构提醒(造账({ ...基础指令 }), 10));
  check('必演字段整个缺失（老账本）→ 照响', 缺字段.length, 1);
}

console.log('\n[3] 已跳过 / 平静期 的既有让位不许被三态改坏');
{
  const 跳过 = 缺必演句(结构提醒(造账({ ...基础指令, 已跳过: true, 必演: null }), 10));
  check('已跳过 → 不响（旧纪律）', 跳过.length, 0);
}

console.log('\n[4] 提示词必须教导演写 "无"（否则它不知道可以这么写 = 白改）');
{
  const 提示 = readFileSync('src/剧情导演/prompts.ts', 'utf8');
  ok('提示词里有「明确没有就写 "无"」', 提示.includes('明确没有就写 "无"'));
  ok('并且说明"不要留空/null"', 提示.includes('不要留空/null'));
  ok('说明 null 会被提醒', 提示.includes('上一道指令没有必演') || 提示.includes('脚本会提醒'));
}

console.log('\n[4b] 端到端：模型写 "无" 时，**指令上要真的落成 "无"**（不是 null）');
{
  // 这一条必须走 构造本幕指令 —— 直接把 '无' 塞进账本测不到"落地"那段代码
  const 造 = (下一幕: any) =>
    构造本幕指令({
      旧指令: null, 下一幕, 账本: 造账(null), 核验: { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false } as any,
      档位: 3, 红线: [], 楼层: 9, 暂停注入: false,
    });
  check('下一幕.必演 = "无" → 指令.必演 === "无"', (造({ 节拍: '受挫', 必演: '无' }) as any).指令?.必演, '无');
  check('下一幕.必演 漏写 → 指令.必演 === null', (造({ 节拍: '受挫' }) as any).指令?.必演, null);
  ok('下一幕.必演 = 对象 → 指令.必演 是对象', typeof (造({ 节拍: '受挫', 必演: { 内容: '她来了' } }) as any).指令?.必演 === 'object');
}

console.log('\n[5] 账本迁移兼容：老账本两种形状都不许崩');
{
  const 两种 = [null, { 内容: '旧事件' }];
  for (const 原 of 两种) {
    const 行 = 结构提醒(造账({ ...基础指令, 必演: 原 }), 10);
    ok(`必演 = ${JSON.stringify(原)} → 不抛错、有输出`, Array.isArray(行));
  }
}

console.log('\n[6] 快照往返：' + '"无"' + ' 必须活下来（需求方实测：以前读回是 undefined）');
{
  const { 快照载荷 } = await import('../src/剧情导演/账本迁移');
  const { sanitizeSnapshot } = await import('../src/剧情导演/账本迁移');
  const 账 = 造账({ ...基础指令, 必演: '无' });
  const 盘 = 快照载荷(账);
  const 读回 = sanitizeSnapshot(盘 as any);
  check('往返后 当前指令.必演 === "无"', (读回.当前指令 as any)?.必演, '无');
  check('往返后 提醒不再催（这条是端到端）', 缺必演句(结构提醒(读回, 10)).length, 0);
  // 对象照常往返
  const 账2 = 造账({ ...基础指令, 必演: { 内容: '她推门进来', 命运: false, 角色ID: '', 镜头外: false, 既成事实: false, 未执行轮: 0 } });
  const 读回2 = sanitizeSnapshot(快照载荷(账2) as any);
  check('对象往返不丢内容', (读回2.当前指令 as any)?.必演?.内容, '她推门进来');
  // 脏值不许原样带进账本（要过 规范化必演）
  const 账3 = 造账({ ...基础指令, 必演: '她走了' as any });
  const 读回3 = sanitizeSnapshot(快照载荷(账3) as any);
  ok('脏字符串不会被原样带进账本（五个字段要补全）', typeof (读回3.当前指令 as any)?.必演 !== 'string');
}

console.log('\n[7] 平静期写 null 不该催（既有挡板，钉住它）');
{
  const 账 = { ...造账({ ...基础指令, 必演: null }), 平静场数: 3 } as any;
  check('平静场数 !== 0 → 不响', 缺必演句(结构提醒(账, 10)).length, 0);
  const 非平静 = { ...造账({ ...基础指令, 必演: null }), 平静场数: 0 } as any;
  check('对照：非平静 + null → 响', 缺必演句(结构提醒(非平静, 10)).length, 1);
}

console.log('\n[8] 提示词不许自相矛盾（184 行曾说"才给 null"，与"不要留空/null"打架）');
{
  const 提示 = readFileSync('src/剧情导演/prompts.ts', 'utf8');
  check('「才给 null」清零', 提示.split('才给 null').length - 1, 0);
  check('「明确没有就写」只此一处定义', 提示.split('明确没有就写').length - 1, 1);
  check('平静期「一律写 null」保留（那是另一回事）', 提示.split('一律写 null').length - 1, 1);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
