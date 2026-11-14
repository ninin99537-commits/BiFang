<template>
  <div class="w-image" :class="{ 'is-stretch': style.imgStretch }" :style="boxStyle">
    <span v-if="widget.label" class="w-image-title" :style="titleStyle">{{ widget.label }}</span>
    <div
      class="w-image-frame"
      :class="['place-' + placeMode, { 'is-clickable': src && !broken }]"
      :style="frameStyle"
      :title="src && !broken ? '点击查看全图' : ''"
      @click="onFrameClick"
    >
      <img
        v-if="src && !broken"
        :src="src"
        :alt="widget.label || widget.name || ''"
        :style="imgStyle"
        @error="onError"
      />
      <span v-else class="w-image-placeholder" :style="placeholderStyle">
        {{ placeholderText }}
      </span>
    </div>
    <ContentModal :open="fullOpen" :title="widget.label || '图片'" :dark="isDark" body-class="is-full-image" @update:open="fullOpen = $event">
      <div class="w-image-full-body">
        <img
          v-if="src"
          :src="src"
          :alt="widget.label || widget.name || ''"
          class="w-image-full-img"
        />
      </div>
    </ContentModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Widget, ImageMapEntry, isDarkColor, resolveImgSrc } from '../schema';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, labelCss } from '../lib/style';
import { getDbValue, getMvuValue } from '../lib/datasource';
import ContentModal from './ContentModal.vue';

const props = defineProps<{ widget: Widget; value?: any }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const isDark = computed(() => isDarkColor(store.config.layout.bg));

const broken = ref(false);
const fullOpen = ref(false);

function valueToString(v: any): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'value' in v) return String((v as any).value ?? '');
  if (Array.isArray(v)) {
    return v
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'value' in item) return String((item as any).value ?? '');
        return '';
      })
      .join(' ');
  }
  if (v == null) return '';
  return String(v);
}

function splitKeys(keys: string): string[] {
  return String(keys || '')
    .replace(/\s*[\/／;；]\s*/g, '、')
    .split(/[、,，]+/)
    .map(k => k.trim())
    .filter(Boolean);
}

const fieldValue = computed<string>(() => {
  void store.dataTick;
  return valueToString(props.value);
});

/**
 * 按字段名取值（db 取列、mvu 取子字段），行号/父级仍跟随控件自身绑定。
 * field 为空时退回控件绑定字段的值（fieldValue）。static 源无其它字段可取。
 */
function fieldText(field: string): string {
  const f = (field || '').trim();
  if (!f) return fieldValue.value;
  const w = props.widget;
  if (w.source === 'db') {
    if (!w.binding?.db_table) return '';
    return valueToString(getDbValue(w.binding.db_table, w.binding.db_row, f));
  }
  if (w.source === 'mvu') {
    if (!w.binding?.mvu_parent) return '';
    return valueToString(getMvuValue(w.binding.mvu_parent, f));
  }
  return fieldValue.value;
}

/**
 * 判定一条 (字段 + 关键词) 子条件是否命中：字段值 contains 任一关键词。
 */
function condMatches(field: string, keysRaw: string): boolean {
  const keys = splitKeys(keysRaw);
  if (keys.length === 0) return true; // 空关键词视为「不限制」，恒真
  const text = fieldText(field);
  return !!text && keys.some(k => text.includes(k));
}

/**
 * 判定一条映射是否整条命中：主条件 + 所有附加条件都须满足（AND）。
 * 留空整条（主关键词为空且无任何附加条件）= 默认兜底，由调用方单独处理。
 */
function entryMatches(entry: ImageMapEntry): boolean {
  if (condMatches(entry.field || '', entry.keys || '') === false) return false;
  for (const c of entry.conds || []) {
    if (condMatches(c.field || '', c.keys || '') === false) return false;
  }
  return true;
}

/** 一条映射是否为「默认兜底」：主关键词留空 且 没有任何带关键词的附加条件 */
function entryIsDefault(entry: ImageMapEntry): boolean {
  if (splitKeys(entry.keys || '').length > 0) return false;
  for (const c of entry.conds || []) {
    if (splitKeys(c.keys || '').length > 0) return false;
  }
  return true;
}

// 原始 src：可能是 base64 / URL / `img:<id>` 图库引用。再过一次 resolveImgSrc 解析图库引用。
const rawSrc = computed<string>(() => {
  void store.dataTick;
  if (props.widget.imageMatchField) {
    const map = props.widget.imageMap || [];
    let fallback = '';
    for (const entry of map) {
      // 默认兜底条目（主关键词空、也无附带关键词的条件）只收集，不参与条件命中
      if (entryIsDefault(entry)) {
        if (fallback === '') fallback = entry.src || '';
        continue;
      }
      if (entryMatches(entry)) {
        return entry.src || '';
      }
    }
    return fallback;
  }
  return fieldValue.value.trim();
});

const src = computed<string>(() =>
  resolveImgSrc(rawSrc.value, store.config.layout.images),
);

const placeholderText = computed(() =>
  broken.value ? '图片加载失败' : src.value ? '' : '未设置图片',
);

watch(src, () => { broken.value = false; });

function onError() { broken.value = true; }
function onFrameClick() {
  if (src.value && !broken.value) fullOpen.value = true;
}
function closeFull() { fullOpen.value = false; }

const placeMode = computed(() => {
  if (style.value.imgStretch) return 'stretch';
  const h = style.value.imgHeight || 'auto';
  if (h === 'auto' && style.value.imgWidth === '100%') return 'stretch';
  return 'inline';
});

const boxStyle = computed(() => {
  const base = baseWidgetCss(style.value) as Record<string, string | undefined>;
  if (!style.value.imgStretch) {
    return { ...base, flexDirection: 'column' } as Record<string, string | undefined>;
  }
  // 与同行控件等高：宽度交给父行（SmartEqualRow）分配，自身只负责填满列高，
  // 不在内联里写 flex/alignSelf，避免覆盖父行计算出的列宽
  return {
    ...base,
    flexDirection: 'column',
    overflow: 'hidden',
  } as Record<string, string | undefined>;
});
const titleStyle = computed(() => labelCss(style.value));

const frameStyle = computed(() => {
  if (style.value.imgStretch) {
    return {
      width: '100%',
      borderRadius: (style.value.imgRadius ?? 8) + 'px',
    } as Record<string, string | undefined>;
  }
  return {
    width: style.value.imgWidth || '100%',
    height: style.value.imgHeight || 'auto',
    borderRadius: (style.value.imgRadius ?? 8) + 'px',
  } as Record<string, string | undefined>;
});
const imgStyle = computed(() => ({
  width: '100%',
  height: '100%',
  objectFit: style.value.imgMode || 'cover',
  borderRadius: 0,
}) as Record<string, string | undefined>);

const placeholderStyle = computed(() => ({
  fontSize: (style.value.fontSize ?? 13) + 'px',
}) as Record<string, string | undefined>);
</script>

<style scoped>
.w-image {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.w-image.is-stretch {
  flex: 1 1 auto;
  align-self: stretch;
  /* 无同行控件时的兜底高度，防止完全看不见 */
  min-height: 64px;
}
.w-image.is-stretch .w-image-frame.place-stretch {
  flex: 1 1 auto;
  width: 100%;
  min-height: 48px;
  position: relative;
}
/* img 绝对定位：不按固有宽高比反向撑高整行，只填 frame */
.w-image.is-stretch .w-image-frame.place-stretch > img,
.w-image.is-stretch .w-image-frame.place-stretch > .w-image-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: inherit;
}
.w-image-title {
  opacity: 0.9;
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-image-frame {
  overflow: hidden;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.08);
  position: relative;
  min-width: 1px;
  min-height: 1px;
}
.w-image-frame.place-stretch {
  width: 100%;
  flex: 1 1 auto;
}
.w-image-frame.place-inline {
  flex: 0 0 auto;
}
img {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
.w-image-frame.is-clickable {
  cursor: zoom-in;
}
.w-image-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  opacity: 0.65;
  text-align: center;
  padding: 4px;
  word-break: break-word;
}
</style>

<style>
/* 全图查看弹层：Teleport 到 .sb-root / 宿主 body，不能用 scoped */
.w-image-full {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.78);
  cursor: zoom-out;
  padding: 24px;
  box-sizing: border-box;
}
.w-image-full-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
  cursor: zoom-in;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: auto;
}
.w-image-full-close {
  position: fixed;
  top: 16px;
  right: 20px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.w-image-full-close:hover {
  background: rgba(255, 255, 255, 0.3);
}
.w-image-full.dark .w-image-full-close {
  background: rgba(255, 255, 255, 0.2);
}
</style>
