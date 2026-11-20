// 彼方 · 球位毒值净化 —— 批次 2026-11-20（需求方 #469，从 C7 摘出来的真 bug）。
//
// ── 这个 bug 是什么 ──
//
//  共用那份（`共用/面板机制.ts`）有两道彼方没有的东西：
//
//  | | 共用那份 | 彼方原来 |
//  |---|---|---|
//  | ① 读取净化 | `球位有效(x,y,vw,vh)`：下界是 **半球**（= 贴边可保存）→ `{20,20}` 判无效（20 < 23） | 只挡 `0,0` 哨兵 → **`{20,20}` 原样返回** |
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

console.log('\n[★ 判据 2b] `球位有效` 的下界是**半球**（= 贴边可保存），毒值仍被拦');
{
  // ── 2026-11-20 #569 修正：下界从"整球"改回"半球" ──
  //
  //  锚点是**球心**，所以：
  //    center = 半（23）→ 球边缘正好贴住屏幕边，完全可见  ← **贴边，必须可保存**
  //    center = 46     → 球离边还有 23px，永远贴不上
  //
  //  毒值 `{20,20}` 仍被拦（20 < 23）—— `8b239b9` 那个修复不受影响。
  const 半 = 球直径 / 2;
  eq('★ x = 半球（23）→ **有效**（这是"贴边"，必须能保存）', 球位有效(半, 半, 1280, 800, 球直径), true);
  eq('★ x = 20（历史毒值，20 < 23）→ **无效**', 球位有效(20, 20, 1280, 800, 球直径), false);
  eq('★ x = 19 → 无效（比毒值更小）', 球位有效(19, 19, 1280, 800, 球直径), false);

  // 上界：不能超出视口（减去半球）
  eq('★ x = 视口宽 - 半球（边界）→ 有效', 球位有效(1280 - 半, 800 - 半, 1280, 800, 球直径), true);
  eq('★ x 超出视口 → 无效', 球位有效(1280, 800, 1280, 800, 球直径), false);

  // 非数字 / NaN / Infinity
  eq('★ NaN → 无效', 球位有效(Number.NaN, 100, 1280, 800, 球直径), false);
  eq('★ Infinity → 无效', 球位有效(Number.POSITIVE_INFINITY, 100, 1280, 800, 球直径), false);
  eq('★ 字符串 → 无效', 球位有效('100', '100', 1280, 800, 球直径), false);
  eq('★ undefined → 无效', 球位有效(undefined, undefined, 1280, 800, 球直径), false);

  // **自证**：如果下界改回整球，第 1 条必须红
  const 旧整球判据 = (x: number, y: number) => x >= 球直径 && y >= 球直径;
  eq('[自证] 下界改回整球时，贴边位置（23）被判无效 → 第 1 条会红',
     旧整球判据(半, 半), false);
  eq('[自证] 但整球判据仍拦毒值（说明"拦毒值"不是判据的区分点）',
     旧整球判据(20, 20), false);
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
  ok('[结构] 下界是 半球（= 贴边可保存）', /x >= 半 && y >= 半/.test(偏好源),
     '下界不是 半 —— 贴边位置会被判毒值');

  const 壳源 = 读('悬浮球界面.vue');
  ok('[结构] persistOrbPos 有 视口可用 守卫', /if \(!视口可用\(vw, vh\)\) return;/.test(壳源));
  ok('[结构] persistOrbPos 有 球位有效 守卫', /if \(!球位有效\(anchorX\.value, anchorY\.value, vw, vh, CLOSED_SIZE\)\) return;/.test(壳源));
  ok('[结构] 读球位置 传了视口进去', /读球位置\(host, \{ w: viewportW\(\), h: viewportH\(\) \}, CLOSED_SIZE\)/.test(壳源));

  // ── 2026-11-20 #569：拖动夹取与落盘守卫**同口径**，且口径是**半球**（贴边） ──
  //
  //  ⚠ 这一节改过两次，记录方向错误：
  //
  //    第一次（#504①）：把 `minAnchorX` 改成整球 46（"与守卫一致"）
  //    → **方向反了**。锚点是球心，`center=23` 才是真正贴边；46 会让球永远贴不上边。
  //    → 用户实测"拖不到左上角"。
  //
  //    正确（#569）：**拖动保持半球（允许贴边），落盘守卫也放宽到半球（让贴边可保存）**。
  //
  //  > **"一致性"本身不是目标，"一致地做对的事"才是。**
  ok('★ [同口径] minAnchorX 的下界是 halfOrb()（半球 = 能贴边）',
     /const minAnchorX = \(\): number => halfOrb\(\) - EDGE_GAP;/.test(壳源),
     'minAnchorX 不是半球 —— 球拖不到贴边位置');
  ok('★ [同口径] minAnchorY 的下界是 halfOrbHeight()',
     /const minAnchorY = \(\): number => halfOrbHeight\(\) - EDGE_GAP;/.test(壳源),
     'minAnchorY 不是半球');
  ok('★ [同口径] 拖动夹取用的是 minAnchorX/minAnchorY（不是另写一套）',
     /clamp\(startAnchorX \+ \(point\.x - startX\), minAnchorX\(\), maxAnchorX\(\)\)/.test(壳源)
     && /clamp\(startAnchorY \+ \(point\.y - startY\), minAnchorY\(\), maxAnchorY\(\)\)/.test(壳源),
     '拖动夹取没有引用 minAnchorX/minAnchorY');
  // 挂载恢复与 resize 夹取也走同一对函数 —— 三处一致才算"同口径"
  ok('★ [同口径] 挂载恢复也用 minAnchorX/minAnchorY',
     /存过的球位\.x >= minAnchorX\(\) && 存过的球位\.x <= maxAnchorX\(\)/.test(壳源)
     && /存过的球位\.y >= minAnchorY\(\) && 存过的球位\.y <= maxAnchorY\(\)/.test(壳源),
     '挂载恢复没有引用 minAnchorX/minAnchorY');
  ok('★ [同口径] resize 夹取也用 minAnchorX/minAnchorY',
     /clamp\(anchorX\.value, minAnchorX\(\), maxAnchorX\(\)\)/.test(壳源)
     && /clamp\(anchorY\.value, minAnchorY\(\), maxAnchorY\(\)\)/.test(壳源),
     'resize 夹取没有引用 minAnchorX/minAnchorY');

  // **自证**：旧的"整球"写法不通过
  ok('[自证] `minAnchorX = () => CLOSED_SIZE`（整球，贴不了边）不通过',
     !/const minAnchorX = \(\): number => halfOrb\(\) - EDGE_GAP;/.test('const minAnchorX = (): number => CLOSED_SIZE;'),
     '正则抓不到整球写法 —— 它是恒真的');

  // **自证**：正则可以抓到旧写法
  ok('[自证] 正则能抓到"只查 null"的旧落盘守卫',
     !/if \(!视口可用\(vw, vh\)\) return;/.test('if (anchorX.value === null || anchorY.value === null) return;'));
}

// ═════════════════════════════════════════════════════════════
console.log('\n[★★ 端到端] 存储里是贴边值 {23,29} → 挂载后球**真的贴在左上角**');
{
  // ── 2026-11-20 #571：这条补的是"判有效 → 真的用上"之间那段空白 ──
  //
  //  真机证据（需求方实测）：
  //    存储里 {x:23, y:29}（localStorage 与全局一致）
  //    球位有效(23,29) 判**有效**（因为存储没被纠正写回）
  //    但 iframe 在 (1985, 833) = 默认右下角
  //
  //  → **判了有效，却没被用上。**
  //
  //  ── 断点在哪（我查到的）──
  //
  //    `savedOrb` 在 **setup 顶层**求值（`悬浮球界面.vue:872`）：
  //
  //      const savedOrb = 读球位置(host, { w: viewportW(), h: viewportH() }, CLOSED_SIZE);
  //
  //    那一刻 `rootEl.value` 还是 null → `parentWin` 是 null →
  //    `viewportW()` 退回 `window.innerWidth`（iframe 自己，挂载前是 0 或极小）
  //    → `读球位置` 里的 `视口可用(0, 0)` 失败 → **返回 null**
  //
  //    → `onMounted` 里 `savedOrb` 是 null → 走默认 `viewportW() - 40`
  //    → 而且**返回 null 不会触发"纠正写回"** → 存储保持 {23,29} 不变
  //
  //    **这正好解释了真机那三条证据（读到 / 判有效 / 没写回 / 球在默认位）。**
  //
  //  ── 这条判据怎么验 ──
  //
  //    不模拟真 DOM（那要 jsdom），而是**直接验那两个函数的组合语义**：
  //      ① 视口可用时，`读球位置` 返回 {23,29}
  //      ② 视口不可用时（0×0），返回 null ← **这就是 bug 的形状**
  //      ③ 断言"挂载路径不该在视口不可用时读偏好"
  const { 读球位置: 读位置 } = await import('../src/彼方_NPC幕后生命状态系统/悬浮球偏好');

  // 造一个最小宿主：存储里就是贴边值
  //
  //  ⚠ 键名必须是 `彼方_界面偏好`（`悬浮球偏好.ts:24` 的 `偏好键`）——
  //    第一版我写成 `界面偏好`，于是 `读偏好` 读不到 → 返回 null → 判据假红。
  const 造宿主 = (值: any) => ({
    vars: {
      get: () => ({ 彼方_界面偏好: 值 }),
      update: () => {},
      del: () => {},
      insertOrAssign: () => {},
      scriptId: () => 't',
    },
    localStorage: {
      getItem: () => JSON.stringify(值),
      setItem: () => {},
      removeItem: () => {},
    },
  });

  // ① 视口可用（1280×800）→ 读到 {23,29}
  const 好视口 = 读位置(造宿主({ x: 23, y: 29, 主题: 'dark' }), { w: 1280, h: 800 }, 球直径);
  eq('★ [端到端 ①] 视口可用时，读球位置 返回贴边值 {23,29}', 好视口, { x: 23, y: 29 });

  // ② 视口不可用（0×0，模拟 setup 时 iframe 还没布局）→ 返回 null
  const 坏视口 = 读位置(造宿主({ x: 23, y: 29, 主题: 'dark' }), { w: 0, h: 0 }, 球直径);
  eq('★ [端到端 ②] **视口不可用时返回 null —— 这就是真机那个 bug 的形状**', 坏视口, null);

  // ③ 断言"挂载路径不该在 setup 顶层读偏好"（读源码形状）
  //
  //    ⚠ 这条是**结构断言**，不是行为断言 —— 它只能说明"代码没在那个位置读"。
  //      真正的行为验证需要 jsdom + 真 iframe，本批没做（见缺口）。
  const { readFileSync: 读文件 } = await import('node:fs');
  const path = await import('node:path');
  const 壳全文 = 读文件(path.join(process.cwd(), 'src/彼方_NPC幕后生命状态系统/悬浮球界面.vue'), 'utf8');
  const 壳代码 = 壳全文.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  // `读球位置(...)` 的调用**必须在 onMounted 里**，不能在 setup 顶层
  const 调用位置 = 壳代码.indexOf('读球位置(host,');
  const 挂载位置 = 壳代码.indexOf('onMounted(');
  ok('★ [端到端 ③] `读球位置` 在 onMounted **之后**调用（不在 setup 顶层）',
     调用位置 >= 0 && 挂载位置 >= 0 && 调用位置 > 挂载位置,
     `读球位置 在 ${调用位置}，onMounted 在 ${挂载位置} —— 若前者更小就是 setup 顶层求值`);

  // **自证**：旧写法（setup 顶层）会被这条抓到
  ok('[自证] setup 顶层的写法不通过这条',
     !((() => {
       const 旧 = 'const savedOrb = 读球位置(host, { w: viewportW(), h: viewportH() }, CLOSED_SIZE);\nonMounted(() => {});';
       return 旧.indexOf('读球位置(host,') > 旧.indexOf('onMounted(');
     })()),
     '自证失败：旧写法的位置判断不对');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
