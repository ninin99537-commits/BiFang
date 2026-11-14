<template>
  <div class="pp">
    <div class="pp-head">
      <span class="pp-title">提示词预览</span>
      <span class="pp-count">全文 {{ 千分位(提示词.length) }} 字</span>
      <button v-if="可折叠" class="pp-btn" @click="展开 = !展开">
        {{ 展开 ? '收起' : '展开全文' }}
      </button>
      <button class="pp-btn" @click="$emit('复制')">复制全文</button>
    </div>

    <!-- 素材体量: 全文注入, 不做任何截断 —— 数字让用户自己判断要不要关某个源 -->
    <div class="pp-stats">
      <span class="pp-stat pp-stat-head">素材体量</span>
      <span class="pp-stat">角色卡 {{ 千分位(体量.charCard) }}</span>
      <span class="pp-stat">user 人设 {{ 千分位(体量.userPersona) }}</span>
      <span class="pp-stat">聊天记录 {{ 千分位(体量.chatHistory) }}</span>
      <span class="pp-stat">世界书 {{ 千分位(体量.worldbook) }}</span>
    </div>

    <!-- ★ 请求技巧状态行: 只列当前开着的; 四个全关时整行不出现。
         它是状态不是操作(操作在设置里), 所以不做成按钮。 -->
    <div v-if="技巧.length" class="pp-tech">
      <span class="pp-tech-icon" aria-hidden="true">🛡</span>
      <span>{{ 技巧.join(' · ') }}</span>
      <span class="pp-tech-note">已附加到请求</span>
    </div>

    <!-- ★ 卡顿修复(#124 批次3): 折叠态装进 textarea 的必须是**真的短字符串**。
         以前这里直接塞 116K 字全文, 浏览器要给这 11 万字做文本布局 —— 实测占 91% 的点击耗时。
         CSS 裁切(max-height / overflow:hidden)不算修: 那只是看不见, 布局照做。
         所以这里绑 预览文本(折叠时按行数真截短), 而不是 提示词。
         注意: **只截"显示", 不截"发送"** —— 复制与发给 AI 的始终是全文(props.提示词)。 -->
    <div v-if="提示词 && 被折叠" class="pp-fold-note">
      预览：只显示开头约 {{ 千分位(上限) }} 字（全文 {{ 千分位(提示词.length) }} 字）。发送与复制仍是全文。
    </div>
    <textarea v-if="提示词" class="pp-full" readonly :value="预览文本"></textarea>
    <div v-else class="pp-empty">勾选模块后这里会显示将要发送的提示词</div>

    <details class="pp-tune">
      <summary class="pp-summary">逐模块微调（改过的记进覆盖，可恢复默认）</summary>
      <div v-for="模块 in 已选模块" :key="模块.id" class="pp-item">
        <div class="pp-item-head">
          <span class="pp-item-name">{{ 模块.name }}</span>
          <button v-if="被改过(模块.id)" class="pp-mini" @click="恢复默认(模块.id)">恢复默认</button>
        </div>
        <textarea class="pp-frag" :value="片段(模块)" @input="写覆盖(模块.id, $event)"></textarea>
      </div>
      <div v-if="已选模块.length === 0" class="pp-empty">还没有勾选任何模块。</div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ModuleDef } from '../schema';
import { useSettingsStore } from '../store';
import { 取片段, 建上下文, 渲染模板 } from '../lib/prompt';
import { 预览上限, 需要折叠, 折叠预览 } from '../lib/折叠';

const props = defineProps<{
  模块表: ModuleDef[];
  提示词: string;
  /** 四块素材各自的字符数(全文注入, 不截断, 只给可见性) */
  体量: { charCard: number; userPersona: number; chatHistory: number; worldbook: number };
  /** 当前开着的请求技巧名(破限/防截断/头部填充/预填充); 空数组 = 四个全关 */
  技巧: string[];
}>();
defineEmits<{ 复制: [] }>();

const 设置 = useSettingsStore();

/**
 * 折叠态预览的**字符上限**(#124 批次3, dsh #162 纠正)。
 *
 * ★ 不变量是**字符数**, 不是行数 —— 卡顿的成本驱动因素是「浏览器要给多少字符做文本布局」。
 *   行数只是字符数的**代理指标, 会脱钩**: 116K 字若落在 200 行以内(每行不到 582 字就够),
 *   按行判会得出"不用折叠" → 修复静默失效, 不报错、只是变慢。
 *   所以判据与截断都按字符算, 与行结构无关。逻辑在 lib/折叠.ts(可单测)。
 */
const 上限 = 预览上限;

/** 展开/收起(组件内部状态, 不持久化 —— 进 store 会触发全变量表写回, 等于把卡顿换个地方) */
const 展开 = ref(false);

/** 是否值得折叠: **按字符数**判, 不看行数 */
const 可折叠 = computed(() => 需要折叠(props.提示词, 上限));

/** 当前是不是折叠显示 */
const 被折叠 = computed(() => 可折叠.value && !展开.value);

/**
 * 真正绑给 textarea 的文本。
 *
 * ★ 卡顿的根因是**浏览器给十几万字做文本布局**, 所以这里必须让 value **真的变短** ——
 *   CSS 裁切只是看不见, 布局照做, 不算修(#124 批次3 的硬约束)。
 * 展开时给全文; 折叠时交给 折叠预览(按字符预算累行, 保证被 上限 封顶)。
 * **只影响显示** —— 复制/发送走的是 props.提示词 全文。
 */
const 预览文本 = computed(() => (被折叠.value ? 折叠预览(props.提示词, 上限) : props.提示词));

/** 千分位, 让体量数字一眼可读 */
function 千分位(数: number): string {
  return String(Math.max(0, Math.round(数))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const 已选模块 = computed(() => props.模块表.filter(模块 => 设置.settings.enabled.includes(模块.id)));

function 片段(模块: ModuleDef): string {
  const 启用集合 = new Set(设置.settings.enabled);
  return 渲染模板(取片段(模块, 启用集合, props.模块表, 设置.settings), 建上下文(模块, 设置.settings));
}

function 被改过(id: string): boolean {
  return !!设置.settings.promptOverrides[id];
}

function 写覆盖(id: string, event: Event) {
  设置.settings.promptOverrides[id] = (event.target as HTMLTextAreaElement).value;
}

function 恢复默认(id: string) {
  delete 设置.settings.promptOverrides[id];
}
</script>

<style scoped>
.pp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pp-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pp-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--fg-dim, #9c9384);
}
.pp-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--fg-faint, #6b6459);
  font-variant-numeric: tabular-nums;
}
.pp-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px 10px;
  font-size: 11.5px;
  color: var(--fg-dim, #9c9384);
}
.pp-stat {
  font-variant-numeric: tabular-nums;
}
.pp-stat-head {
  color: var(--fg-text, #ece6da);
  opacity: 0.8;
}

/* ★ 请求技巧状态行: 用强调色, 因为它确实改变了请求 */
.pp-tech {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--fg-brass, #c9a227);
}
.pp-tech-icon {
  font-size: 11.5px;
}
.pp-tech-note {
  color: var(--fg-faint, #6b6459);
}

.pp-full {
  width: 100%;
  box-sizing: border-box;
  flex: 1 1 auto;
  height: 320px;
  resize: vertical;
  padding: 9px 10px;
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-ink, #12100d);
  color: var(--fg-text, #ece6da);
  font: 12px/1.6 var(--fg-mono, ui-monospace, Consolas, monospace);
}
/* 折叠提示: 说清"看到的是预览", 真实总量永远可见 */
.pp-fold-note {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--fg-faint, #6b6459);
}
.pp-empty {
  padding: 10px;
  border: 1px dashed var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-ink, #12100d);
  font-size: 12.5px;
  color: var(--fg-faint, #6b6459);
}
.pp-tune {
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-surface, #221e18);
  padding: 6px 10px;
}
.pp-summary {
  font-size: 11.5px;
  color: var(--fg-dim, #9c9384);
  cursor: pointer;
}
.pp-item {
  margin-top: 8px;
}
.pp-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.pp-item-name {
  font-size: 12px;
  color: var(--fg-text, #ece6da);
}
.pp-frag {
  width: 100%;
  box-sizing: border-box;
  height: 110px;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 8px;
  background: var(--fg-ink, #12100d);
  color: var(--fg-text, #ece6da);
  font: 11.5px/1.6 var(--fg-mono, ui-monospace, Consolas, monospace);
}
.pp-btn,
.pp-mini {
  border: 1px solid var(--fg-line, #352f26);
  border-radius: 7px;
  background: var(--fg-surface, #221e18);
  color: var(--fg-text, #ece6da);
  font-size: 11.5px;
  padding: 4px 12px;
  cursor: pointer;
  transition: border-color 0.14s ease, color 0.14s ease;
}
.pp-btn:hover,
.pp-mini:hover {
  border-color: var(--fg-brass-dim, #8a6f1c);
  color: var(--fg-brass, #c9a227);
}
</style>
