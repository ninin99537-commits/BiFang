// 人设工坊 · P1: 注册表 M7–M16 + 默认勾选一致性 + 落地动作的纯函数面
//
// 可机验的部分:
//   注册表补全且无重复 / 默认勾选与用户确认一致 / schema 默认与注册表不漂移
//   M13 语言风格的分工(只写行为规律) / NSFW 默认关 / 只勾 basic 的输出白名单
import { 模块注册表, 默认勾选, 模块索引 } from '../src/人设工坊/lib/modules';
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';
import { 拼装提示词 } from '../src/人设工坊/lib/prompt';
import { sanitizeOutput } from '../src/人设工坊/lib/sanitize';

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

function 设置(部分: Partial<Settings>): Settings {
  return {
    mode: 'user',
    enabled: [],
    fieldValues: {},
    brief: '',
    onMissing: 'mark',
    strictWhitelist: true,
    selfCheck: true,
    api: { source: 'main', apiurl: '', key: '', model: '' },
    material: { charCard: false, userPersona: false, chatHistory: false, chatDepth: 20 },
    promptOverrides: {},
    globalPrefix: '',
    globalSuffix: '',
    ...部分,
  } as Settings;
}

const 空素材 = { charInfo: '', userPersona: '', chatHistory: '', worldbook: '', brief: '' };

console.log('\n[1] 注册表补全 M1–M16, id 唯一');
{
  // 2026-10-14 #68: 顺序改为「注意力顺序」(头尾高、中段低), 这条断言随之更新
  const 应有 = [
    'basic', 'anchor', 'palette',
    'background', 'family', 'facets', 'reinterpret', 'collision', 'prefs', 'items', 'secrets', 'inner',
    'corpus', 'speech', 'highlight', 'nsfw_body',
  ];
  const 实际 = 模块注册表.map(模块 => 模块.id);
  check('id 集合与顺序一致', 实际, 应有);
  ok('id 无重复', new Set(实际).size === 实际.length);
  ok('每个 id 都能在索引里查到', 应有.every(id => !!模块索引[id]));
}

console.log('\n[1b] 注意力顺序: 拼装提示词的标题次序(2026-10-14 用户确认)');
{
  const 全部 = 模块注册表.map(模块 => 模块.id);
  const 提示词 = 拼装提示词(设置({ enabled: 全部 }), 模块注册表, 空素材);
  const 位置 = 模块注册表.map(模块 => 提示词.indexOf(`## ${模块.name}`));
  ok('每个模块标题都出现', 位置.every(位 => 位 >= 0));
  ok('标题按注册表顺序出现', 位置.every((位, i) => i === 0 || 位置[i - 1] < 位));
  // 三条硬约束
  ok('basic 在 anchor 之前(先让人知道这是谁)', 提示词.indexOf('## 基础信息与外貌') < 提示词.indexOf('## 性格锚定'));
  ok('调色盘先于三面性', 提示词.indexOf('## 性格调色盘') < 提示词.indexOf('## 三面性'));
  ok('语料在尾段(高注意力区)', 提示词.indexOf('## 语料') > 提示词.indexOf('## 内在与驱动力'));
}

console.log('\n[2] 默认勾选 = 用户确认的那五个');
{
  const 确认 = ['anchor', 'palette', 'basic', 'reinterpret', 'corpus'];
  check('默认勾选集合', [...默认勾选].sort(), [...确认].sort());
  ok('NSFW 默认关', !默认勾选.includes('nsfw_body'));
  ok('三面性默认关', !默认勾选.includes('facets'));
}

console.log('\n[3] schema 默认 enabled 与注册表默认勾选不漂移(防两处事实源)');
{
  const 从schema = SettingsSchema.parse({}).enabled;
  check('两处集合一致', [...从schema].sort(), [...默认勾选].sort());
}

console.log('\n[4] M13 语言风格: 只写行为规律, 台词归三面性/语料');
{
  const 片段 = 模块索引.speech.prompt;
  ok('写明「不是具体台词」', 片段.includes('不是具体台词'));
  ok('写明台词归三面性', 片段.includes('归三面性'));
  ok('要求写「怎么组织一句话」', 片段.includes('怎么组织一句话'));
}

console.log('\n[5] 只勾基础信息时, 别的模块不进提示词, 白名单只列它');
{
  const s = 设置({ enabled: ['basic'] });
  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  ok('含基础信息', 提示词.includes('## 基础信息与外貌'));
  ok('不含性格锚定', !提示词.includes('## 性格锚定'));
  ok('不含语料', !提示词.includes('## 语料'));
  ok('白名单只列基础信息', 提示词.includes('只允许出现这些标题：\n## 基础信息与外貌'));
}

console.log('\n[5b] 标题与 name 一致性(防白名单反向破功)');
{
  // 回归: kimicode P1-4 精确匹配探针 —— 勾了就该留得住。
  // 逐个模块: 只勾它, 提示词里必须出现 `## ${name}`; 拿这个标题喂白名单, 不得 extra/missing。
  const 不一致: string[] = [];
  const 误判: string[] = [];
  for (const 模块 of 模块注册表) {
    const s = 设置({ enabled: [模块.id] });
    const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
    if (!提示词.includes(`## ${模块.name}`)) 不一致.push(模块.id);

    const 探针 = `## ${模块.name}\n内容`;
    const 结果 = sanitizeOutput(探针, [模块.name], 模块注册表.map(m => m.name));
    if (结果.extra.length || 结果.missing.length) 误判.push(模块.id);
  }
  check('每个模块的 name 都出现在提示词标题里', 不一致, []);
  check('每个模块的精确标题都不被白名单误判', 误判, []);

  // 名字里不留斜杠(AI 容易改写成别的分隔符)
  const 带斜杠 = 模块注册表.filter(模块 => 模块.name.includes('/')).map(模块 => 模块.id);
  check('模块 name 不含斜杠', 带斜杠, []);
}

console.log('\n[5c] 归一化挡标点改写');
{
  // AI 把「基础信息与外貌」写成带括号/斜杠的变体, 归一后应仍算命中
  const 变体 = ['## 基础信息（外貌）', '## 基础信息/外貌', '## 基础信息、外貌'];
  const 漏判 = 变体.filter(标题 => {
    const 结果 = sanitizeOutput(`${标题}\n内容`, ['基础信息与外貌'], ['基础信息与外貌']);
    return 结果.missing.length > 0;
  });
  check('标点变体不再误判为 missing', 漏判, []);
}

console.log('\n[6] 新模块的细项默认值');
{
  const s = 设置({ enabled: ['basic'] });
  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  // #124 1.4: 默认字段里加了「介绍」(供人物索引那一句话介绍)
  ok('基础信息默认字段含介绍与外貌', 提示词.includes('姓名、介绍、年龄、性别、身高、外貌、服装'));
  ok('基础信息要求介绍一栏', 提示词.includes('「介绍」一栏必须写'));

  const s2 = 设置({ enabled: ['secrets'] });
  ok('秘密默认 4 条', 拼装提示词(s2, 模块注册表, 空素材).includes('写 4 条'));
}

console.log('\n[7] NSFW 勾了才写');
{
  const 未勾 = 拼装提示词(设置({ enabled: ['anchor'] }), 模块注册表, 空素材);
  ok('未勾不含身体与性', !未勾.includes('## 身体与性'));
  const 已勾 = 拼装提示词(设置({ enabled: ['anchor', 'nsfw_body'] }), 模块注册表, 空素材);
  ok('勾了含身体与性', 已勾.includes('## 身体与性'));
}

console.log('\n[8] 白名单对 NSFW 同样生效');
{
  const 文本 = '## 性格锚定\nA\n\n## 身体与性\nB';
  const 结果 = sanitizeOutput(文本, ['性格锚定'], ['性格锚定', '身体与性']);
  check('extra 含身体与性', 结果.extra, ['身体与性']);
  ok('cleaned 不含 B', !结果.cleaned.includes('B'));
}

console.log(`\n人设工坊 P1: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
