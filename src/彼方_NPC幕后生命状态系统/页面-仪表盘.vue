<template>
  <section class="bf-page bf-page-dashboard">
    <!-- 更新入口唯一在顶栏(方案 §4.1 第 1 条): 页头只留标题与副标题, 不再放第二个更新按钮 -->
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">此刻的彼方</h2>
        <p class="bf-page-sub">故事之外，他们也在继续生活。</p>
      </div>
    </header>

    <!-- 顶部摘要带: 数字衬线 30px / 窄屏 26px / ≤560 24px, 旁注 small 说明本轮变化与过期 -->
    <dl class="bf-summary bf-dash-summary">
      <div>
        <dt>人物</dt>
        <dd>{{ npcEntries.length }}</dd>
      </div>
      <div>
        <dt>有档案</dt>
        <dd>
          {{ npcList.length }}
          <small v-if="本轮有变化人数">{{ `本轮 ${本轮有变化人数} 人有变化` }}</small>
        </dd>
      </div>
      <div :class="{ 'is-late': 过期事务数 > 0 }">
        <dt>待续事务</dt>
        <dd>
          {{ 待续事务数 }}
          <small v-if="过期事务数">其中 {{ 过期事务数 }} 件过期</small>
        </dd>
      </div>
      <div>
        <dt>幕后更新</dt>
        <dd>{{ stats.更新次数 }}<small>次</small></dd>
      </div>
    </dl>

    <section class="bf-section" aria-labelledby="bf-tracked-title">
      <header class="bf-section-head">
        <h3 id="bf-tracked-title">正在追踪</h3>
        <span class="bf-aside">{{ npcList.length }} 人</span>
      </header>

      <div v-if="npcList.length === 0" class="bf-empty">

        <span class="bf-empty-glyph" aria-hidden="true"></span>
        <p class="bf-empty-text">还没有追踪任何人物</p>
        <p class="bf-empty-hint">
          {{
            autoTrackEnabled
              ? '在下面填一个名字，或留空让 AI 在下一轮更新时识别重要人物。'
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
              <span class="bf-person-top">
                <span class="bf-person-name">{{ name }}</span>
                <span class="bf-person-place">{{ data.NPC?.[name]?.['位置'] || '位置未详' }}</span>
              </span>
              <span class="bf-person-doing">{{
                data.NPC?.[name]?.['当前在做'] || data.NPC?.[name]?.['当前状态'] || '还没有记录此刻的动向。'
              }}</span>
            </span>
            <!-- 胶囊只按需出现, 不堆空标签 -->
            <span class="bf-person-tags">
              <span v-if="本轮有变化(name)" class="bf-chip bf-chip-changed">本轮有变化</span>
              <span v-if="过期数(name)" class="bf-chip bf-chip-late">过期 {{ 过期数(name) }}</span>
              <span v-if="进行中数(name)" class="bf-chip">待续 {{ 进行中数(name) }}</span>
              <span v-if="data.NPC?.[name]?.['恋爱对象'] === '是'" class="bf-chip bf-chip-love">
                ♥ {{ data.NPC[name]['好感阶段'] || data.NPC[name]['名分'] || '恋爱对象' }}
              </span>
              <span v-if="是孕期(name)" class="bf-chip bf-chip-body">孕期</span>
            </span>
          </button>
          <button class="bf-person-del" title="从追踪名单移除" :aria-label="`从追踪名单移除 ${name}`" @click.stop="removeNpc(name)">
            <PhX :size="14" weight="bold" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <!-- 底部建档条: 输入姓名 + 添加 -> 打开弹窗 A -->
    <div class="bf-dash-add">
      <input
        v-model="newNpcName"
        class="bf-input bf-input-sm"
        placeholder="输入要手动加入追踪的角色姓名…"
        aria-label="要添加的人物姓名"
        @keyup.enter="openAddDialog"
      />
      <button class="bf-btn bf-btn-sm" @click="openAddDialog">+ 添加人物</button>
    </div>

    <footer class="bf-section bf-dashboard-foot">
      <p class="bf-note">点右上角「更新」会读取最近的剧情，并同步人物档案与世界书条目。</p>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-sm" :disabled="updating" @click="reload">
          <PhArrowsClockwise :size="14" weight="regular" aria-hidden="true" />刷新记录
        </button>
        <button class="bf-btn bf-btn-sm bf-btn-danger" :disabled="updating" @click="clearAll">
          <PhTrash :size="14" weight="regular" aria-hidden="true" />{{ clearing ? '再点一次确认清空' : '清空数据' }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { PhArrowsClockwise, PhTrash, PhX } from '@phosphor-icons/vue';
import { use仪表盘面板 } from './仪表盘面板';
import { 读取台账 } from './事务台账';
import { 事实档案 } from './一致性面板';

const {
  npcList, newNpcName, openAddDialog, autoTrackEnabled, data, removeNpc, openNpc,
  updating, reload, clearAll, clearing, stats, npcEntries, 待续事务数, 过期事务数, 头像色号,
} = use仪表盘面板();

/** 本轮有变化: 卡的「最后更新」等于全局「最后更新」时刻 */
function 本轮有变化(name: string): boolean {
  const 卡 = data.value.NPC?.[name];
  return !!卡?.['最后更新'] && Number(卡['最后更新']) === Number(stats.value.最后更新);
}
/** 待续 = 该人账上「进行中」条数 */
function 进行中数(name: string): number {
  return 读取台账(data.value.NPC?.[name]?.['未完成事项']).filter(事务 => 事务.状态 === '进行中').length;
}
/** 过期 = 该人「进行中」里约定日期已过(或挂满门限)的条数 —— 与事实档案同一口径 */
function 过期数(name: string): number {
  return 事实档案({ NPC: { [name]: data.value.NPC?.[name] }, 剧情时间: data.value.剧情时间 }).过期数;
}
/** 孕期: 是否怀孕 = 是, 或 生理周期 文本已写「孕期」 */
function 是孕期(name: string): boolean {
  const 卡 = data.value.NPC?.[name];
  return 卡?.['是否怀孕'] === '是' || String(卡?.['生理周期'] ?? '').includes('孕期');
}
</script>
