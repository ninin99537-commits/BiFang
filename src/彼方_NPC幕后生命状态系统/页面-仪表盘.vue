<template>
  <section class="bf-page bf-page-dashboard">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">此刻的彼方</h2>
        <p class="bf-page-sub">故事之外，他们也在继续生活。</p>
      </div>
    </header>

    <dl class="bf-summary">
      <div><dt>人物</dt><dd>{{ npcEntries.length }}</dd></div>
      <div><dt>有档案</dt><dd>{{ npcList.length }}</dd></div>
      <div><dt>待续事务</dt><dd>{{ 待续事务数 }}</dd></div>
      <div><dt>幕后更新</dt><dd>{{ stats.更新次数 }}</dd></div>
    </dl>

    <section class="bf-section" aria-labelledby="bf-tracked-title">
      <header class="bf-section-head">
        <h3 id="bf-tracked-title">正在追踪</h3>
        <div class="bf-add-inline">
          <input
            v-model="newNpcName"
            class="bf-input bf-input-sm"
            placeholder="输入人物姓名"
            aria-label="要添加的人物姓名"
            @keyup.enter="openAddDialog"
          />
          <button class="bf-btn bf-btn-sm" @click="openAddDialog">添加</button>
        </div>
      </header>

      <div v-if="npcList.length === 0" class="bf-empty">
        <p class="bf-empty-text">还没有追踪任何人物</p>
        <p class="bf-empty-hint">
          {{
            autoTrackEnabled
              ? '在上面填一个名字，或留空让 AI 在下一轮更新时识别重要人物。'
              : '「正文新角色自动建档」已关闭，新角色不会自动加入，需要在这里手动添加名字。'
          }}
        </p>
      </div>
      <ul v-else class="bf-people">
        <li v-for="name in npcList" :key="name" class="bf-person" :class="{ 'is-changed': 本轮有变化(name) }">
          <button class="bf-person-open" @click="openNpc(name)">
            <span class="bf-avatar" :class="'bf-avatar-tone-' + 头像色号(name)" aria-hidden="true">{{
              name.trim().slice(0, 1) || '?'
            }}</span>
            <span class="bf-person-copy">
              <span class="bf-person-name">{{ name }}</span>
              <span class="bf-person-place">{{ data.NPC?.[name]?.['位置'] || '未知位置' }}</span>
              <span class="bf-person-doing">{{
                data.NPC?.[name]?.['当前在做'] || data.NPC?.[name]?.['当前状态'] || '还没有记录近况'
              }}</span>
            </span>
            <span class="bf-person-tags">
              <span v-if="本轮有变化(name)" class="bf-chip bf-chip-changed">本轮有变化</span>
              <span v-if="进行中数(name)" class="bf-chip">待续 {{ 进行中数(name) }}</span>
              <span v-if="data.NPC?.[name]?.['恋爱对象'] === '是'" class="bf-chip bf-chip-love">{{ data.NPC[name]['好感阶段'] || data.NPC[name]['名分'] || '恋爱对象' }}</span>
              <span v-if="data.NPC?.[name]?.['是否怀孕'] === 'true' || data.NPC?.[name]?.['生理周期']?.includes('孕期')" class="bf-chip bf-chip-body">孕期</span>
            </span>
          </button>
          <button class="bf-icon-btn bf-person-del" title="从追踪名单删除" :aria-label="`从追踪名单删除 ${name}`" @click.stop="removeNpc(name)">
            <PhX :size="14" weight="bold" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <footer class="bf-section bf-dashboard-foot">
      <p class="bf-note">更新会读取最近的剧情，并同步人物档案与世界书条目。</p>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-primary" :disabled="updating" @click="manualUpdate">
          <span v-if="updating" class="bf-spinner" aria-hidden="true"></span>
          <PhArrowsClockwise v-else :size="15" weight="bold" aria-hidden="true" />
          {{ updating ? '更新中' : '立即更新' }}
        </button>
        <button class="bf-btn" :disabled="updating" @click="reload">
          <PhArrowsClockwise :size="15" weight="regular" aria-hidden="true" />刷新记录
        </button>
        <button class="bf-btn bf-btn-danger" :disabled="updating" @click="clearAll">
          <PhTrash :size="15" weight="regular" aria-hidden="true" />{{ clearing ? '再点一次确认清空' : '清空数据' }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { PhArrowsClockwise, PhTrash, PhX } from '@phosphor-icons/vue';
import { use仪表盘面板 } from './仪表盘面板';
import { 读取台账 } from './事务台账';

const {
  npcList, newNpcName, openAddDialog, autoTrackEnabled, data, removeNpc, openNpc,
  updating, manualUpdate, reload, clearAll, clearing, stats, npcEntries, 待续事务数, 头像色号,
} = use仪表盘面板();
function 本轮有变化(name: string): boolean {
  const 卡 = data.value.NPC?.[name];
  return !!卡?.['最后更新'] && Number(卡['最后更新']) === Number(stats.value.最后更新);
}
function 进行中数(name: string): number {
  return 读取台账(data.value.NPC?.[name]?.['未完成事项']).filter(事务 => 事务.状态 === '进行中').length;
}
</script>
