<template>
  <section class="bf-page bf-page-archive">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">事实档案</h2>
        <p class="bf-page-sub">他们答应过的、欠着的、已经了结的。点一行去那个人的页面。</p>
      </div>
    </header>

    <div v-if="总条数 === 0" class="bf-empty">

      <span class="bf-empty-glyph" aria-hidden="true"></span>
      <p class="bf-empty-text">账上还没有事情</p>
      <p class="bf-empty-hint">更新一次后，这里会按紧迫度列出所有 NPC 的承诺与近期了结。</p>
    </div>

    <template v-else>
      <!-- 状态过滤: 带实时计数; 点一格只看那一类(再点回全部) -->
      <dl class="bf-summary bf-led-filter" role="group" aria-label="筛选">
        <div :class="{ on: 过滤 === 'all' }" role="button" tabindex="0" @click="过滤 = 'all'" @keydown.enter="过滤 = 'all'">
          <dt>全部</dt>
          <dd>{{ 总条数 }}</dd>
        </div>
        <div
          :class="{ 'is-late': 过期数 > 0, on: 过滤 === 'late' }"
          role="button"
          tabindex="0"
          @click="过滤 = 过滤 === 'late' ? 'all' : 'late'"
          @keydown.enter="过滤 = 过滤 === 'late' ? 'all' : 'late'"
        >
          <dt>已过期</dt>
          <dd>{{ 过期数 }}</dd>
        </div>
        <div
          :class="{ on: 过滤 === 'ongoing' }"
          role="button"
          tabindex="0"
          @click="过滤 = 过滤 === 'ongoing' ? 'all' : 'ongoing'"
          @keydown.enter="过滤 = 过滤 === 'ongoing' ? 'all' : 'ongoing'"
        >
          <dt>进行中</dt>
          <dd>{{ 进行中数 }}</dd>
        </div>
        <div
          :class="{ on: 过滤 === 'done' }"
          role="button"
          tabindex="0"
          @click="过滤 = 过滤 === 'done' ? 'all' : 'done'"
          @keydown.enter="过滤 = 过滤 === 'done' ? 'all' : 'done'"
        >
          <dt>最近了结</dt>
          <dd>{{ 了结数 }}</dd>
        </div>
      </dl>

      <div class="bf-led-tools">
        <span class="bf-aside">涉及 {{ 人数 }} 人 · 过期门限：约定日期已过或挂满 {{ 老化天数 }} 天 · 最近了结保留 6 条</span>
        <div class="bf-seg" role="group" aria-label="分组方式">
          <button
            class="bf-seg-btn"
            :class="{ active: 分组方式 === 'urgency' }"
            :aria-pressed="分组方式 === 'urgency'"
            @click="分组方式 = 'urgency'"
          >
            按紧迫分组
          </button>
          <button
            class="bf-seg-btn"
            :class="{ active: 分组方式 === 'who' }"
            :aria-pressed="分组方式 === 'who'"
            @click="分组方式 = 'who'"
          >
            按人物分组
          </button>
        </div>
      </div>

      <section v-for="组 in 视图分组" :key="组.key" class="bf-led-group">
        <header class="bf-led-group-head">
          <h4>{{ 组.标题 }}<span>{{ 组.行.length }} 条</span></h4>
        </header>
        <button
          v-for="行 in 组.行"
          :key="行.键"
          class="bf-led-row"
          :class="[行.类, 行.紧迫 && !行.逾期 ? 'is-soon' : '']"
          :title="`点击去 ${行.名} 的人物页`"
          @click="去人物页(行.名)"
        >
          <span class="bf-led-seal" :class="'bf-avatar-tone-' + 头像色号(行.名)" aria-hidden="true">{{
            行.名.trim().slice(0, 1) || '?'
          }}</span>
          <span class="bf-led-body">
            <span class="bf-led-claim">
              <span class="bf-led-tid">{{ 行.编号 }}</span>
              {{ 行.内容 }}
              <span v-if="行.已结" class="bf-stamp" :class="{ void: 行.已作废 }">{{ 行.已结 }}</span>
              <span v-if="行.标记" class="bf-chip bf-chip-changed bf-led-flag">{{ 行.标记 }}</span>
            </span>
            <span class="bf-led-meta">
              <b>{{ 行.名 }}</b>
              <span v-if="行.存于">· 存于 {{ 行.存于 }}</span>
              <span v-if="行.结果">· → {{ 行.结果 }}{{ 行.幕后 ? '（幕后）' : '' }}</span>
            </span>
          </span>
          <span v-if="行.紧迫" class="bf-led-due" :class="{ 'bf-led-late': 行.逾期 }">{{ 行.紧迫 }}</span>
        </button>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
// 这一页只渲染: "谁欠着事、欠了多久、哪条过期"全在 一致性面板.ts 的 事实档案() 里(纯函数, 有用例)。
// 分组方式(按紧迫 / 按人物)是纯视图选择, 放在这里; 排序与紧迫文案仍由 事实档案() 决定。
import { computed, ref } from 'vue';
import { use一致性面板 } from './一致性面板';
import { 老化天数 } from './事务台账';

const { 分组, 总条数, 人数, 进行中数, 过期数, 去人物页, 头像色号 } = use一致性面板();

const 分组方式 = ref<'urgency' | 'who'>('urgency');
/** 状态过滤: all = 全部; 其余只显示对应那一组(再点一次回全部) */
const 过滤 = ref<'all' | 'late' | 'ongoing' | 'done'>('all');

/** 「最近了结」组的条数(分组里的 done 组) */
const 了结数 = computed(() => 分组.value.find(组 => 组.key === 'done')?.行.length ?? 0);

/** 按人物分组: 把三组摊平后按人名归拢, 组头是姓名 + 条数 */
const 视图分组 = computed(() => {
  const 源 = 过滤.value === 'all' ? 分组.value : 分组.value.filter(组 => 组.key === 过滤.value);
  if (分组方式.value === 'urgency') return 源;
  const 表 = new Map<string, typeof 分组.value[number]['行']>();
  for (const 组 of 源) {
    for (const 行 of 组.行) {
      const 已 = 表.get(行.名);
      if (已) 已.push(行);
      else 表.set(行.名, [行]);
    }
  }
  return [...表.entries()]
    .sort((甲, 乙) => 甲[0].localeCompare(乙[0], 'zh-Hans-CN'))
    .map(([名, 行]) => ({ key: `who-${名}`, 标题: 名, 说明: '', 行 }));
});
</script>
