// 剧情导演 · 导演可见的「上一道指令」白名单（2026-11-12，契约变化）
//
// 病根：`账本迁移.引擎视图` 只跳过 `进引擎 === false` 的字段，而 `当前指令` 没有这个标记
// → 整个对象进了导演的【剧情账本】。于是：
//   · `代码调整`（含 P0 的拒绝回执）导演也读得到 —— 等于教它"怎么写才能绕过规则"，
//     真机 53 条回响那场病就是这么长出来的；
//   · `硬约束`（代码对**演员**的裁定）导演也读得到 —— 它会当成自己的活抄进「硬性要求」，
//     而那是"演法建议"通道，一条"必须"被降级成建议，正是 P0.5 刚拆开的那把伞。
//
// 裁定：只发 8 个字段（编号/节拍/必演/生成楼层/已跳过/核验升级次数/档位/红线）。
// 本用例按需求方的要求做**副作用验**：用真实 `buildDirectorMessages()` 拼出完整 user prompt，
// 对**那个字符串**断言 —— 不看 `引擎视图()` 的返回值（那样换个渲染路径就绕过去了）。
//
// ⚠️ 刻意**不**断言"全文不含 `代码调整` 这个字段名"：字段名不出现是"剥字段"的副产品，
//    换一种渲染方式（比如渲染成别的键名）就永远绿 —— 那种断言是假绿。
//    所以正向锚点用**内容**（`【拒绝`、`艾莉拟转死亡`），而不是字段名。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { emptyData } from '../src/剧情导演/快照';
import { buildDirectorMessages } from '../src/剧情导演/prompts';
import { 导演可见指令 } from '../src/剧情导演/账本迁移';

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

/** 上一道指令：8 个保留字段都填上可辨识的值，9 个要剥掉的字段也各填一句**独特**文本 */
const 上一道指令: any = {
  编号: 7,
  节拍: '受挫',
  必演: { 内容: '洛基引爆抽能装置后脱身', 命运: false },
  生成楼层: 88,
  已跳过: false,
  核验升级次数: 1,
  档位: 3,
  红线: ['不许写死主角'],
  // ---- 以下必须剥掉 ----
  硬性要求: '导演的散文：让刺客在雨里等一夜',
  硬约束: ['【本章必须收章】这一章已经进入收束 9 场', '【连败让步】冲突「北坡」本轮必须让玩家赢'],
  伏笔现场: '#4「北坡外人火堆」',
  禁止事项: '不要写雨的拟人化',
  本幕揭示: ['揭示一：铜扣在抽屉最里层'],
  必须保留: ['艾莉已死，不得复活'],
  前情: ['前情一串：第 12 场她把钥匙埋在门槛下'],
  知情核对: [{ 角色: '艾莉', 事: '把北门值班表交出去', 知道吗: '知道', 证据: '第42场她在洼地亲历', 处理: '' }],
  代码调整: ['【拒绝×3】艾莉拟转死亡但证据不足', '张力曲线：连续 3 幕高张力，强制安排喘息幕'],
};

const 账本 = (): 导演账本 => ({ ...emptyData(), 已分析轮数: 20, 当前指令: 上一道指令 });

/** 真实拼一次导演输入，把 system+user 全文当一个字符串（副作用验的前提） */
function 拼全文(): string {
  const 消息 = buildDirectorMessages({
    账本: 账本(),
    reply: '主角推开门, 雪灌进来。',
    replyCount: 1,
    context: '我往前走一步',
    worldbook: '',
    playerName: '艾莉',
    playerDesc: '',
    破限: false,
    头部填充: false,
    头部填充文本: '',
    防截断: false,
    预填充: false,
  } as any);
  return 消息.map(m => m.content).join('\n');
}

// ---------------------------------------------------------------------------
console.log('\n[1] 8 个保留字段：必须真的送到导演面前');
{
  const 全文 = 拼全文();
  ok('防空跑: 全文非空', 全文.length > 1000);
  ok('编号（版本）在', 全文.includes('"编号":7'));
  ok('节拍在', 全文.includes('"节拍":"受挫"'));
  ok('必演在（核验比对对象）', 全文.includes('洛基引爆抽能装置后脱身'));
  ok('生成楼层在', 全文.includes('"生成楼层":88'));
  ok('已跳过在', 全文.includes('"已跳过":false'));
  ok('核验升级次数在', 全文.includes('"核验升级次数":1'));
  ok('档位在', 全文.includes('"档位":3'));
  // 红线是导演唯一能看到红线**内容**的地方（提示词说"红线高于一切"）—— 剥掉这句就成了空话
  ok('红线内容在', 全文.includes('不许写死主角'));
}

console.log('\n[2] 反例钉：拒绝回执一个字都不许进导演输入');
{
  const 全文 = 拼全文();
  // 这条比正向断言值钱：正向断言换个措辞就绕过去了，这条钉的是"内容本身"
  ok('【拒绝×3】艾莉拟转死亡 不在全文里', !全文.includes('艾莉拟转死亡'));
  ok('不含 【拒绝 前缀', !全文.includes('【拒绝'));
  ok('代码调整里的另一条（张力曲线）也不在', !全文.includes('张力曲线：连续 3 幕高张力'));
  // 反面对照（判据能失败）：这句话在**源对象**里确实存在 ——
  // 否则上面三条可能只是"本来就没有"，那是空转。
  ok('反面对照: 源指令里确实带这句话', JSON.stringify(上一道指令).includes('艾莉拟转死亡'));
  ok('反面对照: 源指令里确实带硬约束', JSON.stringify(上一道指令).includes('【本章必须收章】'));
}

console.log('\n[3] 硬约束（代码对演员的裁定）不许进导演输入');
{
  const 全文 = 拼全文();
  ok('不含 【本章必须收章】', !全文.includes('【必须收章】') && !全文.includes('【本章必须收章】'));
  ok('不含 【连败让步】', !全文.includes('【连败让步】') && !全文.includes('连败让步：'));
}

console.log('\n[4] 导演讲的散文与代码装配给演员的材料，都不该回喂给导演');
{
  const 全文 = 拼全文();
  ok('硬性要求（导演自己的散文）不回喂', !全文.includes('导演的散文：让刺客在雨里等一夜'));
  ok('伏笔现场不回喂', !全文.includes('北坡外人火堆'));
  ok('禁止事项不回喂', !全文.includes('不要写雨的拟人化'));
  ok('本幕揭示不回喂', !全文.includes('铜扣在抽屉最里层'));
  ok('必须保留不回喂', !全文.includes('艾莉已死，不得复活'));
  ok('前情不回喂', !全文.includes('第 12 场她把钥匙埋在门槛下'));
  ok('知情核对不回喂', !全文.includes('把北门值班表交出去'));
}

console.log('\n[5] 白名单本身：字段集合精确（多一个少一个都算错）');
{
  const 可见 = 导演可见指令(上一道指令);
  check(
    '字段集合精确等于 8 个',
    Object.keys(可见 ?? {}).sort(),
    ['编号', '节拍', '必演', '生成楼层', '已跳过', '核验升级次数', '档位', '红线'].sort(),
  );
  check('当前指令为空 → 返回 null', 导演可见指令(null), null);
  check('没有必演 → 给 null（形状稳定）', 导演可见指令({ ...上一道指令, 必演: undefined })?.必演, null);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
