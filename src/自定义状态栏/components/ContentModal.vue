<template>
  <Teleport :to="teleportTarget" :disabled="!canTeleport">
    <div
      v-if="open"
      class="cm-overlay"
      :class="{ dark: dark, 'in-statusbar': inStatusBar }"
      @click.self="close"
    >
      <div class="cm-modal" :class="{ dark: dark, ['cm-modal-' + bodyClass]: bodyClass }" @click.stop>
        <div class="cm-head">
          <span class="cm-title">{{ title }}</span>
          <button class="cm-close" type="button" @click="close">×</button>
        </div>
        <div class="cm-body" :class="bodyClass" ref="bodyEl"><slot /></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    dark?: boolean;
    bodyClass?: string;
  }>(),
  { title: '完整内容', dark: true, bodyClass: '' },
);
const emit = defineEmits<{ (e: 'update:open', v: boolean): void }>();

const bodyEl = ref<HTMLElement | null>(null);
const sbRoot = ref<HTMLElement | null>(null);

function pickHostDoc(): Document {
  try {
    const w: any = window;
    const parent = w.parent;
    if (parent?.document?.body) {
      void parent.document.body.nodeType;
      return parent.document as Document;
    }
  } catch {
    /* 跨域 */
  }
  return document;
}

const hostDoc = pickHostDoc();

function resolveSbRoot(): HTMLElement | null {
  const docs: Document[] = [document];
  if (hostDoc !== document) docs.push(hostDoc);
  for (const d of docs) {
    try {
      const el =
        (d.querySelector('.sb-root') as HTMLElement | null) ||
        (d.querySelector('[id*="script"] .sb-root') as HTMLElement | null);
      if (el) return el;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function refreshTarget() {
  sbRoot.value = resolveSbRoot();
}

const inStatusBar = computed(() => !!sbRoot.value);
const teleportTarget = computed(() => (sbRoot.value || hostDoc.body) as HTMLElement);
const canTeleport = computed(() => !!teleportTarget.value);

function close() {
  emit('update:open', false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close();
}

function setRootModalFlag(on: boolean) {
  const root = sbRoot.value || resolveSbRoot();
  if (!root) return;
  if (on) root.classList.add('has-content-modal');
  else root.classList.remove('has-content-modal');
}

watch(
  () => props.open,
  v => {
    refreshTarget();
    setRootModalFlag(!!v);
    if (!v) return;
    nextTick(() => {
      bodyEl.value?.focus?.();
    });
  },
);

onMounted(() => {
  refreshTarget();
  hostDoc.addEventListener('keydown', onKey, true);
  if (hostDoc !== document) document.addEventListener('keydown', onKey, true);
});
onBeforeUnmount(() => {
  setRootModalFlag(false);
  hostDoc.removeEventListener('keydown', onKey, true);
  if (hostDoc !== document) document.removeEventListener('keydown', onKey, true);
});
</script>

<style>
/* Teleport 到 .sb-root 或宿主 body；不能用 scoped */
.sb-root.has-content-modal {
  overflow: visible !important;
  z-index: 40;
  isolation: isolate;
}

/* 状态栏内：只盖住状态栏区域 */
.cm-overlay.in-statusbar {
  position: absolute;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: inherit;
}

/* 兜底：找不到状态栏时仍用全屏居中（含安全区） */
.cm-overlay:not(.in-statusbar) {
  position: fixed;
  inset: 0;
  z-index: 100060;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 0px))
    max(16px, env(safe-area-inset-right, 0px))
    max(16px, env(safe-area-inset-bottom, 0px))
    max(16px, env(safe-area-inset-left, 0px));
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.cm-modal {
  max-width: min(100%, 520px);
  max-height: min(92%, 70vh);
  width: max-content;
  min-width: min(100%, 200px);
  margin: auto;
  flex-shrink: 0;
  background: #ffffff;
  color: #1f2937;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.5;
}
.cm-overlay.in-statusbar .cm-modal {
  max-height: min(100%, 360px);
}
/* 大图模式：modal 高度放大接近全屏，宽度仍随图片自适应（不撑满全屏） */
.cm-overlay .cm-modal.cm-modal-is-full-image {
  max-width: none !important;
  max-height: min(92%, 86vh) !important;
  width: auto !important;
}
.cm-modal.dark {
  background: #1a222c;
  color: #e4eef2;
  border: 1px solid #3a4d5c;
}
.cm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(126, 201, 184, 0.25);
  flex-shrink: 0;
  gap: 8px;
}
.cm-title {
  font-size: 12px;
  opacity: 0.85;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  opacity: 0.7;
  flex-shrink: 0;
}
.cm-close:hover {
  opacity: 1;
  background: rgba(126, 201, 184, 0.18);
}
.cm-body {
  padding: 12px;
  overflow: auto;
  max-height: min(60vh, 360px);
  box-sizing: border-box;
  white-space: normal;
  word-break: break-word;
  outline: none;
}
.cm-overlay.in-statusbar .cm-body {
  max-height: min(50vh, 280px);
}
.cm-body > * {
  max-width: none !important;
  width: auto !important;
  overflow: visible !important;
  flex: 0 0 auto !important;
  text-overflow: clip !important;
  white-space: normal !important;
}
.cm-body .w-chip {
  display: inline-block;
  margin: 2px 4px 2px 0;
  width: auto !important;
  max-width: none !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: clip !important;
}
.cm-body .w-expand {
  display: block;
  overflow: visible !important;
}
/* 图片全图查看：放大弹窗，居中显示原图 */
.cm-body.is-full-image {
  max-height: min(86vh, 760px) !important;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}
/* 覆盖通用的 .cm-body > * 规则，让容器撑满 body 可视高度，图片受限其内 */
.cm-body.is-full-image > .w-image-full-body {
  width: 100% !important;
  height: 100% !important;
  flex: 1 1 auto !important;
  max-width: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.cm-body.is-full-image .w-image-full-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  user-select: none;
  -webkit-user-drag: none;
}
</style>
