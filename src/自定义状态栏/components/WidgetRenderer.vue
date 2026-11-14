<template>
  <div
    ref="rootRef"
    class="w-renderer"
    :class="{ 'is-clickable': canPeek && isTruncated }"
    @click="onRendererClick"
    tabindex="-1"
  >
    <WidgetLabel v-if="widget.type === 'label'" :widget="displayWidget" :value="value" />
    <WidgetBar v-else-if="widget.type === 'bar'" :widget="displayWidget" :value="value" />
    <WidgetKV v-else-if="widget.type === 'kv'" :widget="displayWidget" :value="value" />
    <WidgetList v-else-if="widget.type === 'list'" :widget="displayWidget" :value="value" />
    <WidgetDivider v-else-if="widget.type === 'divider'" :widget="widget" />
    <WidgetGroup v-else-if="widget.type === 'group'" :widget="widget" :hide-title="hideTitle" />
    <WidgetStack v-else-if="widget.type === 'stack'" :widget="widget" />
    <WidgetImage v-else-if="widget.type === 'image'" :widget="displayWidget" :value="value" />
    <div v-else>未知控件</div>

    <ContentModal
      :open="peekOpen"
      :title="peekTitle"
      :dark="isDark"
      @update:open="peekOpen = $event"
    >
      <component
        :is="previewComponent"
        v-if="previewComponent && peekOpen"
        :widget="widget"
        :value="value"
      />
    </ContentModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineAsyncComponent, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { Widget, isDarkColor } from '../schema';
import { useConfigStore } from '../store';
import { storeToRefs } from 'pinia';
import WidgetLabel from './WidgetLabel.vue';
import WidgetBar from './WidgetBar.vue';
import WidgetKV from './WidgetKV.vue';
import WidgetList from './WidgetList.vue';
import WidgetDivider from './WidgetDivider.vue';
import WidgetGroup from './WidgetGroup.vue';
import WidgetImage from './WidgetImage.vue';
import ContentModal from './ContentModal.vue';

/** 异步加载，打断 WidgetRenderer ↔ WidgetStack 循环依赖 */
const WidgetStack = defineAsyncComponent(() => import('./WidgetStack.vue'));

/** 仅文本类控件可点开展开完整内容（进度/分组/分隔/叠放不弹） */
const PEEKABLE = new Set(['label', 'kv', 'list']);

const props = withDefaults(defineProps<{ widget: Widget; hideTitle?: boolean }>(), {
  hideTitle: false,
});
const store = useConfigStore();
const { dataTick } = storeToRefs(store);
const isDark = computed(() => isDarkColor(store.config.layout.bg));
/** 隐藏标题时：label/kv/list/bar 清空 label，避免与页签重复 */
const displayWidget = computed(() => {
  if (!props.hideTitle || !props.widget.label) return props.widget;
  return { ...props.widget, label: '' };
});
const value = computed(() => {
  void dataTick.value;
  return store.widgetValue(props.widget);
});

const rootRef = ref<HTMLElement | null>(null);
const peekOpen = ref(false);
const isTruncated = ref(false);
const canPeek = computed(() => PEEKABLE.has(props.widget.type));
const peekTitle = computed(() => props.widget.label || '完整内容');
let ro: ResizeObserver | null = null;
let checkRaf = 0;

const previewComponent = computed(() => {
  switch (props.widget.type) {
    case 'label':
      return WidgetLabel;
    case 'kv':
      return WidgetKV;
    case 'list':
      return WidgetList;
    default:
      return null;
  }
});

/** 检测节点或其子树是否存在文本/内容被 ellipsis 截断 */
function isTruncatedEl(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  if (el.scrollHeight > el.clientHeight + 1) return true;
  return false;
}

function hasTruncatedText(root: HTMLElement): boolean {
  const candidates = root.querySelectorAll(
    '.w-chip, .w-label-sub, .w-kv-sub, .w-list-item, .w-expand, .w-label-fields, .w-kv-fields, .w-list-body',
  );
  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    if (node instanceof HTMLElement && isTruncatedEl(node)) return true;
  }
  if (isTruncatedEl(root)) return true;
  return false;
}

function checkTruncation() {
  if (!canPeek.value) {
    isTruncated.value = false;
    return;
  }
  const root = rootRef.value;
  if (!root) {
    isTruncated.value = false;
    return;
  }
  isTruncated.value = hasTruncatedText(root);
}

function scheduleCheck() {
  cancelAnimationFrame(checkRaf);
  checkRaf = requestAnimationFrame(() => {
    nextTick(() => checkTruncation());
  });
}

function onRendererClick(e: MouseEvent) {
  if (!canPeek.value) return;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button, a, select, input, .sb-cell-placeholder')) return;
  if (
    t?.closest?.(
      '.sb-root.has-layout, .sb-root.has-editor, .sb-cell.layout-cell, .sg-cell, .ep-drawer, .sb-layout-chip, .w-stack-header, .w-stack-nav, .w-stack-tab',
    )
  ) {
    return;
  }
  const root = (e.currentTarget as HTMLElement | null) || rootRef.value;
  if (!root || !hasTruncatedText(root)) return;
  peekOpen.value = true;
}

onMounted(() => {
  const root = rootRef.value;
  if (root && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => scheduleCheck());
    ro.observe(root);
  }
  scheduleCheck();
  window.setTimeout(() => scheduleCheck(), 120);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(checkRaf);
  ro?.disconnect();
});

watch(
  () => [dataTick.value, props.widget.id, props.widget.label, props.widget.type, value.value] as const,
  () => scheduleCheck(),
  { flush: 'post' },
);
</script>

<style scoped>
.w-renderer {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  outline: none;
  display: flex;
  flex-direction: column;
  align-self: stretch;
}
.w-renderer > :deep(*) {
  width: 100%;
  min-width: 0;
}
/* 文本类控件撑满行高，便于按 alignV 垂直居中短 chip（加边框后高度才不至于顶对齐偏上） */
.w-renderer > :deep(.w-label),
.w-renderer > :deep(.w-kv),
.w-renderer > :deep(.w-list) {
  flex: 1 1 auto;
  min-height: 0;
}
/* 图片撑满行高：renderer 与子项一起吃满 flex/grid 行高 */
.w-renderer:has(.w-image.is-stretch) {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
.w-renderer:has(.w-image.is-stretch) > :deep(.w-image.is-stretch) {
  flex: 1 1 auto;
  min-height: 0;
  align-self: stretch;
}
.w-renderer.is-clickable {
  cursor: zoom-in;
}
</style>
