<template>
  <div class="dl">
    <div class="dl-head">
      <span class="dl-title">草稿箱</span>
      <span class="dl-count">{{ 草稿.length }} / {{ 草稿上限 }}</span>
      <button class="dl-btn" @click="刷新">刷新</button>
    </div>

    <div v-if="草稿.length === 0" class="dl-empty">还没有草稿。生成结果后点「存草稿」会出现在这里。</div>

    <div v-else class="dl-list">
      <div v-for="项 in 草稿" :key="项.id" class="dl-item">
        <div class="dl-item-head">
          <span class="dl-mode">{{ 项.mode === 'user' ? 'user 人设' : 'NPC' }}</span>
          <span class="dl-time">{{ 格式化时间(项.created_at) }}</span>
        </div>
        <div class="dl-brief">{{ 项.brief || '（无一句话需求）' }}</div>
        <div class="dl-mods">{{ 项.modules.join(' · ') }}</div>
        <div class="dl-preview">{{ 预览(项.text) }}</div>
        <div class="dl-actions">
          <button class="dl-btn" @click="$emit('载入', 项)">载入</button>
          <button class="dl-btn" @click="复制(项.text)">复制</button>
          <button class="dl-btn dl-danger" @click="删除(项.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Draft } from '../schema';
import { 列草稿, 删草稿, 草稿上限, 复制文本 } from '../lib/sink';

defineEmits<{ 载入: [草稿: Draft] }>();

const 草稿 = ref<Draft[]>(列草稿());

function 刷新() {
  草稿.value = 列草稿();
}

function 删除(id: string) {
  删草稿(id);
  刷新();
}

async function 复制(文本: string) {
  try {
    await 复制文本(文本);
    toastr.success('草稿已复制');
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : '复制失败');
  }
}

function 预览(文本: string): string {
  const 净 = String(文本 ?? '').trim();
  return 净.length > 120 ? `${净.slice(0, 120)}…` : 净;
}

function 格式化时间(时间: number): string {
  const 日 = new Date(时间);
  const 补 = (数: number) => String(数).padStart(2, '0');
  return `${日.getMonth() + 1}-${补(日.getDate())} ${补(日.getHours())}:${补(日.getMinutes())}`;
}

/** 供父组件在存草稿后刷新 */
defineExpose({ 刷新 });
</script>

<style scoped>
.dl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 8px;
  background: var(--forge-panel, #1c1c20);
  padding: 10px;
}
.dl-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dl-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--forge-text, #e9e8e6);
}
.dl-count {
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.dl-head .dl-btn {
  margin-left: auto;
}
.dl-empty {
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
  line-height: 1.6;
}
.dl-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dl-item {
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dl-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.dl-mode {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--forge-accent, #c8a24a);
}
.dl-time {
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.dl-brief {
  font-size: 11.5px;
  color: var(--forge-text, #e9e8e6);
}
.dl-mods {
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.dl-preview {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--forge-dim, #9a9aa4);
  white-space: pre-wrap;
  word-break: break-all;
}
.dl-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.dl-btn {
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
  padding: 2px 10px;
  cursor: pointer;
}
.dl-btn:hover {
  border-color: var(--forge-accent, #c8a24a);
}
.dl-danger:hover {
  border-color: #e0574a;
  color: #ffb3ab;
}
</style>
