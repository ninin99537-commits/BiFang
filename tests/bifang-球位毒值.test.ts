// 彼方 · 球位毒值净化 —— 批次 2026-11-20（需求方 #469，从 C7 摘出来的真 bug）。
//
// ── 这个 bug 是什么 ──
//
//  共用那份（`共用/面板机制.ts`）有两道彼方没有的东西：
//
//  | | 共用那份 | 彼方原来 |
//  |---|---|---|
//  | ① 读取净化 | `球位有效(x,y,vw,vh)`：下界是 **CLOSED_SIZE**（整球）→ `{20,20}` 判无效 | 只挡 `0,0` 哨兵 → **`{20,20}` 原样返回** |
//  | ② 落盘守卫 | `if (!mountedDone \|\| !视口可用() \|\| !球位有效(...)) return` | `persistOrbPos` 只查 `null` |
//
//  于是 **`{20,20}` 这个毒值被钉住，永久**：
//
//  ```
//  毒值 {20,20} 在全局
//    → 读球位置 返回它（只挡 0,0）
//    → 挂载恢复的下界是 halfOrb() ≈ 20 → {20,20} 刚好通过
//    → persistOrbPos 只查 null → clamp 后的 (20,20) 直接写回全局
//    → 下次读又是它 ……
//  ```
//
//  **形状是"夹取出来的值也是毒值"** —— 夹到边界不等于安全，差一个阈值就是永久钉住。
//
// ── 判据（需求方 #469）──
//
//  1. 存 `{20,20}` → 读球位置返回 **null**（→ 界面用默认右下，不是左上角）
//  2. 视口不可用（宽高为 0）→ 读球位置返回 **null**、`视口可用` 为 false
//  3. 自证：去掉有效性判定 → 第 1 条必须红
import { createPinia, setActivePinia } from 'pinia';
import { 读球位置, 存球位置, 球位有效, 视口可用 } from '../src/彼方_NPC幕后生命状态系统/悬浮球偏好';

setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

const 原I = console.info;
const 原W = console.warn;
const 原E = console.error;
const 静默 = <T>(fn: () => T): T => {
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  }
  finally {
    console.info = 原I;
    console.warn = 原W;
    console.error = 原E;
  }
};

/** 球的真实直径（与 `theme.ts` 的 `悬浮球直径` 一致） */
const 球直径 = 44;
/** 正常视口 */
const 视口 = { w: 1280, h: 800 };

/** 造一个偏好宿主（只用到全局变量读写） */
function 造宿主(初始: Record<string, any> = {}) {
  const 存: any = { global: { ...初始 } };
  const host: any = {
    vars: {
      get: (arg: any) => (arg?.type === 'global' ? 存.global : {}),
      update: (fn: any, arg: any) => {
        if (arg?.type === 'global')
          存.global = fn(存.global);
      },
      // ⚠ `存偏好` 走的是 `insertOrAssign`（不是 `update`）—— 必须实现，否则存不进去
      insertOrAssign: (数据: Record<string, any>, arg: any) => {
        if (arg?.type === 'global')
          Object.assign(存.global, 数据);
      },
      del: () => {},
      scriptId: () => 't',
    },
  };
  return { host, 存 };
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★ 判据 1] 存 `{20,20}` 毒值 → 读球位置返回 null（界面用默认右下）');
{
  // ── 这条是本批的核心 ──
  //  20 恰好等于 `CLOSED_SIZE/2`（旧的下界），所以旧代码会放它过去。
  //  新判据的下界是 `CLOSED_SIZE`（44），20 < 44 → 判无效。
  const { host } = 造宿主();
  静默(() => 存球位置(host, { x: 20, y: 20 }));

  const 读回 = 静默(() => 读球位置(host, 视口, 球直径));

  eq('★ `{20,20}` 判无效 → 返回 null', 读回, null);
  // **自证前提**：确认它确实被存进去了（否则"返回 null"可能只是因为没存）
  const { host: 验host } = 造宿主();
  静默(() => 存球位置(验host, { x: 20, y: 20 }));
  const 不带视口 = 静默(() => 读球位置(验host));
  ok('[前置] 毒值确实存进去了（不传视口时能读回它）',
     !!不带视口 && 不带视口.x === 20,
     `实际 ${JSON.stringify(不带视口)}`);
}

console.log('\n[★ 判据 1b] 正常球位照常读回（不是"全都判无效"）');
{
  const { host } = 造宿主();
  静默(() => 存球位置(host, { x: 1200, y: 700 }));
  const 读回 = 静默(() => 读球位置(host, 视口, 球直径));
  eq('★ 右下角的正常位置照常读回', 读回, { x: 1200, y: 700 });

  // **负样本**：证明判据不是"恒返回 null"
  ok('[自证] 判据不是恒 null', 读回 !== null);
}

console.log('\n[★ 判据 2] 视口不可用（宽高为 0）→ 返回 null');
{
  // ── 这条对应"落盘守卫"那一半 ──
  //  量不出视口时任何坐标都不可信：界面的默认位比一个瞎猜的值安全。
  const { host } = 造宿主();
  静默(() => 存球位置(host, { x: 1200, y: 700 }));

  const 零视口 = 静默(() => 读球位置(host, { w: 0, h: 0 }, 球直径));
  eq('★ 视口 0×0 → 返回 null', 零视口, null);

  const 小视口 = 静默(() => 读球位置(host, { w: 100, h: 100 }, 球直径));
  eq('★ 视口 100×100（< 200）→ 也返回 null', 小视口, null);

  // `视口可用` 本身
  eq('★ 视口可用(0,0) = false', 视口可用(0, 0), false);
  eq('★ 视口可用(199,800) = false', 视口可用(199, 800), false);
  eq('★ 视口可用(200,200) = true（边界）', 视口可用(200, 200), true);
  eq('★ 视口可用(1280,800) = true', 视口可用(1280, 800), true);
}

console.log('\n[★ 判据 2b] `球位有效` 的阈值是"整球"不是"半球"（差一个阈值就是永久钉住）');
{
  // ── 这条钉住那个"差一个等号"的细节 ──
  //
  //  旧的下界是 `halfOrb()` = CLOSED_SIZE/2 = 22（球直径 44 时）
  //  新的下界是 `CLOSED_SIZE` = 44
  //
  //  于是 22 这个值：旧判据放行、新判据拒绝。
  const 半 = 球直径 / 2;
  eq('★ x = 半球（22）→ 无效（这是"夹出来的毒值"）', 球位有效(半, 半, 1280, 800, 球直径), false);
  eq('★ x = 整球（44）→ 有效（边界）', 球位有效(球直径, 球直径, 1280, 800, 球直径), true);
  eq('★ x = 20（历史毒值）→ 无效', 球位有效(20, 20, 1280, 800, 球直径), false);

  // 上界：不能超出视口（减去半球）
  eq('★ x = 视口宽 - 半球（边界）→ 有效', 球位有效(1280 - 半, 800 - 半, 1280, 800, 球直径), true);
  eq('★ x 超出视口 → 无效', 球位有效(1280, 800, 1280, 800, 球直径), false);

  // 非数字 / NaN / Infinity
  eq('★ NaN → 无效', 球位有效(Number.NaN, 100, 1280, 800, 球直径), false);
  eq('★ Infinity → 无效', 球位有效(Number.POSITIVE_INFINITY, 100, 1280, 800, 球直径), false);
  eq('★ 字符串 → 无效', 球位有效('100', '100', 1280, 800, 球直径), false);
  eq('★ undefined → 无效', 球位有效(undefined, undefined, 1280, 800, 球直径), false);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[自证] 去掉有效性判定 → 判据 1 必须红');
{
  // ── 纯逻辑复刻"旧判据"（只挡 0,0），证明它确实会放行毒值 ──
  //
  //  这不能改源码（那是变异测试做的事），但可以证明"两套判据在 20 这一档不同"。
  const 旧判据 = (x: number, y: number) => !(x === 0 && y === 0);   // 旧：只挡哨兵
  const 新判据 = (x: number, y: number) => 球位有效(x, y, 1280, 800, 球直径);

  eq('[自证] 旧判据放行 {20,20}', 旧判据(20, 20), true);
  eq('[自证] 新判据拒绝 {20,20}', 新判据(20, 20), false);
  ok('[自证] 两者在毒值这一档确实不同', 旧判据(20, 20) !== 新判据(20, 20));

  // 负样本：正常值两者都放行（证明新判据不是"全都拒绝"）
  eq('[自证] 正常值两者都放行', [旧判据(1200, 700), 新判据(1200, 700)], [true, true]);
}

// ═════════════════════════════════════════════════════════════
console.log('\n[结构] 两处守卫确实落地了');
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const 读 = (f: string) => readFileSync(path.join(process.cwd(), `src/彼方_NPC幕后生命状态系统/${f}`), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  const 偏好源 = 读('悬浮球偏好.ts');
  ok('[结构] 偏好里有 球位有效()', /function 球位有效\(/.test(偏好源));
  ok('[结构] 偏好里有 视口可用()', /function 视口可用\(/.test(偏好源));
  ok('[结构] 读球位置 接受视口参数', /读球位置\(host: 偏好宿主, 视口\?/.test(偏好源));
  ok('[结构] 读球位置 调了 球位有效', /球位有效\(偏好\.x, 偏好\.y/.test(偏好源));
  ok('[结构] 下界是 球直径（整球）不是半球', /x >= 球直径 && y >= 球直径/.test(偏好源));

  const 壳源 = 读('悬浮球界面.vue');
  ok('[结构] persistOrbPos 有 视口可用 守卫', /if \(!视口可用\(vw, vh\)\) return;/.test(壳源));
  ok('[结构] persistOrbPos 有 球位有效 守卫', /if \(!球位有效\(anchorX\.value, anchorY\.value, vw, vh, CLOSED_SIZE\)\) return;/.test(壳源));
  ok('[结构] 读球位置 传了视口进去', /读球位置\(host, \{ w: viewportW\(\), h: viewportH\(\) \}, CLOSED_SIZE\)/.test(壳源));

  // **自证**：正则可以抓到旧写法
  ok('[自证] 正则能抓到"只查 null"的旧落盘守卫',
     !/if \(!视口可用\(vw, vh\)\) return;/.test('if (anchorX.value === null || anchorY.value === null) return;'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
