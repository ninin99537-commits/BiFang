<template>
  <div class="mt">
    <section v-for="项 in 分组表" :key="项.组" class="mt-section">
      <div class="mt-group">
        <span>{{ 分组名[项.组] ?? 项.组 }}</span>
        <span class="mt-count">{{ 已选数(项.模块) }}/{{ 项.模块.length }}</span>
      </div>
      <div class="mt-cards">
        <ModuleCard v-for="模块 in 项.模块" :key="模块.id" :模块="模块" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ModuleDef } from '../schema';
import { 分组名, 分组顺序 } from '../lib/modules';
import { useSettingsStore } from '../store';
import ModuleCard from './ModuleCard.vue';

const props = defineProps<{ 模块表: ModuleDef[] }>();
const 设置 = useSettingsStore();

const 分组表 = computed(() =>
  分组顺序
    .map(组 => ({ 组, 模块: props.模块表.filter(模块 => 模块.group === 组) }))
    .filter(项 => 项.模块.length > 0),
);

function 已选数(模块们: ModuleDef[]): number {
  return 模块们.filter(模块 => 设置.settings.enabled.includes(模块.id)).length;
}
</script>

<style scoped>
.mt {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px;
}
.mt-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px 5px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--fg-dim, #9c9384);
}
.mt-count {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--fg-faint, #6b6459);
  font-variant-numeric: tabular-nums;
}
.mt-cards {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
