<template>
  <div ref="根元素" class="shell">
    <div v-if="面板开" class="panel">
      <!-- 标题栏 = 拖动柄(整个标题栏可拖) -->
      <header class="titlebar" :class="{ dragging: 拖动中 }" @mousedown="开始拖动">
        <span class="brand">
          <svg class="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.6 3.4 7v10L12 21.4 20.6 17V7L12 2.6Z" />
            <path d="M12 12 3.4 7M12 12l8.6-5M12 12v9.4" />
          </svg>
          人设工坊
        </span>

        <div class="segmented">
          <button :class="['seg', { on: 设置.settings.mode === 'user' }]" @click="设置.settings.mode = 'user'">
            写 user 人设
          </button>
          <button :class="['seg', { on: 设置.settings.mode === 'npc' }]" @click="设置.settings.mode = 'npc'">
            写 NPC
          </button>
        </div>

        <span class="spacer"></span>

        <!-- 互斥在 界面状态.ts 的切换函数里(谁调都受同一条约束), 这里只管切 -->
        <button :class="['ghost', { on: 显示设置 }]" @click="切换设置">设置</button>
        <button :class="['ghost', { on: 显示草稿 }]" @click="切换草稿">草稿箱</button>
        <button class="ghost close" title="关闭" aria-label="关闭" @click="面板开 = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div class="body">
        <App />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from './store';
import { 面板开, 显示设置, 显示草稿, 切换设置, 切换草稿 } from './界面状态';
import App from './App.vue';

// ---------------------------------------------------------------------------
// 人设工坊 · 面板外壳(标题栏 + 拖动 + 外层 iframe 尺寸)
//
// 三个坑, 都照 共用/面板机制.ts 的既有正解:
//   ① 定位哪个 iframe: **从挂载根元素的 ownerDocument.defaultView 反推**,
//      绝不用脚本 realm 的裸 window —— 那会拿到"酒馆助手给脚本建的那个 iframe",
//      尺寸写到看不见的 iframe 上(真机表现为"面板 DOM 有了但外层永远 0×0")。
//   ② 拖动要用**父窗监听**: 只在 iframe 内监听, 鼠标一出界就收不到 mousemove, 拖动粘住。
//   ③ 拖完要记住位置, 重开时用记住的位置, 不要每次都跳回默认。
//
// 尺寸固定像素: 项目规则禁止 vh。
// ---------------------------------------------------------------------------

/** 面板尺寸(px); 视口不够时在 定位() 里收敛 */
const 面板宽 = 1180;
const 面板高 = 720;
/** 贴边距(px) */
const 边距 = 16;
/** 位置记忆键(本机缓存) */
const 位置键 = '人设工坊_面板位置';

const 设置 = useSettingsStore();
const 根元素 = ref<HTMLElement | null>(null);
const 拖动中 = ref(false);

// ── 反推"我挂在哪个 iframe 里"(见坑①) ──────────────────────────────────────
const 框架窗 = computed<Window | null>(() => 根元素.value?.ownerDocument?.defaultView ?? null);
const 外壳 = computed<HTMLIFrameElement | null>(() => (框架窗.value?.frameElement as HTMLIFrameElement | null) ?? null);
const 父窗 = computed<Window | null>(() => 框架窗.value?.parent ?? null);

/** 记住的面板位置(父页面视口坐标); null = 还没有 */
const 记住位置 = ref<{ x: number; y: number } | null>(读位置());

function 读位置(): { x: number; y: number } | null {
  try {
    const 原 = localStorage.getItem(位置键);
    if (!原) return null;
    const 解析 = JSON.parse(原) as { x?: unknown; y?: unknown };
    if (typeof 解析?.x === 'number' && typeof 解析?.y === 'number') return { x: 解析.x, y: 解析.y };
  } catch {
    // 忽略: 读不到就当没记过
  }
  return null;
}

function 写位置(x: number, y: number) {
  try {
    localStorage.setItem(位置键, JSON.stringify({ x: Math.round(x), y: Math.round(y) }));
  } catch {
    // 忽略
  }
}

function 钳(值: number, 下: number, 上: number): number {
  return Math.min(Math.max(值, 下), Math.max(下, 上));
}

/** 目标尺寸(按视口收敛) */
function 面板尺寸(): { w: number; h: number } {
  const 外窗 = 父窗.value;
  const 视口宽 = 外窗?.innerWidth || 1280;
  const 视口高 = 外窗?.innerHeight || 800;
  return {
    w: Math.min(面板宽, Math.max(320, 视口宽 - 边距 * 2)),
    h: Math.min(面板高, Math.max(280, 视口高 - 边距 * 2)),
  };
}

/** 把外层 iframe 调成面板尺寸并摆到记住的位置(没记住则居中) */
function 定位() {
  const el = 外壳.value;
  const 外窗 = 父窗.value;
  if (!el || !外窗) return;

  if (!面板开.value) {
    el.style.width = '0px';
    el.style.height = '0px';
    // 顺手: 关掉时也不吃指针事件(面积 0×0 本就等效, 但显式更干净)
    el.style.pointerEvents = 'none';
    return;
  }

  const 视口宽 = 外窗.innerWidth || 1280;
  const 视口高 = 外窗.innerHeight || 800;
  const { w, h } = 面板尺寸();

  const 默认 = { x: Math.round((视口宽 - w) / 2), y: Math.round((视口高 - h) / 2) };
  const 想要 = 记住位置.value ?? 默认;
  const x = 钳(想要.x, 边距, 视口宽 - w - 边距);
  const y = 钳(想要.y, 边距, 视口高 - h - 边距);

  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  // 打开后尺寸/位置都定了, 才让它接管指针事件(挂载前 index.ts 设的是 none)
  el.style.pointerEvents = 'auto';
}

// ── 拖动(见坑②③) ──────────────────────────────────────────────────────────
//
// 2026-10-14 #84 真机返工(用户: "会一直跟着鼠标，停一下动一下")。上一版只挂父窗 +
// iframe pointer-events:none 的修法**不够** —— mousedown 在 iframe 内, 浏览器存在
// **隐式捕获**: 事件会持续投递给"按下时所在的文档", 给 iframe 设 pointer-events:none
// 未必能打断它, 于是父窗那个唯一监听时有时无 ⇒ 抽搐; mouseup 落在窗口外时 `结束`
// 永不执行 ⇒ 监听不摘、面板一直跟随。
//
// 现在的修法(逐条对应 dsh #84):
//   1. 位移用 **screenX/screenY** —— 屏幕坐标在两个窗口里完全一致, 从根上不可能混坐标系;
//   2. **两个窗都挂** mousemove/mouseup —— 隐式捕获投给谁不确定, 双监听覆盖两种投递路径,
//      screen 坐标下重复事件只是把同一位置写两遍, 无害; 摘的时候两个都摘;
//   3. **buttons === 0 兜底** —— 鼠标键早松但 mouseup 丢了时立刻结束, 直接治"一直跟随";
//   4. window.blur 也结束拖动; mouseleave **只挂父窗** —— iframe 窗的 mouseleave 在正常拖动
//      (指针移到父页上)时就会触发, 挂它会**提前**结束拖动, 正好毁掉"挂父窗监听"的意义;
//   5. 不再用 pointer-events:none —— screen 坐标 + 双监听已足够, 不必为保一个旧修法留隐患。
let 父窗引用: Window | null = null;

function 开始拖动(e: MouseEvent) {
  // 标题栏里的按钮不参与拖动
  if ((e.target as HTMLElement)?.closest('button')) return;
  const el = 外壳.value;
  const 外窗 = 父窗.value;
  const 内窗 = 框架窗.value;
  if (!el || !外窗) return;

  e.preventDefault();
  const 矩形 = el.getBoundingClientRect();
  const 起左 = 矩形.left;
  const 起上 = 矩形.top;
  // 屏幕坐标起步点(与窗口无关; 见上"修法 1")
  const 起点X = e.screenX;
  const 起点Y = e.screenY;
  const { w, h } = 面板尺寸();
  const 视口宽 = 外窗.innerWidth || 1280;
  const 视口高 = 外窗.innerHeight || 800;

  拖动中.value = true;
  try {
    (外窗.document.body.style as CSSStyleDeclaration).userSelect = 'none';
  } catch {
    // 忽略
  }

  let 已结束 = false;

  const 移动 = (ev: MouseEvent) => {
    // ★ 兜底: 键已松开但 mouseup 丢了(落在窗口外) —— 立刻结束, 治"一直跟随"
    if (ev.buttons === 0) {
      结束();
      return;
    }
    const x = 钳(起左 + (ev.screenX - 起点X), 边距, 视口宽 - w - 边距);
    const y = 钳(起上 + (ev.screenY - 起点Y), 边距, 视口高 - h - 边距);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    记住位置.value = { x, y };
  };

  const 结束 = () => {
    if (已结束) return; // mousemove(buttons=0) 与 mouseup 可能都触发, 只收一次
    已结束 = true;
    拖动中.value = false;
    try {
      (外窗.document.body.style as CSSStyleDeclaration).userSelect = '';
    } catch {
      // 忽略
    }
    if (记住位置.value) 写位置(记住位置.value.x, 记住位置.value.y);
    // 哪里挂的摘哪里; mouseleave 只在父窗挂过, 单独摘
    for (const 窗 of [内窗, 外窗]) {
      if (!窗) continue;
      窗.removeEventListener('mousemove', 移动);
      窗.removeEventListener('mouseup', 结束);
      窗.removeEventListener('blur', 结束);
    }
    外窗.removeEventListener('mouseleave', 结束);
  };

  // ★ mousemove / mouseup / blur 两个窗都挂: 隐式捕获投给谁不确定, 双监听覆盖两种投递路径(修法 2)。
  //   mouseleave **只挂父窗** —— iframe 窗的 mouseleave 在"指针正常移到父页上"时就触发,
  //   会把拖动提前掐断, 正好毁掉"挂父窗监听"的意义。
  for (const 窗 of [内窗, 外窗]) {
    if (!窗) continue;
    窗.addEventListener('mousemove', 移动);
    窗.addEventListener('mouseup', 结束);
    窗.addEventListener('blur', 结束);
  }
  外窗.addEventListener('mouseleave', 结束);
}

/** 视口变化: 把当前位置钳进新视口(不重置回默认) */
function 视口变化() {
  const el = 外壳.value;
  const 外窗 = 父窗.value;
  if (!el || !外窗 || !面板开.value) return;
  const 视口宽 = 外窗.innerWidth || 1280;
  const 视口高 = 外窗.innerHeight || 800;
  const { w, h } = 面板尺寸();
  const x = 钳(parseFloat(el.style.left || '0') || 0, 边距, 视口宽 - w - 边距);
  const y = 钳(parseFloat(el.style.top || '0') || 0, 边距, 视口高 - h - 边距);
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  记住位置.value = { x, y };
}

onMounted(() => {
  定位();
  父窗引用 = 父窗.value;
  父窗引用?.addEventListener('resize', 视口变化);
});

onUnmounted(() => {
  父窗引用?.removeEventListener('resize', 视口变化);
  父窗引用 = null;
});

watch(面板开, () => {
  requestAnimationFrame(定位);
});
</script>

<style>
/* 色板与字号: 全局(token 定义在 App.vue 的 :root 里), 这里只写结构样式 */
.shell {
  width: 100%;
  height: 100%;
}

.panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--fg-desk, #1a1713);
  border: 1px solid var(--fg-line2, #443c30);
  border-radius: 12px;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.62),
    0 2px 8px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* ---------------------------------------------------------------- 标题栏 */
.titlebar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 10px 0 14px;
  background: var(--fg-surface, #221e18);
  border-bottom: 1px solid var(--fg-line, #352f26);
  cursor: grab;
}
.titlebar.dragging {
  cursor: grabbing;
}
.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--fg-brass, #c9a227);
  user-select: none;
}
.brand-icon {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.spacer {
  flex: 1;
}

/* 分段控件 */
.segmented {
  display: flex;
  padding: 2px;
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-ink, #12100d);
}
.seg {
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-dim, #9c9384);
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.seg.on {
  background: var(--fg-brass-bg, rgba(201, 162, 39, 0.12));
  color: var(--fg-brass, #c9a227);
}

/* ghost 按钮 */
.ghost {
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--fg-dim, #9c9384);
  font-size: 12px;
  padding: 5px 11px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.ghost:hover {
  background: var(--fg-surface2, #2a251d);
  color: var(--fg-text, #ece6da);
}
.ghost.on {
  color: var(--fg-brass, #c9a227);
  border-color: var(--fg-brass-dim, #8a6f1c);
}
.ghost.close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
}
.ghost.close svg {
  width: 13px;
  height: 13px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.ghost.close:hover {
  color: var(--fg-err, #c0554a);
}

/* ---------------------------------------------------------------- 主体 */
.body {
  flex: 1 1 auto;
  overflow: hidden;
}
</style>
