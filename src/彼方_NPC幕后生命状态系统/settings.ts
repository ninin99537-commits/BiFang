// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { z } from 'zod';
import { klona } from 'klona';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Host } from './host';
import { 建写回闸门, type 写回闸门 as 写回闸门类型 } from '../共用/设置写回';
// 2026-11-14: lodash 是 webpack externals 注入的全局（webpack.config.ts:4），不在 auto-imports 里 ——
// 一旦把 no-undef 开成 error 就会报悬空，所以显式写出来（default 形式，与 设置.ts 一致）。
import _ from 'lodash';

/** 设置层只碰变量表; 用 Pick 写在签名上, 不把整个宿主拖进来。
 *  `toast` 是可选的: 写回失败要出声(3-4), 但 api.ts 那类只读设置的调用方不必为此带上提示能力。 */
type 设置宿主 = Pick<Host, 'vars'> & { toast?: Host['toast'] };

/** 幕后状态写进哪本世界书: 角色卡主世界书 / 当前聊天的世界书 / 关闭 */
const 世界书写入目标表 = ['关闭', '角色卡主世界书', '聊天世界书'] as const;
type 世界书写入目标 = (typeof 世界书写入目标表)[number];

/** 一套完整的接口配置(当前配置与预设共用同一结构) */
const ApiConfigSchema = z
    .object({
    地址: z.string().default(''),
    密钥: z.string().default(''),
    模型: z.string().default(''),
    模型列表: z.array(z.string()).default([]),
    /** 直连接口: 开=彼方在脚本 iframe 里自己 fetch 接口(需接口允许浏览器跨域 CORS), 完全不经过酒馆的生成管线——
     *  预设、世界书、其他扩展都碰不到请求体; 关=由酒馆服务器转发(默认, 无跨域问题) */
    直连: z.boolean().default(false),
    /** 流式输出: 开=逐 token 接收(可实时看到输出进度, 部分模型更稳定); 关=一次性返回完整结果(更简单)。
     *  直连走 SSE, 转发走 should_stream */
    流式: z.boolean().default(false),
    温度: z.coerce.number().default(0.7).transform(value => _.clamp(value, 0, 2)),
    最大token: z.coerce.number().default(60000).transform(value => Math.max(1, Math.min(131072, Math.round(value)))),
    /** 工具通道(K2): 开=请求带一个强制调用的工具, 状态 JSON 从 arguments 里取; 关=老样子(纯文本补全)。
     *  两个作用: ① 把请求形态从"聊天补全"换成"工具调用"(怀疑服务端按请求形态降级时的唯一自主杠杆);
     *  ② tool schema 本身是结构约束, 比"解析失败就原样重发 3 次"更稳。
     *  **开启期间流式与预填充不生效**(见 api.ts 与 update.ts 的门控): 工具参数在流式下是分片到达的,
     *  拼接最容易产生偶发空回包; 而预填充那条 assistant '{' 与"必须调工具"语义互斥。
     *  接口不认 tools/tool_choice 时**本轮直接失败并提示关掉它**, 不降级、不悄悄退回纯文本 ——
     *  静默降级会让一个没用的功能看起来有用, 而用户的实验只能靠输出质量判断。
     *  默认关: 老用户不该被动受影响, 而"有没有用"只能用户自己开一天关一天比。 */
    工具通道: z.boolean().default(false),
    /** 上下文进工具(W4, 方案 §24): 开=整份上下文搬进工具的说明里, messages 只留一句无害指令;
     *  关=上下文照旧留在 messages(现状)。
     *  **必须与「工具通道」同时开才生效** —— 工具通道关着时请求里根本没有工具,
     *  这个开关会无效并在控制台明确提示(不静默)。
     *  代价(面板灰字也写了): 工具说明每轮都变 → 前缀缓存全失效; 说明变长可能变慢。
     *  默认关: 它是"上下文也不留在 messages 里"这一层实验, 与"换请求形态"是两件事, 分开试。 */
    上下文进工具: z.boolean().default(false),
    /** 请求打散(K1): 开=每次请求在 system **开头**插一段随机标记, 让同一份提示词不再字节相同。
     *  动机: 用户观察到"官方 key 请求某些模型时输出异常快而质量差", 怀疑服务端按提示词字节
     *  判定是否降级到更低档的模型 —— 逐字节相同的提示词是这类判定最好的素材。
     *  **标记放最前面, 不放末尾**(2026-11-18 用户裁定 §27): 服务端的前缀缓存从头比,
     *  标记在末尾时前面几千 token 仍逐字节相同、缓存照样命中, 指纹等于没打散。
     *  代价是真的: 每轮全量重算, 更慢更费 token。用户已明确接受, 面板灰字里写了。 */
    请求打散: z.boolean().default(false),
})
    .prefault({});
const Settings = z
    .object({
    /** 启用幕后系统(NPC状态更新/注入等): 关闭后不再调用 API、不再自动更新, 已有状态数据保留(重开恢复) */
    启用幕后: z.boolean().default(true),
    接口: ApiConfigSchema,
    /** 保存的多套接口配置预设(名字 → 完整接口配置), 用于快速切换不同 AI */
    接口预设: z.record(z.string(), ApiConfigSchema).default({}),
    更新: z
        .object({
        自动更新: z.boolean().default(true),
        /** 正文出现新角色时自动建档追踪; 关闭后只更新已追踪(名单内/已有卡)的 NPC, 新角色一律不建档; 手动添加到名单的名字仍会建档 */
        自动建档: z.boolean().default(true),
        更新频率: z.coerce.number().default(1).transform(value => Math.max(1, Math.round(value))),
        读取最近回复数: z.coerce.number().default(3).transform(value => Math.max(1, Math.min(20, Math.round(value)))),
        追踪当前角色: z.boolean().default(false),
        /** 把幕后状态写进哪本世界书的常驻条目(蓝灯常开、禁递归), 切换聊天时自动重写当前聊天的内容。
         *  角色卡主世界书: 主AI 与数据库剧情推进读到的都是它, 但它随当前发言者漂移(群聊里每个成员一本);
         *  聊天世界书: 一场聊天一本, 群聊时稳定不漂移。
         *  这是彼方向主AI提供幕后状态的**唯一**途径: 此前还有一条"注入到主AI"(injectPrompts), 已移除——
         *  那种注入只有主AI自己看得到, 其他读取世界书的插件/环节读不到, 不好用。
         *  旧版是布尔开关, 由下面这条 preprocess 直接读成两档, 不占 migrateSettings。 */
        世界书写入: z.preprocess(
            value => (typeof value === 'boolean' ? (value ? '角色卡主世界书' : '关闭') : value),
            z.enum(世界书写入目标表).default('关闭'),
        ),
        生理监测: z.boolean().default(false),
        注入世界书: z.boolean().default(true),
        /** 注入世界书时排除的条目名(列表): 填条目名(或其关键词)即不注入该条目, 如 "【彼方】NPC幕后生活" */
        注入世界书排除: z.array(z.string()).default([]),
        /** 常驻注入的世界书条目名/关键词(列表): 填条目名(或其关键词)即**每次都强制注入**这些条目(绕过关键词激活)——
         *  角色人设条目通常按关键词触发, 最新正文没提到该角色时就不会激活, 更新AI便读不到人设; 用它保证人设始终可见。
         *  换角色卡后匹配不到该条目则静默跳过(不报错)。 */
        常驻世界书条目: z.array(z.string()).default([]),
        /** 预填充(prefill): 在最后追加一条 assistant 消息引导模型直接从 JSON 开头开始输出, 减少格式失败/废话; 依赖模型是否支持(DeepSeek/GLM/Qwen/Claude 大多支持) */
        预填充: z.boolean().default(false),
        /** 慢一步: 自动更新只分析到**倒数第二层**, 最新那条 AI 回复不参与分析。
         *  代价是状态比正文晚一层; 收益是刚生成、可能被重roll/swipe 的回复不会污染状态。
         *  手动更新(force)不受它影响——用户点了就是"现在要"。
         *  只加默认值, 不做迁移(老设置里没有这个键, zod 会补 false)。 */
        慢一步: z.boolean().default(false),
    })
        .prefault({}),
    /** 用户自定义提示词段: 只允许往内置提示词的固定锚点里插, 内置提示词本身一个字都不改。
     *  锚点是消息级位置(插不进某条消息的正文内部), 见 prompts.ts 的 锚点表。
     *  破限不再内置——想要的人在这里自己插一段(system 或 assistant)。 */
    提示词: z
        .object({
        自定义段: z
            .array(z.object({
            锚点: z.enum(['最前', '主提示词之后', '任务之前', '任务之后', '最后']).default('任务之后'),
            role: z.enum(['system', 'user', 'assistant']).default('system'),
            content: z.string().default(''),
            启用: z.boolean().default(true),
        }))
            .default([]),
    })
        .prefault({}),
    标签: z
        .object({
        模式: z.enum(['排除', '只读']).default('排除'),
        列表: z.array(z.string()).default(['aftertalk']),
    })
        .prefault({}),
    /** 调试开关: 默认全关。目前只有一个用途 —— 把状态仓暴露到 iframe window 上供验收/排障注入假数据。
     *  为什么必须是开关而不是裸挂: 裸挂等于给任何同源脚本一条改状态的通道, 且没人知道它开着。 */
    调试: z
        .object({
        /** 把 pinia 状态仓挂到 `window.__bfStateStore`(只读引用, 不改任何写盘路径)。
         *  关(默认) = 不挂; 开 = 挂上, 供验收在 Console 里往内存塞假数据看版式。
         *
         *  **刻意不做 UI 开关**: 这是排障/验收后门, 摆在普通玩家的设置界面里既是噪音也是诱导误用
         *  (任何人打开它就能拿到一条改状态的通道)。开启方式只有两条:
         *    ① 脚本变量里手写 `彼方_settings.调试.暴露状态 = true`;
         *    ② 浏览器 Console 改 `settingsStore.settings.value.调试.暴露状态 = true`(立即生效, 有 watch 跟随)。
         *  改完刷新页面即恢复默认(不落盘到"开着"的状态之外)。 */
        暴露状态: z.boolean().default(false),
    })
        .prefault({}),
})
    .prefault({});
const SETTINGS_KEY = '彼方_settings';
/** 设置对象的类型(由 schema 推出来, 不手写第二份) */
type 设置 = z.infer<typeof Settings>;
/** 旧设置迁移: 已删除的开关只清键; 世界书写入的旧布尔键按名搬成三档 */
function migrateSettings(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object')
        return raw;
    // 上面已判"是非空对象"。这里是**用户存下来的旧设置**: 键名随版本变, 而迁移要删的正是
    // 那些"新 schema 里已经没有"的旧键 —— 所以只能到"任意键"这一层, 写成精确形状等于
    // 把已删除的键再声明一遍(下次删键还得改类型)。
    const 旧设置 = raw as Record<string, any>;
    const 更新 = 旧设置.更新;
    // 「破限」不再内置: 老开关直接删掉(不搬成自定义段——那段文本是我们的, 用户没写过它)
    if (更新 && typeof 更新 === 'object' && !Array.isArray(更新) && '破限' in 更新)
        delete 更新.破限;
    // v5.2 的「自定义提示词」(整份替换那套)已废弃: 清掉, 免得和新结构混着走
    if (更新 && typeof 更新 === 'object' && !Array.isArray(更新) && '自定义提示词' in 更新)
        delete 更新.自定义提示词;
    // 已删除的提示词开关(头部填充 / 防截断 / 更早的 gemini37f破限): 只清键, 不搬值——新结构没有它们
    if (更新 && typeof 更新 === 'object' && !Array.isArray(更新)) {
        delete 更新.提示词头部填充;
        delete 更新.头部填充文本;
        delete 更新.防截断;
        delete 更新.gemini37f破限;
    }
    // 旧版的布尔开关 → 三档写入目标(旧键名不同, 只能在这里按名搬一次)
    if (更新 && typeof 更新 === 'object' && !Array.isArray(更新) && '注入世界书条目' in 更新) {
        if (更新.世界书写入 === undefined)
            更新.世界书写入 = 更新.注入世界书条目 ? '角色卡主世界书' : '关闭';
        delete 更新.注入世界书条目;
    }
    return raw;
}
/**
 * 写回闸门(2026-11-12 架构深化 ⑨)。
 *
 * 这里原来是两条路径: `saveToGlobal`(**整键覆盖**)与 `saveToGlobalMerged`(顶层浅合并)。
 * 前者会把别的窗口/别的设备刚改的字段一起冲掉 —— 与 P1 那次"接口密钥被抹掉"同型;
 * 后者只在顶层挡了一下, `接口`/`更新` 这类子对象仍然整块覆盖。
 *
 * 现在统一走 `共用/设置写回`: **基线 + 只写改动过的字段 + 深合并 + 按路径删**。
 * 三家(彼方/烟火/剧情导演)从此只有这一份实现, 这类分叉不可能再发生第二次。
 */
let 写回闸门: 写回闸门类型 | null = null;
/** 闸门绑定哪个宿主 —— 宿主换了就重建(用例每个断言换一个假宿主, 生产里只有一个) */
let 闸门宿主: 设置宿主 | null = null;
function 取写回闸门(host: 设置宿主): 写回闸门类型 {
    if (!写回闸门 || 闸门宿主 !== host) {
        闸门宿主 = host;
        写回闸门 = 建写回闸门({
            读: () => host.vars.get({ type: 'global' })?.[SETTINGS_KEY],
            写: 份 => host.vars.update(variables => {
                variables[SETTINGS_KEY] = 份;
                return variables;
            }, { type: 'global' }),
        });
    }
    return 写回闸门;
}
/** 读到了真实的远端 → 记下基线(之后写回只写相对它的改动) */
function 记基线(host: 设置宿主, 读到的那份: any) {
    取写回闸门(host).记录基线(读到的那份);
}
/**
 * 只写改动过的字段。闸门关着(从没成功读到过)就**一个字节都不写** ——
 * 否则内存里的默认值会把用户的真实设置(含接口密钥)覆盖掉。
 */
function 写回全局(host: 设置宿主, settings: any) {
    try {
        const 闸门 = 取写回闸门(host);
        if (闸门.立即写(settings)) {
            invalidateReadCache();
            return;
        }
        // 闸门返回 false 有两种: "没有改动"(正常) 与 "从没读到过存储"(= 一个字节都没写)。
        // 后者必须出声, 否则用户改完设置、刷新后回退, 界面上没有任何线索。
        if (!闸门.可写回())
            host.toast?.warn?.('彼方: 设置没能保存(还没成功读到过存储里的设置, 为避免覆盖已有配置已放弃写入)', '彼方');
    }
    catch (error) {
        console.warn('[彼方] 保存全局设置失败:', error);
        // 3-4: 写回失败必须让用户看见 —— 以前只进控制台, 用户以为改了就存下了,
        // 刷新后设置回退到旧值。
        host.toast?.warn?.(`彼方: 设置没能保存(${error instanceof Error ? error.message : String(error)})`, '彼方');
    }
}
/** 迁移专用: 存储里本来就没有这一份, 直接落盘并成为新基线 */
function 首次落盘(host: 设置宿主, settings: any) {
    try {
        取写回闸门(host).首次落盘(settings);
        invalidateReadCache();
    }
    catch (error) {
        console.warn('[彼方] 迁移设置落盘失败:', error);
        host.toast?.warn?.(`彼方: 旧设置迁移没能落盘(${error instanceof Error ? error.message : String(error)})`, '彼方');
    }
}
function loadSettings(host: 设置宿主) {
    // 1. 优先读全局变量(服务器端共享, 局域网各设备共用)
    try {
        const 全部 = host.vars.get({ type: 'global' });
        const global = 全部?.[SETTINGS_KEY];
        if (global && typeof global === 'object' && !Array.isArray(global)) {
            const 设置 = Settings.parse(migrateSettings(global));
            // 基线取**迁移+解析之后**这一份(与 store 里那一份一致): 否则 schema 补上的默认值
            // 会被当成"用户改动", 第一次保存就把整份灌回去 —— 那就等于整键覆盖了。
            记基线(host, 设置);
            return 设置;
        }
        // 读成功、只是**还没有这一份**(新装用户): 这也算"读到过" ——
        // 不记基线的话闸门永远关着, 新用户的设置一个字节都存不下来。
        if (全部 && typeof 全部 === 'object') 记基线(host, Settings.parse({}));
    }
    catch (error) {
        console.warn('[彼方] 读取全局设置失败:', error);
    }
    // 2. 兼容 localStorage(上一版, 浏览器本地)
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const migrated = Settings.parse(migrateSettings(JSON.parse(raw)));
            首次落盘(host, migrated);
            return migrated;
        }
    }
    catch (error) {
        console.warn('[彼方] 读取本地设置失败:', error);
    }
    // 3. 兼容更早版本: 设置存在酒馆助手脚本变量里(含接口地址/密钥), 迁移到全局变量后清空脚本变量
    try {
        const old = host.vars.get({ type: 'script', script_id: host.vars.scriptId() });
        if (old && typeof old === 'object' && !Array.isArray(old)) {
            const migrated = Settings.parse(migrateSettings(old));
            首次落盘(host, migrated);
            host.vars.update(() => ({}), { type: 'script' });
            return migrated;
        }
    }
    catch (error) {
        console.warn('[彼方] 迁移旧设置失败:', error);
    }
    return Settings.parse({});
}
/** 持久化是否已绑定(两个边界都可能绑定, 只允许一次) */
let persistenceBound = false;
const useSettingsStore = defineStore('bifang-settings', () => {
    // 初值只给 schema 默认值, 不碰平台; 边界挂载时调 load(host) 读真实设置。
    const settings = ref(Settings.parse({}));
    function load(host: 设置宿主) {
        settings.value = loadSettings(host);
    }
    /** 绑定写回: 设置变化后 debounce 300ms 写回全局(服务器端共享)。只有编辑器(.vue)需要绑定。 */
    function bindPersistence(host: 设置宿主) {
        if (persistenceBound)
            return;
        persistenceBound = true;
        // 注意:
        // - debounce 300ms: 设置对象含大量数据(接口预设/模型列表), 每敲一个键就全量
        //   klona+序列化写回会造成输入卡顿; 停止输入 300ms 后才真正写。
        // - 合并写回: 保留全局中彼方 store 里不存在的字段(多 iframe/多设备下防止丢字段),
        //   同名顶层字段用 store 值(用户当前看到的最新值)。
        let saveTimer: ReturnType<typeof setTimeout> | null = null;
        watch(settings, value => {
            if (saveTimer !== null)
                clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                写回全局(host, klona(value));
            }, 300);
        }, { deep: true });
        // 写入目标必须立即落盘: 面板与外层脚本各有一份设置、只靠全局变量传递,
        // 300ms 防抖里外层读到的还是旧目标 —— 群聊里主世界书恒为 null, 于是弹出
        // "当前角色卡没有绑定主世界书"。这一项不该等防抖。
        watch(() => settings.value.更新.世界书写入, () => {
            if (saveTimer !== null) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
            写回全局(host, klona(settings.value));
        });
    }
    return { settings, load, bindPersistence };
});

/**
 * 读取设置: 优先实时读全局(悬浮球/其他 iframe 改设置后, 能立即拿到最新值,
 * 避免 store 缓存旧设置不生效); 读失败回退 store 缓存。
 * 全局读取带 500ms 缓存, 避免频繁调用时反复序列化大设置; 窗口内读失败也记着(照样回退 store),
 * 设置写回后立即失效。
 * 2026-10-01 与烟火同一处缺陷: 以前缓存没有失效语义 —— 写回后 500ms 窗口里仍按旧值走,
 * 且"全局被清空/读取报错"会永久返回上一次的值, 只有刷新页面才恢复。
 */
let globalReadCache: 设置 | null = null;
let globalReadTime = 0;
/**
 * 写回成功后清掉读缓存。
 *
 * **必须连时间戳一起清**: 只把 `globalReadCache` 置 null 的话, 接下来的 500ms 窗口里
 * `getSettings` 会走"窗口内"那条分支, 拿到 `null ?? useSettingsStore().settings` —— 也就是
 * **pinia store 里那份(默认值或上一次 UI 的值)**, 而不是刚刚写进全局的那份。
 * 症状: 写回成功、立刻读却读回默认值(`世界书写入` 变回「关闭」), 过 500ms 才对。
 * 把 `globalReadTime` 归零, 下一次读就必然走真实读取路径。
 */
function invalidateReadCache() {
    globalReadCache = null;
    globalReadTime = 0;
}
function getSettings(host: 设置宿主) {
    const now = Date.now();
    if (now - globalReadTime <= 500)
        return globalReadCache ?? useSettingsStore().settings;
    globalReadTime = now;
    try {
        const global = host.vars.get({ type: 'global' })?.[SETTINGS_KEY];
        if (global && typeof global === 'object' && !Array.isArray(global)) {
            globalReadCache = Settings.parse(migrateSettings(global)); // 与 loadSettings 同一套迁移, 否则旧键在这里读不成新值
            // 成功读到真实远端 = 拿到了一条新基线(2026-11-12): 外层脚本只走这条读路径,
            // 不记基线的话它之后的写回会被闸门拒掉(那会让"改了没生效"看起来像坏掉)。
            记基线(host, globalReadCache);
        }
        else
            globalReadCache = null; // 全局被清空 → 回退 store, 不拿上一次的值充数
    }
    catch {
        // 全局读取失败 → 同样清缓存: 窗口内不反复摸存储, 窗口外再试
        globalReadCache = null;
    }
    return globalReadCache ?? useSettingsStore().settings;
}

export { getSettings, invalidateReadCache, useSettingsStore, 世界书写入目标表 };
export type { 设置宿主, 世界书写入目标 };

