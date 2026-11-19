// 彼方 · 拼装页(零件化 v3 UI —— 条目列表) —— 批次: 2026-11-19
//
// 这一页做四件事:
//   ① 可排序条目列表(内置 15 项 + 用户条目, 同一列表)
//   ② 原位记号(C19): 内置项有, 拖走后记号留在原处; **关闭的也显示**
//   ③ 用户条目的视觉标记: 与内置项长得不一样, 不是留白(缺口 3)
//   ④ 预览: 显示**实际会发出去**的全文 + **内容顺序 → 最终第几条消息**的映射(C21)
//
// ── 本页最重要的一条约束: 别让用户以为"列表 = 消息" ──────────────────
// 今晚已经在"文案说 A 实际发 B"上栽过两次。列表显示的是**内容顺序**,
// 而实际发出去的是**消息形状** —— 两者**从来不一样**(内置项会按块合并成 2~3 条消息)。
//
// 所以本页**同屏显示两个东西**:
//   · 左/上: 条目列表(内容顺序)
//   · 右/下: 消息形状(哪几条消息、每块含哪些条目、最终第几条)
// 并且预览区明确写"下面是实发的样子"。用户拖完能看到"消息数没变但内容换了位置"。
//
// ── 预览同源(与上一批同一条铁律) ──────────────────────────────────
// **预览不自己拼装。** 它调 `收集本轮输入({ 只读: true })` —— 实发用的同一个取料入口,
// 里面调的是同一个 `buildUpdateMessages`。所以"同一份入参、同一个函数"是结构事实。
//
// 截断点(需求方 2026-11-19 裁定): 含宏展开、不含打散标记(打散在 api.ts, 本页不调它)。
//
// U3b(结构锁): 本文件**不出现任何 buildUpdateMessages 调用**。
//   由 tests/bifang-拼装页.test.ts 的 [U3b] 段扫源码断言, [U3c] 段用变异证明那条扫得动。
<script setup lang="ts">
import { computed, ref } from 'vue';
import { 零件表, 清单摘要 } from './零件表';
import {
  默认列表顺序, 造内置列表, 解析位置, 合并成块, 块内用户文本,
  零件所在块, 原位序号, 规范条目, 生成条目id,
  type 列表项, type 用户条目, type 解析段,
} from './条目列表';
import { 收集本轮输入 } from './更新输入';
import { useDebugStore } from './日志仓';
import { toastWarning } from './toast';
import { use设置面板 } from './设置面板';
import type { Host } from './host';

const props = defineProps<{ host: Host }>();
const 设置面板 = use设置面板();
const settings = 设置面板.settings;

/** 内置项的内容由实发时现取 —— 本页只显示"它属于哪块"，不显示内容（内容太长）。
 *  取一个占位串给 `解析位置` 用（它只需要"这个零件存在"这个事实）。 */
const 取内容占位 = (代号: string) => `<${代号}>`;

/** 当前列表：内置 15 项 + 用户条目。
 *  **顺序来自 settings.提示词.条目顺序**（没有就用默认顺序）。
 *  这一份是本页的"内容顺序"的唯一表示。 */
const 列表 = computed<列表项[]>(() => {
  const 内置 = 造内置列表(取内容占位);
  const 关闭 = new Set<string>(settings.value.提示词?.关闭零件 ?? []);
  for (const 项 of 内置) {
    if (关闭.has(项.代号))
      项.启用 = false;
  }
  const 用户们: 用户条目[] = (settings.value.提示词?.条目 ?? []).map((项: any, i: number) => 规范条目(项, i));
  // 顺序: 若 settings 里存了 条目顺序（含内置代号与用户 id），按它排；否则内置在前、用户在后
  const 存序: string[] = settings.value.提示词?.条目顺序 ?? [];
  if (存序.length === 0)
    return [...内置, ...用户们];
  const 全部: 列表项[] = [...内置, ...用户们];
  const 按序 = 存序.map(id => 全部.find(项 => 项.id === id)).filter(Boolean) as 列表项[];
  // 没在顺序里的（新加的条目）追加到末尾 —— 不许丢
  const 剩下 = 全部.filter(项 => !存序.includes(项.id));
  return [...按序, ...剩下];
});

/** 保存顺序（拖拽后调用） */
function 保存顺序(新列表: 列表项[]) {
  settings.value.提示词.条目顺序 = 新列表.map(项 => 项.id);
}

/** 拖拽：HTML5 draggable。**直接改列表顺序**（C17），不生成占位符条目。 */
const 拖动中 = ref<string | null>(null);
function 开始拖(id: string) {
  拖动中.value = id;
}
function 放到(id: string) {
  const 从 = 拖动中.value;
  拖动中.value = null;
  if (!从 || 从 === id)
    return;
  const 现 = [...列表.value];
  const 从位 = 现.findIndex(项 => 项.id === 从);
  const 到位 = 现.findIndex(项 => 项.id === id);
  if (从位 < 0 || 到位 < 0)
    return;
  const [移动项] = 现.splice(从位, 1);
  现.splice(到位, 0, 移动项);
  保存顺序(现);
}

/** 开关：内置项写 关闭零件；用户条目写自己的 启用 */
function 是关闭的(项: 列表项): boolean {
  if (项.来源 === '内置')
    return (settings.value.提示词?.关闭零件 ?? []).includes(项.代号);
  return 项.启用 === false;
}
function 切换(项: 列表项) {
  if (项.来源 === '内置') {
    const 现: string[] = settings.value.提示词?.关闭零件 ?? [];
    settings.value.提示词.关闭零件 = 现.includes(项.代号)
      ? 现.filter(号 => 号 !== 项.代号)
      : [...现, 项.代号];
    return;
  }
  const 条目们 = settings.value.提示词?.条目 ?? [];
  const i = 条目们.findIndex((x: any) => String(x.id) === 项.id);
  if (i >= 0)
    条目们[i].启用 = !(条目们[i].启用 !== false);
}

/** 用户条目增删改 */
function 新增条目() {
  const 条目们 = settings.value.提示词?.条目 ?? [];
  // id 由 `生成条目id()` 产出（uuid）—— 与 settings 里的存量去重共用同一个函数，
  // 见 条目列表.ts 的注释。**这里不再自己拼 id**，否则就是两处实现。
  const id = 生成条目id(new Set(条目们.map((x: any) => String(x.id ?? ''))));
  条目们.push({ id, role: 'system', content: '', 启用: true });
  settings.value.提示词.条目 = 条目们;
  // 新条目追加到顺序末尾
  settings.value.提示词.条目顺序 = [...(settings.value.提示词?.条目顺序 ?? []), id];
}
function 删除条目(id: string) {
  settings.value.提示词.条目 = (settings.value.提示词?.条目 ?? []).filter((x: any) => String(x.id) !== id);
  settings.value.提示词.条目顺序 = (settings.value.提示词?.条目顺序 ?? []).filter((x: string) => x !== id);
}
function 改条目(id: string, 字段: string, 值: any) {
  const 条目们 = settings.value.提示词?.条目 ?? [];
  const i = 条目们.findIndex((x: any) => String(x.id) === id);
  if (i >= 0)
    条目们[i][字段] = 值;
}

/** 每个零件的**真实字数**（来自预览时取到的那一份）。
 *
 *  ── 为什么必须从这里取，而不能用别的东西顶（需求方 2026-11-19 裁定）──
 *  这一列是给用户判断"关掉这个能省多少"用的。**给一个假数字比不给更坏** ——
 *  用户会据此做决定。今晚已经为同一件事返工过一次（R6 报 12 字、实际 5333 字，差 444 倍）。
 *
 *  所以：**没预览过就是空的**（显示 `—`），不许拿"零件说明的长度"顶。
 *  有值时的来处写在列表下方（"字数取自 hh:mm:ss 那次预览"）。 */
const 零件字数 = ref<Record<string, number>>({});
const 字数来处 = ref('');

/** 消息形状（C21 的核心）：把"内容顺序"解析成"块"，再算每块是第几条消息。
 *  **与实发走同一套**: 解析位置 + 合并成块（不是本页自己想的规则）。 */
const 消息形状 = computed(() => {
  const 解析 = 解析位置({ 列表: 列表.value, 关闭零件: settings.value.提示词?.关闭零件 ?? [] });
  const 块们 = 合并成块(解析.段们);
  return 块们.map((块, i) => {
    const 用户文本 = 块内用户文本(块);
    const 内置代号们 = 块.filter(段 => 段.来源 === '内置').map(段 => 段.代号!);
    // 字数: 该块内各内置零件的真实字数之和。
    // **任何一个零件缺字数, 整块就显示 `—`** —— 部分和比全无更误导。
    const 各字数 = 内置代号们.map(代 => 零件字数.value[代]);
    const 全部有 = 内置代号们.length > 0 && 各字数.every(n => typeof n === 'number');
    const 字数 = 内置代号们.length === 0
      ? (字数来处.value ? 用户文本.length : null)
      : (全部有 ? 各字数.reduce((和, n) => 和 + (n as number), 0) : null);
    return {
      序号: i + 1,
      role: 块[0].role,
      块名: 内置代号们.length > 0 ? 零件所在块(内置代号们[0]) : '用户条目',
      含: 内置代号们.length > 0
        ? 内置代号们.map(代 => 零件表.find(件 => 件.代号 === 代)?.名 ?? 代)
        : 块.map(段 => `用户条目 #${段.id}`),
      字数,
    };
  });
});

// ── 预览 ──────────────────────────────────────────────────────
const 预览中 = ref(false);
const 预览文本 = ref('');
const 预览时间 = ref('');
const 预览错误 = ref('');

/** 生成预览。**本页唯一一处取料调用, 走实发同一个入口。** */
async function 生成预览() {
  if (预览中.value)
    return;
  预览中.value = true;
  预览错误.value = '';
  try {
    const 结果 = await 收集本轮输入({
      host: props.host,
      settings: settings.value,
      force: true,
      timing: {},
      debugStore: useDebugStore(),
      只读: true,
    });
    if (!结果) {
      预览错误.value = '取不到可分析的内容(可能还没有 AI 回复, 或最新回复过短)';
      预览文本.value = '';
      return;
    }
    const 段们 = (结果.messages ?? []).map((段: any, i: number) =>
      `── 第 ${i + 1} 条 · ${段.role} ──\n${段.content}`);
    if (结果.工具说明)
      段们.push(`── 工具说明 ──\n${结果.工具说明}`);
    预览文本.value = 段们.join('\n\n');
    预览时间.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    // **字数取自这一次预览的真实内容**（需求方裁定：不许拿别的东西顶）。
    // `结果.零件内容` 就是实发那份 `buildUpdateMessages` 产出的各零件原文。
    const 内容表 = (结果 as any).零件内容 ?? {};
    const 表: Record<string, number> = {};
    for (const [代, 文] of Object.entries(内容表))
      表[代] = String(文 ?? '').length;
    零件字数.value = 表;
    字数来处.value = 预览时间.value;
  }
  catch (error: any) {
    预览错误.value = `预览失败: ${error?.message ?? String(error)}`;
    toastWarning('预览失败, 详见本页提示');
  }
  finally {
    预览中.value = false;
  }
}

/** 内置项的原位（C19：关闭的也显示） */
function 原位(项: 列表项): string {
  if (项.来源 !== '内置')
    return '';
  const 号 = 原位序号(项.代号);
  return 号 === undefined ? '' : `#${号 + 1}`;
}
/** 是否被拖离了原位 */
function 偏离原位(项: 列表项): boolean {
  if (项.来源 !== '内置')
    return false;
  return 默认列表顺序.indexOf(项.代号) !== 列表.value.findIndex(x => x.id === 项.id);
}
</script>

<template>
  <section class="bf-page bf-page-parts">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">拼装</h2>
        <p class="bf-page-sub">拖动改顺序、勾选框开关、自己写条目。下面两栏永远同时显示。</p>
      </div>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-sm" @click="新增条目">＋ 添加一段</button>
        <button class="bf-btn bf-btn-sm bf-btn-primary" :disabled="预览中" @click="生成预览">
          {{ 预览中 ? '正在取料…' : '生成预览' }}
        </button>
      </div>
    </header>

    <p v-if="预览中" class="bf-hint" role="status">
      正在读这一轮的正文、世界书与状态卡，通常需要一两秒。
    </p>
    <p v-if="预览错误" class="bf-hint bf-hint-warn" role="alert">{{ 预览错误 }}</p>

    <!-- 两栏: 左边"内容顺序"，右边"消息形状"。同屏，因为两者从来不一样 -->
    <div class="bf-parts-cols">
      <!-- ── 左栏: 条目列表（内容顺序） ── -->
      <div class="bf-parts-col">
        <details class="bf-setting-group bf-set-group" open>
          <summary class="bf-set-head">
            <span class="bf-set-index" aria-hidden="true">01</span>
            <h3>内容顺序</h3>
            <span class="bf-set-aside">{{ 列表.length }} 段</span>
          </summary>
          <p class="bf-hint">
            拖动改的是<strong>内容先后</strong>。内置段只读（勾掉即关闭），你自己写的可以随便改。
          </p>

          <div
            v-for="(项, i) in 列表"
            :key="项.id"
            class="bf-set-seg-card bf-part-card"
            :class="{ 'is-off': 是关闭的(项), 'is-user': 项.来源 === '用户' }"
            draggable="true"
            @dragstart="开始拖(项.id)"
            @dragover.prevent
            @drop.prevent="放到(项.id)"
          >
            <div class="bf-form-grid bf-set-seg-grid">
              <label class="bf-field">
                <span class="bf-form-label">
                  <span class="bf-entry-grip" aria-hidden="true">⋮⋮</span>
                  {{ i + 1 }}.
                  <template v-if="项.来源 === '内置'">
                    {{ 零件表.find(件 => 件.代号 === 项.代号)?.名 }}
                    <span class="bf-parts-code">{{ 项.代号 }}</span>
                  </template>
                  <template v-else>你的条目</template>
                </span>
                <!-- 内置项：只读 + 原位记号（C19：关闭的也显示） -->
                <span v-if="项.来源 === '内置'" class="bf-part-meta">
                  <span
                    class="bf-entry-origin"
                    :class="{ 'is-drifted': 偏离原位(项) }"
                    :title="偏离原位(项) ? `原位在 ${原位(项)}，已被拖走` : '在原位'"
                  >原位 {{ 原位(项) }}</span>
                  <span class="bf-entry-block">{{ 零件所在块(项.代号) }}</span>
                  <span class="bf-entry-locked" title="内置内容由代码生成，不能改；想改请自己新增一条">只读</span>
                </span>
                <!-- 用户条目：不同标记（不是留白），且有 role 下拉 -->
                <span v-else class="bf-part-meta">
                  <span class="bf-entry-user-tag" title="你自己写的条目，没有原位">自写</span>
                  <select
                    class="bf-select bf-select-sm"
                    :value="项.role ?? 'system'"
                    aria-label="身份"
                    @change="改条目(项.id, 'role', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="system">system</option>
                    <option value="user">user</option>
                    <option value="assistant">assistant</option>
                  </select>
                </span>
              </label>
            </div>

            <!-- 用户条目的正文（内置项没有编辑框 —— 类型上也没有） -->
            <textarea
              v-if="项.来源 === '用户'"
              class="bf-textarea bf-textarea-sm"
              rows="3"
              :value="项.content ?? ''"
              placeholder="在这里写你的提示词"
              @input="改条目(项.id, 'content', ($event.target as HTMLTextAreaElement).value)"
            ></textarea>

            <div class="bf-set-seg-foot">
              <label class="bf-set-inline-toggle">
                <input
                  class="bf-switch"
                  type="checkbox"
                  :checked="!是关闭的(项)"
                  :aria-label="`启用 ${项.来源 === '内置' ? 项.代号 : '你的条目'}`"
                  @change="切换(项)"
                />
                <span>启用</span>
              </label>
              <button
                v-if="项.来源 === '用户'"
                class="bf-btn bf-btn-sm bf-btn-danger"
                type="button"
                @click="删除条目(项.id)"
              >
                删除这一段
              </button>
              <span v-else class="bf-hint">关掉它 = 这一段不进提示词</span>
            </div>
          </div>

          <p class="bf-hint">
            你的条目里可以写 <code v-pre>{{彼方:世界书}}</code> 这种占位符，把内置内容嵌进你自己的话里。
          </p>
        </details>
      </div>

      <!-- ── 右栏: 消息形状 ── -->
      <div class="bf-parts-col">
        <details class="bf-setting-group bf-set-group" open>
          <summary class="bf-set-head">
            <span class="bf-set-index" aria-hidden="true">02</span>
            <h3>消息形状</h3>
            <span class="bf-set-aside">{{ 消息形状.length }} 条消息</span>
          </summary>
          <p class="bf-hint">
            这是<strong>实际发出去的样子</strong>。左栏是内容先后，右栏是消息 —— 同块的会合成一条，所以左边多行在右边只有几行。
          </p>

          <ol class="bf-msg-list">
            <li v-for="条 in 消息形状" :key="条.序号" class="bf-msg">
              <span class="bf-msg-no">第 {{ 条.序号 }} 条</span>
              <span class="bf-msg-role" :class="`role-${条.role}`">{{ 条.role }}</span>
              <span class="bf-msg-block">{{ 条.块名 }}</span>
              <span class="bf-msg-contains">{{ 条.含.join('、') }}</span>
              <span class="bf-msg-size" :title="条.字数 === null ? '还没生成预览，取不到真实字数' : '该条消息的实际字数'">
                {{ 条.字数 === null ? '—' : `${条.字数} 字` }}
              </span>
            </li>
          </ol>

          <p class="bf-hint">
            字数取自{{ 字数来处 ? ` ${字数来处} 那次预览` : '预览' }}——
            <strong>没生成预览时显示 —</strong>，因为不点就取不到这一轮的真实内容。
          </p>
        </details>
      </div>
    </div>

    <section v-if="预览文本" class="bf-parts-preview">
      <header class="bf-parts-preview-head">
        <h3>实际会发出去的内容</h3>
        <span class="bf-parts-when">取样于 {{ 预览时间 }}</span>
      </header>
      <pre class="bf-parts-pre">{{ 预览文本 }}</pre>
    </section>
  </section>
</template>

<style scoped>
/* 这一页的视觉语言**沿用设置页那套**（bf-setting-group / bf-set-head / bf-set-seg-card /
   bf-form-grid / bf-field / bf-textarea / bf-set-seg-foot / bf-set-inline-toggle），
   定义在 面板样式.css。这里只写这一页**特有**的排版，不另起一套。

   为什么不另起一套: 设置页那套是全项目统一的；另起一套等于给以后的样式改动制造两个地方。 */
.bf-parts-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .bf-parts-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* 卡片：拖拽光标 + 关闭态变淡。其余留白/边框由 bf-set-seg-card 提供。 */
.bf-part-card {
  cursor: grab;
}
.bf-part-card.is-off {
  opacity: 0.5;
}
.bf-part-card.is-user {
  background: rgba(120, 170, 255, 0.05);
}
/* 卡片标题那一行的附加信息（原位 / 块名 / 只读 / 自写 / role 下拉） */
.bf-part-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  flex-wrap: wrap;
}
.bf-entry-grip {
  margin-right: 4px;
  color: var(--bf-text-dim, #8a8a92);
  font-size: 11px;
  letter-spacing: -2px;
}
.bf-parts-code {
  margin-left: 5px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-entry-origin {
  font-size: 10.5px;
  font-family: ui-monospace, monospace;
  color: var(--bf-text-dim, #8a8a92);
  border-left: 2px solid currentColor;
  padding-left: 4px;
}
.bf-entry-origin.is-drifted {
  opacity: 0.35;
  font-style: italic;
}
.bf-entry-user-tag {
  font-size: 10.5px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(120, 170, 255, 0.18);
  color: #9dc0ff;
}
.bf-entry-block {
  font-size: 10.5px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--bf-bg-sunken, rgba(0, 0, 0, 0.22));
  color: var(--bf-text-dim, #8a8a92);
}
.bf-entry-locked {
  font-size: 10.5px;
  color: var(--bf-text-dim, #8a8a92);
}
/* 消息形状列表：与设置页的行距/字号一致 */
.bf-msg-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bf-msg {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid var(--bf-line, rgba(255, 255, 255, 0.08));
  font-size: 12px;
}
.bf-msg:last-child {
  border-bottom: 0;
}
.bf-msg-no {
  font-variant-numeric: tabular-nums;
  color: var(--bf-text-dim, #8a8a92);
  font-size: 11px;
  white-space: nowrap;
}
.bf-msg-role {
  font-family: ui-monospace, monospace;
  font-size: 10.5px;
  padding: 0 4px;
  border-radius: 3px;
}
.bf-msg-role.role-system {
  background: rgba(120, 170, 255, 0.16);
}
.bf-msg-role.role-user {
  background: rgba(120, 220, 160, 0.16);
}
.bf-msg-role.role-assistant {
  background: rgba(230, 200, 120, 0.16);
}
.bf-msg-block {
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
  white-space: nowrap;
}
.bf-msg-contains {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bf-msg-size {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
  white-space: nowrap;
}
.bf-hint-warn {
  color: var(--bf-warn, #e0a030);
}
.bf-parts-preview {
  margin-top: 16px;
}
.bf-parts-preview-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
}
.bf-parts-preview-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.bf-parts-when {
  font-size: 11.5px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-parts-pre {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  padding: 10px;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bf-bg-sunken, rgba(0, 0, 0, 0.22));
  border-radius: 6px;
}
</style>
