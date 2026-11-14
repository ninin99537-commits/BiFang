// 接缝判据：第4步探针与第5步探针之间的两条 watch（kimicode #386 抓出的覆盖真空）
//
// 事实（实测 offset）：
//   第4步探针段 = 23872 .. 25587（末锚 function applyPlayerBubbleBgPreset()）
//   第5步探针段 = 26005 .. 26750（末锚 // 基色变化时）
//   两条 watch   = 26795 / 26930   ← 两段都不含
//
// 这两条 watch 是**第4步接线的一部分**（回调里调的就是第4步那两个转发函数），
// 但触发条件挂在 theme 的 custom 基色上。没人测过：
//   ① 改 dialogue_bg_custom 且 bg_scheme==='custom' 时，dialogue_bg 真的重算
//   ② 同一动作不许顺手动 player_dialogue_bg
//   ③ 改 player_dialogue_bg_custom 时，只重算 player 那条
//   ④ bg_scheme 不是 'custom' 时，改基色不许触发重算（条件守卫）
//
// 做法：**真用 vue 的 watch**（不是手搓回调），改 settings 后 await nextTick 看产物。
//      这样测的是「watch 真的挂在那个字段上」，而不只是「回调体能跑」。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { computed, nextTick, ref, watch } from 'vue';
import { 应用气泡预设 } from '../src/正文美化/气泡渐变';

const require = createRequire(import.meta.url);
const ts: typeof import('typescript') = require('typescript');
const 剥类型 = (源码: string) =>
  ts.transpileModule(源码, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    fileName: '片段.ts',
  }).outputText;

const 源路径 = process.env.SEAM_VUE ?? 'src/正文美化/设置界面.vue';
const 源 = readFileSync(源路径, 'utf8');

// ---------- 纯 ASCII 锚点 ----------
const 第4步起 = 'const bubbleBgScheme = computed({';
const 第4步末 = 'function applyPlayerBubbleBgPreset()';
const watch起 = 'watch(() => settings.value.style.theme.dialogue_bg_custom';
const watch末 = 'const open = ref(false);';

const i4a = 源.indexOf(第4步起);
const i4b = 源.indexOf(第4步末, i4a);
const iwa = 源.indexOf(watch起);
const iwb = 源.indexOf(watch末, iwa);

console.log('='.repeat(78));
console.log('〇、提取（先证装置能看见，纪律 36）');
console.log('='.repeat(78));
console.log('  读取文件: ' + 源路径 + '（' + 源.length + ' 字符）');
if (i4a < 0 || i4b < 0 || iwa < 0 || iwb < 0) {
  console.log('❌ 锚点没找到（' + [i4a, i4b, iwa, iwb].join(' / ') + '）—— 探针失效，不是判据通过');
  process.exit(1);
}

const 段4止 = 源.indexOf('\n', i4b) + 1;
const 接线段 = 源.slice(i4a, 段4止);
const watch段 = 源.slice(iwa, iwb);

console.log('  第4步接线段: offset ' + i4a + '..' + 段4止 + '（' + 接线段.split('\n').length + ' 行）');
console.log('  watch 段  : offset ' + iwa + '..' + iwb + '（' + watch段.split('\n').length + ' 行）');
console.log('  watch 段首行: ' + watch段.split('\n')[0].trim());
console.log('  watch 段末行: ' + watch段.split('\n').filter(l => l.trim()).slice(-1)[0].trim());

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = '') {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '\n        ' + extra : '')); }
}

console.log();
console.log('='.repeat(78));
console.log('一、真空核实：两条 watch 确实不在前两个探针的段内');
console.log('='.repeat(78));
{
  const iWatch1 = 源.indexOf('watch(() => settings.value.style.theme.dialogue_bg_custom');
  const iWatch2 = 源.indexOf('watch(() => settings.value.style.theme.player_dialogue_bg_custom');
  const 第5步起 = 源.indexOf("const themePresetSelection = ref('');");
  const 第5步末 = 源.indexOf('// 基色变化时', 第5步起);
  check('〇a 两条 watch 都不在第4步段内',
    !(iWatch1 >= i4a && iWatch1 < 段4止) && !(iWatch2 >= i4a && iWatch2 < 段4止),
    'watch1=' + iWatch1 + ' watch2=' + iWatch2 + ' 段4=' + i4a + '..' + 段4止);
  check('〇b 两条 watch 都不在第5步段内',
    !(iWatch1 >= 第5步起 && iWatch1 < 第5步末) && !(iWatch2 >= 第5步起 && iWatch2 < 第5步末),
    'watch1=' + iWatch1 + ' watch2=' + iWatch2 + ' 段5=' + 第5步起 + '..' + 第5步末);
  check('〇c watch 段里确实有两条 watch（不是抽了个空段）',
    (watch段.match(/watch\(/g) ?? []).length === 2,
    '实际 ' + (watch段.match(/watch\(/g) ?? []).length + ' 条');
}

type 变异名 =
  | '无'
  | 'N1 player那条误调 applyBubbleBgPreset'
  | 'N2 dialogue条件读playerBubbleBgScheme'
  | 'N3 两条都去掉custom守卫'
  | 'N4 两条监听同一个字段';

function 装配(变异: 变异名 = '无') {
  let 码 = 接线段 + '\n' + watch段;
  switch (变异) {
    case 'N1 player那条误调 applyBubbleBgPreset':
      码 = 码.replace(
        /if \(playerBubbleBgScheme\.value === 'custom'\) applyPlayerBubbleBgPreset\(\);/,
        "if (playerBubbleBgScheme.value === 'custom') applyBubbleBgPreset();",
      );
      break;
    case 'N2 dialogue条件读playerBubbleBgScheme':
      码 = 码.replace(
        /if \(bubbleBgScheme\.value === 'custom'\) applyBubbleBgPreset\(\);/,
        "if (playerBubbleBgScheme.value === 'custom') applyBubbleBgPreset();",
      );
      break;
    case 'N3 两条都去掉custom守卫':
      码 = 码
        .replace(/if \(bubbleBgScheme\.value === 'custom'\) applyBubbleBgPreset\(\);/, 'applyBubbleBgPreset();')
        .replace(/if \(playerBubbleBgScheme\.value === 'custom'\) applyPlayerBubbleBgPreset\(\);/, 'applyPlayerBubbleBgPreset();');
      break;
    case 'N4 两条监听同一个字段':
      码 = 码.replace(
        'watch(() => settings.value.style.theme.player_dialogue_bg_custom, () => {',
        'watch(() => settings.value.style.theme.dialogue_bg_custom, () => {',
      );
      break;
  }
  if (变异 !== '无' && 码 === 接线段 + '\n' + watch段) {
    throw new Error('变异「' + 变异 + '」没匹配到任何字 —— 变异是 no-op，结论无效');
  }

  const 工厂 = new Function(
    'computed', 'ref', 'watch', 'settings', '应用气泡预设',
    `${剥类型(码)}\n;return { applyBubbleBgPreset, applyPlayerBubbleBgPreset,
      bubbleBgScheme, playerBubbleBgScheme };`,
  );

  const settings = ref<any>({
    style: {
      bubble: {
        style: 'none', radius: 14, padding: 12,
        bg_scheme: 'violet', bg_direction: 'ttb', bg_strength: 30,
        player_bg_scheme: 'violet', player_bg_direction: 'ttb', player_bg_strength: 30,
      },
      theme: {
        dialogue_bg: '',
        player_dialogue_bg: '',
        // ⚠️ 初始值必须**不等于**后面要赋的值，否则 watch 不触发（我第一版写 #ff0000，
        //    再赋 #ff0000，S1 永远红 —— 不是实现的问题，是判据自己没制造变化）
        dialogue_bg_custom: '#000001',
        player_dialogue_bg_custom: '#000002',
      },
    },
  });
  const api = 工厂(computed, ref, watch, settings, 应用气泡预设);
  return { api, settings };
}

const 取RGB = (css: string) => {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(css);
  return m ? [+m[1], +m[2], +m[3]] : null;
};

/** 跑全套断言，返回红的名字 */
async function 跑全量(变异: 变异名): Promise<string[]> {
  const 红: string[] = [];
  const 判 = (名: string, ok: boolean) => { if (!ok) 红.push(名); };
  const { settings } = 装配(变异);
  const T = () => settings.value.style.theme;
  const B = () => settings.value.style.bubble;

  // ---- S1/S2：dialogue 基色变化 + bg_scheme='custom' ----
  // ⚠️ player_bg_scheme 必须**不是** custom，否则 N2（dialogue 守卫读错对象）就是 no-op
  //    —— 两个 scheme 都是 'custom' 时，读哪个结果一样（纪律 15 现场踩到，第一版 0 红）
  B().bg_scheme = 'custom';
  B().player_bg_scheme = 'violet';
  B().bg_direction = 'ttb';
  B().bg_strength = 50;
  B().player_bg_direction = 'ttb';
  B().player_bg_strength = 50;
  await nextTick();

  T().dialogue_bg_custom = '#ff0000';
  await nextTick();
  await nextTick();
  判('S1', JSON.stringify(取RGB(T().dialogue_bg)) === '[255,0,0]');
  判('S2', T().player_dialogue_bg === '');

  // ---- S3/S4：player 基色变化（此时才把 player 切成 custom）----
  B().player_bg_scheme = 'custom';
  await nextTick();
  T().player_dialogue_bg_custom = '#00ff00';
  await nextTick();
  await nextTick();
  判('S3', JSON.stringify(取RGB(T().player_dialogue_bg)) === '[0,255,0]');
  const d前 = T().dialogue_bg;
  判('S4', T().dialogue_bg === d前);

  // ---- S5：不是 custom 时，改基色不许触发重算 ----
  {
    const { settings: s2 } = 装配(变异);
    const t2 = () => s2.value.style.theme;
    s2.value.style.bubble.bg_scheme = 'violet';
    await nextTick();
    t2().dialogue_bg_custom = '#123456';
    await nextTick();
    await nextTick();
    判('S5', t2().dialogue_bg === '');
  }

  return 红;
}

console.log();
console.log('='.repeat(78));
console.log('二、正向：当前磁盘实现必须 0 红');
console.log('='.repeat(78));
{
  const 红 = await 跑全量('无');
  check('正向对照 0 红', 红.length === 0, '实际红: ' + 红.join(','));
}

console.log();
console.log('='.repeat(78));
console.log('三、变异（每条必须红在对的断言上）');
console.log('='.repeat(78));
const 期望: Array<[变异名, string, (红: string[]) => boolean, string]> = [
  ['N1 player那条误调 applyBubbleBgPreset', 'player 的 watch 写了 dialogue 的转发',
    红 => 红.includes('S3'), 'S3（玩家基色变了但玩家产物没变）'],
  ['N2 dialogue条件读playerBubbleBgScheme', 'dialogue 的守卫读错了对象',
    红 => 红.includes('S1'), 'S1（正文基色变了但正文产物没变）'],
  ['N3 两条都去掉custom守卫', '非 custom 也重算',
    红 => 红.includes('S5'), 'S5（不是 custom 却被重算）'],
  ['N4 两条监听同一个字段', 'player 那条监听挂在 dialogue 基色上',
    红 => 红.includes('S3'), 'S3（改玩家基色没人响应）'],
];
const 结果表 = new Map<string, string[]>();
for (const [名, 说明, 判据, 期望红] of 期望) {
  const 红 = await 跑全量(名);
  结果表.set(名, 红);
  console.log(`\n  【${名}】${说明}`);
  console.log(`    期望红: ${期望红}`);
  console.log(`    实际红 ${红.length} 条: ${红.join(' / ') || '（无）'}`);
  check(`${名} 红在对的断言上`, 判据(红));
}

console.log();
console.log('='.repeat(78));
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('='.repeat(78));
if (fail > 0) process.exit(1);
