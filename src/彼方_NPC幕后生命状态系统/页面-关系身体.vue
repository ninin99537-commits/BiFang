<template>
  <section v-if="有恋爱" class="bf-block bf-block-love" aria-labelledby="bf-love-title">
    <header class="bf-section-head">
      <h3 id="bf-love-title">关系</h3>
      <span class="bf-block-aside">名分 <b>{{ card['名分'] || '未定' }}</b><template v-if="card['情感倾向']">　倾向 <b>{{ card['情感倾向'] }}</b></template></span>
    </header>
    <div class="bf-love-row">
      <span class="bf-love-axis">好感</span>
      <div class="bf-scale bf-scale-affection" role="img" :aria-label="`好感 ${card['好感阶段'] || ''} ${card['好感值'] ?? ''}`">
        <span v-for="名 in 好感档" :key="名" class="bf-scale-step" :class="档类(名, card['好感阶段'], 好感档)"><i></i><b>{{ 名 }}</b></span>
      </div>
      <span class="bf-love-num">{{ card['好感值'] ?? '—' }}</span>
    </div>
    <div class="bf-love-row">
      <span class="bf-love-axis">情欲</span>
      <div class="bf-scale bf-scale-desire" role="img" :aria-label="`情欲 ${card['情欲阶段'] || ''} ${card['情欲值'] ?? ''}`">
        <span v-for="名 in 情欲档" :key="名" class="bf-scale-step" :class="档类(名, card['情欲阶段'], 情欲档)"><i></i><b>{{ 名 }}</b></span>
      </div>
      <span class="bf-love-num">{{ card['情欲值'] ?? '—' }}</span>
    </div>
    <p v-if="card['恋爱态度']" class="bf-love-attitude">{{ card['恋爱态度'] }}</p>
    <p v-if="标签.length" class="bf-love-tags"><span v-for="标签名 in 标签" :key="标签名" class="bf-chip bf-chip-love">{{ 标签名 }}</span></p>
    <!-- 批2·B5: 「恋爱动向」已并入「近期关键事件」, 这里不再单独渲染「最近一轮」——
         数值变动在详情页的 近期关键事件 里就能看到, 两处都写等于同一件事记两遍。 -->
  </section>

  <section v-if="周期 || 孕期" class="bf-block bf-block-body" aria-labelledby="bf-body-title">
    <header class="bf-section-head">
      <h3 id="bf-body-title">身体</h3>
      <span v-if="孕期" class="bf-block-aside">本人知晓：<b>{{ card['怀孕知晓'] || '未知' }}</b></span>
      <span v-else class="bf-block-aside">周期 {{ 周期?.长 }} 天</span>
    </header>
    <template v-if="孕期">
      <p class="bf-body-stage">孕期　孕 {{ 孕期.周 }} 周<template v-if="孕期.日"> + {{ 孕期.日 }} 天</template></p>
      <div class="bf-preg-bar" role="img" :aria-label="`孕程 ${孕程比例}%`"><i :style="{ width: `${孕程比例}%` }"></i></div>
      <p class="bf-body-note">{{ 迹象 }}</p>
    </template>
    <template v-else-if="周期">
      <p class="bf-body-stage">{{ card['生理周期'] }}</p>
      <div class="bf-cycle" role="img" :aria-label="`${card['生理周期']} 第 ${周期.日} 天`">
        <i v-for="日 in 周期.长" :key="日" :class="[`bf-cycle-${阶段(日)}`, { 'is-today': 日 === 周期.日 }]" :title="`Day ${日}`"></i>
      </div>
      <p class="bf-cycle-legend"><span class="bf-lg-men">月经</span><span class="bf-lg-fol">卵泡</span><span class="bf-lg-ovu">排卵</span><span class="bf-lg-lut">黄体</span></p>
      <p class="bf-body-note">{{ [card['周期影响'], 迹象, card['当前防护'] && `防护：${card['当前防护']}`].filter(Boolean).join('　') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { 身体迹象 } from './身体迹象';
import { 好感阶段表, 情欲阶段表, 标签词表 } from './恋爱规则';

const props = defineProps<{ card: Record<string, any> }>();
// A13: 档位与词表一律从 恋爱规则.ts 派生, 不在组件里手抄第二份(改词表时界面自动跟随)
const 好感档 = 好感阶段表.map(阶段 => 阶段.名);
const 情欲档 = 情欲阶段表.map(阶段 => 阶段.名);
const 有恋爱 = computed(() =>
  props.card['恋爱对象'] === '是'
  || ['好感值', '情欲值', '恋爱标签', '名分', '恋爱态度'].some(f => String(props.card[f] ?? '').trim() !== ''),
);
const 标签 = computed(() => {
  const raw = props.card['恋爱标签'];
  const 列表 = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,，、]/);
  // 词表外的词不显示(与 校验标签 的写回口径一致)
  return 列表.map(x => String(x).trim()).filter(x => x && 标签词表.includes(x)).slice(0, 5);
});
const 周期 = computed(() => {
  const m = String(props.card['生理周期'] ?? '').match(/Day\s*(\d+)\s*\/\s*(\d+)/i);
  return m ? { 日: +m[1], 长: Math.max(1, +m[2]) } : null;
});
const 孕期 = computed(() => {
  const m = String(props.card['生理周期'] ?? '').match(/孕期\s*孕\s*(\d+)\s*周(?:\s*\+?\s*(\d+)\s*天)?/);
  return m ? { 周: +m[1], 日: +(m[2] ?? 0) } : null;
});
const 孕程比例 = computed(() => {
  if (!孕期.value) return 0;
  const 总 = Number(props.card['孕程周数']) || 40;
  return Math.min(100, Math.max(0, Math.round(((孕期.value.周 * 7 + 孕期.value.日) / (总 * 7)) * 100)));
});
const 迹象 = computed(() => 身体迹象(props.card));
function 档类(名: string, 当前: unknown, 档: string[]) {
  const i = 档.indexOf(名);
  const now = 档.indexOf(String(当前 ?? ''));
  return { 'is-now': i === now, 'is-past': now >= 0 && i < now };
}
function 阶段(日: number): string {
  const 长 = 周期.value?.长 ?? 28;
  const 排卵日 = 长 - 14;
  if (日 <= 5) return 'men';
  if (日 < 排卵日 - 1) return 'fol';
  if (日 <= 排卵日 + 1) return 'ovu';
  return 'lut';
}
</script>
