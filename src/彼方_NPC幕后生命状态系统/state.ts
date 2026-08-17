// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as klona__WEBPACK_IMPORTED_MODULE_0__ from 'klona';
import * as pinia__WEBPACK_IMPORTED_MODULE_1__ from 'pinia';
import * as vue__WEBPACK_IMPORTED_MODULE_2__ from 'vue';

/* harmony export */ 


const STORAGE_KEY = '彼方';
const DATA_VERSION = 2;
/** 彼方写入角色卡主世界书的常驻条目名（用于识别、更新与排除）。
 * 注意: 数据库脚本(ACU)剧情推进会屏蔽名字含"状态/规则/变量/检定/叙事"等关键词的条目,
 * 因此条目名必须避开这些词, 否则剧情推进读不到。 */
const BIFANG_WORLDBOOK_ENTRY_NAME = '【彼方】NPC幕后生活';
/** 状态回滚快照最多保留的条数，防止楼层过高时数据无限膨胀 */
const SNAPSHOT_LIMIT = 10;
const CARD_FIELDS = [
    '当前在做',
    '当前状态',
    '接下来想做',
    '当前目标',
    '心里惦记',
    '最近变化',
    '未完成事项',
    '生活状态',
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
];
function emptyData() {
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
function freshClearData() {
    const data = emptyData();
    try {
        data.清空层 = getLastMessageId();
    }
    catch {
        // 读取失败时保持 0，退化为全量分析
    }
    return data;
}
function mergeDefaults(raw) {
    const base = emptyData();
    if (!raw || typeof raw !== 'object')
        return base;
    const data = raw;
    return {
        ...base,
        ...data,
        名单: Array.isArray(data.名单) ? data.名单 : [],
        NPC: { ...(data.NPC ?? {}) },
        在场NPC: Array.isArray(data.在场NPC) ? data.在场NPC : [],
        后台互动: Array.isArray(data.后台互动) ? data.后台互动 : [],
        时间轴: Array.isArray(data.时间轴) ? data.时间轴 : [],
        卡字段计数: { ...(data.卡字段计数 ?? {}) },
        统计: { ...base.统计, ...(data.统计 ?? {}) },
        快照: Array.isArray(data.快照) ? data.快照 : [],
        已处理层数: typeof data.已处理层数 === 'number' ? data.已处理层数 : 0,
        最后处理摘要: typeof data.最后处理摘要 === 'string' ? data.最后处理摘要 : '',
        清空层: typeof data.清空层 === 'number' ? data.清空层 : 0,
    };
}
function loadData() {
    try {
        const variables = getVariables({ type: 'chat' });
        return mergeDefaults(variables?.[STORAGE_KEY]);
    }
    catch {
        return emptyData();
    }
}
function saveData(data) {
    try {
        updateVariablesWith(variables => {
            variables[STORAGE_KEY] = klona__WEBPACK_IMPORTED_MODULE_0__.klona(data);
            return variables;
        }, { type: 'chat' });
    }
    catch (error) {
        console.error('[彼方] 保存NPC状态失败:', error);
        toastr.error(`彼方: 保存失败 ${error instanceof Error ? error.message : String(error)}`, '彼方');
    }
}
const useStateStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-state', () => {
    const data = vue__WEBPACK_IMPORTED_MODULE_2__.ref(loadData());
    function reload() {
        data.value = loadData();
    }
    function save() {
        saveData(data.value);
    }
    return { data, reload, save };
});
const useDebugStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-debug', () => {
    const log = vue__WEBPACK_IMPORTED_MODULE_2__.ref(null);
    function record(partial) {
        const base = {
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
const useRenderLogStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-render-log', () => {
    const logs = vue__WEBPACK_IMPORTED_MODULE_2__.ref([]);
    function add(partial) {
        const entry = {
            time: partial.time ?? Date.now(),
            messageId: partial.messageId ?? 0,
            request: partial.request ?? '',
            response: partial.response ?? '',
            error: partial.error ?? '',
        };
        logs.value = [entry, ...logs.value].slice(0, 10);
    }
    function clear() {
        logs.value = [];
    }
    return { logs, add, clear };
});
/** 记录最近一次主AI实际收到的完整请求（含世界书注入等），供日志页查看 */
const useMainPromptStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-main-prompt', () => {
    const prompt = vue__WEBPACK_IMPORTED_MODULE_2__.ref('');
    const time = vue__WEBPACK_IMPORTED_MODULE_2__.ref(0);
    const count = vue__WEBPACK_IMPORTED_MODULE_2__.ref(0);
    function record(text) {
        prompt.value = text;
        time.value = Date.now();
        count.value += 1;
    }
    return { prompt, time, count, record };
});
/** 捕获彼方脚本自身的 console 输出，让日志页可见（不再只进控制台） */
const useConsoleStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-console', () => {
    const lines = vue__WEBPACK_IMPORTED_MODULE_2__.ref([]);
    function record(type, ...args) {
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

/** 性能监控 store: 记录关键操作各阶段耗时(请求发出/中断/完成/渲染) + 顶层页面长任务, 供日志页"性能"面板展示与一键复制 */
const usePerfStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-perf', () => {
    const entries = vue__WEBPACK_IMPORTED_MODULE_2__.ref([]);
    const enabled = vue__WEBPACK_IMPORTED_MODULE_2__.ref(true);
    // 记录一条性能条目: { id, name, stage, start, end, ms, detail }
    function record(entry) {
        if (!enabled.value)
            return;
        const ms = entry.end !== undefined ? Math.round(entry.end - entry.start) : undefined;
        entries.value.push({
            id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: entry.name,
            stage: entry.stage,
            time: entry.end ?? entry.start,
            ms,
            detail: entry.detail ?? '',
        });
        if (entries.value.length > 500)
            entries.value = entries.value.slice(-500);
    }
    /** 生成可复制的汇总文本(含各条目耗时 + 耗时 > 50ms 的慢点统计) */
    function toReportText() {
        const rows = entries.value.map(e => {
            const t = new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false });
            return `${t} | ${e.name} | ${e.stage} | ${e.ms !== undefined ? e.ms + 'ms' : '-'} | ${e.detail}`;
        });
        // 统计最慢的 15 条
        const slow = entries.value
            .filter(e => e.ms !== undefined && e.ms > 50)
            .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0))
            .slice(0, 15);
        const slowRows = slow.map(e => `${e.name} | ${e.stage} | ${e.ms}ms | ${e.detail}`);
        return [
            `彼方性能报告 (${new Date().toLocaleString('zh-CN')})`,
            `总条目: ${entries.value.length}`,
            ``,
            `--- 慢点 TOP 15 (>50ms) ---`,
            ...(slowRows.length ? slowRows : ['(无)']),
            ``,
            `--- 全部条目 ---`,
            ...rows,
        ].join('\n');
    }
    function clear() {
        entries.value = [];
    }
    return { entries, enabled, record, toReportText, clear };
});

/** 启动顶层页面(酒馆)长任务监听: PerformanceObserver 记录主线程被占用 > 50ms 的长任务,
 * 能看出卡顿是彼方 iframe 的 JS 还是酒馆/其他插件造成(attribution 里有 frame/script)。
 * 彼方 iframe 无沙盒, 可直接在父页面注册; 长任务会记录到 usePerfStore, 随性能报告一并复制。 */
let longTaskObserverStarted = false;
function startLongTaskObserver() {
    if (longTaskObserverStarted)
        return;
    const parent = window.parent;
    const parentWin = parent && parent !== window ? parent : window;
    if (typeof parentWin.PerformanceObserver !== 'function')
        return;
    longTaskObserverStarted = true;
    try {
        const perfStore = usePerfStore();
        const observer = new parentWin.PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                try {
                    const dur = Math.round(entry.duration);
                    // attribution 里通常有一个或多个: 取第一个有 name 的(iframe/script 来源)
                    let source = '';
                    const attrs = entry.attribution || [];
                    if (attrs.length > 0) {
                        const a = attrs[0];
                        source = a.name || a.containerType || '';
                        if (a.containerSrc)
                            source += ` (${a.containerSrc.slice(0, 60)})`;
                    }
                    perfStore.record({
                        name: '主线程长任务',
                        stage: 'longtask',
                        start: entry.startTime,
                        end: entry.startTime + entry.duration,
                        detail: `${dur}ms 来源:${source || '?'}`,
                    });
                }
                catch {
                    // 忽略单条
                }
            }
        });
        observer.observe({ type: 'longtask', buffered: true });
    }
    catch {
        // 不支持则跳过
    }
}

/** 给彼方脚本的 console 方法挂上记录（不改变原始输出） */
function captureConsole() {
    try {
        const store = useConsoleStore();
        const types = ['log', 'warn', 'error', 'info'];
        for (const type of types) {
            const original = console[type];
            console[type] = (...args) => {
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
/** 彼方后台任务状态与中断控制（供界面显示弹窗、取消请求）。支持多个任务并发(如幕后更新 + 正文渲染同时进行): 每个任务独立中断, 互不干扰。 */
const useUpdatingStore = pinia__WEBPACK_IMPORTED_MODULE_1__.defineStore('bifang-updating', () => {
    const active = vue__WEBPACK_IMPORTED_MODULE_2__.ref(false);
    const message = vue__WEBPACK_IMPORTED_MODULE_2__.ref('');
    /** 进行中的任务: 任务名 → 独立的 AbortController(各自可独立取消, 不会误中断其他任务) */
    const tasks = new Map();
    const DEFAULT_TASK = '幕后';
    function start(text, taskName) {
        const name = taskName || text || DEFAULT_TASK;
        const controller = new AbortController();
        // 同一任务重复启动时, 先取消旧的(如用户多次点重新渲染)
        const existing = tasks.get(name);
        if (existing)
            existing.abort();
        tasks.set(name, controller);
        refresh();
        return controller.signal;
    }
    function cancel(taskName) {
        if (taskName) {
            tasks.get(taskName)?.abort();
        }
        else {
            // 兼容旧调用: 取消全部
            tasks.forEach(c => c.abort());
        }
    }
    function stop(taskName) {
        if (taskName) {
            tasks.delete(taskName);
        }
        else {
            // 兼容旧调用: 清空全部(旧的 updatingStore.stop() 语义)
            tasks.clear();
        }
        refresh();
    }
    function refresh() {
        if (tasks.size === 0) {
            active.value = false;
            message.value = '';
        }
        else {
            active.value = true;
            message.value = [...tasks.keys()].join(' + ');
        }
    }
    /** 指定任务是否还在进行(用于避免"自动重试"在解析进行中重复请求/误中断) */
    function isActive(taskName) {
        return taskName ? tasks.has(taskName) : tasks.size > 0;
    }
    return { active, message, start, cancel, stop, isActive, tasks };
});

export { BIFANG_WORLDBOOK_ENTRY_NAME, CARD_FIELDS, DATA_VERSION, SNAPSHOT_LIMIT, STORAGE_KEY, captureConsole, emptyData, freshClearData, loadData, saveData, startLongTaskObserver, useConsoleStore, useDebugStore, useMainPromptStore, usePerfStore, useRenderLogStore, useStateStore, useUpdatingStore };
