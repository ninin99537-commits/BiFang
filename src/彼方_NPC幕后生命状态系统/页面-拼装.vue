// 彼方 · 拼装页（2026-11-19 模板化）—— 批次: 2026-11-19 模板化
//
// ── 这一页是什么 ──────────────────────────────────────────────────
// **三段可编辑文本 + 占位符**。用户要的是"一块能写字的地方，上面挂着几个占位符"，
// 不是"更好看的配置卡片"（需求方 #206 原话）。
//
// 三段 = 三条消息（系统段 / 场景判断 / 用户段）。**为什么必须是三段**：
// 现在的产物是 system(规则) / system(场景判断) / user(剧情与状态)，
// 那个"三条"由块归属决定，一段文本表达不了（实测：全拼一起差 1 字，那 1 字是消息边界）。
//
// ── 四条硬规则（需求方 #206）────────────────────────────────────────
//   ① **模板即全部**：没写进模板的零件 = 不发送（等同关闭），不是"按默认位置补回来"
//   ② **恢复默认 = 重置成默认模板，内容和顺序一起**，要二次确认
//   ③ **预览 = 把占位符换成真实内容后的样子**（同源：同一个拼装函数、同一份入参）
//   ④ **拼装清单保留但只读** —— 它不再是开关卡片，是给用户查"我写了却没生效"的对照表
//
// ── 说明放界面，不放模板（需求方 #213 ③ / #221 ③）──────────────────
// 模板里每一行都会发给模型。放一句"你可以在这里加话"就是**多发给模型一句废话**。
// 所以说明、占位符列表、恢复默认按钮全在**编辑区外面**。
//
// ── 预览同源（铁律不变）──────────────────────────────────────────
// 预览不自己拼装。它调 `收集本轮输入({ 只读: true })` —— 实发用的同一个取料入口，
// 里面调同一个 `buildUpdateMessages`，且**传同一份模板**。所以"同一份入参、同一个函数"是结构事实。
//
// U3b(结构锁): 本文件**不出现任何 buildUpdateMessages 调用**。
//   由 tests/bifang-拼装页.test.ts 的 [U3b] 段扫源码断言，[U3c] 段用变异证明那条扫得动。
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { 零件表 } from './零件表';
import { 默认模板, 段名表, 段里的占位符, type 提示词模板, type 段名 } from './提示词模板';
import { 收集本轮输入 } from './更新输入';
import { useDebugStore } from './日志仓';
import { toastWarning } from './toast';
import { use设置面板 } from './设置面板';
import type { Host } from './host';

const props = defineProps<{ host: Host }>();
const 设置面板 = use设置面板();
const settings = 设置面板.settings;

/** 当前模板。**默认是默认模板**（settings 里没存过时用它）。
 *
 *  ── 为什么读的时候要 `?? 默认模板`，写的时候又要整份存 ──
 *  读：老用户没有这个字段（schema 会补 `{}`），不兜底会让三段都是空的。
 *  写：**整份存**，不存"差异" —— 用户可能把某一段清空，那也是一次有意的编辑，
 *  用差异表达不了"这一段我就是要它空"。
 */
const 模板 = computed<提示词模板>(() => {
  const 存 = (settings.value.提示词 as any)?.模板;
  if (!存 || typeof 存 !== 'object')
    return 默认模板;
  return {
    系统段: typeof 存.系统段 === 'string' ? 存.系统段 : 默认模板.系统段,
    场景判断: typeof 存.场景判断 === 'string' ? 存.场景判断 : 默认模板.场景判断,
    用户段: typeof 存.用户段 === 'string' ? 存.用户段 : 默认模板.用户段,
  };
});

/** 写回模板（每一段一个 textarea，`@input` 直接调） */
function 改段(段: 段名, 值: string) {
  if (!settings.value.提示词)
    return;
  (settings.value.提示词 as any).模板 = { ...模板.value, [段]: 值 };
}

/** 三段各自的标题与用途（**这些字不进模板**，只在这里显示） */
const 段信息: Record<段名, { 标题: string; 用途: string }> = {
  系统段: {
    标题: '① 系统段',
    用途: '身份句 + 全部规则。它会是第一条 system 消息。',
  },
  场景判断: {
    标题: '② 场景判断',
    用途: '玩家最近一次输入，**只用来判断谁与玩家同场景**。为空时这一整段不出现。',
  },
  用户段: {
    标题: '③ 用户段',
    用途: '剧情、世界书、状态卡、时间、名单、任务指令。它会是最后那条 user 消息。',
  },
};

// ── 可用占位符（#207：点一下插入到光标位置）────────────────────────
/** 可用的占位符名 + 说明。**说明取自零件表，不另写一份** —— 那是第二处知识。
 *
 *  ── 为什么有两个"零件表里没有"的名字 ──
 *  `生理任务` / `恋爱任务` 是 D14 尾部的两个片段（需求方 #219 裁定各做一个占位符），
 *  它们在零件表里没有条目（零件表里的是 12 字特征串的 R6/R7，按 #217 ① 不许进清单）。
 *  所以这里补两条说明 —— 但**只补这两条**，其余全部取自零件表。
 */
const 可用占位符 = computed(() => {
  const 列表: { 名: string; 说明: string; 代号?: string }[] = [];
  for (const 件 of 零件表) {
    // 不可搬迁的（R6/R7）不进清单 —— 它们展开出来是 12 字特征串，不是真内容
    if (!件.可搬迁)
      continue;
    // D14 拆成了骨架 + 生理任务 + 恋爱任务，所以 D14 自己不再作为占位符
    if (件.代号 === 'D14')
      continue;
    列表.push({ 名: 件.名, 说明: 件.说明, 代号: 件.代号 });
  }
  列表.push(
    { 名: '生理任务', 说明: '生理监测的任务指令（开了生理监测才有，约 4593 字）' },
    { 名: '恋爱任务', 说明: '恋爱监测的任务指令（有恋爱对象才有，约 1360 字）' },
  );
  return 列表;
});

/** 每个 textarea 的 DOM 引用（插入到光标位置要它） */
const 编辑框 = {
  系统段: ref<HTMLTextAreaElement | null>(null),
  场景判断: ref<HTMLTextAreaElement | null>(null),
  用户段: ref<HTMLTextAreaElement | null>(null),
};

/** 插入占位符到**光标位置**（#207 明确要求：不是复制到剪贴板再自己粘）。
 *
 *  ── 为什么要 `nextTick` ──
 *  插入后要恢复光标到"插入内容之后"。改值 → DOM 更新 → 设 selectionStart，
 *  顺序不能反（反了设的是旧 DOM 的位置）。
 */
async function 插入占位符(段: 段名, 名: string) {
  const 框 = 编辑框[段].value;
  const 片段 = `{{彼方:${名}}}`;
  if (!框) {
    // 框还没挂上（理论上不会）—— 退化成追加到末尾，别静默失败
    改段(段, `${模板.value[段]}${片段}`);
    return;
  }
  const 起 = 框.selectionStart ?? 框.value.length;
  const 止 = 框.selectionEnd ?? 框.value.length;
  const 新值 = 框.value.slice(0, 起) + 片段 + 框.value.slice(止);
  改段(段, 新值);
  await nextTick();
  const 位 = 起 + 片段.length;
  框.focus();
  框.setSelectionRange(位, 位);
}

/** 每一段里用了哪些占位符（显示"这一段含 N 个"） */
const 段占位符数 = computed(() => {
  const 出 = {} as Record<段名, number>;
  for (const 段 of 段名表) 出[段] = 段里的占位符(模板.value[段]).length;
  return 出;
});

/** 模板里**没用到**的占位符 —— 它们不会发送。这是"模板即全部"的直接后果，
 *  用户需要看见（否则他以为"没删就是还在"）。 */
const 未使用 = computed(() => {
  const 用了 = new Set<string>();
  for (const 段 of 段名表) for (const 名 of 段里的占位符(模板.value[段])) 用了.add(名);
  return 可用占位符.value.filter(x => !用了.has(x.名));
});

// ── 恢复默认（二次确认）────────────────────────────────────────────
/** **恢复默认 = 重置成默认模板，内容和顺序一起**（需求方 #206 ②）。
 *
 *  ── 为什么必须二次确认 ──
 *  它会**丢掉用户写的东西**。一次点击就清空，是不可接受的数据丢失。
 */
function 恢复默认() {
  const 确认 = window.confirm(
    '恢复默认提示词？\n\n'
    + '这会把你改过的三段内容全部换回默认模板（内容与顺序一起重置）。\n'
    + '你自己写的话会丢失，且不可撤销。',
  );
  if (!确认)
    return;
  if (!settings.value.提示词)
    return;
  // 存成"默认模板的一份拷贝"，而不是删掉字段 ——
  // 删掉字段在语义上是"从没改过"，但那与"用户点了恢复默认"不同（将来若要记"改过没"会用到）。
  (settings.value.提示词 as any).模板 = { ...默认模板 };
}

// ── 预览 ──────────────────────────────────────────────────────
const 预览中 = ref(false);
const 预览文本 = ref('');
const 预览时间 = ref('');
const 预览错误 = ref('');
/** V1 拼装清单：每个零件进了哪、多少字、为什么没进。
 *  **它来自实发那次拼装**（`收集本轮输入` 返回的 `拼装清单`），不是本页另算的。 */
const 清单 = ref<any[]>([]);

/** 生成预览。**本页唯一一处取料调用, 走实发同一个入口。** */
async function 生成预览() {
  if (预览中.value)
    return;
  预览中.value = true;
  预览错误.value = '';
  try {
    // **把当前模板传给取料入口** —— 预览与实发用同一份模板，这才叫同源。
    // 不传的话预览的是"默认行为"，用户改的东西看不到。
    const 结果 = await 收集本轮输入({
      host: props.host,
      settings: { ...settings.value, 提示词: { ...settings.value.提示词, 模板: 模板.value } },
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
    清单.value = (结果 as any).拼装清单 ?? [];
  }
  catch (error: any) {
    预览错误.value = `预览失败: ${error?.message ?? String(error)}`;
    toastWarning('预览失败, 详见本页提示');
  }
  finally {
    预览中.value = false;
  }
}

/** 清单里"没出现在模板里"的那些 —— 用户查"我写了却没生效"用 */
const 清单未出现 = computed(() =>
  清单.value.filter(项 => 未使用.value.some(x => x.名 === 项.名)));
</script>

<template>
  <section class="bf-page bf-page-parts">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">拼装</h2>
        <p class="bf-page-sub">
          三段可编辑文本。占位符会被换成这一轮的真实内容。
        </p>
      </div>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-sm" type="button" @click="恢复默认">
          恢复默认
        </button>
        <button class="bf-btn bf-btn-sm bf-btn-primary" :disabled="预览中" @click="生成预览">
          {{ 预览中 ? '正在取料…' : '预览' }}
        </button>
      </div>
    </header>

    <!-- 说明放这里，不放模板里（模板里每句话都会发给模型） -->
    <p class="bf-hint">
      <strong>模板即全部</strong>：没写进模板的零件不会发送 —— 删掉一行就等于关掉那个零件。
      <br />
      <strong>占位符为空时，它所在的那一整行会消失</strong>（连同行里的其他文字）。
      所以想让一句说明只在有内容时出现，就把说明和占位符<strong>写在同一行</strong>。
    </p>

    <p v-if="预览中" class="bf-hint" role="status">
      正在读这一轮的正文、世界书与状态卡，通常需要一两秒。
    </p>
    <p v-if="预览错误" class="bf-hint bf-hint-warn" role="alert">{{ 预览错误 }}</p>

    <!-- ── 三段编辑区（不是一张大文本 —— 它们是三条消息） ── -->
    <div v-for="段 in 段名表" :key="段" class="bf-setting-group bf-set-group bf-tpl-seg">
      <div class="bf-tpl-seg-head">
        <h3 class="bf-tpl-seg-title">{{ 段信息[段].标题 }}</h3>
        <span class="bf-set-aside">{{ 段占位符数[段] }} 个占位符 · {{ 模板[段].length }} 字</span>
      </div>
      <p class="bf-hint">{{ 段信息[段].用途 }}</p>
      <textarea
        :ref="el => { 编辑框[段].value = el as HTMLTextAreaElement | null }"
        class="bf-textarea bf-tpl-area"
        :rows="段 === '系统段' ? 10 : 段 === '场景判断' ? 3 : 14"
        :value="模板[段]"
        spellcheck="false"
        @input="改段(段, ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <!-- 每段的插入按钮：点一下进光标位置 -->
      <div class="bf-tpl-insert">
        <span class="bf-form-label">插入到这段：</span>
        <button
          v-for="件 in 可用占位符"
          :key="件.名"
          class="bf-btn bf-btn-xs"
          type="button"
          :title="件.说明"
          @click="插入占位符(段, 件.名)"
        >
          {{ 件.名 }}
        </button>
      </div>
    </div>

    <!-- ── 可用占位符清单（#207：有语法 ≠ 能用） ── -->
    <details class="bf-setting-group bf-set-group" open>
      <summary class="bf-set-head">
        <span class="bf-set-index" aria-hidden="true">04</span>
        <h3>可用占位符</h3>
        <span class="bf-set-aside">{{ 可用占位符.length }} 个</span>
      </summary>
      <p class="bf-hint">
        写 <code v-pre>{{彼方:名字}}</code> 会被换成这一轮的真实内容。
        点名字会插到上面**最后聚焦的那一段**的光标位置。
      </p>
      <ul class="bf-tpl-list">
        <li v-for="件 in 可用占位符" :key="件.名" class="bf-tpl-item">
          <code class="bf-tpl-code" v-pre>{{彼方:</code><span class="bf-tpl-name">{{ 件.名 }}</span><code class="bf-tpl-code" v-pre>}}</code>
          <span class="bf-tpl-desc">{{ 件.说明 }}</span>
        </li>
      </ul>
      <p v-if="未使用.length" class="bf-hint bf-hint-warn">
        这 {{ 未使用.length }} 个占位符**没有出现在模板里**，所以不会发送：
        {{ 未使用.map(x => x.名).join('、') }}
      </p>
    </details>

    <!-- ── 预览（占位符换成真实内容后的样子） ── -->
    <section v-if="预览文本" class="bf-parts-preview">
      <header class="bf-parts-preview-head">
        <h3>预览：实际会发出去的内容</h3>
        <span class="bf-parts-when">取样于 {{ 预览时间 }}</span>
      </header>
      <pre class="bf-parts-pre">{{ 预览文本 }}</pre>

      <!-- 只读清单（#206 ④：给用户查"我写了却没生效"） -->
      <details v-if="清单.length > 0" class="bf-setting-group bf-set-group bf-parts-manifest">
        <summary class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">05</span>
          <h3>这一轮每个零件去了哪</h3>
          <span class="bf-set-aside">{{ 清单.length }} 件</span>
        </summary>
        <p class="bf-hint">
          这张表是**只读**的 —— 它告诉你每个零件进了第几条消息、多少字，
          以及哪些**没出现在模板里**（那些不会发送）。
        </p>
        <table class="bf-parts-table">
          <thead>
            <tr>
              <th scope="col">零件</th>
              <th scope="col">状态</th>
              <th scope="col">位置</th>
              <th scope="col">字数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="项 in 清单" :key="项.代号">
              <th scope="row">
                <span class="bf-parts-code">{{ 项.代号 }}</span>{{ 项.名 }}
              </th>
              <td>{{ 项.状态 }}</td>
              <td>
                {{ 项.位置 }}
                <span v-if="项.备注" class="bf-parts-note">{{ 项.备注 }}</span>
              </td>
              <td class="bf-parts-num">{{ 项.字数 }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="清单未出现.length" class="bf-hint bf-hint-warn">
          其中 {{ 清单未出现.length }} 个**没写进模板**，这一轮不会发送：
          {{ 清单未出现.map(x => x.名).join('、') }}
        </p>
      </details>
    </section>
  </section>
</template>

<style scoped>
/* 这一页的视觉语言**沿用设置页那套**（bf-setting-group / bf-set-head / bf-set-aside /
   bf-hint / bf-btn），定义在 面板样式.css。这里只写这一页**特有**的排版，不另起一套。

   为什么不另起一套: 设置页那套是全项目统一的；另起一套等于给以后的样式改动制造两个地方。 */
.bf-tpl-seg {
  margin-bottom: 14px;
}
.bf-tpl-seg-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.bf-tpl-seg-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
/* 编辑区：等宽字体（占位符的 `{{彼方:名字}}` 对齐才看得出结构），可纵向拉伸 */
.bf-tpl-area {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  resize: vertical;
}
.bf-tpl-insert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
/* 占位符清单：一行一个，名字等宽，说明灰一点 */
.bf-tpl-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bf-tpl-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--bf-line, rgba(255, 255, 255, 0.08));
  font-size: 12px;
}
.bf-tpl-item:last-child {
  border-bottom: 0;
}
.bf-tpl-code {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-tpl-name {
  font-family: ui-monospace, monospace;
  font-size: 11.5px;
}
.bf-tpl-desc {
  flex: 1;
  min-width: 0;
  color: var(--bf-text-dim, #8a8a92);
}
.bf-hint-warn {
  color: var(--bf-warn, #e0a030);
}
/* 预览与清单 */
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
.bf-parts-manifest {
  margin-top: 14px;
}
.bf-parts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.bf-parts-table th,
.bf-parts-table td {
  padding: 6px 0;
  text-align: left;
  border-bottom: 1px solid var(--bf-line, rgba(255, 255, 255, 0.08));
  vertical-align: top;
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
.bf-parts-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.bf-parts-note {
  margin-left: 4px;
  font-size: 11px;
  color: var(--bf-warn, #e0a030);
}
.bf-parts-code {
  margin-right: 5px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--bf-text-dim, #8a8a92);
}
</style>
