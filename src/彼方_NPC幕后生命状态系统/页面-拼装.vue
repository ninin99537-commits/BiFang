// 彼方 · 拼装页（2026-11-19 —— 段列表形态）—— 批次: 2026-11-19 模板化
//
// ── 这一页是什么 ──────────────────────────────────────────────────
// **可增删的段列表 + 占位符**。用户要的是"一块能写字的地方，上面挂着几个占位符"，
// 不是"更好看的配置卡片"（需求方 #206 原话）。
//
// ── 为什么是"段列表"而不是"三个固定文本域"（#226 改）──
// 最初做成三个固定框（系统/场景/用户）。用户看到参考实现后指出：
// **那是把"消息结构"当成了"编辑结构"**。他要的是段可以增删、每段自己选 role。
//
// ── 「普通段 / 独立段」那个下拉不是装饰（#228 丙）──
// 它承担"要不要与相邻同 role 的段合并"这个真实语义。实测依据：
// 默认第 1、2 段都是 system，若一律合并 → 13140 字一条，I3 破，
// 而且场景判断那 158 字并进 13k 里就"消失"了（防全知设计破）。
// 所以第 2 段默认 `独立: true`，界面上要让人看得见为什么。
//
// ── 四条硬规则（需求方 #206）────────────────────────────────────────
//   ① **模板即全部**：没写进模板的零件 = 不发送（等同关闭）
//   ② **载入默认 = 重置成默认段列表，内容和顺序一起**，要二次确认
//   ③ **预览 = 把占位符换成真实内容后的样子**（同源：同一个拼装函数、同一份入参）
//   ④ **拼装清单保留但只读** —— 给用户查"我写了却没生效"
//
// ── 说明放界面，不放模板（#213 ③ / #221 ③）──────────────────────────
// 模板里每一行都会发给模型。放一句"你可以在这里加话"就是**多发给模型一句废话**。
//
// U3b(结构锁): 本文件**不出现任何 buildUpdateMessages 调用**。
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { 零件表 } from './零件表';
import {
  默认模板, 新段id, 段里的占位符, 校验模板, role表,
  type 提示词模板, type 模板段, type 模板role,
} from './提示词模板';
import { 收集本轮输入 } from './更新输入';
import { useDebugStore } from './日志仓';
import { toastWarning } from './toast';
import { use设置面板 } from './设置面板';
import type { Host } from './host';

const props = defineProps<{ host: Host }>();
const 设置面板 = use设置面板();
const settings = 设置面板.settings;

/** 当前段列表。**默认是默认模板**（settings 里没存过时用它）。
 *
 *  ── 为什么读的时候要 `?? 默认模板` ──
 *  老用户没有这个字段（schema 会补 `[]`），不兜底会让列表是空的 ——
 *  那看起来像"什么都没了"，而实际是"还没迁"。
 */
const 段们 = computed<提示词模板>(() => {
  const 存 = (settings.value.提示词 as any)?.模板;
  if (!Array.isArray(存) || 存.length === 0)
    return 默认模板.map(段 => ({ ...段 }));
  return 存.map((段: any, i: number) => ({
    id: typeof 段?.id === 'string' && 段.id ? 段.id : `旧-${i}`,
    role: (段?.role === 'user' || 段?.role === 'assistant') ? 段.role : 'system',
    content: typeof 段?.content === 'string' ? 段.content : '',
  }));
});

/** 写回段列表 */
function 存段们(新段们: 提示词模板) {
  if (!settings.value.提示词)
    return;
  (settings.value.提示词 as any).模板 = 新段们;
}

/** 改某一段的某个字段 */
function 改段(id: string, 字段: 'content' | 'role', 值: any) {
  存段们(段们.value.map(段 => (段.id === id ? { ...段, [字段]: 值 } : 段)));
}

/** 插入段。**插到最上方**（需求方 #226 的截图：`＋ 在最上方插入`）。
 *
 *  ── 为什么新段默认 `role: 'system'` ──
 *  用户点"插入"时通常想补一条规则；而 user 段通常在最后（剧情）。这只是默认值，能改。 */
function 插入段() {
  const 新段: 模板段 = { id: 新段id(), role: 'system', content: '' };
  存段们([新段, ...段们.value]);
}

/** **上移 / 下移**（2026-11-19 补，需求方 #233）。
 *
 *  ── 为什么必须有它 ──
 *  用户说"到时候我自己弄一个"（拼成 system → assistant → user 的回放形态）。
 *  那需要把某段挪到某段之前。没有排序入口，他就只能"删了重建"——
 *  而重建会丢掉那段的内容（他可能已经写了几百字）。
 *
 *  ── 为什么用上移/下移而不是拖拽 ──
 *  拖拽要处理 HTML5 drag 事件（触屏还不支持，已记在已知限制里）；
 *  上移/下移是两个按钮，行为确定、触屏也能用、且**每一步都可撤销**（再点一下反向）。
 *  段数量很少（默认 2 段，用户加也就 3–6 段），按钮足够。 */
function 上移(id: string) {
  const 现 = [...段们.value];
  const i = 现.findIndex(段 => 段.id === id);
  if (i <= 0)
    return;
  [现[i - 1], 现[i]] = [现[i], 现[i - 1]];
  存段们(现);
}
function 下移(id: string) {
  const 现 = [...段们.value];
  const i = 现.findIndex(段 => 段.id === id);
  if (i < 0 || i >= 现.length - 1)
    return;
  [现[i], 现[i + 1]] = [现[i + 1], 现[i]];
  存段们(现);
}

/** 删除一段。**至少留一段** —— 全删光等于"什么都不发"，那不是用户想要的。 */
function 删除段(id: string) {
  if (段们.value.length <= 1) {
    toastWarning('至少要留一段');
    return;
  }
  存段们(段们.value.filter(段 => 段.id !== id));
}

/** 载入默认 = 重置成默认段列表（内容 + 顺序一起）。**二次确认**（会丢用户写的东西）。 */
function 载入默认() {
  const 确认 = window.confirm(
    '载入默认提示词？\n\n'
    + '这会把你的段列表整个换回默认（内容与顺序一起重置）。\n'
    + '你自己写的话会丢失，且不可撤销。',
  );
  if (!确认)
    return;
  存段们(默认模板.map(段 => ({ ...段 })));
}

// ── 导入 / 导出 JSON ──────────────────────────────────────────────
/** 导出：把段列表存成 JSON 文件（用户自己备份 / 分享）。 */
function 导出JSON() {
  const 数据 = JSON.stringify({ 版本: 1, 段们: 段们.value }, null, 2);
  const blob = new Blob([数据], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '彼方-提示词模板.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** 导入：读一个 JSON 文件。
 *
 *  ── 为什么要校验到"每一段都合法" ──
 *  导入的文件是**外部输入**，可能缺字段、可能是别的插件的格式。
 *  直接塞进设置会让整页崩（渲染时读 `段.content` 就炸）。
 *  所以逐段校验，不合法就整份拒绝 —— **不做"尽力而为"的修补**：
 *  修补出来的东西用户看不懂，而拒绝至少告诉他"这个文件不对"。
 */
async function 导入JSON(事件: Event) {
  const 输入 = 事件.target as HTMLInputElement;
  const 文件 = 输入.files?.[0];
  if (!文件)
    return;
  try {
    const 文本 = await 文件.text();
    const 解析 = JSON.parse(文本);
    const 候选 = Array.isArray(解析) ? 解析 : 解析?.段们;
    if (!Array.isArray(候选) || 候选.length === 0)
      throw new Error('文件里没有段列表');
    const 校验后: 提示词模板 = 候选.map((段: any, i: number) => {
      if (!段 || typeof 段 !== 'object')
        throw new Error(`第 ${i + 1} 段不是对象`);
      if (typeof 段.content !== 'string')
        throw new Error(`第 ${i + 1} 段缺少 content`);
      const role = 段.role;
      if (role !== 'system' && role !== 'user' && role !== 'assistant')
        throw new Error(`第 ${i + 1} 段的 role 不合法（只能是 system / user / assistant）`);
      return {
        id: typeof 段.id === 'string' && 段.id ? 段.id : 新段id(),
        role,
        content: 段.content,
      };
    });
    存段们(校验后);
  }
  catch (error: any) {
    toastWarning(`导入失败：${error?.message ?? String(error)}`);
  }
  finally {
    // 清空 value，否则同一个文件选第二次不触发 change
    输入.value = '';
  }
}

// ── 可用占位符（收进一个可展开区，默认收起 —— #226）──────────────
/** 可用的占位符名 + 说明。**说明取自零件表，不另写一份** —— 那是第二处知识。
 *
 *  ── 哪些零件不该进清单 ──
 *   · `可搬迁: false`（R1 身份句 / R6 生理说明 / R7 恋爱说明）——
 *     R1 已经是**模板文字**（需求方 #215），R6/R7 是 12 字特征串（展开不出真内容）。
 *   · `D14` —— 它拆成了"骨架（模板文字）+ 生理任务 + 恋爱任务"。
 */
const 可用占位符 = computed(() => {
  const 列表: { 名: string; 说明: string }[] = [];
  const 已见 = new Set<string>();
  for (const 件 of 零件表) {
    if (!件.可搬迁 || 件.代号 === 'D14')
      continue;
    if (已见.has(件.名))
      continue;
    已见.add(件.名);
    列表.push({ 名: 件.名, 说明: 件.说明 });
  }
  return 列表;
});

/** 每个 textarea 的 DOM 引用（插入到光标位置要它）。key 是段 id。 */
const 编辑框 = ref<Record<string, HTMLTextAreaElement | null>>({});
/** **最后聚焦的那一段** —— 占位符插到它的光标处（#226）。 */
const 焦点段id = ref<string>(段们.value[0]?.id ?? '');
function 记焦点(id: string) {
  焦点段id.value = id;
}

/** 插入占位符到**光标位置**。
 *
 *  ── 为什么要 `nextTick` ──
 *  插入后要恢复光标到"插入内容之后"。改值 → DOM 更新 → 设 selectionStart，
 *  顺序不能反（反了设的是旧 DOM 的位置）。
 */
async function 插入占位符(名: string) {
  const id = 焦点段id.value;
  const 段 = 段们.value.find(x => x.id === id);
  if (!段) {
    toastWarning('先点一下要插入的那一段');
    return;
  }
  const 框 = 编辑框.value[id];
  const 片段 = `{{彼方:${名}}}`;
  if (!框) {
    改段(id, 'content', `${段.content}${片段}`);
    return;
  }
  const 起 = 框.selectionStart ?? 框.value.length;
  const 止 = 框.selectionEnd ?? 框.value.length;
  const 新值 = 框.value.slice(0, 起) + 片段 + 框.value.slice(止);
  改段(id, 'content', 新值);
  await nextTick();
  const 位 = 起 + 片段.length;
  框.focus();
  框.setSelectionRange(位, 位);
}

/** 模板里**没用到**的占位符 —— 它们不会发送。 */
const 未使用 = computed(() => {
  const 用了 = new Set<string>();
  for (const 段 of 段们.value) for (const 名 of 段里的占位符(段.content)) 用了.add(名);
  return 可用占位符.value.filter(x => !用了.has(x.名));
});

/** 每段用了几个占位符 */
function 段占位符数(段: 模板段): number {
  return 段里的占位符(段.content).length;
}

/** 段的标题：用序号 + role（`#1 SYSTEM`） */
function 段标题(i: number, 段: 模板段): string {
  return `#${i + 1}  ${段.role.toUpperCase()}`;
}

// ── 预览 ──────────────────────────────────────────────────────
const 预览中 = ref(false);
const 预览文本 = ref('');
const 预览时间 = ref('');
const 预览错误 = ref('');
const 清单 = ref<any[]>([]);

/** 模板校验的错误（没有 user 段时）。**实时算** —— 用户删掉最后一段 user 就立刻看见。 */
const 模板错误 = computed(() => 校验模板(段们.value));

async function 生成预览() {
  if (预览中.value)
    return;
  // 校验不过就别去取料 —— 那不是"预览失败"，是"模板本身发不出去"
  if (模板错误.value) {
    预览错误.value = 模板错误.value;
    预览文本.value = '';
    return;
  }
  预览中.value = true;
  预览错误.value = '';
  try {
    // **把当前段列表传给取料入口** —— 预览与实发用同一份模板，这才叫同源。
    const 结果 = await 收集本轮输入({
      host: props.host,
      settings: { ...settings.value, 提示词: { ...settings.value.提示词, 模板: 段们.value } },
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
    const 段结果 = (结果.messages ?? []).map((段: any, i: number) =>
      `── 第 ${i + 1} 条 · ${段.role} ──\n${段.content}`);
    if (结果.工具说明)
      段结果.push(`── 工具说明 ──\n${结果.工具说明}`);
    预览文本.value = 段结果.join('\n\n');
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

/** 清单里"没出现在模板里"的那些 */
const 清单未出现 = computed(() =>
  清单.value.filter(项 => 未使用.value.some(x => x.名 === 项.名)));
</script>

<template>
  <section class="bf-page bf-page-parts">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">拼装</h2>
        <p class="bf-page-sub">
          编辑提示词：段可以增删，每段自己选角色。占位符会被换成这一轮的真实内容。
        </p>
      </div>
    </header>

    <!-- 工具条：导入 / 导出 / 载入默认 / 在最上方插入 -->
    <div class="bf-tpl-toolbar">
      <label class="bf-btn bf-btn-sm">
        ↓ 导入 JSON
        <input type="file" accept="application/json,.json" class="bf-tpl-file" @change="导入JSON" />
      </label>
      <button class="bf-btn bf-btn-sm" type="button" @click="导出JSON">
        ↑ 导出 JSON
      </button>
      <button class="bf-btn bf-btn-sm" type="button" @click="载入默认">
        载入默认提示词
      </button>
      <button class="bf-btn bf-btn-sm" type="button" @click="插入段">
        ＋ 在最上方插入
      </button>
      <button class="bf-btn bf-btn-sm bf-btn-primary" :disabled="预览中 || !!模板错误" type="button" @click="生成预览">
        {{ 预览中 ? '正在取料…' : '预览' }}
      </button>
    </div>

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
    <!-- 模板校验不过：**这是阻止发送的错误**，不是"预览失败" -->
    <p v-if="模板错误" class="bf-hint bf-hint-error" role="alert">
      {{ 模板错误 }}
    </p>
    <p v-if="预览错误 && !模板错误" class="bf-hint bf-hint-warn" role="alert">{{ 预览错误 }}</p>

    <!-- ── 段列表 ── -->
    <div v-for="(段, i) in 段们" :key="段.id" class="bf-tpl-seg">
      <div class="bf-tpl-seg-head">
        <span class="bf-tpl-seg-title">{{ 段标题(i, 段) }}</span>

        <!-- role 下拉 -->
        <select
          class="bf-select bf-select-sm"
          :value="段.role"
          :aria-label="`第 ${i + 1} 段的角色`"
          @change="改段(段.id, 'role', ($event.target as HTMLSelectElement).value as 模板role)"
        >
          <option v-for="r in role表" :key="r" :value="r">{{ r.toUpperCase() }}</option>
        </select>

        <span class="bf-set-aside">{{ 段占位符数(段) }} 个占位符 · {{ 段.content.length }} 字</span>

        <!-- 上移 / 下移：**没有这个就拼不出自定义顺序**（需求方 #233） -->
        <button
          class="bf-btn bf-btn-sm bf-tpl-move"
          type="button"
          :disabled="i === 0"
          title="上移一段"
          aria-label="上移一段"
          @click="上移(段.id)"
        >
          ↑
        </button>
        <button
          class="bf-btn bf-btn-sm bf-tpl-move"
          type="button"
          :disabled="i === 段们.length - 1"
          title="下移一段"
          aria-label="下移一段"
          @click="下移(段.id)"
        >
          ↓
        </button>

        <button
          class="bf-btn bf-btn-sm bf-btn-danger"
          type="button"
          :title="段们.length <= 1 ? '至少要留一段' : '删除这一段'"
          :disabled="段们.length <= 1"
          @click="删除段(段.id)"
        >
          🗑
        </button>
      </div>

      <textarea
        :ref="el => { 编辑框[段.id] = el as HTMLTextAreaElement | null }"
        class="bf-textarea bf-tpl-area"
        :rows="段.role === 'system' ? 6 : 8"
        :value="段.content"
        spellcheck="false"
        placeholder="在这一段里写内容；可以用 {{彼方:名字}} 插入零件"
        @focus="记焦点(段.id)"
        @click="记焦点(段.id)"
        @input="改段(段.id, 'content', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </div>

    <!-- ── 可用占位符（默认收起；点一下插到最后聚焦那段的光标处） ── -->
    <details class="bf-setting-group bf-set-group bf-tpl-chips-box">
      <summary class="bf-set-head">
        <span class="bf-set-index" aria-hidden="true">04</span>
        <h3>可用占位符</h3>
        <span class="bf-set-aside">{{ 可用占位符.length }} 个 · 点开看</span>
      </summary>
      <p class="bf-hint">
        点一下插到<strong>你最后点过的那一段</strong>的光标处。鼠标停住能看它是什么。
      </p>
      <div class="bf-tpl-chips">
        <button
          v-for="件 in 可用占位符"
          :key="件.名"
          class="bf-btn bf-btn-sm bf-tpl-chip"
          type="button"
          :title="件.说明"
          @click="插入占位符(件.名)"
        >
          {{ 件.名 }}
        </button>
      </div>
      <p v-if="未使用.length" class="bf-hint bf-hint-warn">
        这 {{ 未使用.length }} 个没出现在模板里，所以不会发送：
        {{ 未使用.map(x => x.名).join('、') }}
      </p>
    </details>

    <!-- ── 预览 ── -->
    <section v-if="预览文本" class="bf-parts-preview">
      <header class="bf-parts-preview-head">
        <h3>预览：实际会发出去的内容</h3>
        <span class="bf-parts-when">取样于 {{ 预览时间 }}</span>
      </header>
      <pre class="bf-parts-pre">{{ 预览文本 }}</pre>

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
   bf-hint / bf-btn / bf-select / bf-textarea），定义在 面板样式.css。
   这里只写这一页**特有**的排版，不另起一套。 */
.bf-tpl-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
/* 导入按钮：把 input 藏起来，让 label 充当按钮 */
.bf-tpl-file {
  display: none;
}
/* 一段：一张卡。用 bf-set-seg-card 那套的留白（不重复定义边框/圆角） */
.bf-tpl-seg {
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--bf-line);
  border-radius: var(--bf-radius-sm);
}
.bf-tpl-seg-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.bf-tpl-seg-title {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 600;
  min-width: 90px;
}
/* 上移/下移：窄按钮，别把标题行挤满 */
.bf-tpl-move {
  min-width: 28px;
  padding-left: 0;
  padding-right: 0;
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
.bf-tpl-chips-box {
  margin-top: 4px;
}
/* 占位符按钮排成一行行 —— 这是"清单"的形状，不是"标签墙"。
   每个按钮只是名字（说明在 title 里），所以能一眼扫完（需求方 #225 ②）。 */
.bf-tpl-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.bf-tpl-chip {
  font-family: ui-monospace, monospace;
  white-space: nowrap;
}
.bf-hint-warn {
  color: var(--bf-warn, #e0a030);
}
/* 模板校验错误：比警告更重（它会阻止发送），所以用错误色 */
.bf-hint-error {
  color: var(--bf-error, #e05a5a);
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
