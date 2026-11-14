<template>
  <div class="rp">
    <div class="rp-head">
      <span class="rp-title">生成结果</span>
      <div class="rp-actions">
        <button v-if="!生成中" class="rp-btn rp-primary" @click="开始生成">生成</button>
        <button v-else class="rp-btn rp-stop" @click="停止生成">停止</button>
        <button class="rp-btn" :disabled="!结果" @click="复制结果">复制</button>
      </div>
    </div>

    <textarea
      class="rp-out"
      :value="结果"
      :placeholder="占位"
      @input="结果 = ($event.target as HTMLTextAreaElement).value"
    ></textarea>

    <div v-if="警告 && (警告.extra.length || 警告.missing.length)" class="rp-warn">
      <div v-if="警告.extra.length" class="rp-warn-line">
        <span class="rp-warn-tag">多写</span>
        <span class="rp-warn-names">{{ 警告.extra.join('、') }}</span>
        <button class="rp-mini" @click="保留多写">保留</button>
      </div>
      <div v-if="警告.missing.length" class="rp-warn-line">
        <span class="rp-warn-tag rp-warn-tag-miss">漏写</span>
        <span class="rp-warn-names">{{ 警告.missing.join('、') }}</span>
        <button class="rp-mini" @click="开始生成">重新生成</button>
      </div>
    </div>

    <div class="rp-sink">
      <button class="rp-btn" :disabled="!结果 || 忙" @click="覆盖人设">覆盖当前 user 人设</button>
      <button class="rp-btn" :disabled="!结果 || 忙" @click="写世界书">写入世界书</button>
      <button class="rp-btn" :disabled="!结果 || 忙" @click="存为草稿">存草稿</button>
    </div>

    <!--
      #78: 角色名 —— 写入世界书与写入人物索引**共用这一个**输入。
      从生成结果自动认(基础信息与外貌的「姓名」); 认不到就留空让用户手填(别硬编一个奇怪的名字)。
      写入前这里直接显示"将以「XX」为标题写入", 免得写错了才发现。
    -->
    <div class="rp-name">
      <span class="rp-name-label">角色名</span>
      <input v-model="角色名" class="rp-input rp-input-wide" placeholder="从结果自动识别，认不到请手填" />
      <span v-if="结果" class="rp-name-hint">
        将以「<b>{{ 生效标题.名 }}</b>」为标题写入<span v-if="生效标题.兜底">（没认出角色名，用的是创作方向）</span>
      </span>
    </div>

    <!-- 人物索引(#68 设计2): 手动点, 不自动。条目名固定「人物索引」, 同名覆盖不重复建。 -->
    <div class="rp-index">
      <span class="rp-index-label">人物索引</span>
      <input v-model="索引介绍" class="rp-input rp-input-wide" placeholder="一句话介绍" />
      <button class="rp-btn" :disabled="!角色名.trim() || !索引介绍.trim() || 忙" @click="写人物索引">写入索引</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Settings } from '../schema';
import { sanitizeOutput, 剥免责声明, type 清洗结果 } from '../lib/sanitize';
import { 生成人设, 复制文本, 覆盖当前人设, 写入世界书, 写入人物索引, 存草稿, type 生成句柄 } from '../lib/sink';
import { 从结果取介绍, 从结果取姓名, 取人设条目标题 } from '../lib/取名';
import { 该自动填 } from '../lib/自动填';

const props = defineProps<{
  设置: Settings;
  提示词: string;
  已选模块名: string[];
  全部模块名: string[];
  /**
   * 写入世界书 / 人物索引**成功之后**回调一次。
   * 用来让 App 重新读一遍世界书条目 —— 否则选择器永远停在打开时的旧列表上,
   * 新写的条目要等换角色/换聊天才出现(用户报的「插件的世界书好像没刷新」)。
   */
  已写入?: () => void;
}>();

const emit = defineEmits<{ 存草稿完成: [] }>();

const 结果 = ref('');
const 原始结果 = ref('');
const 生成中 = ref(false);
const 忙 = ref(false);
const 句柄 = ref<生成句柄 | null>(null);
const 警告 = ref<清洗结果 | null>(null);

/**
 * 结果区的占位文案。
 * **非流式(默认)时整段生成完才出现** —— 中间那几十秒里框是空的,
 * 必须让人看出「在跑, 不是卡了」, 否则用户会以为坏了再点一次。
 * 流式时文字会自己长出来, 不需要额外说明。
 */
const 占位 = computed(() => {
  if (生成中.value && !结果.value) {
    return props.设置.request.stream
      ? '正在生成…'
      : '正在生成…（非流式：整段生成完才会出现在这里）';
  }
  return '生成的结果会出现在这里，也可以直接手写。';
});

async function 开始生成() {
  if (生成中.value) return;
  if (!props.已选模块名.length) {
    toastr.warning('先勾至少一个模块，再生成。');
    return;
  }
  生成中.value = true;
  结果.value = '';
  警告.value = null;
  try {
    // #189: 文本**进 ref 之前**就剥掉注入的 <disclaimer> 块 —— 这样 结果/原始结果 两个 ref
    // 从头到尾都不含它, 于是「保留多写」退回 原始结果 也带不回垃圾(那是 #189 指出的洞)。
     const 当前 = 生成人设(props.设置, props.提示词, 文本 => {
      结果.value = 剥免责声明(文本);
    });
    句柄.value = 当前;
    const 文本 = await 当前.完成;
    原始结果.value = 剥免责声明(文本);
    结果.value = 剥免责声明(文本);
    跑校验();
    toastr.success('生成完成');
  } catch (error) {
    const 文本 = error instanceof Error ? error.message : String(error);
    console.error('[人设工坊] 生成失败:', error);
    toastr.error(`生成失败：${文本}`);
  } finally {
    生成中.value = false;
    句柄.value = null;
  }
}

function 停止生成() {
  if (!句柄.value) return;
  stopGenerationById(句柄.value.id);
  toastr.info('已请求停止生成');
}

/** 白名单校验: 关掉开关就只警告不删 */
function 跑校验() {
  const 结果集 = sanitizeOutput(结果.value, props.已选模块名, props.全部模块名);
  警告.value = 结果集;
  if (props.设置.strictWhitelist) 结果.value = 结果集.cleaned;
}

function 保留多写() {
  if (原始结果.value) 结果.value = 原始结果.value;
  警告.value = null;
}

async function 复制结果() {
  try {
    await 复制文本(结果.value);
    toastr.success('结果已复制');
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : '复制失败');
  }
}

/**
 * 角色名(#78): 写入世界书与写入人物索引**共用这一个**。
 * 从生成结果自动认(基础信息与外貌的「姓名」); 认不到就留空, 由用户手填。
 *
 * ★ 2026-10-15 用户报「文本框里的内容不会自动变，一直都是第一个人设的内容」。
 *   旧写法是 `if (角色名.value.trim()) return;` —— **只在为空时填**。
 *   于是第一次填上之后就永久锁死: 生成第二个人设, 框里还是第一个人的名字。
 *   它想表达的是「用户手改过就别覆盖」, 但**「非空」区分不了「自动填的」和「用户改的」** ——
 *   自动填进去的值也是非空的, 所以第二次起它把自己挡住了。
 *
 *   现在记住**上一次自动填进去的值**(自动值):
 *     · 框是空的             → 填
 *     · 框里还是那个自动值   → 用户没动过 → 换成新的
 *     · 其它(用户改过)       → 不碰
 */
const 角色名 = ref('');
let 角色名自动值 = '';

watch(
  结果,
  文本 => {
    if (!该自动填(角色名.value, 角色名自动值)) return; // 用户手改过 → 不覆盖
    const 认得 = 从结果取姓名(文本);
    if (认得) {
      角色名.value = 认得;
      角色名自动值 = 认得;
    }
  },
  { immediate: true },
);

/**
 * 实际会用的标题: 用户填了就用他的; 没填才退回创作方向短名(并标记 兜底)。
 * 用户填的那一刻起, 界面显示的与写出去的就完全是同一个名字。
 */
const 生效标题 = computed(() => {
  const 填的 = 角色名.value.trim();
  if (填的) return { 名: 填的, 兜底: false };
  return 取人设条目标题(结果.value, props.设置.brief, props.设置.mode);
});

/** 统一包一层: 落地动作都不静默失败 */
async function 执行落地(名: string, 动作: () => Promise<void>) {
  if (忙.value) return;
  忙.value = true;
  try {
    await 动作();
    toastr.success(`${名}成功`);
  } catch (error) {
    const 文本 = error instanceof Error ? error.message : String(error);
    console.error(`[人设工坊] ${名}失败:`, error);
    toastr.error(`${名}失败：${文本}`);
  } finally {
    忙.value = false;
  }
}

function 覆盖人设() {
  执行落地('覆盖人设', () => 覆盖当前人设(结果.value, props.设置.brief));
}

function 写世界书() {
  // #78: 标题 = 角色名(取不到才退创作方向), keys 也用它 —— 正文提到该角色才激活。
  // #124 1.2: NPC 模式下由 写入世界书 内部按 `---` 拆成多个条目, 每个条目 keys = 自己的角色名。
  const { 名 } = 生效标题.value;
  执行落地('写入世界书', async () => {
    const { 书, 写了 } = await 写入世界书(名, 结果.value, [名], props.设置.mode);
    toastr.info(
      写了.length > 1
        ? `已写入 ${写了.length} 个角色条目到世界书「${书}」：${写了.join('、')}`
        : `已用「${写了[0] ?? 名}」写入世界书「${书}」`,
    );
    props.已写入?.();
  });
}

function 存为草稿() {
  执行落地('存草稿', async () => {
    存草稿({
      mode: props.设置.mode,
      modules: props.已选模块名,
      text: 结果.value,
      brief: props.设置.brief,
    });
    emit('存草稿完成');
  });
}

/**
 * 人物索引(#68 设计2): 手动点, 不自动。条目名固定「人物索引」, 同名覆盖不重复建。
 * 角色名与「写入世界书」**共用** 角色名(#78); 介绍从结果的「介绍」行自动带出, 用户可改。
 *
 * ★ 与 角色名 同一个缺陷、同一套修法(2026-10-15 用户一并报的):
 *   旧写法 `if (索引介绍.value.trim()) return;` 会让它永久停在第一个角色的介绍上。
 *   现在用「上一次自动值」区分「自动填的」与「用户改的」。
 * 取不到就留空(按钮禁着), 绝不瞎编一句。
 */
const 索引介绍 = ref('');
let 索引介绍自动值 = '';

watch(
  结果,
  文本 => {
    if (!该自动填(索引介绍.value, 索引介绍自动值)) return; // 用户手改过 → 不覆盖
    const 介绍 = 从结果取介绍(文本);
    if (介绍) {
      索引介绍.value = 介绍;
      索引介绍自动值 = 介绍;
    }
  },
  { immediate: true },
);

function 写人物索引() {
  // #124 F1: NPC 模式下由 写入人物索引 内部按 `---` 拆成多行, 每个角色一行。
  执行落地('写入人物索引', async () => {
    const { 书, 写了 } = await 写入人物索引(角色名.value.trim(), 索引介绍.value, props.设置.mode, 结果.value);
    toastr.info(
      写了.length > 1
        ? `已写入 ${写了.length} 个角色到「${书}」的人物索引：${写了.join('、')}`
        : `已写入世界书「${书}」的人物索引`,
    );
    props.已写入?.();
    索引介绍.value = '';
  });
}

/** 供父组件把草稿载入结果区 */
defineExpose({
  设结果(文本: string) {
    // #189: 老草稿里可能带着 <disclaimer> 块(用户之前开着防截断存过) —— 载入时也剥, 别把垃圾带回来。
    结果.value = 剥免责声明(文本);
    原始结果.value = 剥免责声明(文本);
    警告.value = null;
  },
});
</script>

<style scoped>
.rp {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--forge-text, #e9e8e6);
}
.rp-actions {
  display: flex;
  gap: 6px;
}
.rp-btn {
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
  padding: 3px 12px;
  cursor: pointer;
}
.rp-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.rp-primary {
  border-color: var(--forge-accent, #c8a24a);
  background: var(--forge-accent, #c8a24a);
  color: #1a1a1c;
  font-weight: 600;
}
.rp-stop {
  border-color: #e0574a;
  color: #ffb3ab;
}
.rp-out {
  width: 100%;
  box-sizing: border-box;
  height: 240px;
  resize: vertical;
  padding: 8px 10px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 8px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font: 12px/1.7 inherit;
}
.rp-warn {
  border: 1px solid #d9a13c;
  border-radius: 8px;
  background: rgba(217, 161, 60, 0.08);
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rp-warn-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--forge-text, #e9e8e6);
}
.rp-warn-tag {
  flex: none;
  border-radius: 4px;
  background: #d9a13c;
  color: #1a1a1c;
  padding: 1px 6px;
  font-weight: 600;
}
.rp-warn-tag-miss {
  background: #7d8ea8;
  color: #fff;
}
.rp-warn-names {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
.rp-sink {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* #78: 角色名 —— 写入世界书与写入人物索引共用一个输入; 写入前把"会用什么标题"摆在旁边 */
.rp-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.rp-name-label {
  flex: none;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.rp-name-hint {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--forge-dim, #9a9aa4);
}
.rp-name-hint b {
  color: var(--forge-accent, #c8a24a);
  font-weight: 600;
}
.rp-mini {
  flex: none;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: transparent;
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
  padding: 1px 8px;
  cursor: pointer;
}

/* 人物索引: 视觉上比主落地动作再降一级(它是"备档", 不是每次都用) */
.rp-index {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--forge-border, #33333a);
}
.rp-index-label {
  flex: none;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.rp-input {
  flex: 0 1 110px;
  min-width: 0;
  box-sizing: border-box;
  padding: 3px 8px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
}
.rp-input-wide {
  flex: 1 1 160px;
}
.rp-input:focus {
  outline: none;
  border-color: var(--forge-accent, #c8a24a);
}
</style>
