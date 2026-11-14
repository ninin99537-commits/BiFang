// 人设工坊 · 提示词拼装器与白名单校验
//
// 覆盖规格里可机验的几条:
//   模板引擎(变量/条件/循环) → 验收 4
//   拼装顺序(调色盘在三面性之前) → 验收 5
//   三面性替换语料 → 验收 4
//   不勾就不写 → 验收 1
//   白名单校验 → 验收 2
import { 拼装提示词, 渲染模板, 取片段, 建上下文 } from '../src/人设工坊/lib/prompt';
import { 模块注册表, 模块索引, 默认勾选 } from '../src/人设工坊/lib/modules';
import { sanitizeOutput } from '../src/人设工坊/lib/sanitize';
import type { Settings } from '../src/人设工坊/schema';

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

/** 造一份测试用设置: 只给测试关心的字段, 其余用默认占位 */
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

console.log('\n[1] 小模板引擎: 变量 / 条件 / 循环');
{
  check('变量替换', 渲染模板('你好 {{名}}', { 名: '世界' }), '你好 世界');
  check('数组用顿号连接', 渲染模板('{{表}}', { 表: ['日常', '激动'] }), '日常、激动');
  check('未定义变量为空', 渲染模板('x{{缺失}}y', {}), 'xy');
  check('if 真分支', 渲染模板('{{#if a}}有{{/if}}', { a: '值' }), '有');
  check('if 假分支为空', 渲染模板('{{#if a}}有{{/if}}', { a: '' }), '');
  check('if-else', 渲染模板('{{#if a}}有{{else}}无{{/if}}', { a: 0 }), '无');
  check('if 字符串比较', 渲染模板("{{#if m == 'self'}}自述{{else}}客观{{/if}}", { m: 'self' }), '自述');
  check('each 循环', 渲染模板('{{#each 项}}[{{this}}]{{/each}}', { 项: ['a', 'b'] }), '[a][b]');
  check(
    'each 里套 if',
    渲染模板('{{#each 项}}{{#if this}}[{{this}}]{{/if}}{{/each}}', { 项: ['a', '', 'c'] }),
    '[a][c]',
  );
  check('无标记的原样返回', 渲染模板('纯文本', {}), '纯文本');
  check('未闭合标记不炸', 渲染模板('前 {{名', { 名: 'x' }), '前 {{名');
}

console.log('\n[2] 只勾性格锚定时, 别的模块不进提示词(验收 1)');
{
  const s = 设置({ enabled: ['anchor'] });
  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  ok('含性格锚定', 提示词.includes('## 性格锚定'));
  ok('不含性格调色盘', !提示词.includes('## 性格调色盘'));
  ok('不含语料', !提示词.includes('## 语料'));
  ok('输出白名单只列锚定', /只允许出现这些标题：\n## 性格锚定\n?$/.test(提示词) || 提示词.includes('只允许出现这些标题：\n## 性格锚定'));
}

console.log('\n[3] 顺序: 调色盘在三面性之前(验收 5)');
{
  const s = 设置({ enabled: ['anchor', 'palette', 'facets', 'corpus'] });
  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  const 调色盘位置 = 提示词.indexOf('## 性格调色盘');
  const 三面性位置 = 提示词.indexOf('## 三面性');
  ok('调色盘出现', 调色盘位置 >= 0);
  ok('三面性出现', 三面性位置 >= 0);
  ok('调色盘在三面性之前', 调色盘位置 < 三面性位置);
}

console.log('\n[4] 三面性启用时替换语料片段(验收 4)');
{
  const 启用集合 = new Set(['facets', 'corpus']);
  const s = 设置({ enabled: ['facets', 'corpus'] });
  const 语料片段 = 取片段(模块索引.corpus, 启用集合, 模块注册表, s);
  ok('语料片段被替换', 语料片段.includes('语料归入三面性'));
  ok('不再含原语料要求', !语料片段.includes('至少 {{min_lines}} 条'));

  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  ok('提示词里语料已归入三面性', 提示词.includes('语料归入三面性'));
}

console.log('\n[5] 细项默认值与用户填写');
{
  const s = 设置({ enabled: ['corpus'], fieldValues: { min_lines: 12 } });
  const 提示词 = 拼装提示词(s, 模块注册表, 空素材);
  ok('用户填的 12 生效', 提示词.includes('至少 12 条'));

  const s2 = 设置({ enabled: ['corpus'] });
  const 上下文 = 建上下文(模块索引.corpus, s2);
  check('未填时回落默认 8', 上下文.min_lines, 8);
}

console.log('\n[6] 白名单校验: 多写的已知模块被剔除(验收 2)');
{
  const 文本 = '## 性格锚定\n内容A\n\n## 背景故事\n内容B\n\n## 语料\n内容C';
  const 结果 = sanitizeOutput(文本, ['性格锚定', '语料'], ['性格锚定', '语料', '背景故事']);
  check('extra 含背景故事', 结果.extra, ['背景故事']);
  ok('cleaned 不含背景故事', !结果.cleaned.includes('背景故事'));
  ok('cleaned 不含内容B', !结果.cleaned.includes('内容B'));
  ok('cleaned 保留锚定', 结果.cleaned.includes('内容A'));
  ok('cleaned 保留语料', 结果.cleaned.includes('内容C'));
  check('missing 为空', 结果.missing, []);
}

console.log('\n[7] 白名单校验: 漏写与未知标题');
{
  const 文本 = '## 性格锚定\n内容A\n\n## 作者的话\n自由发挥';
  const 结果 = sanitizeOutput(文本, ['性格锚定', '语料'], ['性格锚定', '语料']);
  check('missing 含语料', 结果.missing, ['语料']);
  check('extra 含未知标题', 结果.extra, ['作者的话']);
  ok('未知标题不删', 结果.cleaned.includes('自由发挥'));
}

console.log('\n[8] 白名单校验: 标题归一化(去 #、空格、全角冒号)');
{
  const 文本 = '## 性格锚定 ：\n内容A';
  const 结果 = sanitizeOutput(文本, ['性格锚定'], ['性格锚定']);
  check('不再误判为 extra', 结果.extra, []);
  check('不再误判为 missing', 结果.missing, []);
}

console.log('\n[9] 默认勾选与注册表自洽');
{
  check('默认勾选不含默认关的模块', 默认勾选.includes('facets') || 默认勾选.includes('collision'), false);
  ok('默认勾选含锚定/调色盘/二次解释/语料', ['anchor', 'palette', 'reinterpret', 'corpus'].every(id => 默认勾选.includes(id)));
  ok('每个模块 id 唯一', new Set(模块注册表.map(m => m.id)).size === 模块注册表.length);
}

console.log(`\n人设工坊: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
