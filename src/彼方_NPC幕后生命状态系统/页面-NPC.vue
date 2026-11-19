<template>
  <div class="bf-page bf-npc">
    <aside class="bf-directory" aria-label="人物索引">
      <header class="bf-directory-head">
        <span>人物索引</span>
        <span class="bf-directory-count">{{ npcEntries.length }}</span>
      </header>
      <div v-if="npcEntries.length === 0" class="bf-empty bf-directory-empty">
        <p class="bf-empty-text">还没有人物</p>
        <p class="bf-empty-hint">
          {{
            autoTrackEnabled
              ? '在总览页添加一个名字，或更新一次让 AI 自动识别。'
              : '「正文新角色自动建档」已关闭，请在总览页手动添加名字。'
          }}
        </p>
      </div>
      <nav v-else class="bf-directory-list">
        <button
          v-for="[name, card] in npcEntries"
          :key="name"
          class="bf-dir-item"
          :class="{ active: selectedNpc === name }"
          :aria-current="selectedNpc === name ? 'true' : undefined"
          @click="selectedNpc = name"
        >
          <span class="bf-avatar bf-avatar-sm" :class="'bf-avatar-tone-' + 头像色号(name)" aria-hidden="true">{{
            name.trim().slice(0, 1) || '?'
          }}</span>
          <span class="bf-dir-copy">
            <span class="bf-dir-name">{{ name }}</span>
            <span class="bf-dir-place">{{ card['位置'] || '未知位置' }}</span>
          </span>
        </button>
      </nav>
    </aside>

    <article v-if="selectedNpcCard" ref="profileEl" class="bf-profile">
      <header class="bf-profile-head">
        <div class="bf-profile-lead">
          <span
            class="bf-avatar bf-avatar-lg"
            :class="'bf-avatar-tone-' + 头像色号(selectedNpc)"
            aria-hidden="true"
            >{{ selectedNpc?.trim().slice(0, 1) || '?' }}</span
          >
          <div class="bf-profile-id">
            <h2 class="bf-profile-name">{{ selectedNpc }}</h2>
            <p class="bf-profile-meta">
              <span>{{ selectedNpcCard['身份锚点'] || selectedNpcCard['位置'] || '位置未记录' }}</span>
            </p>
          </div>
        </div>
        <div class="bf-profile-actions">
          <span v-if="!是恋爱对象 && 有恋爱数据" class="bf-hint" style="align-self: center; margin: 0 6px 0 0">
            恋爱已暂停（数值与名分保留，重新标记后接着算）
          </span>
          <button
            v-if="!editingNpc"
            class="bf-btn bf-btn-sm bf-btn-quiet"
            :class="{ 'is-on': 是恋爱对象 }"
            :disabled="updating"
            :title="
              是恋爱对象
                ? '取消恋爱对象标记(此后不再折算恋爱事件)'
                : '标记为恋爱对象(此后每轮幕后更新折算恋爱事件)'
            "
            @click="切换恋爱对象"
          >
            <PhHeart :size="13" :weight="是恋爱对象 ? 'fill' : 'regular'" aria-hidden="true" />{{
              是恋爱对象 ? '取消恋爱对象' : '标记恋爱对象'
            }}
          </button>
          <button v-if="!editingNpc" class="bf-btn bf-btn-sm" @click="startEditNpc">
            <PhPencilSimple :size="13" weight="regular" aria-hidden="true" />编辑
          </button>
          <template v-else>
            <button class="bf-btn bf-btn-sm bf-btn-primary" @click="saveEditNpc">
              <PhCheck :size="13" weight="bold" aria-hidden="true" />保存
            </button>
            <button class="bf-btn bf-btn-sm" @click="cancelEditNpc">取消</button>
          </template>
        </div>
      </header>

      <section class="bf-now" aria-label="当前状态">
        <div class="bf-now-main">
          <span class="bf-field-label">当前在做</span>
          <textarea
            v-if="editingNpc"
            v-model="editDraft['当前在做']"
            class="bf-textarea bf-textarea-sm"
            rows="3"
            aria-label="当前在做"
          ></textarea>
          <p v-else class="bf-now-doing">{{ cleanText(selectedNpcCard['当前在做']) || '还没有记录。' }}</p>
        </div>
        <dl class="bf-now-side">
          <div class="bf-now-item">
            <dt class="bf-field-label">位置</dt>
            <dd>
              <textarea
                v-if="editingNpc"
                v-model="editDraft['位置']"
                class="bf-textarea bf-textarea-sm"
                rows="1"
                aria-label="位置"
              ></textarea>
              <template v-else>{{ cleanText(selectedNpcCard['位置']) || '未记录' }}</template>
            </dd>
          </div>
          <div class="bf-now-item">
            <dt class="bf-field-label">当前状态</dt>
            <dd>
              <textarea
                v-if="editingNpc"
                v-model="editDraft['当前状态']"
                class="bf-textarea bf-textarea-sm"
                rows="2"
                aria-label="当前状态"
              ></textarea>
              <template v-else>{{ cleanText(selectedNpcCard['当前状态']) || '未记录' }}</template>
            </dd>
          </div>
        </dl>
        <p v-if="生活状态条目.length" class="bf-now-life">
          <span v-for="条 in 生活状态条目" :key="条.类" class="bf-now-life-item">
            <b class="bf-now-life-label">{{ 条.类 }}</b> {{ 条.时间 }}<template v-if="条.距今"> · {{ 条.距今 }}</template>
          </span>
        </p>
        <p v-else-if="selectedNpcCard['生活状态']" class="bf-now-life">{{ cleanText(selectedNpcCard['生活状态']) }}</p>
      </section>

      <section class="bf-ledger" aria-labelledby="bf-ledger-title">
        <header class="bf-section-head">
          <h3 id="bf-ledger-title">未了之事</h3>
          <span class="bf-block-aside">进行中 {{ 进行中数 }} / 上限 {{ 台账上限 }}</span>
        </header>

        <p v-if="台账条目.length === 0" class="bf-ledger-empty">账上还没有事情。</p>
        <ul v-else class="bf-ledger-list">
          <li v-for="事务 in 台账条目" :key="事务.编号" class="bf-ledger-item" :class="'is-' + 状态类(事务.状态)">
            <button
              class="bf-check"
              :class="{ checked: 事务.状态 === '已完成' }"
              :disabled="updating"
              :aria-label="事务.状态 === '已完成' ? `把 ${事务.编号} 重新标为进行中` : `把 ${事务.编号} 标为已完成`"
              :aria-pressed="事务.状态 === '已完成'"
              @click="改事务(事务, 事务.状态 === '已完成' ? '进行中' : '已完成')"
            >
              <span class="bf-check-box" aria-hidden="true">
                <PhCheck v-if="事务.状态 === '已完成'" :size="11" weight="bold" />
                <span v-else-if="事务.状态 === '已作废'" class="bf-check-dash"></span>
              </span>
            </button>

            <div class="bf-ledger-main">
              <div class="bf-ledger-line">
                <span class="bf-ledger-text">{{ 事务.内容 }}</span>
                <time v-if="事务.时间" class="bf-ledger-time">{{ 事务.时间 }}</time>
                <button
                  class="bf-text-btn bf-ledger-edit"
                  :aria-expanded="展开事务 === 事务.编号"
                  :aria-label="`修改 ${事务.编号} 的状态或结果`"
                  @click="展开事务 = 展开事务 === 事务.编号 ? null : 事务.编号"
                >
                  {{ 展开事务 === 事务.编号 ? '收起' : '修改' }}
                </button>
              </div>
              <p v-if="事务.结果" class="bf-ledger-result-text">
                结果：{{ 事务.结果 }}<template v-if="事务.完成方式 === '幕后'">（幕后）</template>
              </p>

              <div v-if="展开事务 === 事务.编号" class="bf-ledger-editor">
                <input
                  v-model="结果草稿[事务.编号]"
                  class="bf-input bf-input-sm"
                  :placeholder="事务.结果 ? '改写结果 / 作废原因' : '结果 / 作废原因'"
                  :aria-label="`${事务.编号} 的结果或作废原因`"
                  :disabled="updating"
                />
                <div class="bf-state-group" role="group" :aria-label="`修改 ${事务.编号} 的状态`">
                  <button
                    v-for="状态 in 台账状态表"
                    :key="状态"
                    class="bf-state-btn"
                    :class="{ active: 事务.状态 === 状态 }"
                    :disabled="updating"
                    :aria-pressed="事务.状态 === 状态"
                    :title="`把 ${事务.编号} 标记为${状态}`"
                    @click="改事务(事务, 状态)"
                  >
                    {{ 状态 }}
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>

        <div class="bf-ledger-add">
          <button v-if="!新增展开" class="bf-text-btn" @click="新增展开 = true">+ 新增事务</button>
          <template v-else>
            <input
              v-model="新增事务草稿"
              class="bf-input bf-input-sm"
              placeholder="要做什么"
              aria-label="新增一条事务"
              :disabled="updating"
              @keyup.enter="提交新增"
            />
            <button
              class="bf-btn bf-btn-sm"
              :disabled="updating || !新增事务草稿.trim()"
              title="新增一条事务（内容写下即冻结）"
              @click="提交新增"
            >
              添加
            </button>
            <button class="bf-text-btn" @click="取消新增">取消</button>
          </template>
        </div>
      </section>

      <RelationBody v-if="!editingNpc" :card="selectedNpcCard" />

      <section class="bf-notes" aria-labelledby="bf-notes-title">
        <header class="bf-section-head">
          <h3 id="bf-notes-title">人物侧记</h3>
        </header>
        <p v-if="detailFields.length === 0" class="bf-hint">还没有可展示的侧记。</p>
        <template v-for="组 in detailFields" :key="组.key">
          <h4 class="bf-notes-group">{{ 组.标题 }}</h4>
          <dl class="bf-notes-grid">
            <div v-for="field in 组.字段" :key="field" class="bf-note">
              <dt :title="字段说明表[field] || field">{{ field }}</dt>
              <dd>
                <!-- 受控字段按 字段控件表 的 type 渲染(附表 B / R9): 词表与区间都来自数据源, 不在这里手抄 -->
                <template v-if="editingNpc && 字段控件表[field]">
                  <!-- 下拉 -->
                  <select
                    v-if="字段控件表[field].type === 'select'"
                    v-model="editDraft[field]"
                    class="bf-select bf-select-sm"
                    :aria-label="field"
                  >
                    <option value="">{{ 字段控件表[field].空值文案 }}</option>
                    <option v-for="选项 in 字段控件表[field].选项" :key="选项" :value="选项">{{ 选项 }}</option>
                  </select>
                  <!-- 数字框: 空 = 未结算, 不写 0 -->
                  <input
                    v-else-if="字段控件表[field].type === 'number'"
                    v-model="editDraft[field]"
                    class="bf-input bf-input-sm"
                    type="number"
                    :min="字段控件表[field].min"
                    :max="字段控件表[field].max"
                    :step="字段控件表[field].step"
                    :aria-label="field"
                  />
                  <!-- 胶囊多选(恋爱标签): 满上限后未选中的置灰 -->
                  <div
                    v-else-if="字段控件表[field].type === 'tags'"
                    class="bf-tag-picker"
                    role="group"
                    :aria-label="field"
                  >
                    <button
                      v-for="词 in 字段控件表[field].词表"
                      :key="词"
                      type="button"
                      class="bf-chip bf-chip-pick"
                      :class="{ 'is-on': 草稿标签.includes(词) }"
                      :disabled="!草稿标签.includes(词) && 草稿标签.length >= 字段控件表[field].上限"
                      :aria-pressed="草稿标签.includes(词)"
                      @click="切换标签(词)"
                    >
                      {{ 词 }}
                    </button>
                  </div>
                  <!-- 日期: 保持文本(R3), 保留时刻 -->
                  <input
                    v-else-if="字段控件表[field].type === 'date'"
                    v-model="editDraft[field]"
                    class="bf-input bf-input-sm"
                    placeholder="YYYY-MM-DD HH:mm"
                    :aria-label="field"
                  />
                  <!-- 生理周期(R5): 阶段下拉 + 明细输入, `/NN` 只读 -->
                  <div v-else-if="字段控件表[field].type === 'cycle'" class="bf-split-row">
                    <select
                      class="bf-select bf-select-sm"
                      :value="生理阶段"
                      aria-label="生理阶段"
                      @change="设生理阶段(($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">（未记录阶段）</option>
                      <option v-for="阶段名 in 生理阶段选项" :key="阶段名" :value="阶段名">{{ 阶段名 }}</option>
                    </select>
                    <input
                      class="bf-input bf-input-sm"
                      :value="生理明细"
                      placeholder="Day 12/28 或 孕 16周+3天"
                      aria-label="生理明细"
                      @input="设生理明细(($event.target as HTMLInputElement).value)"
                    />
                    <span v-if="周期长度" class="bf-readonly" title="周期长度是彼方锁定值，不可手改">
                      /{{ 周期长度 }}
                    </span>
                  </div>
                  <textarea
                    v-else
                    v-model="editDraft[field]"
                    class="bf-textarea bf-textarea-sm"
                    rows="2"
                    :aria-label="field"
                  ></textarea>
                  <!-- 规范提示(A14): 11.5px 灰字, 让玩家知道为什么不能随便填 -->
                  <p class="bf-field-hint">{{ 字段控件表[field].提示 }}</p>
                </template>
                <!-- 生活状态(R4): 三项拆开展示 + 整份回写(不承诺按类目合并) -->
                <div v-else-if="editingNpc && field === '生活状态'" class="bf-split-col">
                  <label v-for="类目 in 生活状态类目" :key="类目" class="bf-split-row">
                    <span class="bf-split-label">{{ 类目 }}</span>
                    <input
                      class="bf-input bf-input-sm"
                      :value="生活状态项[类目]"
                      :placeholder="`${类目}的时间与事件`"
                      :aria-label="`生活状态 - ${类目}`"
                      @input="设生活状态项(类目, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                  <p class="bf-field-hint">三项拼成「吃饭(…); 洗漱(…); 睡眠(…)」整份写回；空项不写进串。</p>
                </div>
                <!-- 近期关键事件(R4): 三条拆开 + 按「；」拼回 -->
                <div v-else-if="editingNpc && field === '近期关键事件'" class="bf-split-col">
                  <label v-for="序号 in 近期事件上限" :key="序号" class="bf-split-row">
                    <span class="bf-split-label">{{ 序号 }}</span>
                    <input
                      class="bf-input bf-input-sm"
                      :value="近期事件项[序号 - 1]"
                      :placeholder="`第 ${序号} 条（留空 = 该条不存在）`"
                      :aria-label="`近期关键事件 第 ${序号} 条`"
                      @input="设近期事件项(序号 - 1, ($event.target as HTMLInputElement).value)"
                    />
                  </label>
                  <p class="bf-field-hint">最多 3 条，按「；」拼回；清空某条即删该条。</p>
                </div>
                <textarea
                  v-else-if="editingNpc"
                  v-model="editDraft[field]"
                  class="bf-textarea bf-textarea-sm"
                  rows="2"
                  :aria-label="field"
                ></textarea>
                <template v-else>{{ cleanText(selectedNpcCard[field]) }}</template>
              </dd>
            </div>
          </dl>
        </template>
      </section>
    </article>

    <div v-else class="bf-empty bf-profile-empty">
      <p class="bf-empty-text">从左侧选择一个人物</p>
      <p class="bf-empty-hint">角色卡里的状态、事务和侧记都会显示在这里。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PhCheck, PhHeart, PhPencilSimple } from '@phosphor-icons/vue';
import { useNPC面板 } from './NPC面板';
import RelationBody from './页面-关系身体.vue';
import { 台账上限 } from './事务台账';
import { 拆分生活状态 } from './生活状态';

const {
  npcEntries, autoTrackEnabled, selectedNpc, selectedNpcCard, data, 头像色号,
  editingNpc, 是恋爱对象, 有恋爱数据, 切换恋爱对象, startEditNpc, saveEditNpc, cancelEditNpc, updating,
  cleanText, editDraft, 台账条目, 状态类, 结果草稿, 台账状态表, 改事务,
  新增事务草稿, 新增一条事务, detailFields, 字段说明表,
  字段控件表, 切换标签, 草稿标签,
  生活状态项, 设生活状态项, 生活状态类目, 近期事件项, 设近期事件项, 近期事件上限,
  生理阶段, 生理明细, 周期长度, 设生理阶段, 设生理明细, 生理阶段选项,
} = useNPC面板();

const 进行中数 = computed(() => 台账条目.value.filter(事务 => 事务.状态 === '进行中').length);
/** 生活状态: 拆成"类目 + 时刻 + 距今"三条, 不再把整串摊成一行; 剧情时间用来算"约 N 小时前" */
const 生活状态条目 = computed(() => 拆分生活状态(
  toValue(selectedNpcCard)?.['生活状态'],
  String(toValue(data)?.['剧情时间'] ?? ''),
));
const profileEl = ref<HTMLElement | null>(null);
const 展开事务 = ref<string | null>(null);
const 新增展开 = ref(false);

function 提交新增(): void {
  新增一条事务();
  if (!新增事务草稿.value.trim()) 新增展开.value = false;
}
function 取消新增(): void {
  新增展开.value = false;
  新增事务草稿.value = '';
}

function 回到顶部(): void {
  if (profileEl.value) profileEl.value.scrollTop = 0;
}
watch(selectedNpc, () => {
  展开事务.value = null;
  nextTick(回到顶部);
});
onMounted(() => nextTick(回到顶部));
</script>
