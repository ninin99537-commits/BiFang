<template>
  <div class="mc" :class="{ on: 启用() }">
    <div class="mc-row" @click="切换启用()">
      <!-- 自绘复选框: 铜色勾选态, 不用浏览器默认蓝 -->
      <span class="mc-box" :class="{ checked: 启用() }" aria-hidden="true">
        <svg v-if="启用()" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span class="mc-name">{{ 模块.name }}</span>
      <span v-if="模块.fields.length" class="mc-caret" @click.stop="展开 = !展开">{{ 展开 ? '▾' : '▸' }}</span>
    </div>

    <!-- 勾选的行展开显示描述; 未勾选悬停出描述(行内展开, 不动布局) -->
    <div v-if="启用() || 悬停" class="mc-desc" @mouseenter="悬停 = true" @mouseleave="悬停 = false">{{ 模块.desc }}</div>

    <div v-if="展开 && 模块.fields.length" class="mc-fields">
      <div v-for="字段 in 模块.fields" :key="字段.id" class="mc-field">
        <div class="mc-label">
          <span>{{ 字段.name }}</span>
          <span v-if="字段.desc" class="mc-hint">{{ 字段.desc }}</span>
        </div>

        <input
          v-if="字段.kind === 'text'"
          class="mc-input"
          type="text"
          :value="文本值(字段.id)"
          @input="写文本(字段.id, $event)"
        />

        <input
          v-else-if="字段.kind === 'number'"
          class="mc-input mc-number"
          type="number"
          :value="数值(字段.id)"
          @input="写数字(字段.id, $event)"
        />

        <label v-else-if="字段.kind === 'toggle'" class="mc-toggle" @click.stop>
          <input type="checkbox" :checked="布尔值(字段.id)" @change="写布尔(字段.id, $event)" />
          <span>{{ 布尔值(字段.id) ? '开启' : '关闭' }}</span>
        </label>

        <textarea
          v-else
          class="mc-input mc-list"
          rows="3"
          placeholder="每行一项"
          :value="列表文本(字段.id)"
          @input="写列表(字段.id, $event)"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { ModuleDef } from '../schema';
import { useSettingsStore } from '../store';

const props = defineProps<{ 模块: ModuleDef }>();
const 设置 = useSettingsStore();
const 展开 = ref(false);
const 悬停 = ref(false);

const 启用 = () => 设置.settings.enabled.includes(props.模块.id);

function 切换启用() {
  const 表 = 设置.settings.enabled;
  const 位 = 表.indexOf(props.模块.id);
  if (位 < 0) 表.push(props.模块.id);
  else 表.splice(位, 1);
}

function 默认值(id: string): unknown {
  return props.模块.fields.find(f => f.id === id)?.default;
}

function 文本值(id: string): string {
  const 值 = 设置.settings.fieldValues[id];
  return 值 === undefined || 值 === null ? String(默认值(id) ?? '') : String(值);
}

function 数值(id: string): number {
  const 值 = 设置.settings.fieldValues[id];
  const 数 = Number(值 === undefined || 值 === null ? 默认值(id) : 值);
  return Number.isFinite(数) ? 数 : 0;
}

function 写文本(id: string, event: Event) {
  设置.settings.fieldValues[id] = (event.target as HTMLInputElement).value;
}

function 写数字(id: string, event: Event) {
  const 数 = Number((event.target as HTMLInputElement).value);
  设置.settings.fieldValues[id] = Number.isFinite(数) ? 数 : 0;
}

function 布尔值(id: string): boolean {
  const 值 = 设置.settings.fieldValues[id];
  return 值 === undefined || 值 === null ? !!默认值(id) : !!值;
}

function 列表文本(id: string): string {
  const 值 = 设置.settings.fieldValues[id];
  const 表 = 值 === undefined || 值 === null ? 默认值(id) : 值;
  return Array.isArray(表) ? 表.join('\n') : '';
}

function 写布尔(id: string, event: Event) {
  设置.settings.fieldValues[id] = (event.target as HTMLInputElement).checked;
}

function 写列表(id: string, event: Event) {
  const 行 = (event.target as HTMLTextAreaElement).value
    .split('\n')
    .map(项 => 项.trim())
    .filter(Boolean);
  设置.settings.fieldValues[id] = 行;
}
</script>

<style scoped>
.mc {
  border-radius: 8px;
  padding: 1px 0;
}
.mc.on {
  background: var(--fg-brass-bg, rgba(201, 162, 39, 0.12));
}
.mc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
}
.mc-row:hover {
  background: var(--fg-surface2, #2a251d);
}
.mc-box {
  flex: none;
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  border: 1px solid var(--fg-line2, #443c30);
  border-radius: 4px;
  background: var(--fg-ink, #12100d);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.mc-box.checked {
  border-color: var(--fg-brass, #c9a227);
  background: var(--fg-brass, #c9a227);
}
.mc-box svg {
  width: 11px;
  height: 11px;
  stroke: var(--fg-ink, #12100d);
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mc-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-text, #ece6da);
}
.mc.on .mc-name {
  color: var(--fg-brass, #c9a227);
}
.mc-caret {
  flex: none;
  font-size: 11.5px;
  color: var(--fg-faint, #6b6459);
}
.mc-desc {
  padding: 0 8px 5px 31px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg-dim, #9c9384);
}
.mc-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 8px 8px 31px;
}
.mc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mc-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--fg-dim, #9c9384);
}
.mc-hint {
  opacity: 0.7;
}
.mc-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-ink, #12100d);
  color: var(--fg-text, #ece6da);
  font-family: inherit;
  font-size: 12.5px;
}
.mc-input:focus {
  outline: none;
  border-color: var(--fg-line2, #443c30);
  box-shadow: 0 0 0 3px var(--fg-brass-bg, rgba(201, 162, 39, 0.12));
}
.mc-number {
  width: 88px;
}
.mc-list {
  resize: vertical;
  line-height: 1.5;
}
.mc-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--fg-text, #ece6da);
}
</style>
