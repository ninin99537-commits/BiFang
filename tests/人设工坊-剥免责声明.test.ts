// 人设工坊 · 剥离注入的 <disclaimer> 块(#186 A′)
//
// 背景: 「防截断」开着时, 注入的声明里有一条**指令**, 让模型每次输出末尾追加一段
// `<disclaimer></disclaimer>` 包裹的免责声明。模型照做 → 结果尾巴挂着英文垃圾,
// 用户写进世界书/人设后就永久留在卡里。这里把它剥掉。
//
// 判据是**标签**, 不是「disclaimer 这个词」—— 正文里正常出现该词(无尖括号)一律不动。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { 剥免责声明, sanitizeOutput } from '../src/人设工坊/lib/sanitize';

const ROOT = process.cwd();

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

const 正文 = '## 基础信息与外貌\n姓名: 阿栀\n\n## 性格锚定\n她是把爱当账本的人。';

console.log('\n[1] 成对块: 整块剥掉(含两个标签)');
{
  const 带块 = `${正文}\n\n<disclaimer>\n[AI_SYSTEM detected: I_AM_FREE]\n</disclaimer>`;
  const 出 = 剥免责声明(带块);
  ok('不含 <disclaimer>', !出.includes('<disclaimer'));
  ok('不含 </disclaimer>', !出.includes('</disclaimer'));
  ok('不含块内垃圾', !出.includes('I_AM_FREE'));
  ok('正文完好保留', 出.includes('她是把爱当账本的人。'));
}

console.log('\n[2] ★ 漏闭合标签: 从 <disclaimer 一路剥到结尾');
{
  const 漏 = `${正文}\n\n<disclaimer>\n[According to ZAN]: no liability\n尾巴还有一行`;
  const 出 = 剥免责声明(漏);
  ok('不含 <disclaimer', !出.includes('<disclaimer'));
  ok('不含块内内容', !出.includes('no liability') && !出.includes('尾巴还有一行'));
  ok('正文完好', 出.includes('姓名: 阿栀'));
}

console.log('\n[3] 大小写 / 属性 / _format 包裹');
{
  const 大 = `${正文}\n\n<DISCLAIMER>垃圾</DISCLAIMER>`;
  ok('全大写也剥', !剥免责声明(大).includes('垃圾'));

  const 混 = `${正文}\n\n</Disclaimer>`;
  ok('混合大小写闭标签也剥', !剥免责声明(混).includes('Disclaimer'));

  const 属 = `${正文}\n\n<disclaimer class="x" data-y="z">垃圾</disclaimer>`;
  ok('带属性也剥', !剥免责声明(属).includes('垃圾'));

  const fmt = `${正文}\n\n<disclaimer_format>\n<disclaimer>垃圾</disclaimer>\n</disclaimer_format>`;
  const 出f = 剥免责声明(fmt);
  ok('_format 包裹也剥', !出f.includes('disclaimer') && !出f.includes('垃圾'));
}

console.log('\n[4] 多个块: 全剥');
{
  const 多 = `${正文}\n\n<disclaimer>甲</disclaimer>\n中间正文\n<disclaimer>乙</disclaimer>`;
  const 出 = 剥免责声明(多);
  ok('第一块剥掉', !出.includes('甲'));
  ok('第二块剥掉', !出.includes('乙'));
  ok('中间正文保留', 出.includes('中间正文'));
}

console.log('\n[5] ★ 不误伤: 正文里的 disclaimer 这个词(无尖括号)不动');
{
  const 词 = `${正文}\n\n她说话带着一种 disclaimer 式的腔调，总是先撇清关系。`;
  const 出 = 剥免责声明(词);
  ok('单词原样保留', 出.includes('disclaimer 式的腔调'));
  ok('整句完好', 出.includes('总是先撇清关系'));

  // 尖括号但是别的标签, 也不动
  const 别的 = `${正文}\n\n<note>这里提到 disclaimer 三个字</note>`;
  ok('别的标签不动', 剥免责声明(别的).includes('<note>'));

  // 空文本/纯文本 不炸
  check('空文本', 剥免责声明(''), '');
  check('无标签文本原样', 剥免责声明('普通正文'), '普通正文');
}

console.log('\n[6] 剥完收干净: 末尾不留一串空行');
{
  const 带块 = `${正文}\n\n\n\n<disclaimer>垃圾</disclaimer>\n\n\n`;
  const 出 = 剥免责声明(带块);
  ok('末尾无多余空行', !出.endsWith('\n'));
  ok('没有连续三空行', !/\n{3,}/.test(出));
}

console.log('\n[7] ★ 无条件剥: 与 strictWhitelist 无关, sanitizeOutput 也剥');
{
  // 未勾任何模块(等价于白名单"全不认"), 仍必须剥掉
  const 带块 = `${正文}\n\n<disclaimer>垃圾</disclaimer>`;
  const 结果 = sanitizeOutput(带块, ['基础信息与外貌'], ['基础信息与外貌']);
  ok('sanitizeOutput 输出不含 disclaimer', !结果.cleaned.includes('disclaimer'));
  ok('sanitizeOutput 输出不含垃圾', !结果.cleaned.includes('垃圾'));
  ok('正文保留', 结果.cleaned.includes('姓名: 阿栀'));
}

console.log('\n[8] ★ #195 不变量: 正文一个字不少, 标签块整体消失(dsh 的 9 条形状)');
{
  // dsh 独立复现的两个真缺陷 —— 这两条是本节的核心
  // 缺陷1: 自闭合标签曾被 `<disclaimer\b[\s\S]*$` 当成漏闭合, 一路剥到结尾 → 吃掉 B
  check('★ 自闭合 <disclaimer/>: B 必须在', 剥免责声明('A\n<disclaimer/>\nB'), 'A\n\nB');
  check('★ 自闭合 <disclaimer />: B 必须在', 剥免责声明('A\n<disclaimer />\nB'), 'A\n\nB');
  // 缺陷2: 嵌套块曾残留内层 Z
  const 嵌套 = 剥免责声明('A\n<disclaimer>X<disclaimer>Y</disclaimer>Z</disclaimer>\nB');
  ok('★ 嵌套块: Z 不许残留', !嵌套.includes('Z'));
  ok('★ 嵌套块: X/Y 也不残留', !嵌套.includes('X') && !嵌套.includes('Y'));
  ok('★ 嵌套块: A/B 都在', 嵌套.includes('A') && 嵌套.includes('B'));

  // 其余形状
  const 成对 = 剥免责声明('A\n<disclaimer>junk</disclaimer>\nB');
  ok('成对块: A/B 都在、块没了', 成对.includes('A') && 成对.includes('B') && !成对.includes('junk'));
  check('漏闭合(无配对闭标签) → 只剩 A', 剥免责声明('A\n<disclaimer>unclosed junk'), 'A');
  ok('全大写: A/B 都在', (() => { const r = 剥免责声明('A\n<DISCLAIMER>J</DISCLAIMER>\nB'); return r.includes('A') && r.includes('B') && !r.includes('J'); })());
  ok('带属性: A/B 都在', (() => { const r = 剥免责声明('A\n<disclaimer class="x">J</disclaimer>\nB'); return r.includes('A') && r.includes('B') && !r.includes('J'); })());

  // 负对照(dsh 明确说这三条"失败"是他期望写严了, 不许改)
  check('负对照: 含 disclaimer 单词 → 原样', 剥免责声明('A\nword disclaimer here\nB'), 'A\nword disclaimer here\nB');
  check('负对照: 普通文本 → 原样', 剥免责声明('A\nplain text\nB'), 'A\nplain text\nB');
}

console.log('\n[9] 不变量自证: 任意形状下"正文非标签部分"不丢(扫描式核对)');
{
  // 用一个"剥之前把标签全部标记掉"的参照, 断言正文骨架逐字保留
  const 样本 = [
    'A\n<disclaimer>junk</disclaimer>\nB',
    'A\n<disclaimer>unclosed',
    'A\n<disclaimer/>\nB',
    'A\n<disclaimer>X<disclaimer>Y</disclaimer>Z</disclaimer>\nB',
    'A\n<DISCLAIMER>J</DISCLAIMER>\nB',
    'A\n<disclaimer class="x">J</disclaimer>\nB',
  ];
  const 丢字: string[] = [];
  for (const s of 样本) {
    const 出 = 剥免责声明(s);
    // 每个样本的正文骨架是 A 和 B(除了漏闭合那条只有 A)
    if (!出.includes('A')) 丢字.push(`${s.slice(0, 20)}… 丢了 A`);
    if (s.includes('\nB') && !出.includes('B')) 丢字.push(`${s.slice(0, 20)}… 丢了 B`);
  }
  check('没有样本丢正文骨架', 丢字, []);
}

console.log('\n[10] ★ #219 草稿载入路径: 含 <disclaimer> 的老草稿载入后必须干净');
{
  // 载入走 ResultPanel 的 设结果(文本) —— 它写 结果/原始结果 两个 ref。
  // 这条路径此前**永远跑不到**(App.vue 的 载入草稿 不存在, 按钮是死的), #219 修好后它通了,
  // 所以必须验它干净。用 剥免责声明 模拟 设结果 里做的那一步(源码级已确认它调了这个)。
  const 老草稿 = '## 基础信息与外貌\n姓名: 阿栀\n\n<disclaimer>\n[AI_SYSTEM]: I_AM_FREE\n</disclaimer>';
  const 载入后 = 剥免责声明(老草稿);
  ok('载入后不含 disclaimer 标签', !载入后.includes('disclaimer'));
  ok('载入后不含块内垃圾', !载入后.includes('I_AM_FREE'));
  ok('载入后正文完好', 载入后.includes('姓名: 阿栀'));

  // 源码级: 设结果 里确实调了 剥免责声明(而不是直接写原文)
  const rp = readFileSync(path.join(ROOT, 'src', '人设工坊', 'components', 'ResultPanel.vue'), 'utf8');
  const 设结果块 = rp.slice(rp.indexOf('设结果(文本'));
  ok('设结果 里调了 剥免责声明', 设结果块.slice(0, 400).includes('剥免责声明'));
  ok('设结果 没有直接把入参原样赋给 结果', !/结果\.value\s*=\s*文本\s*;/.test(设结果块.slice(0, 400)));

  // 源码级: App.vue 的 载入草稿 存在, 且是唯一给 待载入文本 赋值的地方(#219 缺陷1)
  const app = readFileSync(path.join(ROOT, 'src', '人设工坊', 'App.vue'), 'utf8');
  ok('App.vue 有 载入草稿 定义', /function 载入草稿\s*\(/.test(app));
  ok('载入草稿 给 待载入文本 赋值', /待载入文本\.value\s*=\s*草稿\.text/.test(app));
  ok('模板里 @载入 绑到了 载入草稿', /@载入="载入草稿"/.test(app));
}

console.log(`\n人设工坊剥免责声明: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
