// 彼方 · 拼装页(零件化 v2 UI) —— 批次: 2026-11-19 第五批
//
// 这一页做三件事:
//   ① 表格: 17 个零件的 开关 / 字数 / 去向
//   ② 可搬位置: 每个零件搬到哪个锚点(等价于写占位符, 但不用懂语法)
//   ③ 预览: 显示**实际会发出去**的全文
//
// ── 预览同源(这是本页最重要的一条约束) ──────────────────────────────
// **预览不自己拼装。** 它调 `收集本轮输入({ 只读: true })` —— 那正是实发用的取料入口,
// 里面调的是同一个 `buildUpdateMessages`。所以"同一份入参、同一个函数"是结构事实,
// 不是"我记得保持一致"。
//
// 截断点(需求方 2026-11-19 裁定):
//   · 含**宏展开**(buildUpdateMessages 内部已展开, host.macros.expand → substitudeMacros)
//   · 不含**打散标记**(打散在 api.ts 里做, 本页不调它 —— 它天然不含标记)
//
// 为什么不能为预览另写一套拼装: 两套会漂, 而漂的那一刻没人知道 —— 11-18 那次
// "文案说 A、实际发 B"就是这么来的, 只不过这次漂的是预览。
//
// U3b(结构锁): 本文件**不出现任何 buildUpdateMessages 调用**。
//   由 tests/bifang-拼装页.test.ts 的 [U3b] 段扫源码断言, [U3c] 段用变异证明那条扫得动。
<script setup lang="ts">
import { computed, ref } from 'vue';
import { 零件表, 清单摘要 } from './零件表';
import { 收集本轮输入 } from './更新输入';
import { useDebugStore } from './日志仓';
import { toastWarning } from './toast';
import { use设置面板 } from './设置面板';
import type { Host } from './host';
const props = defineProps<{ host: Host }>();
const 设置面板 = use设置面板();
const settings = 设置面板.settings;

/** 可搬的位置(与 settings 里的 零件位置 枚举一致) */
const 位置选项 = ['默认位置', '最前', '主提示词之后', '任务之前', '任务之后', '最后'] as const;

/** 当前零件的关闭集合(读写 settings, 立即生效) */
function 是关闭的(代号: string): boolean {
  return (settings.value.提示词?.关闭零件 ?? []).includes(代号);
}
function 切换关闭(代号: string) {
  const 现值: string[] = settings.value.提示词?.关闭零件 ?? [];
  settings.value.提示词.关闭零件 = 现值.includes(代号)
    ? 现值.filter(号 => 号 !== 代号)
    : [...现值, 代号];
}

/** 当前零件搬到的位置('默认位置' = 不搬) */
function 当前位置(代号: string): string {
  return (settings.value.提示词?.零件位置 ?? {})[代号] ?? '默认位置';
}
function 设置位置(代号: string, 位置: string) {
  const 表 = { ...(settings.value.提示词?.零件位置 ?? {}) };
  if (位置 === '默认位置')
    delete 表[代号];
  else
    表[代号] = 位置;
  settings.value.提示词.零件位置 = 表;
}
/** 从 change 事件里取下拉的当前值。
 *  为什么单独一个函数: 模板里不能写 `as HTMLSelectElement`(那是 TS 语法,
 *  Vue 模板编译器不认 —— 会报 "Duplicate attribute / Element is missing end tag",
 *  而 `tsc --noEmit` 抓不到, 只有 webpack 才抓得到)。 */
function 读下拉值(事件: Event): string {
  return String((事件.target as HTMLSelectElement | null)?.value ?? '默认位置');
}

/** D9(场景判断)只许 system —— 所以它搬位置时不给 user/assistant 选项。
 *  U4 的理由(验收): 给一个必错的选项, 等于把 warn 变成常态流程, 那 warn 就不算 warn 了。
 *  本页所有搬位置都写 role='system'(见 更新输入.ts 的 零件位置转段), 所以这条天然满足;
 *  这里只是把"为什么没有 role 下拉"写清楚。 */

// ── 预览 ──────────────────────────────────────────────────────
const 预览中 = ref(false);
const 预览文本 = ref('');
const 预览时间 = ref('');
const 预览错误 = ref('');
const 预览清单 = ref([]) as import('vue').Ref<any[]>;

/** 生成预览。
 *
 *  **这是本页唯一一处取料调用, 且走的是实发同一个入口。**
 *  `只读: true` 保证它不写日志、不打日志行 —— 预览不该在日志页留下"我更新过"的痕迹。 */
async function 生成预览() {
  if (预览中.value)
    return;
  预览中.value = true;
  预览错误.value = '';
  try {
    // 与实发**同一份入参形状**: force=true 表示"现在就要"(预览不受"慢一步"影响)
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
    // 原样显示: messages 按条列, 工具说明单独一块。**不加工、不截断、不重排**。
    const 段们 = (结果.messages ?? []).map((段: any, i: number) =>
      `── 第 ${i + 1} 条 · ${段.role} ──\n${段.content}`);
    if (结果.工具说明)
      段们.push(`── 工具说明 ──\n${结果.工具说明}`);
    预览文本.value = 段们.join('\n\n');
    预览清单.value = 结果.拼装清单 ?? [];
    预览时间.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }
  catch (error: any) {
    预览错误.value = `预览失败: ${error?.message ?? String(error)}`;
    toastWarning('预览失败, 详见本页提示');
  }
  finally {
    预览中.value = false;
  }
}

/** 表格行: 直接来自 V1 拼装清单(不另算字数)。
 *  清单为空(全默认且没预览过)时, 用零件表兜底显示"点预览看实际体量" ——
 *  **不自己估一个数**, 那会造出第二个假账。 */
const 行们 = computed(() => {
  if (预览清单.value.length > 0)
    return 预览清单.value;
  return 零件表.map(件 => ({
    代号: 件.代号,
    名: 件.名,
    状态: 是关闭的(件.代号) ? '已关闭' : '—',
    位置: '点「生成预览」看实际去向',
    字数: null as number | null,
    备注: 件.承重 ? `承重件(${件.承重})` : '',
  }));
});

const 摘要 = computed(() => (预览清单.value.length > 0 ? 清单摘要(预览清单.value) : ''));
</script>

<template>
  <section class="bf-page bf-page-parts">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">拼装</h2>
        <p class="bf-page-sub">每一块内容去了哪里、占多少字。关掉或搬走都会立刻生效。</p>
      </div>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-sm bf-btn-primary" :disabled="预览中" @click="生成预览">
          {{ 预览中 ? '正在取料…' : '生成预览' }}
        </button>
      </div>
    </header>

    <p v-if="预览中" class="bf-hint" role="status">
      正在读这一轮的正文、世界书与状态卡，通常需要一两秒。
    </p>
    <p v-if="预览错误" class="bf-hint bf-hint-warn" role="alert">{{ 预览错误 }}</p>

    <p v-if="摘要" class="bf-parts-summary">{{ 摘要 }}</p>

    <table class="bf-parts-table">
      <thead>
        <tr>
          <th scope="col">零件</th>
          <th scope="col">开启</th>
          <th scope="col">搬到</th>
          <th scope="col">字数</th>
          <th scope="col">去向</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="行 in 行们" :key="行.代号" :class="{ 'is-off': 行.状态 === '已关闭' }">
          <th scope="row">
            <span class="bf-parts-code">{{ 行.代号 }}</span>
            <span class="bf-parts-name">{{ 行.名 }}</span>
          </th>
          <td>
            <input
              type="checkbox"
              :checked="!是关闭的(行.代号)"
              :aria-label="`启用 ${行.名}`"
              @change="切换关闭(行.代号)"
            />
          </td>
          <td>
            <!-- R6/R7 不可搬迁(由自己的开关控制), 给它们一个禁用的下拉比藏起来更好:
                 藏起来用户会问"为什么别的有它没有", 禁用 + title 说清原因 -->
            <select
              v-if="零件表.find(件 => 件.代号 === 行.代号)?.可搬迁"
              :value="当前位置(行.代号)"
              :aria-label="`${行.名} 的位置`"
              @change="设置位置(行.代号, 读下拉值($event))"
            >
              <option v-for="项 in 位置选项" :key="项" :value="项">{{ 项 }}</option>
            </select>
            <span v-else class="bf-parts-locked" title="这一块由它自己的开关控制，不能单独搬位置">跟开关走</span>
          </td>
          <td class="bf-parts-num">
            {{ 行.字数 === null ? '—' : 行.字数 }}
          </td>
          <td>
            <span v-if="行.备注" class="bf-parts-note">{{ 行.备注 }}</span>
            <span v-else>{{ 行.位置 }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="bf-hint">
      字数是实际会发出去的量。没点「生成预览」时显示 —，因为不点就取不到这一轮的真实内容。
    </p>

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
.bf-parts-summary {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-parts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.bf-parts-table th,
.bf-parts-table td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--bf-line, rgba(255, 255, 255, 0.08));
  vertical-align: middle;
}
.bf-parts-table thead th {
  font-weight: 600;
  font-size: 11.5px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-parts-table tbody th {
  font-weight: 500;
  white-space: nowrap;
}
.bf-parts-table tr.is-off {
  opacity: 0.55;
}
.bf-parts-code {
  display: inline-block;
  min-width: 34px;
  margin-right: 6px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-parts-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.bf-parts-locked {
  font-size: 11.5px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-parts-note {
  font-size: 11.5px;
  color: var(--bf-text-dim, #8a8a92);
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
