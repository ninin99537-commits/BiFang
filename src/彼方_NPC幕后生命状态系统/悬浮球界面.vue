<template>
  <div ref="rootEl" class="bf-root" :data-theme="theme">
    <!-- 悬浮球: 关闭态填满 44×44 的 iframe(命中区=视觉); 打开面板后只在有边距时停靠一侧,
         没有边距(窄屏/全屏面板)就隐藏, 保证不遮挡内容 -->
    <div
      class="bf-orb"
      :class="{ dragging: isDragging }"
      :style="orbStyle"
      :title="panelOpen ? '收起彼方' : '打开彼方'"
      role="button"
      tabindex="0"
      :aria-label="panelOpen ? '收起彼方' : '打开彼方'"
      @pointerdown="onOrbPointerDown"
      @click="onOrbClick"
      @keydown.enter.prevent="onOrbClick"
      @keydown.space.prevent="onOrbClick"
    >
      <span class="bf-orb-glyph" aria-hidden="true"></span>
      <span v-if="updatingActive" class="bf-orb-spinner" aria-hidden="true"></span>
    </div>

    <!-- 面板。遮罩画在酒馆页面(bf-panel-dim)上、盖在 iframe 之上并给面板留洞, 见 置遮罩()。
         **故意不用 <Transition>**: Vue 的进入过渡靠 requestAnimationFrame 收尾, 而真机上
         (2026-10-26, Firefox)那个回调没跑 —— 日志没打、`bf-pop-enter-from` 的 opacity:0
         也永远不撤, 于是"面板在 DOM 里但永远透明"。入场动画改由纯 CSS 关键帧完成。 -->
    <div v-if="panelOpen" ref="panelEl" class="bf-panel" :class="面板态类" @click.stop>
      <header class="bf-topbar">
        <div class="bf-brand">
          <span class="bf-brand-mark" aria-hidden="true"></span>
          <div class="bf-brand-text">
            <h1 class="bf-title">彼方</h1>
            <p class="bf-subtitle">幕后人物档案</p>
          </div>
        </div>
        <div class="bf-crumb">
          <span v-if="data.剧情时间">剧情时间 {{ data.剧情时间 }}</span>
          <span v-if="stats.最后更新">上次更新 {{ fmtTime(stats.最后更新) }}</span>
        </div>
        <div class="bf-topbar-actions">
          <button
            class="bf-btn bf-btn-primary bf-update-btn"
            :class="更新按钮态类"
            :disabled="updating"
            :aria-busy="updating"
            @click="manualUpdate"
          >
            <span v-if="updating" class="bf-spinner" aria-hidden="true"></span>
            <PhArrowsClockwise v-else :size="15" weight="bold" aria-hidden="true" />
            <span>{{ 更新按钮文案 }}</span>
          </button>
          <button class="bf-icon-btn" :title="theme === 'light' ? '切换到夜间模式' : '切换到日间模式'" :aria-label="theme === 'light' ? '切换到夜间模式' : '切换到日间模式'" @click="toggleTheme">
            <PhSun v-if="theme === 'light'" :size="17" weight="regular" aria-hidden="true" />
            <PhMoon v-else :size="17" weight="regular" aria-hidden="true" />
          </button>
          <button class="bf-icon-btn" title="收起彼方" aria-label="收起彼方" @click="closePanel">
            <PhX :size="17" weight="regular" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav class="bf-nav" aria-label="主要导航">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="bf-nav-item"
          :class="{ active: tab === item.key }"
          :aria-current="tab === item.key ? 'page' : undefined"
          @click="tab = item.key"
        >
          <span v-if="页签角标(item.key)" class="bf-nav-badge">{{ 页签角标(item.key) }}</span>
          <span v-else-if="页签圆点(item.key)" class="bf-nav-dot" :class="页签圆点色(item.key)" aria-hidden="true"></span>
          <span class="bf-nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <main class="bf-main">
        <DashboardPage v-if="tab === 'dashboard'" key="dashboard" />
        <NpcPage v-else-if="tab === 'npc'" key="npc" />
        <ConsistencyPage v-else-if="tab === 'consistency'" key="consistency" />
        <PartsPage v-else-if="tab === 'parts'" key="parts" />
        <LogsPage v-else-if="tab === 'logs'" key="logs" />
        <SettingsPage v-else key="settings" />
      </main>

      <footer class="bf-rail-foot">
        <div class="bf-sync" :class="{ ok: ready }" :title="statusTitle">
          <span class="bf-dot" :class="运行指示灯类" aria-hidden="true"></span>
          <span
            class="bf-run-text"
            :class="运行文字类"
            :title="运行文字"
            @click="运行状态 === 'err' && (tab = 'logs')"
          >{{ 运行文字 }}</span>
        </div>
        <span class="bf-rail-meta">{{ 当前页名 }}</span>
      </footer>
    </div>

    <!-- 添加人物弹窗 -->
    <div v-if="addDialogOpen" class="bf-modal-backdrop" @click="addDialogOpen = false"></div>
    <form
      v-if="addDialogOpen"
      class="bf-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bf-add-title"
      @submit.prevent="confirmAddNpc"
      @click.stop
    >
      <header class="bf-modal-head">
        <h2 id="bf-add-title" class="bf-modal-title">添加人物</h2>
        <button type="button" class="bf-icon-btn" aria-label="关闭" @click="addDialogOpen = false">
          <PhX :size="16" weight="bold" aria-hidden="true" />
        </button>
      </header>
      <label class="bf-form-row">
        <span class="bf-form-label">姓名</span>
        <input v-model="addDraft['名字']" class="bf-input" placeholder="人物姓名" required />
      </label>
      <label v-for="字段 in 建档字段" :key="字段.名" class="bf-form-row">
        <span class="bf-form-label" :title="字段.说明">{{ 字段.名 }}</span>
        <input
          v-if="字段.输入 === 'input'"
          v-model="addDraft[字段.名]"
          class="bf-input"
          :placeholder="字段.占位 || 字段.说明"
        />
        <textarea
          v-else
          v-model="addDraft[字段.名]"
          class="bf-textarea bf-textarea-sm"
          rows="2"
          :placeholder="字段.占位 || 字段.说明"
        ></textarea>
      </label>
      <p class="bf-hint">初始状态可稍后在人物详情里补充；生理监测字段不在这里填。</p>
      <div class="bf-modal-actions">
        <button type="button" class="bf-btn" @click="addDialogOpen = false">取消</button>
        <button type="submit" class="bf-btn bf-btn-primary">添加人物</button>
      </div>
    </form>

    <!-- 标记恋爱对象: 设定关系起点 -->
    <div v-if="开局弹窗开" class="bf-modal-backdrop" @click="开局弹窗开 = false"></div>
    <form
      v-if="开局弹窗开"
      class="bf-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bf-romance-title"
      @submit.prevent="确认标记恋爱对象"
      @click.stop
    >
      <header class="bf-modal-head">
        <h2 id="bf-romance-title" class="bf-modal-title">设定和{{ selectedNpc }}的关系起点</h2>
        <button type="button" class="bf-icon-btn" aria-label="关闭" @click="开局弹窗开 = false">
          <PhX :size="16" weight="bold" aria-hidden="true" />
        </button>
      </header>
      <p class="bf-hint">如果两人的关系在故事开始前就存在，在这里定好起点；之后每轮按正文事件变化。</p>
      <label class="bf-form-row">
        <input v-model="开局草稿.方式" type="radio" value="AI" />
        <span>让 AI 读人设和已有档案判断（下一轮更新时给出）</span>
      </label>
      <label class="bf-form-row">
        <input v-model="开局草稿.方式" type="radio" value="手动" />
        <span>我自己选</span>
      </label>
      <template v-if="开局草稿.方式 === '手动'">
        <label class="bf-form-row">
          <span class="bf-form-label">好感</span>
          <select v-model="开局草稿.好感" class="bf-select">
            <option v-for="名 in 开局好感选项" :key="名" :value="名">{{ 名 }}</option>
          </select>
        </label>
        <label class="bf-form-row">
          <span class="bf-form-label">情欲</span>
          <select v-model="开局草稿.情欲" class="bf-select">
            <option v-for="名 in 开局情欲选项" :key="名" :value="名">{{ 名 }}</option>
          </select>
        </label>
        <label class="bf-form-row">
          <span class="bf-form-label">名分</span>
          <select v-model="开局草稿.名分" class="bf-select">
            <option v-for="名 in 名分词表" :key="名" :value="名">{{ 名 }}</option>
          </select>
        </label>
      </template>
      <label class="bf-form-row">
        <span class="bf-form-label">情感倾向</span>
        <select v-model="开局草稿.倾向" class="bf-select">
          <option value="">让 AI 按人设判断</option>
          <option v-for="名 in 情感倾向选项" :key="名" :value="名">{{ 名 }}</option>
        </select>
      </label>
      <div class="bf-modal-actions">
        <button type="button" class="bf-btn" @click="开局弹窗开 = false">取消</button>
        <button type="submit" class="bf-btn bf-btn-primary">标记为恋爱对象</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { 应显示更新弹条 } from '../共用/更新弹条判定';
import { storeToRefs } from 'pinia';
import {
  PhArrowsClockwise,
  PhMoon,
  PhSun,
  PhX,
} from '@phosphor-icons/vue';
import { chatCompletion, fetchModelList } from './api';
import { useSettingsStore, 世界书写入目标表 } from './settings';
import { useStateStore } from './数据仓';
import { useConsoleStore, useDebugStore, useMainPromptStore } from './日志仓';
import { useUpdatingStore } from './任务中断';
import { 加NPC, 移除NPC, 更新状态卡, 改事务状态, 新增事务, 清空彼方数据, 清空生理数据, 建变更环境, 导出数据, 导入数据 } from './数据变更';
import { 吸收日志, 判定本轮收尾, 重试提示, 新建本轮账 } from './更新状态机';
import type { 运行状态 as 运行状态类型, 本轮账 as 本轮账类型 } from './更新状态机';
import { 建档字段 } from './卡字段';
import type { NpcStateCard } from './卡字段';
import { 一致性面板键, 建一致性面板, 事实档案 } from './一致性面板';
import { NPC面板键, 建NPC面板 } from './NPC面板';
import { 情感倾向表, 名分词表, 开局好感值表, 开局情欲值表, 推算阶段 } from './恋爱规则';
import { updateNpcStates } from './update';
import { 报告世界书失败, syncNpcStatesWorldbook } from './worldbook-inject';
import { setToastAnchor, setToastColors, setToastSuppressed, toastError, toastSuccess, toastWarning } from './toast';
import { 取弹窗配色, 弹窗兜底配色, 弹窗变量, 悬浮球圆角, 悬浮球直径, 悬浮球高, 主题表 } from './theme';
import type { 弹窗配色 } from './theme';
import type { Host } from './host';
import { 取收纳坞, 取收纳坞入口 } from '../共用/收纳坞';
// 列表类设置的文本 → 名单: 三家统一按换行切(逗号/顿号不再当分隔符)
import { 解析名单 } from '../共用/世界书排除';
import LogsPage from './页面-日志.vue';
import PartsPage from './页面-拼装.vue';
import ConsistencyPage from './页面-一致性.vue';
import NpcPage from './页面-NPC.vue';
import DashboardPage from './页面-仪表盘.vue';
import SettingsPage from './页面-设置.vue';
import { 仪表盘面板键, 建仪表盘面板 } from './仪表盘面板';
import { 日志面板键, 建日志面板 } from './日志面板';
import { 设置面板键, 建设置面板 } from './设置面板';
import { use面板主题, 读球位置, 存球位置 } from './悬浮球偏好';
import { 构建标识 } from './构建';

// 宿主由挂载器传入, 组件不直接构造平台边界。
const props = defineProps<{ host: Host }>();
const host = props.host;

/** 关闭态 iframe 与球同尺寸同圆角, 裁剪与命中区才一致 */
const CLOSED_SIZE = 悬浮球直径;
const CLOSED_HEIGHT = 悬浮球高;

const { theme, toggleTheme } = use面板主题(host);

watch(theme, value => {
  if (updatingPopEl && updatingPopEl.isConnected) {
    updatingPopEl.dataset.theme = value;
    applyPopTheme(updatingPopEl);
  }
  applyToastTheme();
  // 遮罩在酒馆页面上, 颜色不走 CSS 变量, 换主题时得自己重刷
  置遮罩(panelOpen.value);
});

const settingsStore = useSettingsStore();
const { settings } = storeToRefs(settingsStore);
// 设置从全局读一次, 并绑定写回(store 的 setup 不碰平台, 见 settings.ts)
settingsStore.load(host);
settingsStore.bindPersistence(host);
// 切聊天后重读设置(批次 3-4): 设置是**全局**变量, 但别的窗口/设备可能刚改过;
// 面板开着跨过一场聊天切换时, 界面上那份必须与流水线读到的一致(否则"面板显示开、实际关")。
// 只重读不重绑: bindPersistence 是一次性的(再绑会挂第二个 watch)。
const 停止监听聊天切换 = host.events.onChatChanged(() => settingsStore.load(host));
onUnmounted(() => 停止监听聊天切换.stop());

const stateStore = useStateStore();
const { data } = storeToRefs(stateStore);
// store 初始为空状态; 界面挂载时用真实宿主读一次(数据仓.ts)
stateStore.reload(host);

const debugStore = useDebugStore();
const { log: debugLog } = storeToRefs(debugStore);
// 重载/热重载后从聊天变量恢复上一轮日志(3-3): 以前一刷新日志页就是空的
debugStore.恢复(host);

const updatingStore = useUpdatingStore();
const { active: updatingActive, message: updatingMessage } = storeToRefs(updatingStore);

const mainPromptStore = useMainPromptStore();
const { prompt: mainPrompt, time: mainPromptTime, count: mainPromptCount } = storeToRefs(mainPromptStore);

const consoleStore = useConsoleStore();
const { lines: consoleLines } = storeToRefs(consoleStore);

const rootEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const frameWin = computed<Window | null>(() => rootEl.value?.ownerDocument?.defaultView ?? null);
const frame = computed<HTMLIFrameElement | null>(() => frameWin.value?.frameElement as HTMLIFrameElement | null);
const parentWin = computed<Window | null>(() => frameWin.value?.parent ?? null);

/** 球 iframe 的真实视口矩形: 收纳类插件直接改 iframe 的 style, 逻辑锚点会与真实位置脱节 */
const 球矩形 = ref<{ x: number; y: number; w: number; h: number; cx: number; cy: number } | null>(null);

/** 重新量球; 返回"是否变了" */
function 量球(): boolean {
  const el = frame.value;
  if (!el || !el.isConnected) {
    球矩形.value = null;
    return false;
  }
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) {
    球矩形.value = null;
    return false;
  }
  const 旧 = 球矩形.value;
  if (
    旧 &&
    Math.abs(旧.x - r.left) < 0.5 &&
    Math.abs(旧.y - r.top) < 0.5 &&
    Math.abs(旧.w - r.width) < 0.5 &&
    Math.abs(旧.h - r.height) < 0.5
  )
    return false;
  球矩形.value = { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  return true;
}

/** 矩形盯守: 属性观察器 + 慢轮询兜底 */
let 量球定时器: number | null = null;
let 量球观察器: MutationObserver | null = null;

/** 挂了 resize 监听的那个窗口(B32): 必须记住**挂载时那个引用** ——
 *  onUnmounted 里重新求 parentWin.value 可能已变成 null 或另一个窗口,
 *  那样摘的就是另一个对象, 原监听永久残留(每重挂一次多一条)。 */
let 挂了resize的窗口: Window | null = null;

/** 贴球定位的取点: 收纳坞入口 → 球 iframe 真实矩形 → 逻辑锚点 */
function 球锚点(): { x: number; y: number; r: number } {
  // 面板打开时 iframe 被撑成整屏(见 applyFrame 的 panelOpen 分支), 球矩形 = 整个视口 ——
  // 拿它当锚点会把提示条甩到屏幕正中、正好压在面板上(用户反馈的"提示条弹在面板中间")。
  // 这时一律用球的**逻辑位置**(用户把球拖到哪儿就是哪儿, 通常某个角), 提示条仍旧贴着角出来。
  if (!panelOpen.value) {
    const 入口 = 取收纳坞入口(parentWin.value?.document, frame.value);
    if (入口) {
      const r = 入口.getBoundingClientRect();
      if (r.width || r.height)
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 };
    }
    const 实 = 球矩形.value;
    if (实) return { x: 实.cx, y: 实.cy, r: Math.max(实.w, 实.h) / 2 };
  }
  return { x: currentX(), y: currentY(), r: CLOSED_SIZE / 2 };
}

/** 贴球锚点的响应式快照 */
const 贴球锚点 = ref<{ x: number; y: number; r: number }>({ x: -100, y: -100, r: CLOSED_SIZE / 2 });

/** 坞被拖动/折叠时不改变球 iframe, 所以单独盯坞 */
let 坞观察器: MutationObserver | null = null;
function 盯住收纳坞(): void {
  if (坞观察器 || typeof MutationObserver === 'undefined') return;
  const 坞 = 取收纳坞(parentWin.value?.document);
  if (!坞) return;
  坞观察器 = new MutationObserver(() => 同步贴球锚点());
  坞观察器.observe(坞, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
}

/** 同步"贴球锚点"到 toast 与更新弹条 */
function 同步贴球锚点(强制 = false): void {
  盯住收纳坞();
  同步球指针();
  量球();
  const 锚 = 球锚点();
  const 旧 = 贴球锚点.value;
  if (!强制 && Math.abs(旧.x - 锚.x) < 0.5 && Math.abs(旧.y - 锚.y) < 0.5 && Math.abs(旧.r - 锚.r) < 0.5) return;
  贴球锚点.value = 锚;
  setToastAnchor(锚.x, 锚.y);
  positionUpdatingPop();
}

const panelOpen = ref(false);
// 面板开着时压住提示条(用户要求 2026-11-07): 弹条会被面板盖住/挡住操作 —— 关掉面板再按顺序补发
watch(panelOpen, 开 => setToastSuppressed(开));
const tab = ref<'dashboard' | 'npc' | 'consistency' | 'logs' | 'settings'>('dashboard');
const showKey = ref(false);
const fetchingModels = ref(false);
const testing = ref(false);
/** 更新进行中: 直接取自 updatingStore —— updateNpcStates 内部 start/stop 维护它,
 *  球上的转圈(updatingActive)与更新弹窗同源; 用本地 ref 会导致自动更新进行中面板按钮仍可点 */
const updating = computed(() => updatingActive.value);
const isDragging = ref(false);

// API 配置预设: 保存/加载/删除多套接口配置
const presetName = ref('');
const selectedPreset = ref('');
function saveApiPreset() {
  const name = String(presetName.value).trim();
  if (!name) {
    toastWarning('请填写预设名');
    return;
  }
  if (!settings.value.接口预设) settings.value.接口预设 = {};
  settings.value.接口预设[name] = klona(settings.value.接口);
  presetName.value = '';
  selectedPreset.value = name;
  toastSuccess(`已保存接口配置预设「${name}」`);
}
function loadApiPreset() {
  const name = String(selectedPreset.value).trim();
  if (!name || !settings.value.接口预设?.[name]) {
    toastWarning('请选择要加载的预设');
    return;
  }
  settings.value.接口 = klona(settings.value.接口预设[name]);
  toastSuccess(`已加载接口配置预设「${name}」`);
}
function deleteApiPreset() {
  const name = String(selectedPreset.value).trim();
  if (!name || !settings.value.接口预设?.[name]) {
    toastWarning('请选择要删除的预设');
    return;
  }
  delete settings.value.接口预设[name];
  selectedPreset.value = '';
  toastSuccess(`已删除接口配置预设「${name}」`);
}

const tabs = [
  { key: 'dashboard', label: '此刻的彼方' },
  { key: 'npc', label: '人物' },
  { key: 'consistency', label: '事实档案' },
  { key: 'parts', label: '拼装' },
  { key: 'logs', label: '日志' },
  { key: 'settings', label: '设置' },
] as const;

/** 顶栏面包屑的当前页名 */
const 当前页名 = computed(() => tabs.find(item => item.key === tab.value)?.label ?? '此刻的彼方');

// ---------- 更新状态: 三态做进面板本身(顶栏分割线光效 + 底栏状态行 + 按钮), 不弹任何浮层 ----------
/** idle = 待机; running = 正在跑; ok = 刚成功(4.5s 后回落待机); err = 上次失败(常驻, 点状态行跳日志) */
const 运行状态 = ref<运行状态类型>('idle');
/** 本次运行已用秒数(200ms 刷新一次; 面板收起也继续跑, 重新展开直接读当前值) */
const 已用秒 = ref(0);
let 运行起点 = 0;
let 秒表定时器: number | null = null;
let 回落定时器: number | null = null;
/** 最近一次成功更新的摘要(底栏"更新成功 · 第 N 楼 · X 人已更新 · 用时 Ys"要用) */
const 上次摘要 = ref({ 楼层: '', 人数: 0, 用时: 0 });
/** 本轮账: 见过错(粘住, 只用于"重试过"弱提示) + 最终错误(跟随最新那条, 决定红绿)。
 *
 *  2026-11-18 修的 bug(方案 §24 W6): 以前只有一个"本轮出错"布尔量, 中途失败一次就永久粘住,
 *  于是"第一次失败、第二次重试成功"也会在收尾时判成失败 —— 明明成了, 挂红灯。
 *  现在两件事分开记: 红绿只看**最终错误**, 粘住的那份只喂弱提示。
 *  判定逻辑抽在 更新状态机.ts —— .vue 里的东西跑不进用例, 这类 bug 只能靠人手点。
 *
 *  复查 P1-11 补第三账: **本轮是否真的发过请求**。提前 return 的路径一条 error 都不写,
 *  只看"最终错误为空"会把它们判成成功、弹"已更新"绿 —— 而什么都没发生。
 *  这个事实由 `chatCompletionInner` 置真(经 任务中断.ts 的 本轮发过请求 传上来)。 */
let 本轮账: 本轮账类型 = 新建本轮账();
/** 本轮"重试过但成功了" —— 状态行给一句弱提示, 不挂红灯 */
const 本轮重试过 = ref(false);

function 停秒表() {
  if (秒表定时器 !== null) window.clearInterval(秒表定时器);
  秒表定时器 = null;
}
function 停回落() {
  if (回落定时器 !== null) window.clearTimeout(回落定时器);
  回落定时器 = null;
}

// 每写一条日志就更新本轮账。record() 每次都换一个新对象, 所以对象一变就说明有人写了日志。
watch(() => debugLog.value, 日志 => {
  if (运行状态.value !== 'running') return;
  本轮账 = 吸收日志(本轮账, 日志 as any);
});

watch(updatingActive, active => {
  停回落();
  if (active) {
    运行状态.value = 'running';
    运行起点 = Date.now();
    已用秒.value = 0;
    // 新一轮开始: 账清零(否则上一轮的红灯/弱提示会带进来)
    本轮账 = 新建本轮账();
    本轮重试过.value = false;
    停秒表();
    秒表定时器 = window.setInterval(() => {
      已用秒.value = Math.round((Date.now() - 运行起点) / 100) / 10;
    }, 200);
    return;
  }
  停秒表();
  if (运行状态.value !== 'running') return;
  const 日志 = debugLog.value;
  // 用户主动中断不是失败: 回落待机, 不挂红灯(否则"我点了中断"看起来像出错)
  // 判定按**最终结果**, 不被中途重试污染(方案 §24 W6): 红绿只看 最终错误,
  // "见过错"只喂弱提示 —— 否则"第一次失败、第二次成功"会挂红灯。
  const 判定 = 判定本轮收尾({
    发过请求: updatingStore.本轮发过请求,
    见过错: 本轮账.见过错,
    最终错误: 本轮账.最终错误,
    中断: /已中断/.test(本轮账.最终错误),
  });
  本轮重试过.value = 判定.重试过;
  if (判定.状态 !== 'ok') {
    运行状态.value = 判定.状态;
    return;
  }
  const 用时 = Math.round((Date.now() - 运行起点) / 10) / 10;
  上次摘要.value = {
    楼层: 日志?.replyIds?.length ? `第 ${日志.replyIds[日志.replyIds.length - 1]} 楼` : '',
    人数: 日志?.updatedNpcs?.length ?? 0,
    用时,
  };
  运行状态.value = 'ok';
  回落定时器 = window.setTimeout(() => {
    运行状态.value = 'idle';
    回落定时器 = null;
  }, 4500);
}, { immediate: true });

onUnmounted(() => {
  停秒表();
  停回落();
});

/** 面板根节点类名: 顶栏分割线光效由它驱动 */
const 面板态类 = computed(() => (运行状态.value === 'idle' ? '' : `is-${运行状态.value}`));

/** 顶栏按钮三态: 更新 → 更新中(转圈) → 已更新 / 重试; 成功后短暂转绿、失败转红 */
const 更新按钮文案 = computed(() => {
  if (updating.value) return '更新中';
  if (运行状态.value === 'ok') return '已更新';
  return 运行状态.value === 'err' ? '重试' : '更新';
});
const 更新按钮态类 = computed(() => {
  if (updating.value) return '';
  return 运行状态.value === 'ok' ? 'is-ok' : 运行状态.value === 'err' ? 'is-err' : '';
});

/** 底栏状态行: 待机显示接口就绪; 运行时带楼层与秒数; 成功 4.5s 后回落; 失败常驻并可点 */
const 运行文字 = computed(() => {
  if (运行状态.value === 'running') {
    const 阶段 = updatingMessage.value || '读取楼层';
    return `正在更新 · ${阶段} · 已用 ${已用秒.value.toFixed(1)}s`;
  }
  if (运行状态.value === 'ok') {
    const { 楼层, 人数, 用时 } = 上次摘要.value;
    return ['更新成功', 重试提示(本轮重试过.value), 楼层, 人数 > 0 ? `${人数} 人已更新` : '无人物变化', `用时 ${用时.toFixed(1)}s`]
      .filter(Boolean)
      .join(' · ');
  }
  if (运行状态.value === 'err') {
    const 原因 = (debugLog.value?.error ?? '').split('\n')[0].slice(0, 40) || '见日志';
    return `更新失败 · ${原因} · 点这里看日志`;
  }  return ready.value ? `接口已就绪 · ${settings.value.接口.模型}` : '未配置模型 · 点设置填写';
});
const 运行文字类 = computed(() => {
  if (运行状态.value === 'running') return 'is-running';
  if (运行状态.value === 'ok') return 'is-ok';
  if (运行状态.value === 'err') return 'is-err clickable';
  return '';
});
/** 底栏圆点: 待机看接口是否就绪; 运行时琥珀呼吸; 成功绿; 失败红 */
const 运行指示灯类 = computed(() => {
  if (运行状态.value === 'running') return 'is-running warn';
  if (运行状态.value === 'ok') return 'good';
  if (运行状态.value === 'err') return 'bad';
  return '';
});

/** 本轮有变化的人: 卡的「最后更新」等于全局「最后更新」时刻 */
const 本轮有变化人数 = computed(() => {
  const 时刻 = Number(stats.value.最后更新 ?? 0);
  if (!时刻) return 0;
  return Object.values(data.value.NPC ?? {}).filter(卡 => Number((卡 as any)?.['最后更新'] ?? 0) === 时刻).length;
});
/** 事实档案的过期事务数: 页签红色胶囊角标(为 0 时隐藏) */
const 过期事务数 = computed(() => 事实档案(data.value).过期数);

/** 页签角标(数字): 事实档案 = 已过期事务数, 0 时不给 */
function 页签角标(key: string): string {
  if (key === 'consistency' && 过期事务数.value > 0) return String(过期事务数.value);
  return '';
}
/** 页签圆点(布尔): 此刻的彼方/人物 = 本轮有人变化; 日志 = 最近一次更新出错 */
function 页签圆点(key: string): boolean {
  if (key === 'dashboard' || key === 'npc') return 本轮有变化人数.value > 0;
  if (key === 'logs') return 运行状态.value === 'err';
  return false;
}
/** 圆点配色: 有变化用暖色、出错用红色 —— 两种含义不共用一个颜色 */
function 页签圆点色(key: string): string {
  return key === 'logs' ? '' : 'warm';
}

const newNpcName = ref('');
/** 自动建档开启时给空状态的正确引导; 关闭时提示手动加名单 */
const autoTrackEnabled = computed(() => settings.value.更新.自动建档 !== false);


const addDialogOpen = ref(false);
const addDraft = ref<Record<string, any>>({});

function openAddDialog() {
  addDraft.value = {
    名字: newNpcName.value.trim(),
    身份锚点: '',
    当前在做: '',
    当前状态: '',
    位置: '',
    接下来想做: '',
  };
  addDialogOpen.value = true;
}

function confirmAddNpc() {
  const name = String(addDraft.value['名字'] || '').trim();
  if (!name) {
    toastWarning('请填写NPC名字');
    return;
  }
  // 改数据 → 写快照 → 重同步世界书这一整套在 数据变更.ts, 界面只消费返回值
  const 结果 = 加NPC(data.value, name, addDraft.value, 建变更环境(host));
  // 没落盘就别把人选切过去、别关窗: 关窗=玩家以为加好了, 刷新后才发现人不在
  if (结果.失败) {
    toastWarning(结果.说明);
    return;
  }
  selectedNpc.value = name;
  newNpcName.value = '';
  addDialogOpen.value = false;
  toastSuccess(结果.说明);
}

function removeNpc(name: string) {
  // 保存并提交给界面由 建变更环境 负责(写快照 + 更新数据仓), 这里不用再回写 data
  const 结果 = 移除NPC(data.value, name, 建变更环境(host));
  if (结果.失败) {
    toastWarning(结果.说明);
    return;
  }
  if (selectedNpc.value === name) selectedNpc.value = null;
  toastSuccess(结果.说明);
}
/** 事实档案整页(含"谁欠着事/欠了多久/哪条过期"的排序与文案)已搬进 一致性面板.ts,
 *  壳这边只把 data 与两个动作接进去 —— 见文件末尾的 provide。 */
const stats = computed(() => data.value.统计 ?? { 更新次数: 0, 最后更新: 0 });
// 模型候选面板: 自绘, 与输入框当前值**无关**(照 人设工坊 SettingsPanel #236 ③ 的教训)。
// 为什么不用原生 <datalist>: 它按输入框当前值过滤候选 —— 已经填了 `gemini-3.7-flash`
// 再展开下拉, 就只剩匹配项(甚至一项都不剩), 必须先把输入框删空才看得到别的模型。
// 自绘面板每次打开都列全部, 只有点候选项才写 模型, 开/关列表不会弄丢已配好的值。
const 模型候选开 = ref(false);
function 选模型(名: string) {
  settings.value.接口.模型 = 名;
  模型候选开.value = false;
}
const ready = computed(() => Boolean(settings.value.接口.地址 && settings.value.接口.模型));
const statusTitle = computed(() =>
  ready.value
    ? `接口: ${settings.value.接口.地址} · 模型: ${settings.value.接口.模型}`
    : '请在「设置」中配置接口地址与模型',
);

const selectedNpc = ref<string | null>(null);
const selectedNpcCard = computed<NpcStateCard | null>(() => {
  if (selectedNpc.value && data.value.NPC?.[selectedNpc.value]) return data.value.NPC[selectedNpc.value];
  return null;
});

watch(
  () => data.value.NPC,
  npcMap => {
    if (!selectedNpc.value || !npcMap?.[selectedNpc.value]) {
      const first = Object.keys(npcMap ?? {})[0];
      selectedNpc.value = first ?? null;
    }
  },
  { immediate: true, deep: true },
);

function openNpc(name: string) {
  selectedNpc.value = name;
  tab.value = 'npc';
}




// 切换写入目标时立即按新目标写一遍; 关掉时把条目删掉(两本都清)。
// 数据变更之后的"重同步"由 数据变更.ts 统一负责, 这里只管"目标被改了"这一件事。
// 换目标不清理另一本: 旧条目留在原处, 由用户自己删。
watch(
  [() => settings.value.更新.世界书写入, () => settings.value.更新.生理监测, () => settings.value.启用幕后],
  ([目标, , 启用]) => {
    const 写入 = 启用 && 目标 !== '关闭' && Object.keys(data.value.NPC ?? {}).length > 0;
    // 生理开关也挂在这里: 关掉后条目里的生理六列必须马上消失, 不能等下一轮更新。
    // 总开关关掉同样要清: 关的是"彼方写世界书"这件事, 留着条目等于主AI 继续读过期状态。
    syncNpcStatesWorldbook(host, data.value, 写入 ? 目标 : '关闭', undefined, settings.value.更新.生理监测).catch(error => 报告世界书失败(host, error));
  },
);



/** 标记/取消恋爱对象: 只写「恋爱对象」一个字段(其余恋爱字段由首轮更新惰性补齐),
 *  取消标记写空值 = 删掉该字段(空值即删除), 于是提示词与合并逻辑都回到"未标记"路径。
 *
 *  R8: **已有历史恋爱记录时不再弹窗**, 直接恢复 `恋爱对象 = '是'` ——
 *  那些数值/阶段/名分本来就是这段关系的证据, 再问一次"关系从哪儿开始"等于让人重填已经发生的事。 */
function 切换恋爱对象() {
  if (!selectedNpc.value || !selectedNpcCard.value) return;
  const 名字 = selectedNpc.value;
  const 标记 = String(selectedNpcCard.value['恋爱对象'] ?? '').trim() === '是';
  if (!标记) {
    // 有历史记录(数值/阶段/名分/标签/态度任一非空) → 直接恢复标记, 不弹窗
    const 有历史 = ['好感值', '情欲值', '好感阶段', '情欲阶段', '名分', '恋爱标签', '恋爱态度']
      .some(键 => String(selectedNpcCard.value?.[键] ?? '').trim() !== '');
    if (有历史) {
      const 恢复 = 更新状态卡(data.value, 名字, { 恋爱对象: '是' }, 建变更环境(host));
      if (恢复.失败) {
        toastWarning(恢复.说明);
        return;
      }
      toastSuccess(`已恢复 ${名字} 的恋爱对象标记（沿用原有数值与名分）`);
      return;
    }
    // 首次标记(无任何历史)才问关系起点: 人设里已是夫妻/恋人的角色不该从陌生起步
    开局草稿.value = { 方式: 'AI', 好感: '陌生', 情欲: '无感', 名分: '无', 倾向: '' };
    开局弹窗开.value = true;
    return;
  }
  const 结果 = 更新状态卡(data.value, 名字, { 恋爱对象: '' }, 建变更环境(host));
  if (结果.失败) {
    toastWarning(结果.说明);
    return;
  }
  toastSuccess(`已取消 ${名字} 的恋爱对象标记`);
}

/** 开局对话框: "让 AI 判断"只写标记(开局窗口保持开着, 下一轮 AI 必须报开局);
 *  "我自己选"直接写好数值/阶段/名分并把「恋爱开局」写成「是」(窗口关闭, AI 不再改起点) */
const 开局弹窗开 = ref(false);
const 开局草稿 = ref({ 方式: 'AI', 好感: '陌生', 情欲: '无感', 名分: '无', 倾向: '' });
const 开局好感选项 = Object.keys(开局好感值表);
const 开局情欲选项 = Object.keys(开局情欲值表);
/** 情感倾向的下拉选项: 枚举由 恋爱规则.ts 持有(系数也在那边), 界面不重复写词表。
 *  两处用它: 开局对话框(壳里)与人物页的详情字段(那里经 NPC面板 拿到同一份) */
const 情感倾向选项 = Object.keys(情感倾向表);
function 确认标记恋爱对象() {
  if (!selectedNpc.value) return;
  const 名字 = selectedNpc.value;
  const 草稿 = 开局草稿.value;
  const 补: Record<string, string> = { 恋爱对象: '是' };
  if (草稿.倾向) 补['情感倾向'] = 草稿.倾向;
  if (草稿.方式 === '手动') {
    const 好感 = 开局好感值表[草稿.好感] ?? 0;
    const 情欲 = 开局情欲值表[草稿.情欲] ?? 0;
    Object.assign(补, {
      好感值: String(好感),
      好感阶段: 推算阶段('好感', 好感),
      情欲值: String(情欲),
      情欲阶段: 推算阶段('情欲', 情欲),
      名分: 草稿.名分,
      恋爱开局: '是',
    });
  }
  const 结果 = 更新状态卡(data.value, 名字, 补, 建变更环境(host));
  if (结果.失败) {
    toastWarning(结果.说明);
    return;
  }
  开局弹窗开.value = false;
  toastSuccess(
    草稿.方式 === '手动'
      ? `已把 ${名字} 标记为恋爱对象, 起点: ${草稿.好感} / ${草稿.名分}`
      : `已把 ${名字} 标记为恋爱对象, 下一轮更新由 AI 判断关系起点`,
  );
}


/** 人物名 → 头像色号(1-8)。按名字散列, 增删人物时已有角色不变色 */
function 头像色号(name?: string | null): number {
  let hash = 0;
  for (const char of String(name ?? '')) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 8) + 1;
}

// 标签过滤草稿: 输入时原样保留(不中途拆分), watch 才把**换行**解析成列表写入设置
// ——避免用 computed setter 拆分导致"一打字(换行)就消失"
const tagDraft = ref(settings.value.标签.列表.join('\n'));
watch(tagDraft, value => {
  settings.value.标签.列表 = 解析名单(String(value ?? ''))
    .map(item => item.replace(/^<|>$/g, ''))
    .filter(Boolean);
});
// 注入世界书排除草稿: 每行一条(标题含这些字就排除), watch 解析成列表写入设置
const worldbookExcludeDraft = ref((settings.value.更新.注入世界书排除 || []).join('\n'));
watch(worldbookExcludeDraft, value => {
  settings.value.更新.注入世界书排除 = 解析名单(String(value ?? ''));
});
// 常驻世界书条目草稿: 每行一个条目名/关键词, watch 解析成列表写入设置
const worldbookAlwaysDraft = ref((settings.value.更新.常驻世界书条目 || []).join('\n'));
watch(worldbookAlwaysDraft, value => {
  settings.value.更新.常驻世界书条目 = 解析名单(String(value ?? ''));
});

// ---- 编辑提示词功能(自定义提示词段)已于 2026-10 删除: 历史残留, 界面与设置项一并移除 ----

const savedOrb = 读球位置(host);

const viewportW = (): number => parentWin.value?.innerWidth ?? window.innerWidth;
const viewportH = (): number => parentWin.value?.innerHeight ?? window.innerHeight;

/** 视口的响应式快照: 打开面板时球停靠位置需要跟着视口重算 */
const 视口尺寸 = ref({ w: viewportW(), h: viewportH() });
function 记视口尺寸(): void {
  视口尺寸.value = { w: viewportW(), h: viewportH() };
}

/** 贴边留白: 0 = 球体真正贴到屏幕边缘(球体外侧阴影已去除, 贴边不会被裁) */
const EDGE_GAP = 0;
const halfOrb = (): number => CLOSED_SIZE / 2;
const halfOrbHeight = (): number => CLOSED_HEIGHT / 2;
const minAnchorX = (): number => halfOrb() - EDGE_GAP;
const maxAnchorX = (): number => viewportW() - halfOrb() + EDGE_GAP;
const minAnchorY = (): number => halfOrbHeight() - EDGE_GAP;
const maxAnchorY = (): number => viewportH() - halfOrbHeight() + EDGE_GAP;

const anchorX = ref<number | null>(null);
const anchorY = ref<number | null>(null);

function currentX(): number {
  return anchorX.value ?? viewportW() - 40;
}

function currentY(): number {
  return anchorY.value ?? viewportH() - 110;
}

/** 被收纳且面板未开时, 关掉本插件 iframe 的指针事件 */
function 同步球指针(): void {
  const target = frame.value;
  if (!target) return;
  const 被收纳 = !!取收纳坞入口(parentWin.value?.document, target);
  target.style.pointerEvents = 被收纳 && !panelOpen.value ? 'none' : 'auto';
}

/** 面板矩形: 与 .bf-panel 的尺寸规则同口径(≤800px 为整屏) */
function 面板矩形(): { x: number; y: number; w: number; h: number } {
  const vw = viewportW();
  const vh = viewportH();
  if (vw <= 800) return { x: 0, y: 0, w: vw, h: vh };
  const w = Math.min(1120, vw * 0.95);
  const h = Math.min(760, vh - 56);
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** 面板打开时球的停靠位: 两侧还有边距就贴边, 没有就隐藏(避免压住内容) */
const 打开态球位 = computed<{ left: number; top: number } | null>(() => {
  if (!panelOpen.value) return null;
  const { w: vw, h: vh } = 视口尺寸.value;
  const p = 面板矩形();
  const 边距 = CLOSED_SIZE + 16;
  const 右余 = vw - (p.x + p.w);
  const 左余 = p.x;
  const top = clamp(
    (anchorY.value ?? vh - 110) - CLOSED_HEIGHT / 2,
    8,
    Math.max(8, vh - CLOSED_HEIGHT - 8),
  );
  if (右余 >= 边距) return { left: vw - 边距, top };
  if (左余 >= 边距) return { left: 8, top };
  return null;
});

const orbStyle = computed<Record<string, string>>(() => {
  if (!panelOpen.value) return { left: '0px', top: '0px' };
  const pos = 打开态球位.value;
  if (!pos) return { left: '0px', top: '0px', display: 'none' };
  return { left: `${Math.round(pos.left)}px`, top: `${Math.round(pos.top)}px` };
});

/** iframe 被放大后个别机器不会重新光栅化(整块空白但命中测试正常): 逼一次重绘 */
function 强制重绘(target: HTMLIFrameElement): void {
  target.style.transform = 'translateZ(0)';
  requestAnimationFrame(() => {
    if (target.style.transform === 'translateZ(0)') target.style.transform = '';
  });
}

/** 关闭态的 iframe 圆角: 与 .bf-orb 的圆角同源(theme.ts 的 悬浮球圆角) */
function 球圆角样式(): string {
  return `${悬浮球圆角.上}px ${悬浮球圆角.上}px ${悬浮球圆角.下}px ${悬浮球圆角.下}px`;
}

function applyFrame() {
  const target = frame.value;
  if (!target) return;
  同步球指针();
  const x = currentX();
  const y = currentY();
  if (panelOpen.value) {
    target.style.width = `${viewportW()}px`;
    target.style.height = `${viewportH()}px`;
    target.style.left = '0px';
    target.style.top = '0px';
    // 面板分支必须把裁剪设回矩形, 否则整个面板会被上一态的圆角裁掉
    target.style.borderRadius = '0px';
    // **故意不裁 iframe**: 2026-10-26 真机(Firefox)上 `clip-path: path()` 打在 iframe 上时
    // 既没裁渲染也没裁命中测试, 反而多了一个"面板画不出来"的变量。命中交给页面遮罩
    // (它盖在 iframe **之上**, 中间给面板留洞), 与 iframe 的渲染路径彻底解耦。
    target.style.clipPath = 'none';
    强制重绘(target);
  } else {
    target.style.width = `${CLOSED_SIZE}px`;
    target.style.height = `${CLOSED_HEIGHT}px`;
    target.style.left = `${clamp(x - halfOrb(), -EDGE_GAP, viewportW() - CLOSED_SIZE + EDGE_GAP)}px`;
    target.style.top = `${clamp(y - halfOrbHeight(), -EDGE_GAP, viewportH() - CLOSED_HEIGHT + EDGE_GAP)}px`;
    // iframe 元素本身裁成球的圆角(与 .bf-orb 同源): replaced element 的 border-radius 会同时裁剪
    // 渲染与鼠标命中测试——四角透明区不再吃点击
    target.style.borderRadius = 球圆角样式();
    target.style.clipPath = 'none';
  }
}

onMounted(() => {
  anchorX.value =
    typeof savedOrb?.x === 'number' && savedOrb.x >= minAnchorX() && savedOrb.x <= maxAnchorX()
      ? savedOrb.x
      : viewportW() - 40;
  anchorY.value =
    typeof savedOrb?.y === 'number' && savedOrb.y >= minAnchorY() && savedOrb.y <= maxAnchorY()
      ? savedOrb.y
      : viewportH() - 110;
  记视口尺寸();
  applyFrame();
  同步贴球锚点(true);
  // 盯球(属性改动, 命中即瞬时) + 盯坞(坞拖动/折叠/释放不动球 iframe) + 慢轮询兜底
  if (!量球观察器 && typeof MutationObserver !== 'undefined') {
    量球观察器 = new MutationObserver(() => 同步贴球锚点());
    const 球元素 = frame.value;
    if (球元素) 量球观察器.observe(球元素, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (量球定时器 === null) 量球定时器 = window.setInterval(() => 同步贴球锚点(), 2000);
  applyToastTheme();
  // B32: 记住挂载时那个窗口 —— 摘除要用同一个引用(见 onUnmounted)。
  挂了resize的窗口 = parentWin.value;
  挂了resize的窗口?.addEventListener('resize', onViewportResize);
  // R8: Esc 关闭 —— 本 iframe 与酒馆页面(父窗口)都挂, 谁收到都能关(焦点可能在任一边)
  frameWin.value?.addEventListener('keydown', onEscape);
  parentWin.value?.addEventListener('keydown', onEscape);
  // 脚本按钮入口: 必须挂到 **frameWin**(组件所在嵌套 iframe 的 window)。
  // 组件代码跑在脚本 iframe 的 JS 上下文里, 裸 window 与 contentWindow 不是同一个对象 ——
  // 挂错了就永远收不到按钮的调用(2026-10-23 真机踩过)。
  const win = frameWin.value as any;
  if (win) win.__bfOpenPanel = 打开面板入口;
  // 【验收/排障用】把 stateStore 暴露到 iframe window 上, 供在浏览器里往**内存**塞假数据
  // (看版式/主题/抽屉), 不写任何酒馆变量、不触发快照写盘。
  // **默认不挂**(TD-1): 裸挂等于给任何同源脚本一条改状态的通道, 且没人知道它开着。
  // 只有脚本变量 `调试.暴露状态 === true` 时才挂 —— 验收要注入数据时自己去设置里打开。
  if (win && settings.value.调试?.暴露状态 === true) win.__bfStateStore = stateStore;
  // 开关改了要立刻跟上(否则"打开开关还得刷新页面"这种要求会让人以为开关坏了)
  watch(() => settings.value.调试?.暴露状态, 开 => {
    const w = frameWin.value as any;
    if (!w) return;
    if (开) w.__bfStateStore = stateStore;
    else delete w.__bfStateStore;
  });
});

onUnmounted(() => {
  if (量球定时器 !== null) window.clearInterval(量球定时器);
  量球定时器 = null;
  量球观察器?.disconnect();
  量球观察器 = null;
  坞观察器?.disconnect();
  坞观察器 = null;
  // 二次确认窗口与位置保存都是短定时器: 卸载后不该再回写组件状态或平台变量(定时器残留)
  if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
  if (orbSaveTimer !== null) window.clearTimeout(orbSaveTimer);
  关闭看门狗();
  移除遮罩();
  // B32: 摘的是挂载时记住的那个窗口, 不是重新求值的 parentWin
  挂了resize的窗口?.removeEventListener('resize', onViewportResize);
  挂了resize的窗口 = null;
  frameWin.value?.removeEventListener('keydown', onEscape);
  parentWin.value?.removeEventListener('keydown', onEscape);
  const win = frameWin.value as any;
  if (win) {
    delete win.__bfOpenPanel;
    delete win.__bfStateStore;
  }
});

function onViewportResize() {
  const anchorChanged = anchorX.value !== null || anchorY.value !== null;
  if (anchorX.value !== null) anchorX.value = clamp(anchorX.value, minAnchorX(), maxAnchorX());
  if (anchorY.value !== null) anchorY.value = clamp(anchorY.value, minAnchorY(), maxAnchorY());
  记视口尺寸();
  applyFrame();
  // 遮罩的洞是按视口算的: 视口一变必须重摆, 否则面板边上会多压一条遮罩(那一侧的按钮就点不到了)
  if (panelOpen.value) 置遮罩(true);
  positionUpdatingPop();
  // 视口变化把球挤出原位置时, 保存修正后的位置
  if (anchorChanged) persistOrbPos();
}

watch([panelOpen, anchorX, anchorY], () => {
  applyFrame();
  // 开/关面板会改变 iframe 尺寸(展开时铺满整屏), 贴球锚点必须跟着重算 —— 否则提示条会按
  // "整个视口"定位, 正好弹在面板正中(关掉后又会突然跳回球边)
  同步贴球锚点(true);
});

// 位置持久化: 只在拖动结束(pointerup)时写一次全局变量——拖动过程中每个 pointermove
// 都写会造成数百次全局变量写入(全局变量是服务器端共享的, 每次都有序列化开销)
watch([anchorX, anchorY], () => {
  // 自己挪球: rAF 后 iframe 的真实矩形已经跟上(收纳/坞拖动走 同步贴球锚点 的双通道)
  // 不用 requestAnimationFrame: 真机上那个回调可能根本不跑(2026-10-26, Firefox),
  // 于是拖动后弹条锚点一直停在旧位置。两次 setTimeout 既让布局落定, 又不依赖渲染帧。
  window.setTimeout(() => 同步贴球锚点(true), 0);
  window.setTimeout(() => 同步贴球锚点(true), 120);
});

let orbSaveTimer: number | null = null;
function persistOrbPos() {
  if (orbSaveTimer !== null) window.clearTimeout(orbSaveTimer);
  orbSaveTimer = window.setTimeout(() => {
    orbSaveTimer = null;
    if (anchorX.value === null || anchorY.value === null) return;
    存球位置(host, { x: anchorX.value, y: anchorY.value });
  }, 200);
}

const UPDATING_POP_ID = '彼方_更新弹窗';
let updatingPopEl: HTMLElement | null = null;
/** 更新弹条外观: 窗灯旁的一张薄签, 与提示条同族 */
const UPDATING_POP_CSS = `position:fixed;top:0;left:0;z-index:2147483003;display:none;align-items:center;gap:9px;padding:7px 8px 7px 12px;border-radius:4px 10px 10px 4px;background:var(${弹窗变量.bg},${弹窗兜底配色.bg});border:0;color:var(${弹窗变量.text},${弹窗兜底配色.text});font:12px/1.6 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.5),0 0 0 1px var(${弹窗变量.border},${弹窗兜底配色.border});user-select:none;white-space:nowrap;transform-origin:left center;animation:bfPopIn .18s ease-out;`;
const UPDATING_POP_HTML = `
    <span class="bf-pop-spin" style="width:9px;height:12px;border-radius:5px 5px 1px 1px;background:radial-gradient(70% 60% at 50% 70%,#ffd89a,#e9a85a 60%,#8a5a2a);box-shadow:0 0 8px rgba(240,180,100,.6);animation:bfLamp 1.6s ease-in-out infinite;flex:none;"></span>
    <span class="bf-pop-msg"></span>
    <button type="button" class="bf-pop-cancel" style="margin-left:2px;padding:3px 8px;border-radius:4px;border:1px solid var(${弹窗变量.border},${弹窗兜底配色.border});background:transparent;color:var(${弹窗变量.text},${弹窗兜底配色.text});font:inherit;cursor:pointer;">中断</button>`;

/** 更新弹条不在弹窗容器里, 单独补主题变量 */
function applyPopTheme(el: HTMLElement) {
  const vars = 取弹窗配色(theme.value);
  for (const [key, prop] of Object.entries(弹窗变量) as [keyof 弹窗配色, string][])
    el.style.setProperty(prop, vars[key]);
}

/** 贴球弹窗容器整体同步主题配色(值来自 theme.ts, 不再从面板 DOM 里反读) */
function applyToastTheme() {
  setToastColors(取弹窗配色(theme.value));
  if (updatingPopEl && updatingPopEl.isConnected) applyPopTheme(updatingPopEl);
}

/** 弹条贴着悬浮球左方弹出(左方空间不足则弹到右方), 垂直居中对齐球, 跟随球的位置 */
function positionUpdatingPop() {
  const el = updatingPopEl;
  if (!el || !el.isConnected) return;
  const vw = viewportW();
  const vh = viewportH();
  const w = el.offsetWidth || 220;
  const h = el.offsetHeight || 40;
  // 锚点由 球锚点 统一解析: 被收纳时=坞图标, 否则=球 iframe 真实矩形
  const { x: 心x, y: 心y, r: 半径 } = 贴球锚点.value;
  let left = 心x - 半径 - w - 10;
  if (left < 8) left = 心x + 半径 + 10;
  left = clamp(left, 8, Math.max(8, vw - w - 8));
  const top = clamp(心y - h / 2, 8, Math.max(8, vh - h - 8));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function ensureUpdatingPop(doc: Document): HTMLElement {
  let el = doc.getElementById(UPDATING_POP_ID);
  if (el) {
    // 热重载/重进脚本时可能复用旧版式的残留元素: 重刷为当前样式与主题色(顺带重置旧按钮监听)
    el.style.cssText = UPDATING_POP_CSS;
    el.innerHTML = UPDATING_POP_HTML;
    applyPopTheme(el);
    return el;
  }
  el = doc.createElement('div');
  el.id = UPDATING_POP_ID;
  el.style.cssText = UPDATING_POP_CSS;
  applyPopTheme(el);
  el.innerHTML = UPDATING_POP_HTML;
  if (!doc.querySelector('style[data-bf-pop]')) {
    const style = doc.createElement('style');
    style.setAttribute('data-bf-pop', '1');
    style.textContent = `
      @keyframes bf-pop-spin{0%,100%{opacity:.35}50%{opacity:1}}
      @keyframes bfPopIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
      .bf-pop-msg{max-width:min(420px,60vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      @media (prefers-reduced-motion: reduce){#${UPDATING_POP_ID}{animation-duration:.01ms !important;}}`;
    doc.head.appendChild(style);
  }
  doc.body.appendChild(el);
  return el;
}

// 2026-11-13: 同剧情导演那条弹条 —— 依赖补 panelOpen，面板开着就移除（彼方面板内也有中断按钮）。
watch([updatingActive, updatingMessage, panelOpen], ([active, message, open]) => {
  const parentDoc = parentWin.value?.document;
  if (!parentDoc) return;
  if (应显示更新弹条(!!active, !!open)) {
    updatingPopEl = ensureUpdatingPop(parentDoc);
    const msgEl = updatingPopEl.querySelector('.bf-pop-msg');
    if (msgEl) msgEl.textContent = message || '彼方更新中…';
    const cancelBtn = updatingPopEl.querySelector('.bf-pop-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => updatingStore.cancel());
    updatingPopEl.style.display = 'flex';
    // 重新播放弹出动画(display 切换不会重放 CSS animation)
    updatingPopEl.style.animation = 'none';
    void updatingPopEl.offsetWidth;
    updatingPopEl.style.animation = '';
    positionUpdatingPop();
  } else if (updatingPopEl) {
    updatingPopEl.remove();
    updatingPopEl = null;
  }
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let startX = 0;
let startY = 0;
let startAnchorX = 0;
let startAnchorY = 0;
let moved = false;

function parentClient(e: PointerEvent): { x: number; y: number } {
  const rect = frame.value?.getBoundingClientRect();
  if (e.view === frameWin.value && rect) {
    return { x: rect.left + e.clientX, y: rect.top + e.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function onOrbPointerDown(e: PointerEvent) {
  // 面板打开时球是"停靠书签"(只负责收起), 不参与拖动 —— 位置由面板边距算出来
  if (panelOpen.value) return;
  // 只认主键(鼠标右键/中键不拖); 触摸的 button 恒为 0
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  isDragging.value = true;
  moved = false;
  // 起点与移动必须走**同一个**坐标换算: 以前这里手写 `rect.left + e.clientX`,
  // 而 onMove 走 parentClient() —— 移动端两边对"事件来自哪个窗口"的判断一旦不一致,
  // 差出来的就是一整个 iframe 原点, 球整块跳走再偏着跟手。
  const start = parentClient(e);
  startX = start.x;
  startY = start.y;
  startAnchorX = currentX();
  startAnchorY = currentY();
  // 触摸: 把后续 pointer 事件锁到球上 —— 手指移出 iframe 也不会丢事件
  try {
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  } catch {
    // 宿主不支持/指针已失效: 双窗监听仍是兜底
  }
  frameWin.value?.addEventListener('pointermove', onMove);
  frameWin.value?.addEventListener('pointerup', onUp);
  frameWin.value?.addEventListener('pointercancel', onUp);
  parentWin.value?.addEventListener('pointermove', onMove);
  parentWin.value?.addEventListener('pointerup', onUp);
  parentWin.value?.addEventListener('pointercancel', onUp);
}

function onMove(e: PointerEvent) {
  const point = parentClient(e);
  if (Math.abs(point.x - startX) + Math.abs(point.y - startY) > 4) moved = true;
  anchorX.value = clamp(startAnchorX + (point.x - startX), minAnchorX(), maxAnchorX());
  anchorY.value = clamp(startAnchorY + (point.y - startY), minAnchorY(), maxAnchorY());
}

function onUp() {
  isDragging.value = false;
  frameWin.value?.removeEventListener('pointermove', onMove);
  frameWin.value?.removeEventListener('pointerup', onUp);
  frameWin.value?.removeEventListener('pointercancel', onUp);
  parentWin.value?.removeEventListener('pointermove', onMove);
  parentWin.value?.removeEventListener('pointerup', onUp);
  parentWin.value?.removeEventListener('pointercancel', onUp);
  if (moved) persistOrbPos();
  window.setTimeout(() => {
    moved = false;
  }, 200);
}

function onOrbClick() {
  if (moved) {
    moved = false;
    return;
  }
  if (panelOpen.value) closePanel();
  else 展开面板('悬浮球');
}

function closePanel() {
  panelOpen.value = false;
}

/**
 * R8: `Esc` 关闭 —— 有内层弹窗时先关弹窗, 没有弹窗时才收面板。
 * 为什么挂到 **父窗口**(酒馆页面)而不是组件所在 iframe: 面板打开时 iframe 铺满整屏但焦点可能
 * 停在酒馆页面(玩家刚点过外面), 只在本 iframe 上监听会收不到 Esc。
 * 两个窗口都挂, 用同一个处理函数, 谁收到都能关。
 */
function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (addDialogOpen.value) {
    addDialogOpen.value = false;
    return;
  }
  if (开局弹窗开.value) {
    开局弹窗开.value = false;
    return;
  }
  if (panelOpen.value) closePanel();
}

// ---------------------------------------------------------------------------
// 打开面板: 遮罩(画在酒馆页面, 盖在 iframe 之上并给面板留洞) + 阶段日志 + 看门狗
// ---------------------------------------------------------------------------

const DIM_ID = 'bf-panel-dim';
const 状态ID = 'bf-panel-status';
/** iframe 2147483000 → 遮罩 2147483001 → 状态字 2147483002 → 提示条 2147483003 */
const DIM_Z = 2147483001;
let 遮罩容器: HTMLElement | null = null;
/** 四块边带(上/下/左/右) */
let 遮罩块: HTMLElement[] = [];
/** 四个角上的补丁: 洞要跟着面板的**圆角**走, 否则四角各留一块直角 —— 那块里正好是面板投影,
 *  看起来就是"四个直角小阴影块"(2026-10-26 真机反馈)。 */
let 圆角块: HTMLElement[] = [];
let 状态元素: HTMLElement | null = null;

/** 遮罩取主题 token */
function 遮罩色(): string {
  return 主题表[theme.value]?.scrim ?? 主题表.dark.scrim;
}

/** 面板圆角: 与 --bf-radius-xl 同源; 窄屏为 0 */
function 面板圆角(): number {
  if (viewportW() <= 800) return 0;
  const 值 = parseFloat(主题表[theme.value].radiusXl);
  return Number.isFinite(值) ? 值 : 0;
}

/** 遮罩 = 四块边带 + 四块圆角补丁, 中间留出面板 */
function 置遮罩(显示: boolean): void {
  const doc = parentWin.value?.document;
  if (!doc) return;
  if (!显示) {
    [...遮罩块, ...圆角块].forEach(el => (el.style.display = 'none'));
    置状态('');
    return;
  }
  if (!遮罩容器 || !遮罩容器.isConnected) {
    遮罩容器?.remove();
    遮罩容器 = doc.getElementById(DIM_ID) as HTMLElement | null;
    if (!遮罩容器) {
      遮罩容器 = doc.createElement('div');
      遮罩容器.id = DIM_ID;
      doc.body.appendChild(遮罩容器);
    }
    // 容器的内联样式每次重建都重写一遍: 热重载留下的旧容器也能被纠正
    遮罩容器.style.cssText =
      `position:fixed;left:0;top:0;width:100%;height:100%;z-index:${DIM_Z};pointer-events:none;`;
    遮罩容器.textContent = '';
    const 造块 = () => {
      const el = doc.createElement('div');
      el.addEventListener('click', (e: MouseEvent) => {
        // 别让点击继续冒到酒馆页面自己的委托处理器上(有些插件会在 document 上关自己的浮层)
        e.stopPropagation();
        closePanel();
      });
      遮罩容器!.appendChild(el);
      return el;
    };
    遮罩块 = [0, 1, 2, 3].map(造块);
    圆角块 = [0, 1, 2, 3].map(造块);
  }
  const p = 面板矩形();
  const vw = viewportW();
  const vh = viewportH();
  const 底 = `position:fixed;pointer-events:auto;background:${遮罩色()};`;
  const 几何 = [
    { left: 0, top: 0, width: vw, height: Math.max(0, p.y) }, // 上
    { left: 0, top: p.y + p.h, width: vw, height: Math.max(0, vh - (p.y + p.h)) }, // 下
    { left: 0, top: p.y, width: Math.max(0, p.x), height: p.h }, // 左
    { left: p.x + p.w, top: p.y, width: Math.max(0, vw - (p.x + p.w)), height: p.h }, // 右
  ];
  遮罩块.forEach((el, i) => {
    const g = 几何[i];
    el.style.cssText = `${底}left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;`;
  });
  const r = 面板圆角();
  if (r <= 0) {
    // 窄屏(≤800px)面板是整屏、圆角是 0: 这时洞就等于整个视口, 不该再补角
    圆角块.forEach(el => (el.style.display = 'none'));
    return;
  }
  const 角 = [
    { left: p.x, top: p.y, 圆心: '100% 100%' }, // 左上: 圆弧圆心在补丁右下
    { left: p.x + p.w - r, top: p.y, 圆心: '0% 100%' }, // 右上
    { left: p.x, top: p.y + p.h - r, 圆心: '100% 0%' }, // 左下
    { left: p.x + p.w - r, top: p.y + p.h - r, 圆心: '0% 0%' }, // 右下
  ];
  const 色 = 遮罩色();
  圆角块.forEach((el, i) => {
    const c = 角[i];
    el.style.cssText =
      `position:fixed;pointer-events:none;left:${c.left}px;top:${c.top}px;width:${r}px;height:${r}px;` +
      `background:radial-gradient(circle ${r}px at ${c.圆心}, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${r - 1}px, ${色} ${r}px);`;
  });
}

/** 只在面板没打开成功时显示 */
function 置状态(text: string): void {
  const doc = parentWin.value?.document;
  if (!doc) return;
  if (!text) {
    if (状态元素) 状态元素.style.display = 'none';
    return;
  }
  if (!状态元素 || !状态元素.isConnected) {
    状态元素 = doc.getElementById(状态ID) as HTMLElement | null;
    if (!状态元素) {
      状态元素 = doc.createElement('div');
      状态元素.id = 状态ID;
      doc.body.appendChild(状态元素);
    }
  }
  const token = 主题表[theme.value] ?? 主题表.dark;
  状态元素.style.cssText =
    `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:${DIM_Z + 1};` +
    `max-width:min(560px,86vw);padding:12px 16px;border-radius:${token.radiusLg};pointer-events:none;` +
    `background:${token.dangerSoft};border:1px solid ${token.danger};color:${token.danger};` +
    'font:13px/1.7 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;text-align:center;white-space:pre-wrap;';
  状态元素.textContent = text;
  状态元素.style.display = 'block';
}

function 移除遮罩(): void {
  遮罩容器?.remove();
  遮罩容器 = null;
  遮罩块 = [];
  状态元素?.remove();
  状态元素 = null;
}

/** 面板尺寸(不受入场动画影响) */
function 面板尺寸(): { w: number; h: number } | null {
  const el = panelEl.value;
  if (!el) return null;
  return { w: el.offsetWidth, h: el.offsetHeight };
}

/** 统一诊断串: 下一个人报"打不开"时, 这段就是唯一现场 */
function 诊断串(): string {
  const r = 面板尺寸();
  return [
    `构建 ${构建标识}`,
    `样式 ${document.head.querySelectorAll('style').length} 个`,
    `面板元素 ${panelEl.value ? '有' : '没有'}`,
    `面板尺寸 ${r ? `${r.w}×${r.h}` : '—'}`,
    `iframe ${frame.value?.style.width || '?'}×${frame.value?.style.height || '?'}`,
    `视口 ${viewportW()}×${viewportH()}`,
  ].join(' / ');
}

/** 打开看门狗: 面板 1.8s 还没上屏就自己收回去, 并把诊断留在屏幕中央。
 *  没有这条, "面板没画出来"就是一个死局 —— iframe 铺满整屏且吃点击, 用户只能刷新页面。 */
let 看门狗: number | null = null;
function 关闭看门狗(): void {
  if (看门狗 !== null) {
    window.clearTimeout(看门狗);
    看门狗 = null;
  }
}
function 开始看门狗(): void {
  关闭看门狗();
  看门狗 = window.setTimeout(() => {
    看门狗 = null;
    if (!panelOpen.value) return;
    const r = 面板尺寸();
    if (r && r.w > 0 && r.h > 0) return; // 面板确实上屏了
    const 诊断 = 诊断串();
    panelOpen.value = false;
    applyFrame();
    console.warn('[彼方] 面板没能显示出来, 已自动收起。诊断:', 诊断);
    toastError('彼方面板没能显示出来，已自动收起（诊断见日志页/控制台）');
    // 收面板会触发一次遮罩清理(它顺手清掉状态字), 所以这段话得等那一轮 watcher 跑完再写 ——
    // 否则它刚写上去就被自己的收尾逻辑关掉了(2026-10-26 真机连这个都踩到)。
    void nextTick(() => {
      置状态(`彼方的面板没能显示出来（已自动收起）。\n${诊断}\n这段文字可以直接截图发给作者。`);
      window.setTimeout(() => 置状态(''), 8000);
    });
  }, 1800);
}

/** 脚本按钮的入口: 由 host.script 的按钮点击经挂载器转过来(挂在 frameWin 上) */
function 打开面板入口() {
  展开面板('脚本按钮');
}

/** 统一的展开入口: 同步打一行日志, nextTick 再报尺寸 */
function 展开面板(来源: string): void {
  const t0 = performance.now();
  panelOpen.value = true;
  记视口尺寸();
  console.info(`[彼方] 点开面板(${来源}, 构建 ${构建标识})`);
  applyFrame();
  void nextTick(() => {
    const r = 面板尺寸();
    const ms = Math.round(performance.now() - t0);
    if (r && r.w > 0 && r.h > 0) {
      console.info(`[彼方] 面板已展开(${来源}, ${ms}ms, ${r.w}×${r.h})`);
      置状态('');
    }
    else {
      console.warn(`[彼方] 面板已打开但没上屏(${来源}, ${ms}ms)。诊断:`, 诊断串());
      置状态(`彼方已经打开，但面板没显示出来…\n${诊断串()}`);
    }
  });
}

/** 渲染期抛错(数据形状异常/模板访问越界)不该变成"白屏 + 整屏点不动":
 *  记完整错误、把面板收起来、把原因留在屏幕中央。 */
onErrorCaptured((error, _instance, info) => {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[彼方] 界面渲染出错(${info}), 面板已收起:`, error);
  // 先把 tab 退回仪表盘再收面板: 坏掉的常常只是某一个页面(如"事实档案"里某个字段),
  // 停在那一页会让"重开面板"每次都炸在同一处 —— 用户看到的就是"整个面板打不开了"。
  tab.value = 'dashboard';
  panelOpen.value = false;
  applyFrame();
  toastError('彼方界面渲染出错，面板已收起（详见控制台）');
  // 同上: 收面板那一轮 watcher 会清状态字, 所以这段话要等它跑完再写
  void nextTick(() =>
    置状态(`彼方的界面渲染出错，面板已收起。\n${info}\n${text}\n这段文字可以直接截图发给作者。`),
  );
  return false; // 不再往上冒, 免得同一个错误刷满控制台
});

watch(panelOpen, open => {
  置遮罩(open);
  if (open) 开始看门狗();
  else 关闭看门狗();
});

function fmtTime(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : '';
}

async function copyText(text: string) {
  // iframe 内 navigator.clipboard 常被权限策略禁用，优先用父窗口的剪贴板
  const clipboard = parentWin.value?.navigator.clipboard ?? navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      toastSuccess('已复制到剪贴板');
      return;
    } catch {
      // 继续走兜底
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    if (ok) {
      toastSuccess('已复制到剪贴板');
      return;
    }
  } catch {
    // 忽略
  }
  toastError('复制失败，请手动选中复制');
}

function buildErrorReport(): string {
  const log = debugLog.value;
  if (!log) return '';
  return [
    '【彼方 · 报错报告】',
    `时间: ${fmtTime(log.time)}`,
    `模型: ${log.model || '—'}`,
    `使用的楼层: #${log.replyIds.length > 0 ? log.replyIds.join('、#') : '—'}`,
    `本轮更新NPC: ${log.updatedNpcs.join('、') || '—'}`,
    log.error ? `错误: ${log.error}` : '',
    '',
    '--- 发送给 AI 的内容 ---',
    log.request,
    '',
    '--- AI 输出内容 ---',
    log.response || '(无输出)',
  ]
    .filter(line => line !== '')
    .join('\n');
}

async function copyErrorReport() {
  // 空日志时按钮已禁用, 但快捷键/程序调用也可能走到这里: 空串复制过去只会提示"已复制"
  const 报告 = buildErrorReport();
  if (!报告.trim()) {
    toastWarning('还没有可复制的日志(先跑一次更新)');
    return;
  }
  await copyText(报告);
}

async function loadModels() {
  if (!settings.value.接口.地址) {
    toastWarning('请先填写接口地址');
    return;
  }
  fetchingModels.value = true;
  try {
    const list = await fetchModelList(host);
    settings.value.接口.模型列表 = list;
    // 只在"还没选模型"时才自动填第一个: 手填的名字本来就不在列表里是正常情况
    // (有的接口没有 /models 端点), 不能被拉取结果静默覆盖掉。
    if (!settings.value.接口.模型) {
      settings.value.接口.模型 = list[0] ?? '';
    }
    if (list.length === 0) {
      // 空列表不是"地址/密钥一定错"(见页面-设置 的说明), 但也不能报成功让人误判
      toastWarning('这个接口没返回模型列表, 请直接手填模型名, 再用「测试连接」实测');
      return;
    }
    toastSuccess(`获取到 ${list.length} 个模型`);
  } catch (error) {
    console.error('[彼方] 获取模型列表失败:', error);
    toastError(
      `${error instanceof Error ? error.message : String(error)}\n拉不到列表不代表接口不能用——可直接手填模型名, 再用「测试连接」实测`,
      '彼方·获取模型失败',
    );
  } finally {
    fetchingModels.value = false;
  }
}

async function testConnection() {
  if (!settings.value.接口.地址 || !settings.value.接口.模型) {
    toastWarning('请先填写接口地址并选择模型');
    return;
  }
  testing.value = true;
  try {
    const reply = await chatCompletion(host, [{ role: 'user', content: '请只回复两个字: 正常' }], { max_tokens: 16 });
    toastSuccess(`连接正常, 模型回复: ${reply.trim().slice(0, 50)}`);
  } catch (error) {
    console.error('[彼方] 测试连接失败:', error);
    toastError(error instanceof Error ? error.message : String(error), '彼方·测试失败');
  } finally {
    testing.value = false;
  }
}

async function manualUpdate() {
  if (!settings.value.启用幕后) {
    toastWarning('幕后系统已关闭(设置→启用幕后), 如需更新请先开启');
    return;
  }
  await updateNpcStates(host, true);
}

function reload() {
  stateStore.reload(host);
}

const clearing = ref(false);
/** 「再点一次确认清空」的确认窗口定时器: 确认或重新计时前必须先清掉旧的——
 *  否则上一次的定时器会在新确认窗口中途把 clearing 提前复位, 玩家第二次点击就变成"重新计时"而不是清空 */
let clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;

function clearAll() {
  if (!clearing.value) {
    clearing.value = true;
    if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(() => {
      clearing.value = false;
    }, 3000);
    return;
  }
  clearing.value = false;
  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
  // 清空 = 物理删除所有楼层的快照 + 重置元数据(记录清空层) + 删掉世界书条目——协议在 数据变更.ts;
  // 这里不再重读存储做启发式校验(持久层自己负责正确性)。
  // 失败时绝不能弹"已清空": 数据还在, 玩家以为清了就不会再备份。
  const 结果 = 清空彼方数据(data.value, 建变更环境(host));
  if (结果.失败) {
    toastWarning(结果.说明);
    return;
  }
  toastSuccess(结果.说明);
}

// 数据备份: 导出成一段可粘贴的文本(复制到剪贴板), 导入时走同一条保存通道。
// 为什么要有它: 状态只活在楼层变量里, 一次大范围删楼(/cut、批量删)就是净损失, 没有任何抓手。
const 导入文本 = ref('');
async function 导出备份() {
  await copyText(导出数据(data.value));
  toastSuccess('已复制当前数据(粘贴到任何地方存起来)');
}
function 导入备份() {
  const 结果 = 导入数据(导入文本.value, data.value, 建变更环境(host));
  if (结果.数据 === data.value) {
    toastWarning(结果.说明);
    return;
  }
  导入文本.value = '';
  toastSuccess(结果.说明);
}
// 人物页: 编辑会话与台账动作都在 NPC面板.ts, 壳只把「谁被选中」和变更环境接进去。
provide(NPC面板键, 建NPC面板({
  数据: data,
  选中的人: selectedNpc,
  选中卡: selectedNpcCard,
  更新中: updating,
  自动建档: autoTrackEnabled,
  头像色号,
  fmtTime,
  建变更: () => 建变更环境(host),
  切换恋爱对象,
}));

// 事实档案页: 走**自己的窄接口**(见 一致性面板.ts), 不再从下面那个大对象里取。
provide(一致性面板键, 建一致性面板({ 数据: data, 去人物页: openNpc, 头像色号 }));

// 其余三页各有一份自己的窄接口(见 仪表盘面板.ts / 日志面板.ts / 设置面板.ts)。
// 五个 provide 都放在脚本末尾: 它们引用的绑定必须在执行前完成初始化。
provide(仪表盘面板键, 建仪表盘面板({
  数据: data,
  更新中: updating,
  自动建档: autoTrackEnabled,
  头像色号,
  newNpcName,
  openAddDialog,
  removeNpc,
  openNpc,
  manualUpdate,
  reload,
  clearAll,
  clearing,
}));

provide(日志面板键, 建日志面板({
  debugLog,
  debugStore,
  mainPrompt,
  mainPromptTime,
  mainPromptCount,
  consoleLines,
  consoleStore,
  fmtTime,
  copyText,
  copyErrorReport,
}));

provide(设置面板键, 建设置面板({
  清空生理数据: () => {
    const 结果 = 清空生理数据(data.value, 建变更环境(host));
    if (结果.失败) {
      toastWarning(结果.说明, '彼方');
      return;
    }
    toastSuccess('彼方: ' + 结果.说明, '彼方');
  },
  settings,
  showKey,
  模型候选开,
  选模型,
  fetchingModels,
  testing,
  loadModels,
  testConnection,
  presetName,
  selectedPreset,
  saveApiPreset,
  loadApiPreset,
  deleteApiPreset,
  tagDraft,
  worldbookAlwaysDraft,
  worldbookExcludeDraft,
  导出数据: 导出备份,
  导入数据: 导入备份,
  导入文本,
}));
</script>

<style src="./面板样式.css"></style>



