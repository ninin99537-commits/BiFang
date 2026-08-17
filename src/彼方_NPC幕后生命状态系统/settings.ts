// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as zod__WEBPACK_IMPORTED_MODULE_0__ from 'zod';
import * as klona__WEBPACK_IMPORTED_MODULE_1__ from 'klona';
import * as pinia__WEBPACK_IMPORTED_MODULE_2__ from 'pinia';
import * as vue__WEBPACK_IMPORTED_MODULE_3__ from 'vue';

/* harmony export */ 



/** 一套完整的接口配置(当前配置与预设共用同一结构) */
const ApiConfigSchema = zod__WEBPACK_IMPORTED_MODULE_0__.z
    .object({
    地址: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
    密钥: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
    模型: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
    模型列表: zod__WEBPACK_IMPORTED_MODULE_0__.z.array(zod__WEBPACK_IMPORTED_MODULE_0__.z.string()).default([]),
    /** 走酒馆服务器转发请求(绕开浏览器跨域限制), 用于不支持 CORS 的接口(如 tokenrhythm.studio) */
    服务端转发: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
    /** 关闭模型思维链(推理/思考), 加快响应并避免正文被推理占满; 通过 thinking.type=disabled 实现(Responses API 风格, 原生支持 Responses API 的模型可用) */
    关闭思维链: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
    温度: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(0.7).transform(value => _.clamp(value, 0, 2)),
    最大token: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(2048).transform(value => Math.max(1, Math.min(131072, Math.round(value)))),
})
    .prefault({});
const Settings = zod__WEBPACK_IMPORTED_MODULE_0__.z
    .object({
    /** 启用幕后系统(NPC状态更新/注入等): 关闭后不再调用 API、不再自动更新, 已有状态数据保留(重开恢复) */
    启用幕后: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
    接口: ApiConfigSchema,
    /** 保存的多套接口配置预设(名字 → 完整接口配置), 用于快速切换不同 AI */
    接口预设: zod__WEBPACK_IMPORTED_MODULE_0__.z.record(zod__WEBPACK_IMPORTED_MODULE_0__.z.string(), ApiConfigSchema).default({}),
    更新: zod__WEBPACK_IMPORTED_MODULE_0__.z
        .object({
        自动更新: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
        更新频率: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(1).transform(value => Math.max(1, Math.round(value))),
        读取最近回复数: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(3).transform(value => Math.max(1, Math.min(20, Math.round(value)))),
        追踪当前角色: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        后台互动: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        注入到AI: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        /** 把幕后状态写入当前角色卡主世界书里的常驻条目(蓝灯常开), 切换聊天时会自动重新注入当前聊天的内容 */
        注入世界书条目: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        生理监测: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        注入世界书: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
        注入世界书上限: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(8000).transform(value => Math.max(500, Math.min(200000, Math.round(value)))),
        注入世界书条数: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(40).transform(value => Math.max(1, Math.min(200, Math.round(value)))),
        /** 自定义更新提示词段(非空时替换内置幕后提示词): { role: system/user/assistant, content }[]; 占位符 {{正文}}/{{上下文}}/{{追踪名单}}/{{现有状态卡}}/{{互动记录}}/{{当前剧情时间}}/{{主角名}}/{{当前时间}} */
        自定义提示词: zod__WEBPACK_IMPORTED_MODULE_0__.z
            .array(zod__WEBPACK_IMPORTED_MODULE_0__.z.object({
            role: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['system', 'user', 'assistant']),
            content: zod__WEBPACK_IMPORTED_MODULE_0__.z.string(),
        }))
            .default([]),
    })
        .prefault({}),
    标签: zod__WEBPACK_IMPORTED_MODULE_0__.z
        .object({
        模式: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['排除', '只读']).default('排除'),
        列表: zod__WEBPACK_IMPORTED_MODULE_0__.z.array(zod__WEBPACK_IMPORTED_MODULE_0__.z.string()).default(['aftertalk']),
    })
        .prefault({}),
})
    .prefault({});
const SETTINGS_KEY = '彼方_settings';
/** 设置写入全局变量(存在服务器端): 局域网各设备共享同一份, 不随脚本导出, 不在脚本变量列表 */
function saveToGlobal(settings) {
    try {
        updateVariablesWith(variables => {
            variables[SETTINGS_KEY] = klona__WEBPACK_IMPORTED_MODULE_1__.klona(settings);
            return variables;
        }, { type: 'global' });
    }
    catch (error) {
        console.warn('[彼方] 保存全局设置失败:', error);
    }
}
/** 合并写回全局: 保留全局中彼方 store 里没有的顶层字段, 避免多 iframe/多设备互相覆盖时丢字段 */
function saveToGlobalMerged(settings) {
    try {
        updateVariablesWith(variables => {
            const prev = variables[SETTINGS_KEY];
            if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
                variables[SETTINGS_KEY] = { ...prev, ...klona__WEBPACK_IMPORTED_MODULE_1__.klona(settings) };
            }
            else {
                variables[SETTINGS_KEY] = klona__WEBPACK_IMPORTED_MODULE_1__.klona(settings);
            }
            return variables;
        }, { type: 'global' });
    }
    catch (error) {
        console.warn('[彼方] 保存全局设置失败:', error);
    }
}
function loadSettings() {
    // 1. 优先读全局变量(服务器端共享, 局域网各设备共用)
    try {
        const global = getVariables({ type: 'global' })?.[SETTINGS_KEY];
        if (global && typeof global === 'object' && !Array.isArray(global)) {
            return Settings.parse(global);
        }
    }
    catch (error) {
        console.warn('[彼方] 读取全局设置失败:', error);
    }
    // 2. 兼容 localStorage(上一版, 浏览器本地)
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const migrated = Settings.parse(JSON.parse(raw));
            saveToGlobal(migrated);
            return migrated;
        }
    }
    catch (error) {
        console.warn('[彼方] 读取本地设置失败:', error);
    }
    // 3. 兼容更早版本: 设置存在酒馆助手脚本变量里(含接口地址/密钥), 迁移到全局变量后清空脚本变量
    try {
        const old = getVariables({ type: 'script', script_id: getScriptId() });
        if (old && typeof old === 'object' && !Array.isArray(old)) {
            const migrated = Settings.parse(old);
            saveToGlobal(migrated);
            updateVariablesWith(() => ({}), { type: 'script' });
            return migrated;
        }
    }
    catch (error) {
        console.warn('[彼方] 迁移旧设置失败:', error);
    }
    return Settings.parse({});
}
const useSettingsStore = pinia__WEBPACK_IMPORTED_MODULE_2__.defineStore('bifang-settings', () => {
    const settings = vue__WEBPACK_IMPORTED_MODULE_3__.ref(loadSettings());
    // 设置变化时写回全局(服务器端共享)。注意:
    // - 每次变化都写回(含首次), 因为 loadSettings 已读到全局最新值, 首次写回相同值无害;
    // - 合并写回: 保留全局中彼方 store 里不存在的字段(多 iframe/多设备下防止丢字段),
    //   同名顶层字段用 store 值(用户当前看到的最新值)。
    vue__WEBPACK_IMPORTED_MODULE_3__.watch(settings, value => {
        saveToGlobalMerged(klona__WEBPACK_IMPORTED_MODULE_1__.klona(value));
    }, { deep: true });
    return { settings };
});

/**
 * 读取设置: 优先实时读全局(悬浮球/其他 iframe 改设置后, 渲染侧能立即拿到最新值,
 * 避免 store 缓存旧设置导致图片库/头像大小等不生效); 读失败回退 store 缓存。
 * 全局读取带 500ms 缓存, 避免渲染频繁调用时反复序列化大设置(含 base64 头像)。
 */
let globalReadCache = null;
let globalReadTime = 0;
function getSettings() {
    try {
        const now = Date.now();
        if (!globalReadCache || now - globalReadTime > 500) {
            const global = getVariables({ type: 'global' })?.[SETTINGS_KEY];
            if (global && typeof global === 'object' && !Array.isArray(global)) {
                globalReadCache = Settings.parse(global);
                globalReadTime = now;
            }
        }
        if (globalReadCache)
            return globalReadCache;
    }
    catch {
        // 全局读取失败, 回退 store
    }
    return useSettingsStore().settings;
}

export { getSettings, useSettingsStore };
