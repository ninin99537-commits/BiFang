<template>
  <div class="w-bar" :class="valueMode" :style="wrapStyle">
    <div v-if="widget.label" class="w-bar-label" :style="titleStyle">{{ widget.label }}</div>
    <div class="w-bar-main" :class="'align-' + style.align">
      <template v-if="entries.length > 1">
        <div v-for="(e, i) in entries" :key="i" class="w-bar-one" :class="valueMode">
          <span v-if="e.name" class="w-bar-sub">{{ e.name }}</span>
          <div class="w-bar-track" :style="trackStyle">
            <div class="w-bar-fill" :style="fillOf(e.value)">
              <span v-if="valueMode === 'inside'" class="w-bar-text inside" :style="valueTextStyle">{{ toNum(e.value) }} / {{ max }}</span>
            </div>
          </div>
          <div v-if="valueMode === 'outside'" class="w-bar-text" :style="valueTextStyle">{{ toNum(e.value) }} / {{ max }}</div>
        </div>
      </template>
      <template v-else>
        <div class="w-bar-one" :class="valueMode">
          <div class="w-bar-track" :style="trackStyle">
            <div class="w-bar-fill" :style="fillStyle">
              <span v-if="valueMode === 'inside'" class="w-bar-text inside" :style="valueTextStyle">{{ num }} / {{ max }}</span>
            </div>
          </div>
          <div v-if="valueMode === 'outside'" class="w-bar-text" :style="valueTextStyle">{{ num }} / {{ max }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Widget, withOpacity } from '../schema';
import { toNumber } from '../lib/datasource';
import { useConfigStore } from '../store';
import { resolveStyle, baseWidgetCss, barFillBackground, labelCss } from '../lib/style';

const props = defineProps<{ widget: Widget; value?: any }>();
const store = useConfigStore();
const style = computed(() => resolveStyle(store.config.layout, props.widget));
const entries = computed(() => store.widgetEntries(props.widget));
const num = computed(() => toNumber(props.value ?? entries.value[0]?.value));
const max = computed(() => style.value.barMax || 100);
const pct = computed(() => Math.max(0, Math.min(100, (num.value / max.value) * 100)));
const valueMode = computed(() => style.value.barValueMode || 'outside');

function toNum(v: any) {
  return toNumber(v);
}
function fillOf(v: any) {
  const n = toNumber(v);
  const p = Math.max(0, Math.min(100, (n / max.value) * 100));
  const h = Math.max(4, style.value.barHeight || 12);
  return {
    width: p + '%',
    height: '100%',
    minHeight: h + 'px',
    background: barFillBackground(style.value),
    borderRadius: style.value.radius + 'px',
    minWidth: valueMode.value === 'inside' && p > 0 ? '2.5em' : undefined,
  };
}

const wrapStyle = computed(() => {
  const base = baseWidgetCss(style.value, { fullWidth: true });
  return {
    ...base,
    display: 'flex',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  } as Record<string, string | undefined>;
});
const titleStyle = computed(() => labelCss(style.value));
const trackStyle = computed(() => {
  const track = style.value.barTrack || '#252d38';
  const op = style.value.barTrackOpacity ?? 1;
  const h = Math.max(4, style.value.barHeight || 12);
  return {
    background: withOpacity(track, op),
    height: h + 'px',
    minHeight: h + 'px',
    borderRadius: style.value.radius + 'px',
    opacity: 1,
    flex: '1 1 auto',
    minWidth: '40px',
  };
});
const fillStyle = computed(() => {
  const h = Math.max(4, style.value.barHeight || 12);
  return {
    width: pct.value + '%',
    height: '100%',
    minHeight: h + 'px',
    background: barFillBackground(style.value),
    borderRadius: style.value.radius + 'px',
    minWidth: valueMode.value === 'inside' && pct.value > 0 ? '2.5em' : undefined,
  };
});
const valueTextStyle = computed(() => {
  const s = style.value;
  const out: Record<string, string | undefined> = {
    opacity: '1',
  };
  if (s.barValueColor) {
    out.color = s.barValueColor;
  } else if (valueMode.value === 'outside') {
    out.color = withOpacity(s.color || '#e4eef2', s.colorOpacity ?? 1);
  } else {
    out.color = '#ffffff';
  }
  if (s.barValueFontSize && s.barValueFontSize > 0) {
    out.fontSize = s.barValueFontSize + 'px';
  } else {
    out.fontSize = Math.round((s.fontSize ?? 13) * 0.9) + 'px';
  }
  return out;
});
</script>

<style scoped>
.w-bar {
  display: flex;
  gap: 6px;
  width: 100% !important;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  align-items: center;
  overflow: hidden;
}
.w-bar-label {
  flex: 0 1 auto;
  width: auto;
  max-width: 40%;
  line-height: 1.3;
  opacity: 0.9;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-bar-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 48px;
  width: 100%;
  overflow: hidden;
}
.w-bar-main.align-center {
  align-items: center;
}
.w-bar-main.align-right {
  align-items: flex-end;
}
.w-bar-main.align-left {
  align-items: stretch;
}
.w-bar-one {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.w-bar-sub {
  flex: 0 0 auto;
  opacity: 0.75;
  font-size: 0.9em;
  max-width: min(70%, 10em);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-bar-track {
  flex: 1 1 auto;
  overflow: hidden;
  min-width: 40px;
  min-height: 4px;
}
.w-bar-fill {
  height: 100%;
  min-height: inherit;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  position: relative;
}
.w-bar-text {
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 1.2;
}
.w-bar-text.inside {
  padding: 0 6px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.45);
}
</style>
