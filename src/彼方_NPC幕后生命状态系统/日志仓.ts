// 彼方 · 日志仓: 日志页要显示的三样东西, 外加把彼方自己的 console 输出接进来。
//
// - useDebugStore: 最近一次更新的请求 / 响应 / 错误 / 更新了哪些 NPC / 移除了哪些
// - useMainPromptStore: 最近一次写进世界书的幕后状态内容(与条目内容逐字相同)
// - useConsoleStore + captureConsole: 彼方自己的 console 输出(不改变原始输出, 记录失败也不影响打印)
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { 规模数据 } from './规模';

/** 规模行文本: **格式是需求钉死的契约**(日志页顶部固定一行), 改这里等于改契约。 */
function 格式化规模行(规模: 规模数据): string {
    return `本轮追踪 ${规模.追踪} 个 NPC · 状态卡合计 ${规模.卡片字数} 字 · 世界书 ${规模.世界书条数} 条 / ${规模.世界书字数} 字 · 输入约 ${规模.估算token} token`;
}

/** 一条更新日志。字段全部可选: record() 是"补丁式"写入(见下面 base 的合并逻辑),
 *  调用方每次只给发生变化的那几项(如 update.ts 成功时只给 updatedNpcs/removedNpcs,
 *  失败时只给 error)。写成必填会让每个调用点补一堆空串, 那才是失真。 */
interface 更新日志 {
    time: number;
    model: string;
    replyIds: number[];
    replyPreview: string;
    updatedNpcs: string[];
    removedNpcs: string[];
    request: string;
    response: string;
    error: string;
    /** 本轮注入规模; 只有"组装过请求"的那一轮才有(失败/中断的轮次可能没有) */
    规模: 规模数据 | null;
    /** 规模数据渲染成的那一行(由 record() 统一派生, 格式只在这里写一次) */
    规模行: string;
}

/** 控制台里的一行(日志页按 type 上色, 所以 type 保留原始方法名) */
interface 控制台行 {
    time: number;
    type: string;
    text: string;
}

const useDebugStore = defineStore('bifang-debug', () => {
    const log = ref<更新日志 | null>(null);
    function record(partial: Partial<更新日志>) {
        const base: 更新日志 = {
            time: 0,
            model: '',
            replyIds: [],
            replyPreview: '',
            updatedNpcs: [],
            removedNpcs: [],
            request: '',
            response: '',
            error: '',
            规模: null,
            规模行: '',
        };
        // 规模行只由 规模 派生(唯一一处拼文本): 传了 规模 就必然有对应的一行, 两者不会漂。
        const 规模 = partial.规模 ?? log.value?.规模 ?? null;
        log.value = {
            ...base,
            ...(log.value ?? {}),
            ...partial,
            规模,
            规模行: 规模 ? 格式化规模行(规模) : '',
            time: partial.time ?? Date.now(),
        };
    }
    function clear() {
        log.value = null;
    }
    return { log, record, clear };
});
/** 记录最近一次彼方写入世界书条目(供主AI及任何读取该世界书的环节读取)的幕后状态内容, 供日志页查看 */
const useMainPromptStore = defineStore('bifang-main-prompt', () => {
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
const useConsoleStore = defineStore('bifang-console', () => {
    const lines = ref<控制台行[]>([]);
    function record(type: string, ...args: unknown[]) {
        const text = args
            .map(a => {
            if (typeof a === 'string')
                return a;
            if (a instanceof Error)
                return a.stack || a.message;
            try {
                return JSON.stringify(a);
            }
            catch {
                return String(a);
            }
        })
            .join(' ');
        lines.value.push({ time: Date.now(), type, text });
        if (lines.value.length > 300)
            lines.value = lines.value.slice(-300);
    }
    function clear() {
        lines.value = [];
    }
    return { lines, record, clear };
});

/** 给彼方脚本的 console 方法挂上记录（不改变原始输出） */
function captureConsole() {
    try {
        const store = useConsoleStore();
        // as const: 不这样写 types 会被推成 string[], 于是 console[type] 是"用 string 索引 Console"
        // (TS7053)。这里要的正是"只允许这四个真实存在的键"。
        const types = ['log', 'warn', 'error', 'info'] as const;
        for (const type of types) {
            const original = console[type];
            console[type] = (...args: unknown[]) => {
                try {
                    store.record(type, ...args);
                }
                catch {
                    // 记录失败不影响原始输出
                }
                return original.apply(console, args);
            };
        }
    }
    catch {
        // 忽略
    }
}

export { captureConsole, useConsoleStore, useDebugStore, useMainPromptStore };
export type { 更新日志, 控制台行 };
