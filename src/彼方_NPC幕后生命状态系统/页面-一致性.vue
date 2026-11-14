<template>
  <section class="bf-page bf-page-archive">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">事实档案</h2>
        <p class="bf-page-sub">跨人物的未了之事，按紧迫度排列。</p>
      </div>
      <span v-if="总条数" class="bf-page-aside">{{ 人数 }} 人 · {{ 总条数 }} 条</span>
    </header>

    <div v-if="总条数 === 0" class="bf-empty">
      <p class="bf-empty-text">账上还没有事情</p>
      <p class="bf-empty-hint">更新一次后，这里会按紧迫度列出所有 NPC 的承诺与近期了结。</p>
    </div>

    <template v-else>
      <div class="bf-led-bar">
        <h3>进行中</h3>
        <span class="bf-led-stat">
          共 <b>{{ 进行中数 }}</b> 条<template v-if="过期数"> · 已过期 <b>{{ 过期数 }}</b> 条</template>
        </span>
      </div>

      <section v-for="组 in 分组" :key="组.key" class="bf-led-group">
        <header class="bf-led-group-head">
          <h4>{{ 组.标题 }}</h4>
          <span>{{ 组.说明 }}</span>
        </header>
        <button
          v-for="行 in 组.行"
          :key="行.键"
          class="bf-led-row"
          :class="行.类"
          :title="`到 ${行.名} 的人物页`"
          @click="去人物页(行.名)"
        >
          <span class="bf-led-seal" :class="'bf-avatar-tone-' + 头像色号(行.名)" aria-hidden="true">{{
            行.名.trim().slice(0, 1) || '?'
          }}</span>
          <span class="bf-led-who">{{ 行.名 }}</span>
          <span class="bf-led-claim">
            {{ 行.内容 }}
            <small v-if="行.结果">→ {{ 行.结果 }}</small>
          </span>
          <span class="bf-led-meta">
            <span class="bf-led-tid">{{ 行.编号 }}</span>
            <span v-if="行.标记" class="bf-led-flag">{{ 行.标记 }}</span>
            <span v-if="行.存于">存于 {{ 行.存于 }}</span>
            <span v-if="行.紧迫" :class="{ 'bf-led-late': 行.逾期 }">{{ 行.紧迫 }}</span>
          </span>
        </button>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
// 这一页只渲染: "谁欠着事、欠了多久、哪条过期"全在 一致性面板.ts 的 事实档案() 里(纯函数, 有用例)。
import { use一致性面板 } from './一致性面板';

const { 分组, 总条数, 人数, 进行中数, 过期数, 去人物页, 头像色号 } = use一致性面板();
</script>
