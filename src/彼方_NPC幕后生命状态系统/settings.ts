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
    /** 启用幕后系统(NPC状态更新/注入等): 关闭后不再调用 API、不再自动更新, 已有状态数据保留(重开恢复); 与正文渲染相互独立 */
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
    正文渲染: zod__WEBPACK_IMPORTED_MODULE_0__.z
        .object({
        启用: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        /** 解析接口配置名: 空=复用彼方当前接口; 填了=用保存的接口配置预设(不同 API, 与更新互不干扰) */
        解析接口预设: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 图片库: 每张图片匹配一个或多个关键词(角色名/别名), 渲染时按说话者名字匹配头像 */
        图片库: zod__WEBPACK_IMPORTED_MODULE_0__.z
            .array(zod__WEBPACK_IMPORTED_MODULE_0__.z
            .object({
            关键词: zod__WEBPACK_IMPORTED_MODULE_0__.z.array(zod__WEBPACK_IMPORTED_MODULE_0__.z.string()).default([]),
            图片: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
            颜色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
            头像形状: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['auto', 'circle', 'rounded', 'portrait', 'soft']).default('auto'),
        })
            .prefault({ 关键词: [], 图片: '', 颜色: '', 头像形状: 'auto' }))
            .default([]),
        /** 角色色: 自动=从设计调色板按角色名稳定取色; 固定=所有未配图角色同一色; 灰=中性灰 */
        角色配色: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['自动', '固定', '灰']).default('自动'),
        固定角色色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default('#8b93a7'),
        /** 头像形状: 自动=按角色名稳定分配; 固定=所有角色同一形状 */
        头像形状: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['auto', 'circle', 'rounded', 'portrait', 'soft']).default('auto'),
        /** 主角名: 主角对白显示用此名字(空=用 persona 名 / "你"), 也用于判定哪些对白是主角 */
        主角名: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 主角对白独立样式(留空则用角色解析色): 对白文字色/名字色/竖线色/头像色 */
        主角对白文字色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        主角名字色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        主角细线色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        主角头像色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 正文标签预处理: 无/排除(删标签内)/只读(只留标签内) */
        标签模式: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['无', '排除', '只读']).default('排除'),
        标签列表: zod__WEBPACK_IMPORTED_MODULE_0__.z.array(zod__WEBPACK_IMPORTED_MODULE_0__.z.string()).default([]),
        /** 对白外观: 用户自由定制背景/渐变/透明度/圆角/细线等(无背景细线为默认) */
        /** 对白背景色: 空=无背景(保留细线样式) */
        对白背景色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 对白背景色2: 渐变终点色(空=与背景色同色, 仅渐变时用) */
        对白背景色2: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 对白背景透明度(0-100, 0=全透明无背景) */
        对白背景透明度: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(12).transform(value => _.clamp(value, 0, 100)),
        /** 对白背景渐变方向: 无/横向/纵向/对角 */
        对白渐变: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['无', '横向', '纵向', '对角', '横向到透明', '纵向到透明', '对角到透明']).default('无'),
        /** 对白左侧细线: 开启后使用角色色细线强调(默认开启, 细线效果) */
        对白细线: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
        /** 对白细线颜色: 空=使用角色色 */
        对白细线颜色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 对白细线粗细(px) */
        对白细线粗细: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(2).transform(value => _.clamp(value, 0, 8)),
        /** 对白圆角(px) */
        对白圆角: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(4).transform(value => _.clamp(value, 0, 30)),
        /** 对白文字颜色: 空=跟随主题正文色 */
        对白文字色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        显示角色名: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        /** 角色名字号(px): 显示角色名时的大小 */
        角色名字号: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(12).transform(value => _.clamp(value, 8, 24)),
        对白最大宽度: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(75).transform(value => _.clamp(value, 40, 95)),
        头像大小: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(50).transform(value => Math.max(32, Math.round(value))),
        /** 阅读区最大宽度(px): 控制正文左右留白 */
        阅读宽度: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(760).transform(value => Math.max(480, Math.min(1200, Math.round(value)))),
        /** 旁白字体设置 */
        旁白字体: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default('Noto Serif SC, Source Han Serif SC, Songti SC, STSong, SimSun, serif'),
        旁白字号: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(17).transform(value => Math.max(13, Math.min(24, value))),
        旁白加粗: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        旁白行高: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(2.0).transform(value => _.clamp(value, 1.4, 2.6)),
        /** 旁白段间距(em): 旁白段落之间的垂直距离 */
        旁白段间距: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(1.15).transform(value => _.clamp(value, 0, 4)),
        /** 旁白间距(em): 旁白块(含动作)与相邻内容之间的垂直距离 */
        旁白间距: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(1.6).transform(value => _.clamp(value, 0, 6)),
        /** 旁白文字色: 空=跟随主题正文色 */
        旁白文字色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 动作文字色: 空=跟随旁白 */
        动作文字色: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 对白字体设置 */
        对白字体: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default('Noto Serif SC, Source Han Serif SC, Songti SC, STSong, SimSun, serif'),
        对白字号: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(17).transform(value => Math.max(13, Math.min(24, value))),
        对白加粗: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        对白行高: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(1.9).transform(value => _.clamp(value, 1.3, 2.4)),
        /** 导入字体: 每行一条 — @font-face 样式 / 字体文件 URL / Google Fonts 样式表链接 */
        导入字体: zod__WEBPACK_IMPORTED_MODULE_0__.z.string().default(''),
        /** 杀八股清理: 开启时渲染 AI 附带"杀八股清理规则"(语义清理), 关闭则纯逐字保留解析 */
        杀八股: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
        /** 杀八股启用的规则组(与"通用规则集"分组一致): 勾选的组才生效(AI 组进提示词, program 组进代码替换); 选开组默认关 */
        杀八股规则: zod__WEBPACK_IMPORTED_MODULE_0__.z
            .record(zod__WEBPACK_IMPORTED_MODULE_0__.z.string(), zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean())
            .default({
            '形副词系': true,
            '形副量词': true,
            '删陈词滥调': true,
            '修剪比喻类': true,
            '修剪复合句': true,
            '人体词汇': true,
            'R18词汇': true,
            '词汇替换': false,
            '处理——及多种增殖': false,
            '合并较短段落': false,
            '分割较长段落': false,
        }),
        /** 自定义解析提示词段(非空时替换内置提示词): { role: system/user/assistant, content }[]; 占位符 {{正文}}/{{主角名}}/{{当前时间}} */
        自定义提示词: zod__WEBPACK_IMPORTED_MODULE_0__.z
            .array(zod__WEBPACK_IMPORTED_MODULE_0__.z.object({
            role: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['system', 'user', 'assistant']),
            content: zod__WEBPACK_IMPORTED_MODULE_0__.z.string(),
        }))
            .default([]),
        /** 旁白与对白的间距(em) */
        对白间距: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(2.0).transform(value => _.clamp(value, 0.5, 5)),
        /** 旁白与对白对齐: 开启后旁白缩进到与对白文本同一起始列, 形成上下对齐的阅读列 */
        旁白对齐对白: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        /** 动作并入旁白: 开启后 action 不单独渲染(斜体弱化), 直接按旁白样式显示 */
        动作并入旁白: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        动画: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(true),
        历史播放动画: zod__WEBPACK_IMPORTED_MODULE_0__.z.boolean().default(false),
        /** 情绪驱动动画: 完整(静态表现+一次性 accent)/简化(仅静态表现)/关闭(不输出情绪) */
        情绪动画: zod__WEBPACK_IMPORTED_MODULE_0__.z.enum(['完整', '简化', '关闭']).default('完整'),
        /** 动画触发位置: 元素顶部滚到屏幕的这个百分比(从顶部计)处才显示/播放动画; 66=距底1/3, 50=屏幕中间, 100=一进视口就显示 */
        动画触发位置: zod__WEBPACK_IMPORTED_MODULE_0__.z.coerce.number().default(66).transform(value => Math.max(5, Math.min(100, Math.round(value)))),
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
