<template>
  <div class="sp">
    <div class="sp-head">
      <span class="sp-title">设置</span>
      <button class="sp-btn" @click="$emit('关闭')">收起</button>
    </div>

    <section class="sp-sec">
      <div class="sp-sec-title">API 源</div>
      <label class="sp-row">
        <span class="sp-label">来源</span>
        <select class="sp-input" :value="设置.settings.api.source" @change="写来源">
          <option value="main">主 API（酒馆当前设置）</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      <template v-if="设置.settings.api.source === 'custom'">
        <label class="sp-row">
          <span class="sp-label">地址</span>
          <input v-model="设置.settings.api.apiurl" class="sp-input" placeholder="https://... （末尾自动补 /v1）" />
        </label>
        <label class="sp-row">
          <span class="sp-label">密钥</span>
          <input v-model="设置.settings.api.key" class="sp-input" type="password" placeholder="sk-..." />
        </label>
        <label class="sp-row">
          <span class="sp-label">模型</span>
          <!--
            #236 ③: 以前用「输入框 + 原生候选列表」—— 那个原生的候选列表会**按输入框当前值过滤**,
            选中一个模型后 value = 完整模型名, 再打开就只剩匹配项, 用户必须删空才看得到别的。
            现在改成「输入框 + 下拉按钮 + 自绘候选面板」:
              · 候选面板渲染的是 models 数组, **与当前值无关** → 每次打开都列全部;
              · 只有点候选才写 model → 开/关列表不会弄丢已配好的值;
              · input 就是普通输入框 → 手打能力完整保留。
          -->
          <span class="sp-model">
            <input v-model="设置.settings.api.model" class="sp-input" placeholder="gpt-4o" />
            <button
              type="button"
              class="sp-btn sp-btn-inline"
              title="选择模型"
              @click="候选开 = !候选开"
            >
              ▾
            </button>
            <div v-if="候选开" class="sp-cand-mask" @click="候选开 = false"></div>
            <div v-if="候选开" class="sp-cand">
              <button
                v-for="模型 in 设置.settings.api.models"
                :key="模型"
                type="button"
                class="sp-cand-item"
                @click="选模型(模型)"
              >
                {{ 模型 }}
              </button>
              <div v-if="!设置.settings.api.models.length" class="sp-cand-empty">还没有候选，先点右侧「拉取模型」</div>
            </div>
          </span>
          <button class="sp-btn sp-btn-inline" :disabled="拉取中" @click="拉模型">
            {{ 拉取中 ? '拉取中…' : '拉取模型' }}
          </button>
        </label>

        <!-- 预设: 只对自定义接口有意义, 所以放在 custom 分支内 -->
        <div class="sp-row sp-row-wrap sp-preset">
          <input v-model="预设名" class="sp-input" placeholder="预设名" />
          <button class="sp-btn" @click="存预设">存为预设</button>
          <select class="sp-input" :value="选中预设" @change="选预设">
            <option value="">选择预设…</option>
            <option v-for="名 in 预设名表" :key="名" :value="名">{{ 名 }}</option>
          </select>
          <button class="sp-btn sp-danger" :disabled="!选中预设" @click="删预设">删除</button>
        </div>
      </template>
    </section>

    <section class="sp-sec">
      <div class="sp-sec-title">素材注入</div>
      <label class="sp-check"><input v-model="设置.settings.material.charCard" type="checkbox" /><span>角色卡（描述/性格/场景/示例对话，全文注入）</span></label>
      <label class="sp-check"><input v-model="设置.settings.material.userPersona" type="checkbox" /><span>当前 user 人设（全文注入）</span></label>
      <label class="sp-check"><input v-model="设置.settings.material.chatHistory" type="checkbox" /><span>最近聊天记录</span></label>
      <label class="sp-row">
        <span class="sp-label">记录条数</span>
        <input v-model.number="设置.settings.material.chatDepth" class="sp-input sp-num" type="number" />
      </label>
      <div class="sp-hint">「记录条数」= 取最后 N 条**完整消息**（每条楼层内容原样进入，不会切到句子中间）。素材一律全文注入，不做任何字符截断；体量见右侧提示词预览的字符数。</div>

      <label class="sp-check">
        <input v-model="设置.settings.material.worldbook" type="checkbox" />
        <span>世界书（内嵌 + 绑定 + 聊天世界书，按下方勾选注入，全文不截断）</span>
      </label>
      <WorldbookPicker v-if="设置.settings.material.worldbook" :条目="世界书条目" />
    </section>

    <section class="sp-sec">
      <div class="sp-sec-title">生成策略</div>
      <label class="sp-row">
        <span class="sp-label">信息不足时</span>
        <select v-model="设置.settings.onMissing" class="sp-input">
          <option value="mark">标记（写「信息不足」，不编）</option>
          <option value="infer">合理推断（不得矛盾）</option>
          <option value="skip">跳过整个模块</option>
        </select>
      </label>
      <label class="sp-check"><input v-model="设置.settings.strictWhitelist" type="checkbox" /><span>输出白名单校验（多写的模块自动剔除）</span></label>
      <label class="sp-check"><input v-model="设置.settings.selfCheck" type="checkbox" /><span>生成后自查（P3 启用）</span></label>
    </section>

    <section class="sp-sec">
      <div class="sp-sec-title">请求技巧</div>
      <label class="sp-check"><input v-model="设置.settings.request.jailbreak" type="checkbox" /><span>破限（两段式；接口有内容政策拦截时使用）</span></label>
      <label class="sp-check"><input v-model="设置.settings.request.antiTruncation" type="checkbox" /><span>防截断（把免责声明段缝在系统提示词末尾）</span></label>
      <label class="sp-check"><input v-model="设置.settings.request.headFiller" type="checkbox" /><span>头部填充（填充文本作为第一条消息单独发送，留空用内置小说原文）</span></label>
      <label v-if="设置.settings.request.headFiller" class="sp-row">
        <span class="sp-label">填充文本</span>
        <textarea v-model="设置.settings.request.headFillerText" class="sp-input" rows="4" placeholder="留空使用内置小说原文"></textarea>
      </label>
      <label class="sp-check"><input v-model="设置.settings.request.prefill" type="checkbox" /><span>预填充（塞第一个勾选模块的标题，引导模型直接从标题起手）</span></label>
      <label class="sp-check"><input v-model="设置.settings.request.stream" type="checkbox" /><span>流式输出（边生成边显示；关着则整段生成完才出现，**不影响「停止」**）</span></label>
      <div class="sp-hint">四项默认全关。它们只改「怎么把请求发出去」，不改提示词内容本身。</div>
    </section>

    <section class="sp-sec">
      <div class="sp-sec-title">提示词编辑器</div>
      <div class="sp-row sp-row-wrap">
        <button class="sp-btn" @click="导出">导出 JSON</button>
        <button class="sp-btn" @click="导入">导入 JSON</button>
        <button class="sp-btn sp-danger" @click="全部恢复默认">全部恢复默认</button>
      </div>
      <div class="sp-hint">逐模块改片段请在右侧「提示词预览 → 逐模块微调」里改。这里导出/导入的是这些覆盖。</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { klona } from 'klona';
import { useSettingsStore } from '../store';
import WorldbookPicker from './WorldbookPicker.vue';
import type { 世界书条目 as 世界书条目类型 } from '../lib/世界书';
import { 拉取模型 } from '../lib/接口';

defineProps<{ 世界书条目: 世界书条目类型[] }>();
defineEmits<{ 关闭: [] }>();

const 设置 = useSettingsStore();

function 写来源(event: Event) {
  设置.settings.api.source = (event.target as HTMLSelectElement).value === 'custom' ? 'custom' : 'main';
}

// ── 模型候选面板(#236 ③) ──────────────────────────────────────────────────
// 候选面板渲染的是 models 数组, 与输入框当前值无关 —— 所以「选过一次后列表被过滤」不存在。
// 开关列表**不写 model**, 只有 选模型 才写 → 开了不选就关掉, 原值原样还在。
const 候选开 = ref(false);

function 选模型(模型: string) {
  设置.settings.api.model = 模型;
  候选开.value = false;
}

// ── 拉取模型 ────────────────────────────────────────────────────────────────
const 拉取中 = ref(false);

async function 拉模型() {
  if (拉取中.value) return;
  拉取中.value = true;
  try {
    const 列表 = await 拉取模型(设置.settings.api.apiurl, 设置.settings.api.key);
    设置.settings.api.models = 列表;
    toastr.success(`已获取 ${列表.length} 个模型`);
  } catch (error) {
    // 响亮报错, 不吞 —— 把 message 带出来
    toastr.error(error instanceof Error ? error.message : String(error));
  } finally {
    拉取中.value = false;
  }
}

// ── 接口配置预设 ────────────────────────────────────────────────────────────
const 预设名 = ref('');
const 选中预设 = ref('');
const 预设名表 = computed(() => Object.keys(设置.settings.apiPresets ?? {}));

/** 存为预设。★ 两头都 klona: 少一个就会让「当前配置」和「预设本体」共享对象引用 */
function 存预设() {
  const 名 = 预设名.value.trim();
  if (!名) {
    toastr.warning('请填写预设名');
    return;
  }
  const 已存在 = !!设置.settings.apiPresets?.[名];
  设置.settings.apiPresets[名] = klona(设置.settings.api);
  预设名.value = '';
  选中预设.value = 名;
  // 同名覆盖要和新建说不同的话 —— 用户得知道旧的那份没了
  toastr.success(已存在 ? `已覆盖预设「${名}」` : `已保存预设「${名}」`);
}

function 选预设(event: Event) {
  const 名 = (event.target as HTMLSelectElement).value;
  选中预设.value = 名;
  if (!名) return;
  const 预设 = 设置.settings.apiPresets?.[名];
  if (!预设) {
    toastr.warning('请选择要载入的预设');
    return;
  }
  // ★ 载入也要 klona —— 否则之后改当前配置会改到预设本体
  设置.settings.api = klona(预设);
  toastr.success(`已载入预设「${名}」`);
}

function 删预设() {
  const 名 = 选中预设.value.trim();
  if (!名 || !设置.settings.apiPresets?.[名]) {
    toastr.warning('请选择要删除的预设');
    return;
  }
  delete 设置.settings.apiPresets[名];
  选中预设.value = '';
  toastr.success(`已删除预设「${名}」`);
}

function 导出() {
  const 内容 = JSON.stringify(设置.settings.promptOverrides, null, 2);
  const 名 = `人设工坊-提示词覆盖-${Date.now()}.json`;
  const 链接 = document.createElement('a');
  链接.href = URL.createObjectURL(new Blob([内容], { type: 'application/json' }));
  链接.download = 名;
  链接.click();
  URL.revokeObjectURL(链接.href);
  toastr.success('已导出提示词覆盖');
}

function 导入() {
  const 输入 = document.createElement('input');
  输入.type = 'file';
  输入.accept = '.json,application/json';
  输入.onchange = async () => {
    const 文件 = 输入.files?.[0];
    if (!文件) return;
    try {
      const 文本 = await 文件.text();
      const 数据 = JSON.parse(文本) as Record<string, string>;
      if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw Error('格式不对: 期望一个对象');
      const 干净: Record<string, string> = {};
      for (const [键, 值] of Object.entries(数据)) {
        if (typeof 值 === 'string') 干净[键] = 值;
      }
      设置.settings.promptOverrides = 干净;
      toastr.success(`已导入 ${Object.keys(干净).length} 条提示词覆盖`);
    } catch (error) {
      toastr.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  输入.click();
}

function 全部恢复默认() {
  设置.settings.promptOverrides = {};
  toastr.success('已恢复全部默认片段');
}
</script>

<style scoped>
.sp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 8px;
  background: var(--forge-panel, #1c1c20);
  padding: 10px 12px;
}
.sp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sp-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--forge-text, #e9e8e6);
}
.sp-sec {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--forge-border, #33333a);
  padding-top: 8px;
}
.sp-sec-title {
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: var(--forge-accent, #c8a24a);
}
.sp-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sp-row-wrap {
  flex-wrap: wrap;
}
/* 「拉取模型」按钮: 贴着模型输入框, 不参与 flex 拉伸 */
.sp-btn-inline {
  flex: none;
}
/* #236 ③: 模型输入框 + 下拉按钮 + 自绘候选面板 */
.sp-model {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.sp-model .sp-input {
  flex: 1 1 auto;
}
/* 点面板外关闭用的透明遮罩: 不吃布局, 只吃点击 */
.sp-cand-mask {
  position: fixed;
  inset: 0;
  z-index: 10;
}
.sp-cand {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  z-index: 11;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  max-height: 200px;
  overflow-y: auto;
  box-sizing: border-box;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  scrollbar-width: thin;
}
.sp-cand-item {
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--forge-text, #e9e8e6);
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
}
.sp-cand-item:hover {
  background: var(--forge-panel, #221e18);
  color: var(--forge-accent, #c8a24a);
}
.sp-cand-empty {
  font-size: 11.5px;
  line-height: 1.5;
  padding: 6px 8px;
  color: var(--forge-dim, #9a9aa4);
}
/* 预设一行: 名字输入 + 存 + 下拉 + 删 */
.sp-preset {
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--forge-border, #33333a);
}
.sp-preset .sp-input {
  flex: 1 1 120px;
}
.sp-preset select.sp-input {
  flex: 1 1 140px;
}
.sp-label {
  flex: 0 0 88px;
  font-size: 11.5px;
  color: var(--forge-dim, #9a9aa4);
}
.sp-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 4px 8px;
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font-size: 12px;
}
.sp-num {
  flex: 0 0 90px;
}
.sp-check {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--forge-text, #e9e8e6);
}
.sp-hint {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--forge-dim, #9a9aa4);
}
.sp-btn {
  border: 1px solid var(--forge-border, #33333a);
  border-radius: 6px;
  background: var(--forge-bg, #141416);
  color: var(--forge-text, #e9e8e6);
  font-size: 11.5px;
  padding: 3px 10px;
  cursor: pointer;
}
.sp-btn:hover {
  border-color: var(--forge-accent, #c8a24a);
}
.sp-danger:hover {
  border-color: #e0574a;
  color: #ffb3ab;
}
</style>
