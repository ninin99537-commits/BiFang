import { defineStore } from 'pinia';
import { ref } from 'vue';
import { clearAllData, discardSnapshotAt, emptyData, loadData, saveData, SNAPSHOT_LIMIT, STORAGE_KEY, writeStateSnapshot, 保存推进结果, 读离线状态, 读已剧终, 写已剧终, 清推进失败, 设自动暂停, 记推进失败, 熔断阈值, empty离线, type 存档结果, type 离线状态 } from './快照';
import type { 导演账本 } from './schema';
import type { 往返尝试 } from '../共用/模型往返';

export { clearAllData, discardSnapshotAt, emptyData, loadData, SNAPSHOT_LIMIT, STORAGE_KEY, saveData, writeStateSnapshot, 保存推进结果, 读离线状态, 读已剧终, 写已剧终, 清推进失败, 设自动暂停, 记推进失败, 熔断阈值, empty离线 };
export type { 存档结果, 离线状态 };

/** 导演写入角色卡主世界书的常驻条目名(识别/更新/排除用)。
 * 注意: ACU 剧情推进会屏蔽名字含"状态/规则/变量/检定/叙事/格式"等关键词的条目, 条目名必须避开这些词 */
export const WORLDBOOK_ENTRY_NAME = '【剧情导演】编剧备忘';
/** 悬浮球位置/主题等界面偏好(全局变量键) */
export const UI_KEY = '剧情导演_界面';

export const useStateStore = defineStore('daoyan-state', () => {
  const data = ref<导演账本>(loadData());
  function reload() {
    data.value = loadData();
  }
  function save() {
    return saveData(data.value);
  }
  return { data, reload, save };
});

export interface DebugLog {
  time: number;
  model: string;
  replyIds: number[];
  replyPreview: string;
  request: string;
  response: string;
  error: string;
  备注: string[];
  /** 每次尝试各留一份(含失败那次的完整原文, v2.8.5 D1): 线上失败据此回放 */
  尝试?: 往返尝试[];
}

export const useDebugStore = defineStore('daoyan-debug', () => {
  const log = ref<DebugLog | null>(null);
  function 空记录(): DebugLog {
    return {
      time: 0,
      model: '',
      replyIds: [],
      replyPreview: '',
      request: '',
      response: '',
      error: '',
      备注: [],
      尝试: [],
    };
  }
  /** 同一轮里各步补记(合并) */
  function record(partial: Partial<DebugLog>) {
    log.value = { ...空记录(), ...(log.value ?? {}), ...partial, time: partial.time ?? Date.now() };
  }
  /** 新一轮开始: **不与上一轮合并**(否则上一轮的报错/输出会挂到这一轮头上, 见烟火 state.ts 同款说明, v2.8.5 D7) */
  function 开始新记录(partial: Partial<DebugLog>) {
    log.value = { ...空记录(), ...partial, time: partial.time ?? Date.now() };
  }
  function clear() {
    log.value = null;
  }
  return { log, record, 开始新记录, clear };
});

export const useConsoleStore = defineStore('daoyan-console', () => {
  const lines = ref<{ time: number; type: string; text: string }[]>([]);
  function record(type: string, ...args: unknown[]) {
    const text = args
      .map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return a.stack || a.message;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    lines.value.push({ time: Date.now(), type, text });
    if (lines.value.length > 300) lines.value = lines.value.slice(-300);
  }
  function clear() {
    lines.value = [];
  }
  return { lines, record, clear };
});

/** 捕获导演脚本自身的 console 输出, 让日志页可见 */
export function captureConsole() {
  try {
    const store = useConsoleStore();
    const types = ['log', 'warn', 'error', 'info'] as const;
    for (const type of types) {
      const original = console[type];
      console[type] = (...args: unknown[]) => {
        try {
          store.record(type, ...args);
        } catch {
          // 忽略
        }
        return original.apply(console, args);
      };
    }
  } catch {
    // 忽略
  }
}

export const useUpdatingStore = defineStore('daoyan-updating', () => {
  const active = ref(false);
  const message = ref('');
  const controller = ref<AbortController | null>(null);
  function start(text: string): AbortSignal {
    const abort = new AbortController();
    if (controller.value) controller.value.abort();
    controller.value = abort;
    active.value = true;
    message.value = text;
    return abort.signal;
  }
  function cancel() {
    controller.value?.abort();
  }
  function stop() {
    controller.value = null;
    active.value = false;
    message.value = '';
  }
  return { active, message, start, cancel, stop };
});

/** 死亡抉择: 主角死亡事件待用户当场三选一; 未抉择前暂停注入 */
export const useDeathStore = defineStore('daoyan-death', () => {
  const pending = ref(false);
  function markPending() {
    pending.value = true;
  }
  function settle() {
    pending.value = false;
  }
  return { pending, markPending, settle };
});
