<template>
  <div class="cp" ref="rootEl">
    <button
      type="button"
      class="cp-swatch"
      :style="{ background: swatchBg }"
      :title="modelValue || '选择颜色'"
      @click.stop="toggle"
    />
    <Teleport :to="teleportTarget" :disabled="!canTeleport">
      <div
        v-if="open"
        ref="popEl"
        class="cp-pop"
        :style="popStyle"
        @click.stop
      >
        <div class="cp-row">
          <span class="cp-label">当前</span>
          <div class="cp-preview" :style="{ background: swatchBg }"></div>
          <input
            class="cp-hex"
            :value="hexDraft"
            @input="onHexInput"
            @change="commitHex"
            spellcheck="false"
            placeholder="#rrggbb"
          />
        </div>
        <div class="cp-row native-row">
          <span class="cp-label">取色</span>
          <input
            type="color"
            class="cp-native"
            :value="nativeHex"
            @input="onNative"
          />
          <button v-if="allowTransparent" type="button" class="cp-chip" @click="setTransparent">透明</button>
          <button v-if="allowEmpty" type="button" class="cp-chip" @click="setEmpty">{{ emptyLabel }}</button>
        </div>
        <div class="cp-row" v-if="!isSpecial || (modelValue && modelValue !== 'transparent')">
          <span class="cp-label">透明</span>
          <input
            type="range"
            class="cp-alpha"
            min="0"
            max="1"
            step="0.01"
            :value="alphaVal"
            @input="onAlpha"
          />
          <span class="cp-alpha-val">{{ Math.round(alphaVal * 100) }}%</span>
        </div>
        <div class="cp-palette">
          <button
            v-for="c in palette"
            :key="c"
            type="button"
            class="cp-dot"
            :class="{ on: isActive(c) }"
            :style="{ background: c }"
            :title="c"
            @click="pick(c)"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { toColorInput, parseColor, isDarkColor, withOpacity } from '../schema';
import { useConfigStore } from '../store';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    allowTransparent?: boolean;
    allowEmpty?: boolean;
    emptyLabel?: string;
    fallback?: string;
  }>(),
  {
    allowTransparent: false,
    allowEmpty: false,
    emptyLabel: '跟随',
    fallback: '#7ec9b8',
  },
);

const store = useConfigStore();

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const popEl = ref<HTMLElement | null>(null);
const hexDraft = ref('');
const popStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  zIndex: '10050',
});

/**
 * 脚本运行在 iframe 内，但状态栏挂载到酒馆主页面（window.parent）。
 * Teleport 到「宿主文档」的 body，否则会传进看不见的 iframe body。
 * 若取不到宿主（同域），回退到当前 body。
 */
function pickHostDoc(): Document {
  try {
    const w: any = window;
    const parent = w.parent;
    if (parent && parent.document && parent.document.body) {
      // 确认可访问（跨域会抛错）
      void parent.document.body.nodeType;
      return parent.document as Document;
    }
  } catch {
    /* 跨域，回退 */
  }
  return document;
}
const hostDoc = pickHostDoc();
const teleportTarget = computed(() => hostDoc.body as HTMLElement);
// 同域宿主时启用 Teleport；跨域 fallback 时挂回当前组件位置
const canTeleport = computed(() => hostDoc !== document || !!hostDoc.body);

/**
 * 弹窗被 Teleport 到宿主 body（主页面），其定位坐标系也是宿主窗口的 viewport。
 * 但脚本本身在 iframe 里运行：window.innerWidth/Height 是 iframe 尺寸，
 * 滚动事件默认监听的是 iframe 的 window/scroller，都会与弹窗实际坐标错位。
 * 因此这里统一用「宿主窗口」做布局与滚动/resize 监听。
 */
const hostWin: Window =
  hostDoc !== document
    ? (() => {
        try {
          // 跨域访问 .defaultView 可能抛错，再 try 一下
          return hostDoc.defaultView || window;
        } catch {
          return window;
        }
      })()
    : window;

const PALETTE_LIGHT = [
  /* 晨雾桃青主序 */
  '#f5f9f7', '#eef5f2', '#e4f0eb', '#c5ddd4', '#5fad9c', '#3d8a7a',
  '#2c4a42', '#4a7a6e', '#6b8f86', '#e8b4a0', '#f0d0c4', '#ffffff',
  /* 中性 + 点缀 */
  '#f8faf9', '#e5e9e7', '#9ca8a4', '#6b7280', '#374151', '#111827',
  '#fdf4f2', '#f5cfc8', '#e8a090', '#c45c5c', '#8b3a3a', '#5c2020',
  '#eef4fa', '#c8ddf0', '#8eb8dc', '#5a8fbf', '#2f5f8a', '#1a3a5c',
  '#faf3e8', '#f0dfb8', '#e0c070', '#b8923a', '#7a5e20', '#4a3810',
  '#eef8f2', '#b8e6ce', '#6dcc9e', '#3d9a72', '#246b4c', '#144030',
  '#f6f0fa', '#e0d0f0', '#b898d8', '#8a64b8', '#5a3d80', '#35204a',
];

const PALETTE_DARK = [
  /* 雾夜青主序 */
  '#161c24', '#1a222c', '#1f2833', '#252d38', '#3a4d5c', '#4a6270',
  '#e4eef2', '#c5d8e0', '#b4c9d2', '#94aab4', '#7ec9b8', '#8ec5d8',
  '#0e141c', '#1f2833', '#2f4a52', '#5a7a84', '#a8bcc6', '#eef6f8',
  /* 点缀：珊瑚 / 雾蓝 / 蜜杏 / 紫雾 */
  '#3a2428', '#4a3034', '#8a4a4a', '#c07070', '#f5a8a8', '#fde8e8',
  '#1a2838', '#2a4058', '#4a7090', '#7aabcc', '#b0d0e4', '#e4f0f8',
  '#2a2418', '#4a3c20', '#8a7030', '#c4a050', '#e8d090', '#f8f0d8',
  '#142820', '#1e4034', '#3a7a62', '#5fad9c', '#a0d8c8', '#d8f0e8',
  '#221a30', '#3a2a50', '#6a4a90', '#9a78c0', '#c8b0e0', '#f0e8f8',
];

/** 色板主序跟随全局主题明暗（可在「全局 → 颜色」切换） */
const palette = computed(() => {
  const dark = isDarkColor(store.config.layout.bg);
  return dark
    ? [...PALETTE_DARK, ...PALETTE_LIGHT.slice(0, 12)]
    : [...PALETTE_LIGHT, ...PALETTE_DARK.slice(0, 12)];
});

const isSpecial = computed(() => {
  const v = (props.modelValue || '').trim();
  return v === 'transparent' || v === 'inherit' || v === '';
});

const nativeHex = computed(() => {
  if (isSpecial.value) return toColorInput(props.fallback);
  return toColorInput(props.modelValue || props.fallback);
});

const alphaVal = computed(() => {
  if (isSpecial.value) return 1;
  const p = parseColor(props.modelValue || props.fallback);
  return p ? Math.max(0, Math.min(1, p.a)) : 1;
});

const swatchBg = computed(() => {
  const v = (props.modelValue || '').trim();
  if (v === 'transparent') {
    return 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px';
  }
  if (!v || v === 'inherit') return props.fallback;
  return v;
});

watch(
  () => props.modelValue,
  v => {
    const t = (v || '').trim();
    if (t === 'transparent') hexDraft.value = 'transparent';
    else if (!t || t === 'inherit') hexDraft.value = '';
    else hexDraft.value = toColorInput(t);
  },
  { immediate: true },
);

/**
 * 取色弹层 Teleport 到宿主 body，脱离编辑器 DOM。
 * 直接按全局布局主题（全局 → 颜色）合成变量，改强调色/背景/文字色会同步到弹层。
 */
function resolvePopTheme(): Record<string, string> {
  const l = store.config.layout;
  const dark = isDarkColor(l.bg);
  const accent = l.accentColor || (dark ? '#7ec9b8' : '#5fad9c');
  const text = l.textColor || (dark ? '#e4eef2' : '#2c4a42');
  const border = l.borderColor || (dark ? '#3a4d5c' : '#c5ddd4');
  const surface = dark ? '#1a222c' : '#fbfdfc';
  const surface2 = dark ? '#222b36' : '#eef5f2';
  const inputBg = dark ? '#1f2833' : '#ffffff';
  const muted = dark ? '#94aab4' : '#6b8f86';
  const sb = l.scrollbarColor || withOpacity(accent, 0.42);
  return {
    '--ep-bg': surface,
    '--ep-bg2': surface2,
    '--ep-border': border,
    '--ep-text': text,
    '--ep-muted': muted,
    '--ep-accent': accent,
    '--ep-input-bg': inputBg,
    '--ep-scrollbar': sb,
    '--dp-bg': surface,
    '--dp-bg3': inputBg,
    '--dp-border': border,
    '--dp-text': text,
    '--dp-muted': muted,
  };
}

function placePop() {
  const anchor = rootEl.value;
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const popW = 240;
  const popH = popEl.value?.offsetHeight || 220;
  const pad = 8;
  // 用宿主窗口的视口尺寸（弹窗已 Teleport 到宿主 body）。
  // iframe 自身尺寸与宿主 viewport 无对应关系，会造成弹窗贴到屏幕最左/顶。
  let vpW = 0;
  let vpH = 0;
  try {
    vpW = hostWin.innerWidth || 0;
    vpH = hostWin.innerHeight || 0;
  } catch {
    /* 跨域读取：回退当前 iframe 视口（虽不精确但不会崩） */
  }
  if (!vpW) vpW = window.innerWidth;
  if (!vpH) vpH = window.innerHeight;
  let top = r.bottom + 6;
  let left = r.left;
  if (top + popH > vpH - pad) {
    top = Math.max(pad, r.top - popH - 6);
  }
  if (left + popW > vpW - pad) {
    left = Math.max(pad, vpW - popW - pad);
  }
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  const theme = resolvePopTheme();
  popStyle.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    zIndex: '10050',
    ...theme,
  };
}

function toggle() {
  open.value = !open.value;
  if (open.value) {
    nextTick(() => {
      placePop();
      // 二次定位：高度测准后再贴边
      requestAnimationFrame(() => placePop());
    });
  }
}

// 弹层打开时主题变更（全局颜色）即时刷新弹层配色
watch(
  () => [
    store.config.layout.bg,
    store.config.layout.textColor,
    store.config.layout.accentColor,
    store.config.layout.borderColor,
    store.config.layout.scrollbarColor,
  ],
  () => {
    if (open.value) placePop();
  },
);

function close() {
  open.value = false;
}
function pick(c: string) {
  emit('update:modelValue', c);
  hexDraft.value = c;
}
function formatColor(p: { r: number; g: number; b: number; a: number }): string {
  if (p.a < 0.999) {
    return `rgba(${Math.round(p.r)}, ${Math.round(p.g)}, ${Math.round(p.b)}, ${Math.round(p.a * 1000) / 1000})`;
  }
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${hex(p.r)}${hex(p.g)}${hex(p.b)}`;
}
function onNative(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  const prev = parseColor(props.modelValue || '');
  const next = parseColor(v);
  if (next && prev && prev.a < 0.999) {
    const out = formatColor({ ...next, a: prev.a });
    emit('update:modelValue', out);
    hexDraft.value = out;
    return;
  }
  emit('update:modelValue', v);
  hexDraft.value = v;
}
function onAlpha(e: Event) {
  const a = Number((e.target as HTMLInputElement).value);
  const base = parseColor(props.modelValue || '') || parseColor(props.fallback);
  if (!base) return;
  const out = formatColor({ ...base, a: Math.max(0, Math.min(1, a)) });
  emit('update:modelValue', out);
  hexDraft.value = out;
}
function onHexInput(e: Event) {
  hexDraft.value = (e.target as HTMLInputElement).value;
}
function commitHex() {
  let v = hexDraft.value.trim();
  if (!v) {
    if (props.allowEmpty) {
      emit('update:modelValue', '');
      return;
    }
    v = props.fallback;
  }
  if (v === 'transparent' && props.allowTransparent) {
    emit('update:modelValue', 'transparent');
    return;
  }
  let tryParse = v;
  if (!tryParse.startsWith('#') && !/^rgba?\(/i.test(tryParse)) tryParse = '#' + tryParse;
  const p = parseColor(tryParse);
  if (p) {
    const out = formatColor(p);
    emit('update:modelValue', out);
    hexDraft.value = out;
  } else {
    hexDraft.value = isSpecial.value ? (props.modelValue || '') : toColorInput(props.modelValue || props.fallback);
  }
}
function setTransparent() {
  emit('update:modelValue', 'transparent');
  hexDraft.value = 'transparent';
}
function setEmpty() {
  emit('update:modelValue', '');
  hexDraft.value = '';
}
function isActive(c: string) {
  return toColorInput(props.modelValue || '') === toColorInput(c);
}

function onDoc(e: MouseEvent) {
  if (!open.value) return;
  const t = e.target as Node;
  if (rootEl.value?.contains(t)) return;
  if (popEl.value?.contains(t)) return;
  close();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
function onReposition() {
  if (open.value) placePop();
}
// 宿主页面 #chat 等是内部滚动容器，window resize/scroll 抓不到；
// 故除了 window 之外，还要绑定 anchor 所有「overflow auto/scroll」的祖先的 scroll，
// 否则弹窗会贴在原位不跟锚点走。
let scrollAncestors: (HTMLElement | Window)[] = [];
function collectScrollAncestors(from: HTMLElement | null): (HTMLElement | Window)[] {
  const list: (HTMLElement | Window)[] = [];
  if (!from) return list;
  let el: HTMLElement | null = from.parentElement;
  const doc = from.ownerDocument || document;
  const hostEl = doc.documentElement;
  let guard = 0;
  while (el && el !== hostEl && guard++ < 64) {
    const cs = getComputedStyle(el);
    const ov = (cs.overflowY || '') + (cs.overflowX || '');
    if (/auto|scroll/.test(ov)) list.push(el);
    el = el.parentElement;
  }
  list.push(hostWin);
  return list;
}
function bindAncestorScrolls() {
  scrollAncestors = collectScrollAncestors(rootEl.value);
  for (const t of scrollAncestors) {
    if (t === hostWin) (t as Window).addEventListener('resize', onReposition as any, true);
    else (t as HTMLElement).addEventListener('scroll', onReposition as any, true);
  }
}
function unbindAncestorScrolls() {
  for (const t of scrollAncestors) {
    try {
      if (t === hostWin) (t as Window).removeEventListener('resize', onReposition as any, true);
      else (t as HTMLElement).removeEventListener('scroll', onReposition as any, true);
    } catch {
      /* ignore cross-iframe teardown */
    }
  }
  scrollAncestors = [];
}

function addListeners(doc: Document) {
  doc.addEventListener('mousedown', onDoc, true);
  doc.addEventListener('keydown', onKey, true);
}
function removeListeners(doc: Document) {
  doc.removeEventListener('mousedown', onDoc, true);
  doc.removeEventListener('keydown', onKey, true);
}
onMounted(() => {
  addListeners(hostDoc);
  // iframe 自身也监听 key（焦点可能在 iframe 内）
  addListeners(document);
  bindAncestorScrolls();
});
onBeforeUnmount(() => {
  removeListeners(hostDoc);
  removeListeners(document);
  unbindAncestorScrolls();
});
</script>

<style scoped>
.cp {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.cp-swatch {
  width: 32px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--ep-border, var(--dp-border, #c5d9d2));
  cursor: pointer;
  padding: 0;
  box-sizing: border-box;
  flex-shrink: 0;
  background-clip: padding-box;
}
</style>

<style>
/* Teleport 到 body，不能用 scoped 父选择器依赖 */
.cp-pop {
  width: 240px;
  padding: 10px;
  border-radius: 12px;
  background: var(--ep-bg, var(--dp-bg, #1a222c));
  color: var(--ep-text, var(--dp-text, #e4eef2));
  border: 1px solid var(--ep-border, var(--dp-border, #3a4d5c));
  box-shadow: 0 10px 28px rgba(47, 74, 67, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
}
.cp-pop .cp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.cp-pop .cp-label {
  font-size: 11px;
  color: var(--ep-muted, var(--dp-muted, #94aab4));
  width: 28px;
  flex-shrink: 0;
}
.cp-pop .cp-preview {
  width: 28px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--ep-border, #3a4d5c);
  flex-shrink: 0;
}
.cp-pop .cp-hex {
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--ep-border, #3a4d5c);
  background: var(--ep-input-bg, var(--dp-bg3, #1f2833));
  color: var(--ep-text, #e4eef2);
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
}
.cp-pop .cp-native {
  width: 36px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--ep-border, #3a4d5c);
  border-radius: 4px;
  background: var(--ep-input-bg, #1f2833);
  cursor: pointer;
}
.cp-pop .cp-alpha {
  flex: 1;
  min-width: 0;
  height: 4px !important;
  margin: 7px 0 !important;
  padding: 0 !important;
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  appearance: none !important;
  background: var(--ep-range-track, var(--ep-scrollbar, rgba(125, 182, 170, 0.35))) !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  outline: 0 none transparent !important;
  box-shadow: none !important;
  cursor: pointer;
  accent-color: var(--ep-range-thumb, var(--ep-accent, #7ec9b8));
}
.cp-pop .cp-alpha:focus,
.cp-pop .cp-alpha:active {
  border: 0 none transparent !important;
  outline: 0 none transparent !important;
  box-shadow: none !important;
}
.cp-pop .cp-alpha::-webkit-slider-runnable-track {
  height: 4px !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
}
.cp-pop .cp-alpha::-webkit-slider-thumb {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 14px !important;
  height: 14px !important;
  margin-top: -5px !important;
  border: 0 none transparent !important;
  border-radius: 50% !important;
  background: var(--ep-range-thumb, var(--ep-accent, #7ec9b8)) !important;
  box-shadow: none !important;
  cursor: pointer;
}
.cp-pop .cp-alpha::-moz-range-track {
  height: 4px !important;
  border: 0 none transparent !important;
  border-radius: 999px !important;
  background: transparent !important;
  box-shadow: none !important;
}
.cp-pop .cp-alpha::-moz-range-thumb {
  width: 14px !important;
  height: 14px !important;
  border: 0 none transparent !important;
  border-radius: 50% !important;
  background: var(--ep-range-thumb, var(--ep-accent, #7ec9b8)) !important;
  box-shadow: none !important;
  cursor: pointer;
}
.cp-pop .cp-alpha::-moz-focus-outer {
  border: 0 !important;
}
.cp-pop .cp-alpha-val {
  font-size: 11px;
  color: var(--ep-muted, #94aab4);
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
}
.cp-pop .cp-chip {
  border: 1px solid var(--ep-border, #3a4d5c);
  background: var(--ep-bg2, #263238);
  color: var(--ep-text, #e4eef2);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
}
.cp-pop .cp-palette {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ep-scrollbar, rgba(125, 182, 170, 0.45)) transparent;
  padding-top: 2px;
}
.cp-pop .cp-dot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 6px;
  border: 1px solid rgba(127, 140, 141, 0.35);
  cursor: pointer;
  padding: 0;
  box-sizing: border-box;
}
.cp-pop .cp-dot.on {
  outline: 2px solid var(--ep-accent, #7ec9b8);
  outline-offset: 1px;
}
</style>
