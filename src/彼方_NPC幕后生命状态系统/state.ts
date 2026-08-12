export const STORAGE_KEY = '彼方';
export const DATA_VERSION = 2;

/** 彼方写入角色卡主世界书的常驻条目名（用于识别、更新与排除）。
 * 注意: 数据库脚本(ACU)剧情推进会屏蔽名字含"状态/规则/变量/检定/叙事"等关键词的条目,
 * 因此条目名必须避开这些词, 否则剧情推进读不到。 */
export const BIFANG_WORLDBOOK_ENTRY_NAME = '【彼方】NPC幕后生活';
/** 状态回滚快照最多保留的条数，防止楼层过高时数据无限膨胀 */
export const SNAPSHOT_LIMIT = 10;

export const CARD_FIELDS = [
  '当前在做',
  '当前状态',
  '接下来想做',
  '当前目标',
  '心里惦记',
  '最近变化',
  '未完成事项',
  '秘密想法',
  '隐藏目标',
  '位置',
  '生理周期',
  '是否怀孕',
  '累计受孕率',
  '当前防护',
  '近期性行为',
  '生理结算',
  '受孕率记录',
] as const;

export type NpcStateCard = {
  当前在做?: string;
  当前状态?: string;
  接下来想做?: string;
  当前目标?: string;
  心里惦记?: string;
  最近变化?: string;
  未完成事项?: string;
  秘密想法?: string;
  隐藏目标?: string;
  位置?: string;
  可能偶遇?: boolean;
  生理周期?: string;
  是否怀孕?: string;
  累计受孕率?: string;
  当前防护?: string;
  近期性行为?: string;
  生理结算?: string;
  受孕率记录?: string;
  最后更新?: number;
};

export type NpcInteraction = {
  时间: string;
  NPC: string[];
  事件: string;
  /** 该互动已延续的更新轮数(由代码自动递增, 供提示词提示 AI 推进进展, 不参与显示) */
  轮次?: number;
};

/** 时间轴单条记录（每次更新生成，供界面时间轴展示，不写入 NPC 状态卡） */
export type BifangTimelineEntry = {
  /** 现实时间戳（同剧情时间时的排序基准） */
  时间: number;
  /** 分配的剧情时间文本(如 "2035-06-15 21:34") */
  剧情时间: string;
  标题: string;
  描述: string;
  类型: '状态' | '互动';
};

/** 某楼层数下彼方完整状态的快照，用于删除楼层 / 重roll时回滚 */
export type BifangSnapshot = {
  层数: number;
  时间: number;
  名单: string[];
  NPC: Record<string, NpcStateCard>;
  在场NPC: string[];
  后台互动: NpcInteraction[];
  时间轴: BifangTimelineEntry[];
  /** 卡字段未变化计数: NPC名 → 字段 → 连续未变化的轮数(最多5), 用于提示词催促 AI 更新长期未变的字段 */
  卡字段计数: Record<string, Record<string, number>>;
  统计: {
    更新次数: number;
    最后更新: number;
  };
};

export type BifangData = {
  版本: number;
  /** 本聊天要监控的 NPC 名单（随聊天保存，新聊天默认空） */
  名单: string[];
  NPC: Record<string, NpcStateCard>;
  /** 最近一次更新时 AI 判定在场的 NPC（当前场景中），用于区分注入主 AI 的在/不在场措辞 */
  在场NPC?: string[];
  后台互动: NpcInteraction[];
  /** 时间轴记录：每次更新为本次条目分配剧情时间后写入，供界面展示 */
  时间轴: BifangTimelineEntry[];
  /** 卡字段未变化计数: NPC名 → 字段 → 连续未变化的轮数(最多5), 用于提示词催促 AI 更新长期未变的字段 */
  卡字段计数: Record<string, Record<string, number>>;
  /** 最近一次更新时的剧情时间范围(由 AI 从正文推断, 如 "2035-06-15 21:28 至 21:35"), 用于提示词保持时间连续 */
  剧情时间?: string;
  统计: {
    更新次数: number;
    最后更新: number;
  };
  /** 状态回滚快照：按 AI 楼层数保存，删除/重roll时恢复到对应楼层 */
  快照: BifangSnapshot[];
  /** 彼方最近一次更新时对话中的 AI 楼层数 */
  已处理层数: number;
  /** 彼方最近一次处理的最新 AI 回复内容摘要，用于识别重roll */
  最后处理摘要: string;
  /** 清空时记录的最后楼层 id：清空后只分析比它更新的楼层，避免旧楼层重新识别出 NPC */
  清空层: number;
};

export function emptyData(): BifangData {
  return {
    版本: DATA_VERSION,
    名单: [],
    NPC: {},
    后台互动: [],
    时间轴: [],
    卡字段计数: {},
    统计: { 更新次数: 0, 最后更新: 0 },
    快照: [],
    已处理层数: 0,
    最后处理摘要: '',
    清空层: 0,
  };
}

/** 清空数据，并记录当前楼层作为「清空层」，之后只分析更新的楼层 */
export function freshClearData(): BifangData {
  const data = emptyData();
  try {
    data.清空层 = getLastMessageId();
  } catch {
    // 读取失败时保持 0，退化为全量分析
  }
  return data;
}

function mergeDefaults(raw: unknown): BifangData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<BifangData>;
  return {
    ...base,
    ...data,
    名单: Array.isArray(data.名单) ? (data.名单 as string[]) : [],
    NPC: { ...(data.NPC ?? {}) },
    在场NPC: Array.isArray(data.在场NPC) ? (data.在场NPC as string[]) : [],
    后台互动: Array.isArray(data.后台互动) ? (data.后台互动 as NpcInteraction[]) : [],
    时间轴: Array.isArray(data.时间轴) ? (data.时间轴 as BifangTimelineEntry[]) : [],
    卡字段计数: { ...(data.卡字段计数 ?? {}) },
    统计: { ...base.统计, ...(data.统计 ?? {}) },
    快照: Array.isArray(data.快照) ? (data.快照 as BifangSnapshot[]) : [],
    已处理层数: typeof data.已处理层数 === 'number' ? data.已处理层数 : 0,
    最后处理摘要: typeof data.最后处理摘要 === 'string' ? data.最后处理摘要 : '',
    清空层: typeof data.清空层 === 'number' ? data.清空层 : 0,
  };
}

export function loadData(): BifangData {
  try {
    const variables = getVariables({ type: 'chat' });
    return mergeDefaults(variables?.[STORAGE_KEY]);
  } catch {
    return emptyData();
  }
}

export function saveData(data: BifangData): void {
  try {
    updateVariablesWith(variables => {
      variables[STORAGE_KEY] = klona(data);
      return variables;
    }, { type: 'chat' });
  } catch (error) {
    console.error('[彼方] 保存NPC状态失败:', error);
    toastr.error(`彼方: 保存失败 ${error instanceof Error ? error.message : String(error)}`, '彼方');
  }
}

export const useStateStore = defineStore('bifang-state', () => {
  const data = ref<BifangData>(loadData());

  function reload() {
    data.value = loadData();
  }

  function save() {
    saveData(data.value);
  }

  return { data, reload, save };
});

export type BifangDebugLog = {
  time: number;
  model: string;
  replyIds: number[];
  replyPreview: string;
  updatedNpcs: string[];
  removedNpcs: string[];
  request: string;
  response: string;
  error: string;
};

export const useDebugStore = defineStore('bifang-debug', () => {
  const log = ref<BifangDebugLog | null>(null);

  function record(partial: Partial<BifangDebugLog>) {
    const base: BifangDebugLog = {
      time: 0,
      model: '',
      replyIds: [],
      replyPreview: '',
      updatedNpcs: [],
      removedNpcs: [],
      request: '',
      response: '',
      error: '',
    };
    log.value = { ...base, ...(log.value ?? {}), ...partial, time: partial.time ?? Date.now() };
  }

  function clear() {
    log.value = null;
  }

  return { log, record, clear };
});

/** 记录最近一次主AI实际收到的完整请求（含世界书注入等），供日志页查看 */
export const useMainPromptStore = defineStore('bifang-main-prompt', () => {
  const prompt = ref('');
  const time = ref(0);
  const count = ref(0);

  function record(text: string) {
    prompt.value = text;
    time.value = Date.now();
    count.value += 1;
  }

  return { prompt, time, count, record };
});

/** 捕获彼方脚本自身的 console 输出，让日志页可见（不再只进控制台） */
export const useConsoleStore = defineStore('bifang-console', () => {
  const lines = ref<{ time: number; type: 'log' | 'warn' | 'error' | 'info'; text: string }[]>([]);

  function record(type: 'log' | 'warn' | 'error' | 'info', ...args: unknown[]) {
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

/** 给彼方脚本的 console 方法挂上记录（不改变原始输出） */
export function captureConsole(): void {
  try {
    const store = useConsoleStore();
    const types = ['log', 'warn', 'error', 'info'] as const;
    for (const type of types) {
      const original = console[type];
      (console as any)[type] = (...args: unknown[]) => {
        try {
          store.record(type, ...args);
        } catch {
          // 记录失败不影响原始输出
        }
        return original.apply(console, args);
      };
    }
  } catch {
    // 忽略
  }
}

/** 彼方更新中的状态与中断控制（供界面显示弹窗、取消请求） */
export const useUpdatingStore = defineStore('bifang-updating', () => {
  const active = ref(false);
  const message = ref('');
  let controller: AbortController | null = null;

  function start(text: string): AbortSignal {
    active.value = true;
    message.value = text;
    controller = new AbortController();
    return controller.signal;
  }

  function cancel() {
    controller?.abort();
  }

  function stop() {
    active.value = false;
    message.value = '';
    controller = null;
  }

  return { active, message, start, cancel, stop };
});
