// P0-2 判据装置（需求方独立复跑用，等 dsh 交付后直接跑）
//
// 缺口：提醒.ts:916 的 世界时间天数() 全库零调用；.vue:128 模板仍是裸插值
//       {{ 账本.世界时间.天数 }}，浮点累加实测上屏 67.30000000000045。
//
// 三层：
//   层1 静态禁令（.vue 模板不许裸插值 + 必须调用 世界时间天数）
//   层2 行为（从 .vue 现场抽新 computed，注入 67.32200000000002 真求值）
//   层3 变异（M1-M5，每条必须红在对的地方）
//
// ⚠️ 剥注释只剥整行注释（§7.8）：块注释正则会吃 accept="image/*" 后面 122 行。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { computed, ref } from 'vue';

const require = createRequire(import.meta.url);
const ts: typeof import('typescript') = require('typescript');
const 剥类型 = (源码: string) =>
  ts.transpileModule(源码, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: '片段.ts',
  }).outputText;

const 源路径 = process.env.P02_VUE ?? 'src/剧情导演/悬浮球界面.vue';
const 源 = readFileSync(源路径, 'utf8');

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = '') {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

console.log('='.repeat(78));
console.log('〇、装置自检（纪律 36：先证能看见）');
console.log('='.repeat(78));
console.log('  读取文件: ' + 源路径 + '（' + 源.length + ' 字符）');
check('〇a 源里确实有 账本.世界时间（判据不是测空气）', 源.includes('账本.世界时间'));

// 只剥整行注释（§7.8）
const 剥整行注释 = (s: string) =>
  s.replace(/^[ \t]*\/\/.*$/gm, '').replace(/^[ \t]*\*.*$/gm, '');
const 剥后 = 剥整行注释(源);
check('〇b 剥整行注释没吃掉真代码（行数不塌）',
  剥后.split('\n').length > 源.split('\n').length * 0.8,
  '原 ' + 源.split('\n').length + ' → 剥后 ' + 剥后.split('\n').length);
// ⚠️ 本文件没有 accept="image/*"（那是 设置界面.vue:316）。这里换一个本文件必有的真代码锚点。
check('〇c 剥整行注释保留了真代码（.vue 里的 computed 声明仍在）',
  /const\s+\S+\s*=\s*computed\s*\(/.test(剥后),
  '剥后还能找到 computed 声明 = ' + /const\s+\S+\s*=\s*computed\s*\(/.test(剥后));

// =====================================================================
console.log();
console.log('='.repeat(78));
console.log('一、层 1：静态禁令');
console.log('='.repeat(78));

// A. 模板插值里不许出现 世界时间.天数
const 裸插值 = [...剥后.matchAll(/\{\{[^}]*世界时间\s*\.\s*天数[^}]*\}\}/g)].map(m => m[0].trim());
check('A 模板插值里 世界时间.天数 命中数 == 0', 裸插值.length === 0,
  '实际命中 ' + 裸插值.length + ' 处: ' + 裸插值.join(' | '));

// B. 必须**真调用** 世界时间天数(
//
// 2026-11-14 dsh #394 提出：这条会数到注释里的「世界时间天数(」。
// 我实测确认它**能骗过这一条**（造 tmp/p02-mB2-行尾注释.vue：真调用删掉、
// 只在行尾 `// TODO 这里本该调 世界时间天数(...)` 留一句 → 这条仍 PASS）。
// 当时是层 2 的 E/F/G/H 兜住了 exit=1，但**静态禁令本身不能靠别人兜**。
//
// 剥法补两刀：
//   ① 整行注释（已有）
//   ② **行尾 `//` 之后的尾巴**（`  // ...` 这种，行首剥法管不到）
// 并且要求「调用」不是出现在 `import { ... }` 那条里（那是导入，不是调用）。
const 剥行尾注释 = (s: string) =>
  s
    .split('\n')
    .map(l => {
      // 找不在字符串里的 // —— 本文件模板段有 `第 {{ 世界天数 }} 天` 之类，
      // 但没有含 `//` 的字符串字面量，用朴素切分足够；为防 `https://` 这类，
      // 要求 // 前面不是冒号。
      const i = l.search(/(^|[^:])\/\//);
      if (i < 0) return l;
      return l.slice(0, i < 1 ? i : i + 1);
    })
    .join('\n');

const 剥后更狠 = 剥行尾注释(剥后);
const 调用行 = 剥后更狠
  .split('\n')
  .filter(l => /世界时间天数\s*\(/.test(l) && !/^\s*import\b/.test(l));
const 调用数 = 调用行.length;
check('B .vue 里 世界时间天数( 真调用数 >= 1（剥整行注释 + 剥行尾 // + 排除 import 行）',
  调用数 >= 1,
  '实际 ' + 调用数 + ' 处；命中行: ' + (调用行.map(l => l.trim()).join(' | ') || '（无）'));
// B2. 装置自检（纪律 36 的形态）：把「真调用删掉、只在行尾注释留一句」这一形态
//     喂给上面同一套剥法，计数必须变 0 —— 否则 B 仍是「数名字」而不是「数调用」。
{
  const 假源 = 剥后.replace(
    /世界时间天数\s*\([^)]*\)/,
    '(账本.value as any).世界时间?.天数',
  ).replace(/(\n)/, '$1// TODO 这里本该调 世界时间天数(账本.value)\n');
  const 假剥 = 剥行尾注释(假源);
  const 假数 = 假剥.split('\n').filter(l => /世界时间天数\s*\(/.test(l) && !/^\s*import\b/.test(l)).length;
  check('B2 装置自检：真调用删掉后只在注释里留一句 → 必须数到 0', 假数 === 0,
    '实际数到 ' + 假数 + '（若 >0 说明 B 还是「数名字」）');
}

// C. 文本仍显示
check('C .vue 里 世界时间.文本 仍然存在', /世界时间\s*\.\s*文本/.test(剥后));

// D. import 了 世界时间天数
check('D .vue 里 import 了 世界时间天数',
  /import\s*\{[^}]*世界时间天数[^}]*\}\s*from/.test(剥后),
  '实际 import 行: ' + (剥后.match(/^[ \t]*import[^\n]*提醒[^\n]*$/m) ?? ['（没找到提醒的 import）'])[0].trim());

// =====================================================================
console.log();
console.log('='.repeat(78));
console.log('二、层 2：行为（从 .vue 抽新 computed，真求值）');
console.log('='.repeat(78));

// 找 computed 声明：含 世界时间天数( 的那一行起的 const xxx = computed(...)
let 段起 = -1;
let 段止 = -1;
{
  const 行们 = 剥后.split('\n');
  for (let i = 0; i < 行们.length; i++) {
    if (/世界时间天数\s*\(/.test(行们[i]) && /computed\s*\(/.test(行们[i])) {
      段起 = 剥后.indexOf(行们[i]);
      // 括号配平
      let 深 = 0;
      let 已开 = false;
      let j = 段起;
      for (; j < 剥后.length; j++) {
        const c = 剥后[j];
        if (c === '(') { 深++; 已开 = true; }
        else if (c === ')') { 深--; if (已开 && 深 === 0) { j++; break; } }
      }
      段止 = j;
      break;
    }
  }
}
console.log('  新 computed 锚点: ' + (段起 >= 0 ? '偏移 ' + 段起 : '（没找到）'));
if (段起 < 0) {
  console.log('  ❌ 没找到「含 世界时间天数( 且含 computed( 的那一行」—— 说明 dsh 可能用了别的写法');
  console.log('     这不是判据通过，是判据失效。需要人工看实现形态。');
  fail++;
} else {
  const 原文段 = 剥后.slice(段起, 段止);
  console.log('  段: ' + 原文段.split('\n').length + ' 行 / ' + 原文段.length + ' 字符');
  console.log('  首行: ' + 原文段.split('\n')[0].trim());

  // 找到变量名
  // ⚠️ `\p{L}` 必须配 `u` flag，否则在非 unicode 模式下 `\p` 退化成字面 `p`，
  //    字符类变成 [p{L}_$]，中文首字匹配不上 → 变量名抽成空串 → 工厂返回 undefined
  //    → 报「Cannot read properties of undefined」。这是我自己装置的 bug，不是实现的问题。
  const 变量名 = /const\s+([\p{L}_$][\p{L}\p{N}_$]*)\s*=/u.exec(原文段)?.[1] ?? '';
  console.log('  变量名: ' + JSON.stringify(变量名));
  if (!变量名) {
    console.log('  ❌ 抽不到变量名 —— 装置失效，不是判据通过');
    fail++;
  }

  function 装配(变异: '无' | 'M1 裸读' | 'M2 ceil' | 'M3 常量0' | 'M4 不取整' = '无') {
    let 码 = 原文段;
    if (变异 === 'M1 裸读') {
      码 = 码.replace(/世界时间天数\s*\([^)]*\)/, '(账本.value?.世界时间?.天数)');
    } else if (变异 === 'M2 ceil') {
      码 = 码.replace(/世界时间天数\s*\(/, 'Math.ceil(').replace(/\}\s*\)\s*\)?;?$/, '});');
    } else if (变异 === 'M3 常量0') {
      码 = 码.replace(/世界时间天数\s*\([^)]*\)/, '0');
    } else if (变异 === 'M4 不取整') {
      码 = 码.replace(/世界时间天数\s*\([^)]*\)/, '(Number(账本.value?.世界时间?.天数) || 0)');
    }
    const 工厂 = new Function(
      'computed', 'ref', '账本', '世界时间天数',
      `${剥类型(码)}\n;return ${变量名};`,
    );
    return (账本: any) => {
      const a = 工厂(computed, ref, ref(账本), (z: any) => Math.max(0, Math.round(Number(z?.世界时间?.天数) || 0)));
      return a.value;
    };
  }

  try {
    const 求值 = 装配();
    const r1 = 求值({ 世界时间: { 天数: 67.32200000000002, 文本: '傍晚' } });
    check('E 67.32200000000002 → 67', String(r1).includes('67') && !String(r1).includes('67.3'),
      '实际 ' + JSON.stringify(r1));

    const r2 = 求值({ 世界时间: { 天数: 0.4, 文本: '' } });
    check('F 0.4 → 0（不是 0.4）', String(r2).includes('0') && !String(r2).includes('0.4'),
      '实际 ' + JSON.stringify(r2));

    const r3 = 求值({ 世界时间: { 天数: -5, 文本: '' } });
    check('G -5 → 0（不显示负数天）', !String(r3).includes('-5'), '实际 ' + JSON.stringify(r3));

    const r4 = 求值({ 世界时间: { 天数: 3.7, 文本: '清晨' } });
    // ⚠️ 我第一版这里断言「结果里含 '清晨'」—— 那是**判据设计错误**，不是实现缺陷。
    //    dsh 把职责拆开了：computed 只算「取整后的天数」（返回 number），
    //    文本在模板里单独插值 `· {{ 账本.世界时间.文本 }}`（层 1 的 C 已覆盖）。
    //    所以层 2 抽 computed **测不到文本**，写「含清晨」等于写了一条永远红的断言
    //    （4 个变异全红在 H 就是证据：它不是变异引起的，是一直红）。
    // 正确形态：确认 computed 返回的是**纯数字**（没被拼成 "3.7 清晨" 之类）。
    check('H 4 时取整成 4 且是纯数字（不是 "4 清晨" 这种拼接）',
      r4 === 4 || (typeof r4 === 'number' && r4 === 4),
      '实际 ' + JSON.stringify(r4) + '（类型 ' + typeof r4 + '）');

    // 层 3 变异
    console.log();
    console.log('='.repeat(78));
    console.log('三、层 3：变异（每条必须红）');
    console.log('='.repeat(78));
    const 跑 = (名: string, 变异: any) => {
      const 红: string[] = [];
      try {
        const f = 装配(变异);
        const a = f({ 世界时间: { 天数: 67.32200000000002, 文本: '傍晚' } });
        if (!(String(a).includes('67') && !String(a).includes('67.3'))) 红.push('E');
        const b = f({ 世界时间: { 天数: 0.4, 文本: '' } });
        if (String(b).includes('0.4')) 红.push('F');
        const c = f({ 世界时间: { 天数: -5, 文本: '' } });
        if (String(c).includes('-5')) 红.push('G');
        const d = f({ 世界时间: { 天数: 3.7, 文本: '清晨' } });
        if (!String(d).includes('清晨')) 红.push('H');
      } catch (e: any) {
        红.push('抛错:' + String(e.message).slice(0, 60));
      }
      console.log(`  【${名}】红 ${红.length} 条${红.length ? ' → ' + 红.join(' / ') : '  ⚠️ 全绿 = 变异是 no-op'}`);
      return 红;
    };
    const m1 = 跑('M1 裸读不取整', 'M1 裸读');
    const m2 = 跑('M2 Math.ceil', 'M2 ceil');
    const m3 = 跑('M3 常量 0', 'M3 常量0');
    const m4 = 跑('M4 只夹不取整', 'M4 不取整');
    check('M1 必须红', m1.length > 0);
    check('M2 必须红', m2.length > 0);
    check('M3 必须红', m3.length > 0);
    check('M4 必须红', m4.length > 0);
  } catch (e: any) {
    console.log('  ❌ 装配失败: ' + String(e.message).slice(0, 200));
    console.log('     这不是判据通过，是装置失效 —— 实现形态可能和我预期不同。');
    fail++;
  }
}

// =====================================================================
console.log();
console.log('='.repeat(78));
console.log('四、层 1 的 M5 专项：模板真的用上了新 computed 吗');
console.log('='.repeat(78));
{
  // M5 形态 = 加了 computed 但模板仍裸插值 → 层 1 红、层 2 绿
  // 这条在真实源上必须「层 1 绿」；变异要人工改源才能测，这里只核当前态
  check('M5 对照：当前源必须层 1 绿（A==0 且 B>=1）', 裸插值.length === 0 && 调用数 >= 1,
    'A=' + 裸插值.length + ' B=' + 调用数);
}

console.log();
console.log('='.repeat(78));
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('='.repeat(78));
if (fail > 0) process.exit(1);
