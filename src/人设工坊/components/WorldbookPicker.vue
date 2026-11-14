<template>
  <div class="wp">
    <div class="wp-head">
      <span class="wp-title">世界书条目</span>
      <span class="wp-count">{{ 已选数 }} / {{ 条目.length }} 条 · {{ 千分位(已选字数) }} 字</span>
      <span class="wp-acts">
        <button class="wp-mini" type="button" @click="全选">全选</button>
        <button class="wp-mini" type="button" @click="全不选">全不选</button>
        <button class="wp-mini" type="button" @click="重置为常驻默认">重置为常驻默认</button>
      </span>
    </div>

    <input v-model="搜索" class="wp-search" placeholder="搜索条目名 / 世界书名" />

    <div class="wp-list">
      <label v-for="条 in 过滤后" :key="条.键" class="wp-item" :class="{ on: 勾选(条) }">
        <input type="checkbox" :checked="勾选(条)" @change="切换(条)" />
        <span class="wp-name">{{ 条.名 }}</span>
        <span v-if="条.常驻" class="wp-badge">常驻</span>
        <span class="wp-book">{{ 条.书 }}</span>
        <span class="wp-size" :class="{ big: 条.字数 >= 20000 }">{{ 千分位(条.字数) }} 字</span>
      </label>
      <div v-if="过滤后.length === 0" class="wp-empty">
        {{ 条目.length === 0 ? '当前范围没有可注入的世界书条目。' : '没有匹配的条目。' }}
      </div>
    </div>

    <div class="wp-hint">
      首次默认勾选「常驻」条目；勾选变化即保存。「全选 / 全不选」只作用于**搜索过滤后**看得见的条目（先搜再全选）。体量特别大的条目（≥2 万字）标红，勾前请确认不是别的扩展的基建数据。
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSettingsStore } from '../store';
import { 已选世界书条目, type 世界书条目 } from '../lib/世界书';

const props = defineProps<{ 条目: 世界书条目[] }>();

const 设置 = useSettingsStore();
const 搜索 = ref('');

/** 展示顺序: 按字数降序(大字条目一眼可见), 过滤只作用于展示 */
const 过滤后 = computed(() => {
  const 词 = 搜索.value.trim().toLowerCase();
  const 全 = [...props.条目].sort((左, 右) => 右.字数 - 左.字数);
  if (!词) return 全;
  return 全.filter(条 => 条.名.toLowerCase().includes(词) || 条.书.toLowerCase().includes(词));
});

const 已选 = computed(() => 已选世界书条目(设置.settings, props.条目));
const 已选数 = computed(() => 已选.value.length);
const 已选字数 = computed(() => 已选.value.reduce((和, 条) => 和 + 条.字数, 0));

function 勾选(条: 世界书条目): boolean {
  return 已选.value.some(选 => 选.键 === 条.键);
}

function 切换(条: 世界书条目) {
  const 当前 = new Set(已选.value.map(选 => 选.键));
  if (当前.has(条.键)) 当前.delete(条.键);
  else 当前.add(条.键);
  设置.settings.material.worldbookSelected = [...当前];
  设置.settings.material.worldbookTouched = true;
}

/**
 * 全选 / 全不选 —— **只作用于当前列表里看得见的条目**(搜索过滤之后那些)。
 * 这是刻意的: 想在 300 条里挑出某一类, 正确用法是先搜、再全选;
 * 如果全选无视过滤, 用户搜完一点就顺手把别的全勾上了, 而且很难发现。
 */
function 批量勾选(勾: boolean) {
  const 条们 = 过滤后.value;
  if (!条们.length) return;
  const 当前 = new Set(已选.value.map(选 => 选.键));
  for (const 条 of 条们) {
    if (勾) 当前.add(条.键);
    else 当前.delete(条.键);
  }
  设置.settings.material.worldbookSelected = [...当前];
  设置.settings.material.worldbookTouched = true;
  const 范围 = 搜索.value.trim() ? `匹配「${搜索.value.trim()}」的 ${条们.length} 条` : `全部 ${条们.length} 条`;
  toastr.success(勾 ? `已勾选${范围}` : `已取消勾选${范围}`);
}

function 全选() {
  批量勾选(true);
}

function 全不选() {
  批量勾选(false);
}

/** 回到"默认勾选常驻条目"的初始状态(touched=false 时按常驻算) */
function 重置为常驻默认() {
  设置.settings.material.worldbookSelected = [];
  设置.settings.material.worldbookTouched = false;
  toastr.success('已重置为「默认勾选常驻条目」');
}

function 千分位(数: number): string {
  return String(Math.max(0, Math.round(数))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
</script>

<style scoped>
.wp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 8px;
  background: var(--forge-bg, #141416);
  padding: 8px 10px;
}
.wp-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wp-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--forge-text, #e9e8e6);
}
.wp-count {
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
  font-variant-numeric: tabular-nums;
}
.wp-head .wp-acts {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
.wp-search {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-panel, #1c1c20);
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
}
.wp-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}
.wp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--forge-text, #e9e8e6);
  cursor: pointer;
}
.wp-item:hover {
  background: var(--forge-panel, #1c1c20);
}
.wp-item.on {
  color: var(--forge-accent, #c8a24a);
}
.wp-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wp-badge {
  flex: none;
  border-radius: 4px;
  background: var(--forge-accent, #c8a24a);
  color: #1a1a1c;
  font-size: 11.5px;
  padding: 0 5px;
  font-weight: 600;
}
.wp-book {
  flex: none;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.wp-size {
  flex: none;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
  font-variant-numeric: tabular-nums;
}
.wp-size.big {
  color: #e0574a;
  font-weight: 600;
}
.wp-empty {
  padding: 6px 0;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.wp-hint {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--forge-dim, #9a9aa4);
}
.wp-mini {
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: transparent;
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
  padding: 2px 8px;
  cursor: pointer;
}
.wp-mini:hover {
  border-color: var(--forge-accent, #c8a24a);
}
</style>
