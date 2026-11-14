// 人设工坊 · 世界书素材源回归(用户报的 Bug A)
//
// 用户原话: "素材来源是角色卡，不是世界书？" —— 一张卡的世界观/人物/机制往往全在世界书里,
// 只读卡字段等于没读设定。本用例钉住三件事:
//   [1] 条目来源: 内嵌(直接读 data.character_book) + 绑定世界书, 都进候选; 禁用的跳过
//   [2] 选择逻辑: 默认勾常驻 / 自定义按勾选 / 换书后无效选择被忽略(不报错) / 源关掉则空
//   [3] 注入不截断: 条目全文进提示词素材, 无省略号
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';
import {
  取世界书条目, 已选世界书条目, 拼世界书素材, 条目键, type 世界书条目,
} from '../src/人设工坊/lib/世界书';

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

/** 造设置: material 上覆盖本次要测的字段, 其余走 schema 默认 */
function 设置(material: Record<string, unknown> = {}): Settings {
  const 基 = SettingsSchema.parse({});
  基.material = { ...基.material, ...material } as Settings['material'];
  return 基;
}

/** 常驻规则条目: 400 字, 用来验证"按字数降序" */
const 长正文 = '规则内容'.repeat(100);

console.log('\n[1] 候选来源: 内嵌 character_book + 绑定世界书, 禁用的跳过');
{
  (globalThis as any).getCharData = () => ({
    name: '测试卡',
    description: '', personality: '', scenario: '', mes_example: '',
    data: {
      character_book: {
        name: '内嵌书',
        entries: {
          0: { comment: '常驻规则', content: 长正文, constant: true, enabled: true },
          1: { comment: '关键词条目', content: '词条内容', constant: false, enabled: true },
          2: { comment: '被禁用的', content: '不该出现', constant: true, enabled: false },
        },
      },
    },
  });
  (globalThis as any).getCharWorldbookNames = () => ({ primary: '绑定书', additional: [] });
  (globalThis as any).getChatWorldbookName = () => null;
  (globalThis as any).getWorldbook = async () => [
    { uid: 10, name: '绑定常驻', content: '绑定内容', enabled: true, strategy: { type: 'constant' } },
    { uid: 11, name: '绑定绿灯', content: '绿灯内容', enabled: true, strategy: { type: 'selective' } },
    { uid: 12, name: '绑定禁用', content: '不该出现', enabled: false, strategy: { type: 'constant' } },
  ];

  const 全部 = await 取世界书条目();
  const 名 = 全部.map(条 => 条.名);
  ok('读到内嵌常驻', 名.includes('常驻规则'));
  ok('读到内嵌关键词条目', 名.includes('关键词条目'));
  ok('读到绑定常驻', 名.includes('绑定常驻'));
  ok('读到绑定绿灯', 名.includes('绑定绿灯'));
  ok('内嵌禁用的跳过', !名.includes('被禁用的'));
  ok('绑定禁用的跳过', !名.includes('绑定禁用'));
  check('候选共 4 条', 全部.length, 4);
  check('按字数降序(最长的在内嵌常驻)', 全部[0].名, '常驻规则');
  ok('内嵌常驻标记 constant', 全部.find(条 => 条.名 === '常驻规则')?.常驻 === true);
  ok('绑定常驻标记 constant', 全部.find(条 => 条.名 === '绑定常驻')?.常驻 === true);
  ok('绑定绿灯不是常驻', 全部.find(条 => 条.名 === '绑定绿灯')?.常驻 === false);
}

console.log('\n[2] 选择逻辑: 默认勾常驻');
{
  const 全部 = await 取世界书条目();
  const 选 = 已选世界书条目(设置(), 全部);
  const 名 = 选.map(条 => 条.名).sort();
  check('默认 = 两条常驻', 名, ['常驻规则', '绑定常驻'].sort());
}

console.log('\n[3] 选择逻辑: 用户自定义(含取消常驻、勾上绿灯)');
{
  const 全部 = await 取世界书条目();
  const 选 = 已选世界书条目(
    设置({ worldbookTouched: true, worldbookSelected: [条目键('内嵌书', 1), 条目键('绑定书', 11)] }),
    全部,
  );
  const 名 = 选.map(条 => 条.名).sort();
  check('按用户勾选', 名, ['关键词条目', '绑定绿灯'].sort());
}

console.log('\n[4] 换书后无效选择被忽略, 不报错');
{
  const 全部 = await 取世界书条目();
  const 选 = 已选世界书条目(
    设置({ worldbookTouched: true, worldbookSelected: ['不存在的书#99', 条目键('内嵌书', 1)] }),
    全部,
  );
  const 名 = 选.map(条 => 条.名);
  check('只留当前范围里存在的', 名, ['关键词条目']);
}

console.log('\n[5] 世界书源关掉 → 不注入');
{
  const 全部 = await 取世界书条目();
  check('关闭后为空', 已选世界书条目(设置({ worldbook: false }), 全部), []);
}

console.log('\n[6] 注入不截断: 条目全文进素材, 无省略号');
{
  const 全部 = await 取世界书条目();
  const 选 = 已选世界书条目(设置(), 全部);
  const 文本 = 拼世界书素材(选);
  ok('含常驻规则全文', 文本.includes(长正文));
  ok('无省略号', !文本.includes('…'));
  ok('带条目标题', 文本.includes('### 常驻规则'));
  ok('带世界书名', 文本.includes('内嵌书'));
  check('长条目字数 = 原长', 全部.find(条 => 条.名 === '常驻规则')?.字数, 长正文.length);
}

console.log(`\n人设工坊世界书: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
