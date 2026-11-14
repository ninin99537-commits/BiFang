<template>
  <div class="forge">
    <main class="fg-main">
      <aside class="fg-col fg-col-modules">
        <ModuleTree :模块表="模块注册表" />
      </aside>
      <section class="fg-col fg-col-prompt">
        <PromptPreview
          :模块表="模块注册表"
          :提示词="提示词"
          :体量="体量"
          :技巧="请求技巧"
          @复制="复制提示词"
        />
      </section>
      <section class="fg-col fg-col-result">
        <ResultPanel
          ref="结果面板"
          :设置="设置.settings"
          :提示词="提示词"
          :已选模块名="已选模块名"
          :全部模块名="全部模块名"
          :已写入="加载世界书"
        />
      </section>
    </main>

    <!-- 设置 / 草稿箱: 夹在主体与底栏之间, 自身限高可滚 ——
         这样底栏(flex:none)仍然钉在底部, 不被挤走; 也不用绝对定位(项目规则)。
         ★ v-else-if 不是笔误: 两个抽屉**结构上互斥** —— 只有第一个成立时才渲染第一个,
           第二个只在第一个不成立时才可能渲染。所以就算 界面状态 里的互斥切换失效、
           两个信号同时为真, DOM 里也只有一个抽屉, 永远不会叠起来把底栏挤没(#84)。 -->
    <div v-if="显示设置" class="fg-drawer">
      <SettingsPanel :世界书条目="候选条目" @关闭="显示设置 = false" />
    </div>
    <div v-else-if="显示草稿" class="fg-drawer">
      <DraftList @载入="载入草稿" />
    </div>

    <!-- 底栏: 创作方向。★ 钉住不滚动 —— 以前它被挤到折叠线以下是明确缺陷 -->
    <footer class="fg-foot">
      <div class="fg-foot-head">
        <label class="fg-foot-label" for="fg-brief">创作方向</label>
        <span class="fg-foot-count">{{ 设置.settings.brief.length }} 字</span>
      </div>
      <textarea
        id="fg-brief"
        ref="方向框"
        v-model="设置.settings.brief"
        class="fg-brief"
        rows="3"
        placeholder="例：40 岁退伍军人，说话短句、不用敬语；讨厌甜食；对主角有亏欠感，但从不提"
      ></textarea>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSettingsStore } from './store';
import { 模块注册表 } from './lib/modules';
import { 拼装提示词 } from './lib/prompt';
import { 取素材, 复制文本 } from './lib/sink';
import { 取世界书条目, 已选世界书条目, 拼世界书素材, type 世界书条目 as 类型世界书条目 } from './lib/世界书';
import { 待载入文本, 显示设置, 显示草稿 } from './界面状态';
import type { Draft } from './schema';
import ModuleTree from './components/ModuleTree.vue';
import PromptPreview from './components/PromptPreview.vue';
import ResultPanel from './components/ResultPanel.vue';
import SettingsPanel from './components/SettingsPanel.vue';
import DraftList from './components/DraftList.vue';

const 设置 = useSettingsStore();

const 结果面板 = ref<{ 设结果: (文本: string) => void } | null>(null);
const 方向框 = ref<HTMLTextAreaElement | null>(null);

// ── 素材刷新 ────────────────────────────────────────────────────────────────
// 取素材 内部读的是 getCharData / getPersona / getChatMessages —— 全是**非响应式**的平台 API,
// Vue 无从知道它们变了。所以换角色/换聊天时 computed 不会重算, 素材一直停在上一张卡。
// 修法: 一个自增的 素材版本 进 computed 的依赖, 在 CHAT_CHANGED / CHARACTER_PAGE_LOADED 时自增。
const 素材版本 = ref(0);
/** 当前范围的世界书候选条目(异步加载; 选择器与拼装都用它) */
const 候选条目 = ref<类型世界书条目[]>([]);

async function 加载世界书() {
  try {
    候选条目.value = await 取世界书条目();
  } catch (error) {
    console.warn('[人设工坊] 读取世界书条目失败:', error);
    候选条目.value = [];
  }
}

// 素材单独算一次: 提示词每次重算不必重新读聊天记录
const 素材 = computed(() => {
  void 素材版本.value; // 订阅刷新信号(否则平台 API 变了也不知道)
  const 基 = 取素材(设置.settings);
  基.worldbook = 拼世界书素材(已选世界书条目(设置.settings, 候选条目.value));
  return 基;
});
const 提示词 = computed(() => 拼装提示词(设置.settings, 模块注册表, 素材.value));

/**
 * 四块素材各自的字符数 —— 替代字符截断, 只给"体量可见性"。
 * 素材一律全文注入, 由用户看数字后自己决定关掉哪个源。
 */
const 体量 = computed(() => ({
  charCard: 素材.value.charInfo.length,
  userPersona: 素材.value.userPersona.length,
  chatHistory: 素材.value.chatHistory.length,
  worldbook: 素材.value.worldbook.length,
}));

/**
 * 当前开着的请求技巧(破限/防截断/头部填充/预填充/流式)。
 * 它们是加在 ordered_prompts **消息数组**上的另一层, 提示词预览里看不出区别 ——
 * 所以要在预览栏用状态行明示, 否则用户会误判为"没生效"。
 * (流式默认关, 所以只在**打开时**才出现在这行里。)
 */
const 请求技巧 = computed(() => {
  const r = 设置.settings.request;
  const 表: string[] = [];
  if (r.jailbreak) 表.push('破限');
  if (r.antiTruncation) 表.push('防截断');
  if (r.headFiller) 表.push('头部填充');
  if (r.prefill) 表.push('预填充');
  if (r.stream) 表.push('流式');
  return 表;
});

const 已选模块名 = computed(() =>
  模块注册表.filter(模块 => 设置.settings.enabled.includes(模块.id)).map(模块 => 模块.name),
);
const 全部模块名 = 模块注册表.map(模块 => 模块.name);

async function 复制提示词() {
  try {
    await 复制文本(提示词.value);
    toastr.success('提示词已复制');
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : '复制失败');
  }
}

// 草稿载入结果区(草稿箱在面板里点「载入」时写 待载入文本)
//
// ★ #219 真缺陷修复: 这里以前**只有 watch、没有赋值者** ——
//   `DraftList` 的 `@载入="载入草稿"` 引用了一个**根本不存在的函数**, Vue 生产构建
//   对 undefined 处理器不警告, 所以表现为「点了没反应、也没报错」。按钮从来没通过。
//   现在补上 载入草稿: 它是唯一给 待载入文本 赋值的地方。
function 载入草稿(草稿: Draft) {
  待载入文本.value = 草稿.text;
  // 载入的目的是把文本送进结果区, 抽屉开着会挡着它 —— 顺手收起
  显示草稿.value = false;
}

watch(待载入文本, 文本 => {
  if (!文本) return;
  结果面板.value?.设结果(文本);
  待载入文本.value = '';
  toastr.success('草稿已载入结果区');
});

// ── 创作方向: 自动增高(上限 8 行, 超出内部滚动) ─────────────────────────────
//
// #94 真机缺陷(用户: "草稿和设置还是被压着" 的连带): 挂载那一刻外层 iframe 还没被
// 面板.vue 的 定位() 撑开, textarea 只有 ~120px 宽 —— 此时 scrollHeight 量出 168,
// 而真实宽度(1154)下只要 80。这个函数以前只在 brief 变化时才跑, 于是**错值被永久冻结**
// (框里 7 个字, 高度却是 168px, 把底栏顶高到 208)。
//
// 两道护栏, 缺一不可:
//   ① 宽度为 0 时**不写** —— 布局未定型, 量不出来就别把退化值固化;
//   ② 宽度**变化时重量** —— ResizeObserver + 自己比对上次宽度(只宽度真变了才跑,
//      否则"高度变化→observer 触发→再算高度"会自激)。
const 行高 = 22; // 与 css 的 line-height 对应
const 高度上限 = 行高 * 8;
let 上次宽度 = 0;
let 尺寸观察: ResizeObserver | null = null;

function 自适应高度() {
  const el = 方向框.value;
  if (!el) return;
  const 可用宽 = el.clientWidth;
  if (!可用宽) return; // ① 布局未定型: 不写, 别固化错值
  el.style.height = 'auto';
  el.style.height = `${Math.min(Math.max(el.scrollHeight, 行高 * 3), 高度上限)}px`;
  el.style.overflowY = el.scrollHeight > 高度上限 ? 'auto' : 'hidden';
  上次宽度 = 可用宽;
}

watch(() => 设置.settings.brief, () => nextTick(自适应高度));

// 打开设置面板就重读一次世界书条目。
// 写入后的回调(ResultPanel 的 已写入)只覆盖"本插件写的"; 用户可能直接去酒馆的世界书面板
// 增删条目、或换绑世界书 —— 那只有重新打开面板才看得到。重读很便宜, 不做增量。
watch(显示设置, 开 => {
  if (开) void 加载世界书();
});

// 换角色 / 换聊天都要重读素材与世界书条目
let 停订阅: Array<() => void> = [];
onMounted(() => {
  void 加载世界书();
  void nextTick(() => {
    自适应高度();
    // ② 宽度变化时重量(只在宽度真变了才跑 —— 否则高度变化会自激)
    const el = 方向框.value;
    if (el && typeof ResizeObserver !== 'undefined') {
      尺寸观察 = new ResizeObserver(() => {
        const 宽 = 方向框.value?.clientWidth ?? 0;
        if (宽 && 宽 !== 上次宽度) 自适应高度();
      });
      尺寸观察.observe(el);
    }
  });
  停订阅 = [
    eventOn(tavern_events.CHAT_CHANGED, () => {
      素材版本.value++;
      void 加载世界书();
    }).stop,
    eventOn(tavern_events.CHARACTER_PAGE_LOADED, () => {
      素材版本.value++;
      void 加载世界书();
    }).stop,
  ];
});
onUnmounted(() => {
  尺寸观察?.disconnect();
  尺寸观察 = null;
  停订阅.forEach(停 => 停());
  停订阅 = [];
});
</script>

<style>
/* ==========================================================================
 * 人设工坊 · 铜与墨（brass & ink）
 * 暗底 + 铜强调保留，换的是执行：暖暗底色、清楚的字号层级、真纵深、三栏各滚各的。
 * ========================================================================== */
:root {
  /* 底 */
  --fg-ink: #12100d;
  --fg-desk: #1a1713;
  --fg-surface: #221e18;
  --fg-surface2: #2a251d;
  /* 线 */
  --fg-line: #352f26;
  --fg-line2: #443c30;
  /* 字 */
  --fg-text: #ece6da;
  --fg-dim: #9c9384;
  --fg-faint: #6b6459;
  /* 强调 */
  --fg-brass: #c9a227;
  --fg-brass-dim: #8a6f1c;
  --fg-brass-bg: rgba(201, 162, 39, 0.12);
  /* 语义 */
  --fg-ok: #6f9e5a;
  --fg-warn: #c9762f;
  --fg-err: #c0554a;

  /* 字体 */
  --fg-font: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
  --fg-mono: 'Cascadia Mono', 'Consolas', 'JetBrains Mono', ui-monospace, monospace;

  /* 旧变量名保留为别名, 避免一次性改爆所有组件 */
  --forge-bg: var(--fg-ink);
  --forge-panel: var(--fg-surface);
  --forge-border: var(--fg-line);
  --forge-text: var(--fg-text);
  --forge-dim: var(--fg-dim);
  --forge-accent: var(--fg-brass);
}

html,
body {
  margin: 0;
  padding: 0;
  /* 面板自带底色; 这里透明, 避免球壳/嵌套 iframe 被染出方块 */
  background: transparent;
  color: var(--fg-text);
  font-family: var(--fg-font);
}

/* ---------------------------------------------------------------------------
 * 自绘复选框(全局): 浏览器默认蓝与铜色强调打架, 验收第 7 条明确禁止。
 * 用 appearance:none 统一改掉 —— 设置页、世界书选择器、模块细项 toggle 一次性生效,
 * 不破坏任何 v-model / :checked 绑定。
 * ------------------------------------------------------------------------- */
input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  position: relative;
  flex: none;
  width: 15px;
  height: 15px;
  margin: 0;
  border: 1px solid var(--fg-line2);
  border-radius: 4px;
  background: var(--fg-ink);
  cursor: pointer;
  vertical-align: -2px;
  transition:
    background 0.14s ease,
    border-color 0.14s ease;
}
input[type='checkbox']:hover {
  border-color: var(--fg-brass-dim);
}
input[type='checkbox']:checked {
  background: var(--fg-brass);
  border-color: var(--fg-brass);
}
input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid var(--fg-ink);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
input[type='checkbox']:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--fg-brass-bg);
}

.forge {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--fg-desk);
  color: var(--fg-text);
  font-size: 13px;
  line-height: 1.45;
}

/* ---------------------------------------------------------------- 三栏 */
/* overflow:hidden 让本 flex 项的自动最小尺寸归零, 不需要任何"最小高度"声明 */
.fg-main {
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
  gap: 10px;
  padding: 10px;
}
/* 每栏 overflow-y:auto 本身就使自动最小尺寸为 0 */
.fg-col {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--fg-line2) transparent;
}
.fg-col::-webkit-scrollbar {
  width: 8px;
}
.fg-col::-webkit-scrollbar-thumb {
  background: var(--fg-line2);
  border-radius: 4px;
}
.fg-col-modules {
  flex: 0 0 272px;
}
.fg-col-prompt,
.fg-col-result {
  flex: 1 1 0;
  min-width: 0;
}

/* ---------------------------------------------------------------- 底栏 */
/* ★ 钉住: flex 列里 flex:none, 永远在底部, 不随主体滚动 */
.fg-foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px 10px;
  background: var(--fg-surface);
  border-top: 1px solid var(--fg-line);
}
.fg-foot-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.fg-foot-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--fg-dim);
}
.fg-foot-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--fg-faint);
  font-variant-numeric: tabular-nums;
}
.fg-brief {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--fg-line);
  border-radius: 8px;
  background: var(--fg-ink);
  color: var(--fg-text);
  font-family: inherit;
  font-size: 13px;
  line-height: 22px;
  resize: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.fg-brief::placeholder {
  color: var(--fg-faint);
}
.fg-brief:focus {
  outline: none;
  border-color: var(--fg-line2);
  box-shadow: 0 0 0 3px var(--fg-brass-bg);
}

/* ---------------------------------------------------------------- 设置/草稿抽屉 */
/* ★ 以前这里只有注释、没有规则 —— 抽屉是无样式 div, 内容撑多高就多高,
   被 .panel 的 overflow:hidden 裁掉, 底部的「请求技巧」「提示词编辑器」不可达。
   修法: overflow 归零自动最小尺寸(与 .fg-main 同一手法), 不用 min-height。

   ★★ #94 真机缺陷(用户: "草稿和设置还是被压着"):
   `max-height` **只封顶, 封不住 flex-shrink**。抽屉 basis 是**未截断的内容高度**(实测 881),
   shrink 权重按 basis 分配 → 它吸走绝大部分压缩量, 366 的上限被压到 230。
   `flex: 0 0 auto` 把 shrink 关掉(保留 grow=0 / basis=auto), 抽屉拿到 min(内容, 55%),
   压缩量全部由 .fg-main 承担(它 overflow:hidden, 最小尺寸为 0)。
   **不用 min-height** —— 项目规矩: 用 overflow 归零自动最小尺寸。 */
.fg-drawer {
  flex: 0 0 auto;
  max-height: 55%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 10px 10px;
  scrollbar-width: thin;
  scrollbar-color: var(--fg-line2) transparent;
}
.fg-drawer::-webkit-scrollbar {
  width: 8px;
}
.fg-drawer::-webkit-scrollbar-thumb {
  background: var(--fg-line2);
  border-radius: 4px;
}
</style>
