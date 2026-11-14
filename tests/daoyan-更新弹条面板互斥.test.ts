// 剧情导演 / 彼方 · 更新弹条必须跟面板互斥（2026-11-13 用户报的"开面板提示条还挂在左边"）
//
// 病根：这条弹条是**第三套浮层** —— 既不在 toast 栈里、也不走 setToastSuppressed，
// 所以面板机制那条抑制链对它完全无效。面板一开，它照样 display:flex 挂在面板左沿
// （真机：剧情导演_更新弹条 @ l=331 z=2147482999，面板视口 left=679）。
//
// 烟火的 推进弹条.ts 早就修过同款；这两条弹条当初从烟火抄来，漏了 panelOpen 那一半。
//
// 判据分两层：① 纯函数真值表（行为）② 调用点真的用了它（源码，**先剥注释**，避免"注释就骗过"）。
import { readFileSync } from 'node:fs';
import { 应显示更新弹条 } from '../src/共用/更新弹条判定';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + '\n        期望 ' + JSON.stringify(expected) + '\n        实际 ' + JSON.stringify(actual)); }
}
function ok(label: string, cond: boolean) { check(label, !!cond, true); }

console.log('\n[1] 真值表：只有「更新中 且 面板没开」才显示');
{
  check('更新中 + 面板关 → 显示', 应显示更新弹条(true, false), true);
  check('更新中 + 面板开 → **不显示**（这就是缺陷本身）', 应显示更新弹条(true, true), false);
  check('没更新 + 面板关 → 不显示', 应显示更新弹条(false, false), false);
  check('没更新 + 面板开 → 不显示', 应显示更新弹条(false, true), false);
}

/** 定位「应显示更新弹条(」所在的那个 watch，返回它的**依赖数组内容**（不是全文件搜） */
function 弹条watch依赖(码: string): string | null {
  const i = 码.indexOf('应显示更新弹条(');
  if (i < 0) return null;
  const j = 码.lastIndexOf('watch([', i);
  if (j < 0) return null;
  const k = 码.indexOf(']', j);
  if (k < 0 || k > i) return null;
  return 码.slice(j + 'watch(['.length, k);
}
/** 弹条那个 watch 的**整段代码**（到配对的 }); 为止），用来查块内行为 */
function 弹条watch块(码: string): string {
  const i = 码.indexOf('应显示更新弹条(');
  if (i < 0) return '';
  const j = 码.lastIndexOf('watch([', i);
  if (j < 0) return '';
  const 止 = 码.indexOf('});', i);
  return 止 < 0 ? 码.slice(j) : 码.slice(j, 止 + 3);
}

console.log('\n[2] 两个调用点都真的用了它（剥注释后比对）');
{
  const 剥注释 = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const [名, 路径] of [
    ['剧情导演', 'src/剧情导演/悬浮球界面.vue'],
    ['彼方', 'src/彼方_NPC幕后生命状态系统/悬浮球界面.vue'],
  ] as [string, string][]) {
    const 码 = 剥注释(readFileSync(路径, 'utf8'));
    ok(名 + ': 判定用 应显示更新弹条(...)', 码.includes('应显示更新弹条('));
    // 2026-11-13 需求方 M4：**不许全文件搜** —— 彼方里还有一条
    // watch([panelOpen, anchorX, anchorY])（贴球重排，与弹条无关），全文件搜会命中它。
    // 所以先靠「应显示更新弹条(」反查最近的 watch([，把范围锁死到弹条那一条。
    const 依赖 = 弹条watch依赖(码);
    ok(名 + ': 找到了弹条那个 watch（防空跑）', 依赖 !== null);
    ok(名 + ': **弹条那个** watch 的依赖里有 panelOpen', (依赖 ?? '').includes('panelOpen'));
    // 同样收窄：只查弹条那个 watch 的代码块（否则文件后面别处的 .remove() 会误判成绿）
    ok(名 + ': 不显示时是**移除**（限定在弹条 watch 块内）', /\.remove\(\)/.test(弹条watch块(码)));
  }
  // 反例：这条弹条不该再出现"只把 display 设 none"的老写法
  const 导演码 = 剥注释(readFileSync('src/剧情导演/悬浮球界面.vue', 'utf8'));
  ok('剧情导演: 不再用 display = \'none\' 藏弹条', !/更新弹条El\.style\.display = 'none'/.test(导演码));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
