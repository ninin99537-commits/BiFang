<template>
  <div class="w-label" :style="styleObj">
    <span v-if="widget.label" class="w-label-title" :style="titleStyle">{{ widget.label }}</span>
    <div class="w-label-fields" :class="[fieldsClass, 'align-' + style.align, 'valign-' + (style.alignV || 'center')]" :style="fieldsStyle">
      <template v-if="entries.length > 1">
        <span v-for="(e, i) in entries" :key="i" class="w-label-item" :class="[fieldsClass, 'valign-' + (style.alignV || 'center')]" :style="i > 0 && fieldsNegMargin ? fieldsNegMargin : undefined">
          <span v-if="e.name" class="w-label-sub" :title="e.name">{{ e.name }}</span>
          <ExpandableParts
            :parts="partsOf(e.value)"
            :style-obj="style"
            :layout="fieldsClass"
            :align="style.align"
            :align-v="style.alignV"
          />
        </span>
      </template>
      <ExpandableParts
        v-else
        :parts="singleParts"
        :style-obj="style"
        :layout="fieldsClass"
        :align="style.align"
        :align-v="style.alignV"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Widget } from '../schema';
import { displayParts } from '../lib/datasource';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, labelCss } from '../lib/style';
import ExpandableParts from './ExpandableParts.vue';

const props = defineProps<{ widget: Widget; value?: any }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const entries = computed(() => {
  void store.dataTick;
  return store.widgetEntries(props.widget);
});
const singleParts = computed(() => displayParts(props.value ?? entries.value[0]?.value));
function partsOf(v: any) {
  return displayParts(v);
}
const fieldsClass = computed(() => (style.value.fieldsLayout === 'inline' ? 'inline' : 'stack'));
const fieldsGap = computed(() => (style.value.fieldsGap ?? 6));
const fieldsStyle = computed(() => fieldsGap.value >= 0 ? { gap: fieldsGap.value + 'px' } : { gap: '0px' });
const fieldsNegMargin = computed(() => {
  const g = fieldsGap.value;
  if (g >= 0) return null;
  return style.value.fieldsLayout === 'inline' ? { marginLeft: g + 'px' } : { marginTop: g + 'px' };
});
const styleObj = computed(() => ({
  ...baseWidgetCss(style.value),
  display: 'flex',
  gap: '4px 8px',
}) as Record<string, string | undefined>);
const titleStyle = computed(() => labelCss(style.value));
</script>

<style scoped>
.w-label {
  word-break: break-word;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
}
.w-label-title {
  opacity: 0.9;
  /* 可让位给数据区，避免窄列只剩标题、数值完全消失 */
  flex: 0 1 auto;
  width: auto;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.w-label-fields {
  display: flex;
  /* 数据区不可压到 0：窄屏/侧栏打开时至少留可见宽度 */
  min-width: 3.5em;
  max-width: 100%;
  gap: 6px 10px;
  flex: 1 1 auto;
  align-items: center;
  overflow: hidden;
}
.w-label-fields.stack {
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: flex-start;
  /* 在横排容器内把数据区撑满整列高度，再按 alignV 居中短 chip */
  align-self: stretch;
}
.w-label-fields.stack.valign-center {
  justify-content: center;
}
.w-label-fields.stack.valign-top {
  justify-content: flex-start;
}
.w-label-fields.stack.valign-bottom {
  justify-content: flex-end;
}
.w-label-fields.inline {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}
.w-label-fields.align-center {
  justify-content: center;
  text-align: center;
}
.w-label-fields.align-center.stack {
  align-items: center;
}
.w-label-fields.align-right {
  justify-content: flex-end;
  text-align: right;
}
.w-label-fields.align-right.stack {
  align-items: flex-end;
}
.w-label-fields.align-left {
  justify-content: flex-start;
  text-align: left;
}
.w-label-item {
  display: flex;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  overflow: hidden;
}
.w-label-item :deep(.w-expand),
.w-label-fields > :deep(.w-expand) {
  min-width: 0;
  max-width: 100%;
  width: 100%;
  flex: 1 1 auto;
}
.w-label-item.stack {
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  align-items: inherit;
}
.w-label-item.stack.valign-center {
  justify-content: center;
}
.w-label-item.stack.valign-top {
  justify-content: flex-start;
}
.w-label-item.stack.valign-bottom {
  justify-content: flex-end;
}
.w-label-item.inline {
  flex-direction: row;
  align-items: center;
  flex: 0 1 auto;
}
.w-label-sub {
  opacity: 0.75;
  font-size: 0.9em;
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.w-label-item.inline .w-label-sub {
  flex: 0 1 auto;
  max-width: min(70%, 12em);
}
</style>
