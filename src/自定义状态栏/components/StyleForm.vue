<template>
  <div class="sf-form-wrap">
    <details class="sf-sec" open v-if="hasSection('text')">
      <summary class="sf-sec-sum">文字</summary>
      <div class="sf-form">
        <template v-if="show('color')">
        <label>文字色</label>
        <ColorPicker v-model="styleObj.color" />
        <span class="sf-val muted">{{ styleObj.color }}</span>
        </template>

        <template v-if="show('colorOpacity')">
        <label>文字透明</label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="styleObj.colorOpacity" />
        <span class="sf-val">{{ Math.round((styleObj.colorOpacity ?? 1) * 100) }}%</span>
        </template>

        <template v-if="show('font')">
        <label>字体</label>
        <select v-model="styleObj.font" class="sf-span2">
          <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
        </template>

        <template v-if="show('fontSize')">
        <label>字号</label>
        <input type="range" min="10" max="28" v-model.number="styleObj.fontSize" />
        <span class="sf-val">{{ styleObj.fontSize }}px</span>
        </template>

        <template v-if="show('bold')">
        <label>内容加粗</label>
        <input type="checkbox" v-model="styleObj.bold" />
        <span></span>
        </template>

        <template v-if="show('italic')">
        <label>斜体</label>
        <input type="checkbox" v-model="styleObj.italic" />
        <span></span>
        </template>
      </div>
    </details>

    <details class="sf-sec" v-if="hasSection('label')">
      <summary class="sf-sec-sum">标题</summary>
      <div class="sf-form">
        <template v-if="show('labelBold')">
        <label>标题加粗</label>
        <input type="checkbox" v-model="styleObj.labelBold" />
        <span></span>
        </template>

        <template v-if="show('labelColor')">
        <label>标题色</label>
        <div class="sf-color-row sf-span2">
          <ColorPicker
            :model-value="styleObj.labelColor || styleObj.color"
            allow-empty
            empty-label="跟随"
            @update:model-value="styleObj.labelColor = $event"
          />
          <button type="button" class="sf-chip" @click="styleObj.labelColor = ''">跟随</button>
          <span class="sf-val muted">{{ styleObj.labelColor || '跟随' }}</span>
        </div>
        </template>

        <template v-if="show('labelFontSize')">
        <label>标题字号</label>
        <input type="range" min="0" max="28" v-model.number="styleObj.labelFontSize" />
        <span class="sf-val">{{ styleObj.labelFontSize > 0 ? styleObj.labelFontSize + 'px' : '跟随' }}</span>
        </template>

        <template v-if="show('labelAlign')">
        <label>标题对齐</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.labelAlign === 'left' }" @click="styleObj.labelAlign = 'left'">左</button>
          <button type="button" :class="{ on: styleObj.labelAlign === 'center' }" @click="styleObj.labelAlign = 'center'">中</button>
          <button type="button" :class="{ on: styleObj.labelAlign === 'right' }" @click="styleObj.labelAlign = 'right'">右</button>
        </div>
        </template>

        <template v-if="show('labelAlignV')">
        <label>标题垂直</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.labelAlignV === 'top' }" @click="styleObj.labelAlignV = 'top'">顶</button>
          <button type="button" :class="{ on: styleObj.labelAlignV === 'center' }" @click="styleObj.labelAlignV = 'center'">中</button>
          <button type="button" :class="{ on: styleObj.labelAlignV === 'bottom' }" @click="styleObj.labelAlignV = 'bottom'">底</button>
        </div>
        </template>

        <template v-if="show('direction')">
        <label>标题方向</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.direction === 'row' }" @click="styleObj.direction = 'row'">左右</button>
          <button type="button" :class="{ on: styleObj.direction === 'column' }" @click="styleObj.direction = 'column'">上下</button>
        </div>
        </template>
      </div>
    </details>

    <details class="sf-sec" v-if="hasSection('layout')">
      <summary class="sf-sec-sum">布局与对齐</summary>
      <div class="sf-form">
        <template v-if="show('align')">
        <label>数据对齐</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.align === 'left' }" @click="styleObj.align = 'left'">左</button>
          <button type="button" :class="{ on: styleObj.align === 'center' }" @click="styleObj.align = 'center'">中</button>
          <button type="button" :class="{ on: styleObj.align === 'right' }" @click="styleObj.align = 'right'">右</button>
        </div>
        </template>

        <template v-if="show('alignV')">
        <label>垂直对齐</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.alignV === 'top' }" @click="styleObj.alignV = 'top'">顶</button>
          <button type="button" :class="{ on: styleObj.alignV === 'center' }" @click="styleObj.alignV = 'center'">中</button>
          <button type="button" :class="{ on: styleObj.alignV === 'bottom' }" @click="styleObj.alignV = 'bottom'">底</button>
        </div>
        </template>

        <template v-if="show('padding')">
        <label>内边距</label>
        <input type="range" min="0" max="24" v-model.number="styleObj.padding" />
        <span class="sf-val">{{ styleObj.padding }}px</span>
        </template>

        <template v-if="show('radius')">
        <label>圆角</label>
        <input type="range" min="0" max="24" v-model.number="styleObj.radius" />
        <span class="sf-val">{{ styleObj.radius }}px</span>
        </template>

        <template v-if="show('fieldsLayout')">
        <label>多字段排列</label>
        <div class="sf-seg sf-span2">
          <button type="button" :class="{ on: styleObj.fieldsLayout === 'stack' }" @click="styleObj.fieldsLayout = 'stack'">纵向</button>
          <button type="button" :class="{ on: styleObj.fieldsLayout === 'inline' }" @click="styleObj.fieldsLayout = 'inline'">横向</button>
        </div>
        </template>

        <template v-if="show('fieldsGap')">
        <label>条目间距</label>
        <input type="range" min="-10" max="24" v-model.number="styleObj.fieldsGap" />
        <span class="sf-val">{{ styleObj.fieldsGap ?? 6 }}px</span>
        </template>
      </div>
    </details>

    <details class="sf-sec" v-if="hasSection('bg')">
      <summary class="sf-sec-sum">背景与片段</summary>
      <div class="sf-form">
        <template v-if="show('bg')">
        <label>背景</label>
        <div class="sf-color-row sf-span2">
          <ColorPicker v-model="styleObj.bg" allow-transparent />
          <button type="button" class="sf-chip" @click="styleObj.bg = 'transparent'">透明</button>
        </div>
        </template>

        <template v-if="show('bgOpacity')">
        <label>背景透明</label>
        <input type="range" min="0" max="1" step="0.05" v-model.number="styleObj.bgOpacity" />
        <span class="sf-val">{{ Math.round((styleObj.bgOpacity ?? 1) * 100) }}%</span>
        </template>

        <template v-if="show('chipEnabled')">
        <label>数据边框</label>
        <div class="sf-color-row sf-span2">
          <input
            type="checkbox"
            :checked="styleObj.chipEnabled !== false"
            @change="styleObj.chipEnabled = ($event.target as HTMLInputElement).checked"
            title="短数据片段是否加边框底"
          />
          <span class="sf-val muted">{{ styleObj.chipEnabled === false ? '关' : '开' }}</span>
        </div>
        </template>

        <template v-if="show('chipBorder')">
        <label>边框色</label>
        <div class="sf-color-row sf-span2">
          <ColorPicker
            :model-value="styleObj.chipBorder || styleObj.color"
            allow-empty
            empty-label="跟随"
            @update:model-value="styleObj.chipBorder = $event"
          />
          <button type="button" class="sf-chip" @click="styleObj.chipBorder = ''">跟随</button>
          <button type="button" class="sf-chip" @click="styleObj.chipBorder = 'transparent'">无</button>
          <span class="sf-val muted">{{ chipBorderLabel }}</span>
        </div>
        </template>

        <template v-if="show('chipBg')">
        <label>片段底</label>
        <div class="sf-color-row sf-span2">
          <ColorPicker
            :model-value="styleObj.chipBg || styleObj.color"
            allow-transparent
            allow-empty
            empty-label="跟随"
            @update:model-value="styleObj.chipBg = $event"
          />
          <button type="button" class="sf-chip" @click="styleObj.chipBg = ''">跟随</button>
          <button type="button" class="sf-chip" @click="styleObj.chipBg = 'transparent'">透明</button>
          <span class="sf-val muted">{{ chipBgLabel }}</span>
        </div>
        </template>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { WidgetStyle, WidgetType } from '../schema';
import ColorPicker from './ColorPicker.vue';

const props = defineProps<{ styleObj: WidgetStyle; type: WidgetType }>();

const FONT_OPTIONS = [
  { label: '默认', value: 'inherit' },
  { label: '微软雅黑', value: '"Microsoft YaHei",sans-serif' },
  { label: '宋体', value: '"SimSun",serif' },
  { label: '楷体', value: '"STKaiti","KaiTi",serif' },
  { label: '黑体', value: '"SimHei",sans-serif' },
  { label: '等宽', value: '"Consolas","Microsoft YaHei",monospace' },
];

/**
 * 按控件类型筛选「控件样式」里该显示的字段：
 * 某类型用不到的字段一律不显示，避免给图片调文字色这类无意义项。
 * true = 显示；未列出的类型默认全显示（label/kv/list）。
 */
const SHOW: Record<WidgetType, Record<string, boolean>> = {
  label: {}, // 全显示
  kv: {}, // 全显示
  list: {}, // 全显示
  bar: {
    alignV: false, fieldsLayout: false, fieldsGap: false,
    chipEnabled: false, chipBorder: false, chipBg: false,
  },
  divider: {
    bold: false, italic: false,
    labelBold: false, labelColor: false, labelFontSize: false,
    labelAlign: false, labelAlignV: false, direction: false,
    alignV: false, radius: false, fieldsLayout: false, fieldsGap: false,
    bg: false, bgOpacity: false,
    chipEnabled: false, chipBorder: false, chipBg: false,
  },
  group: {
    alignV: false, fieldsLayout: false, fieldsGap: false,
    chipEnabled: false, chipBorder: false, chipBg: false,
  },
  stack: {
    fontSize: false, bold: false, italic: false,
    align: false, alignV: false, padding: false, radius: false,
    fieldsLayout: false, fieldsGap: false,
    chipEnabled: false, chipBorder: false, chipBg: false,
  },
  image: {
    fontSize: false, bold: false, italic: false,
    align: false, alignV: false, fieldsLayout: false, fieldsGap: false,
    chipEnabled: false, chipBorder: false, chipBg: false,
  },
};
const show = (key: string): boolean => SHOW[props.type]?.[key] !== false;

/** 整个分区若该类型内可用字段为空，则隐藏该 details。 */
const hasSection = (section: string): boolean => {
  const fields: Record<string, string[]> = {
    text: ['color', 'colorOpacity', 'font', 'fontSize', 'bold', 'italic'],
    label: ['labelBold', 'labelColor', 'labelFontSize', 'labelAlign', 'labelAlignV', 'direction'],
    layout: ['align', 'alignV', 'padding', 'radius', 'fieldsLayout', 'fieldsGap'],
    bg: ['bg', 'bgOpacity', 'chipEnabled', 'chipBorder', 'chipBg'],
  };
  return fields[section].some(k => show(k));
};

const chipBorderLabel = computed(() => {
  const v = (props.styleObj.chipBorder || '').trim();
  if (!v) return '跟随';
  if (v === 'transparent' || v === 'none') return '无';
  return v;
});
const chipBgLabel = computed(() => {
  const v = (props.styleObj.chipBg || '').trim();
  if (!v) return '跟随';
  if (v === 'transparent' || v === 'none') return '透明';
  return v;
});
</script>

<style scoped>
.sf-form-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sf-sec {
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 8px;
  background: var(--ep-bg2, rgba(0, 0, 0, 0.02));
  overflow: hidden;
}
.sf-sec-sum {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ep-text, inherit);
  display: flex;
  align-items: center;
  gap: 6px;
}
.sf-sec-sum::-webkit-details-marker {
  display: none;
}
.sf-sec-sum::before {
  content: '▸';
  font-size: 11px;
  opacity: 0.7;
  width: 12px;
  flex-shrink: 0;
}
.sf-sec[open] > .sf-sec-sum::before {
  content: '▾';
}
.sf-sec[open] > .sf-sec-sum {
  border-bottom: 1px solid var(--ep-border, #e5e7eb);
  background: var(--ep-input-bg, transparent);
}
.sf-form {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  gap: 6px 6px;
  align-items: center;
  font-size: 12px;
  color: inherit;
  padding: 8px 8px 10px;
}
.sf-form label {
  color: var(--ep-muted, #6b7280);
}
/* range 样式由 EditorPanel 非 scoped 统一处理 */
.sf-form select {
  padding: 4px 6px;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 4px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, inherit);
}
.sf-val {
  font-size: 11px;
  color: var(--ep-text, #374151);
  min-width: 32px;
  text-align: right;
}
.sf-val.muted {
  color: var(--ep-muted, #9ca3af);
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sf-span2 {
  grid-column: 2 / -1;
}
.sf-seg {
  display: flex;
  gap: 0;
  border: 1px solid var(--ep-border, #d1d5db);
  border-radius: 6px;
  overflow: hidden;
}
.sf-seg button {
  flex: 1;
  border: none;
  background: var(--ep-input-bg, #fff);
  color: var(--ep-text, inherit);
  padding: 4px 4px;
  cursor: pointer;
  font-size: 11px;
  border-right: 1px solid var(--ep-border, #e5e7eb);
}
.sf-seg button:last-child {
  border-right: none;
}
.sf-seg button.on {
  background: var(--ep-accent, #3b82f6);
  color: #fff;
}
.sf-color-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.sf-chip {
  border: 1px solid var(--ep-border, #d1d5db);
  background: var(--ep-bg2, #f9fafb);
  color: var(--ep-text, inherit);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
}
</style>
