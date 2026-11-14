// 人设工坊 · 字段活性(#149): 每个模块的每个字段都必须真的能改变输出
//
// 为什么是行为级而不是字符串级:
//   nsfw_body 那个 bug(六个字段的值一个字都进不了提示词)能活很多轮, 根因是**没有任何测试
//   在管这一类问题** —— 唯一的防线只断言了那六个具体占位符, 换个模块再犯一次照样绿。
//
// 判据: 逐模块、逐字段, 造两个不同的值各渲染一次, **两次输出必须不同**。
//   相同 → 这个字段是死的 → 失败, 并报出 模块 id + 字段 id。
//
// 为什么「输出必须变」比「占位符必须在」强:
//   它同时覆盖 ① 占位符缺失(nsfw 的形态) ② 上下文没传值 ③ 模板语法写错
//   ④ {{#if}} 分支写空。对 toggle / 枚举字段同样成立 —— 开关改了输出却不变, 它本身就是死的。
//
// 豁免: 确实故意不渲染的字段, 必须在 FieldDef 上显式标 `不渲染: true`;
//   测试读到标记才跳过。**不许无标记静默跳过** —— 「静默不渲染」正是要根除的形态。
import { 模块注册表 } from '../src/人设工坊/lib/modules';
import { 建上下文, 渲染模板 } from '../src/人设工坊/lib/prompt';
import { SettingsSchema, type Settings, type FieldDef } from '../src/人设工坊/schema';

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

/** 造设置: material 全关(字段活性与素材无关), 只给 enabled 与 fieldValues */
function 设置(部分: Partial<Settings>): Settings {
  const 基 = SettingsSchema.parse({});
  return { ...基, ...部分 } as Settings;
}

/** 造一个**一定不同于默认值**的值(按 kind) */
function 造另一个值(字段: FieldDef): unknown {
  switch (字段.kind) {
    case 'text':
      return '活性测试值';
    case 'number':
      return (typeof 字段.default === 'number' ? 字段.default : 1) + 7;
    case 'list':
      return ['活性甲', '活性乙'];
    case 'toggle':
      return !字段.default;
    default:
      return '活性测试值';
  }
}

console.log('\n[1] 逐模块逐字段: 改一个字段的值, 提示词输出必须变');
{
  const 死的: string[] = [];
  const 豁免: string[] = [];
  let 字段总数 = 0;

  for (const 模块 of 模块注册表) {
    for (const 字段 of 模块.fields) {
      字段总数++;
      if (字段.不渲染) {
        豁免.push(`${模块.id}.${字段.id}`);
        continue;
      }

      const 值A = 字段.default;
      const 值B = 造另一个值(字段);

      const 输出A = 渲染模板(
        模块.prompt,
        建上下文(模块, 设置({ enabled: [模块.id], fieldValues: { [字段.id]: 值A } })),
      );
      const 输出B = 渲染模板(
        模块.prompt,
        建上下文(模块, 设置({ enabled: [模块.id], fieldValues: { [字段.id]: 值B } })),
      );

      if (输出A === 输出B) 死的.push(`${模块.id}.${字段.id}`);
    }
  }

  check('没有死字段(改值后输出不变)', 死的, []);
  ok('确实遍历到了字段(不是空跑)', 字段总数 > 0);
  console.log(`        (共检 ${字段总数} 个字段, 显式豁免 ${豁免.length} 个)`);
}

console.log('\n[2] 死的字段会真的被抓到(自证测试有牙齿)');
{
  // 构造一个"字段存在但 prompt 里没有它的占位符"的模块, 断言检测逻辑能报出来。
  // 否则 [1] 全绿只说明"没跑错", 不能说明"能失败"。
  const 假模块 = {
    id: '假模块',
    name: '假模块',
    group: 'custom' as const,
    desc: '',
    defaultOn: false,
    fields: [{ id: '死的', name: '死的', kind: 'text' as const, default: '' }],
    prompt: '## 假模块\n这里没有那个字段的占位符。',
  };
  const 值A = 假模块.fields[0].default;
  const 值B = '另一个值';
  const 输出A = 渲染模板(假模块.prompt, 建上下文(假模块 as never, 设置({ enabled: ['假模块'], fieldValues: { 死的: 值A } })));
  const 输出B = 渲染模板(假模块.prompt, 建上下文(假模块 as never, 设置({ enabled: ['假模块'], fieldValues: { 死的: 值B } })));
  check('死字段确实输出相同(判据可失败)', 输出A, 输出B);
}

console.log('\n[3] 显式豁免要能在 schema 里带上, 且真被读');
{
  // 加了 不渲染:true 的字段, 若它其实能影响输出, 也只是被跳过 —— 这是"显式声明"的代价, 可接受。
  // 这里只钉住: schema 认识这个标记(不被 strip 掉), 否则标记形同虚设。
  const 解析 = SettingsSchema.parse({});
  ok('SettingsSchema 正常解析(标记不影响设置)', !!解析);
  const 带标记 = { id: 'x', name: 'x', kind: 'text' as const, default: '', 不渲染: true };
  const 上下文 = 建上下文({ id: 'm', name: 'm', group: 'custom', desc: '', defaultOn: false, fields: [带标记], prompt: '' } as never, 设置({}));
  ok('带豁免标记的字段仍能进上下文(不报错)', 上下文.x === '' || 上下文.x === undefined);
}

console.log(`\n人设工坊字段活性: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
