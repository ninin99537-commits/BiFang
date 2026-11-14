import { z } from 'zod';

// ---------------------------------------------------------------------------
// 人设工坊 · 数据模型 (zod 4)
//
// 一件事: 字段可选、提示词可拼装。用户勾哪些模块, AI 就只写哪些模块。
// 所以 schema 里最核心的两个字段是 `enabled`(勾了哪些模块) 与
// `fieldValues`(模块细项的值) —— 其余都是围绕它俩的配置。
// ---------------------------------------------------------------------------

/** 模块分组: 决定勾选树里的分节 */
export const ModuleGroupSchema = z.enum(['method', 'profile', 'relation', 'extra', 'nsfw', 'custom']);
export type ModuleGroup = z.infer<typeof ModuleGroupSchema>;

/** 模块细项(可选字段) */
export const FieldDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['text', 'number', 'list', 'toggle']),
  default: z.unknown().optional(),
  desc: z.string().optional(),
  /**
   * 显式声明「这个字段故意不进提示词」(#149)。
   * 字段活性测试读到它才跳过; 没这个标记却不影响输出 = 测试失败。
   * 「静默不渲染」正是 nsfw_body 那个 bug 的形态, 不许无标记跳过。
   */
  不渲染: z.boolean().optional(),
});
export type FieldDef = z.infer<typeof FieldDefSchema>;

/** 模块定义(静态注册表, 见 lib/modules.ts) */
export const ModuleDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: ModuleGroupSchema,
  desc: z.string(),
  defaultOn: z.boolean(),
  /** 与其它模块的联动: 启用本模块时, 改写这些模块的提示词片段 */
  overrides: z.record(z.string(), z.string()).optional(),
  /** 本模块下的细项; 空数组表示本模块是一个整体 */
  fields: z.array(FieldDefSchema),
  /** 本模块贡献给提示词的写作要求(模板串, 支持 {{占位符}}) */
  prompt: z.string(),
});
export type ModuleDef = z.infer<typeof ModuleDefSchema>;

/** 生成用的 API 源(当前配置与预设共用同一结构) */
export const ApiSettingsSchema = z
  .object({
    source: z.enum(['main', 'custom']).default('main'),
    apiurl: z.string().default(''),
    key: z.string().default(''),
    model: z.string().default(''),
    /** 「拉取模型」拉回来的候选列表(缓存); 进预设, 载入后下拉立刻可用 */
    models: z.array(z.string()).default([]),
  })
  .prefault({});
export type ApiSettings = z.infer<typeof ApiSettingsSchema>;

/** 素材注入开关(角色卡 / user 人设 / 聊天记录) */
export const MaterialSettingsSchema = z
  .object({
    charCard: z.boolean().default(true),
    userPersona: z.boolean().default(true),
    chatHistory: z.boolean().default(true),
    /** 世界书(内嵌 character_book + 绑定世界书 + 聊天世界书)作为素材源 */
    worldbook: z.boolean().default(true),
    /**
     * 世界书条目选择: 稳定键(书名#uid) → 是否勾选。
     * 只在用户动过之后才有意义; `worldbookTouched=false` 时按"默认勾选常驻条目"算。
     */
    worldbookSelected: z.array(z.string()).default([]),
    /** 用户是否动过条目选择(false = 未动过 ⇒ 默认勾选常驻条目) */
    worldbookTouched: z.boolean().default(false),
    chatDepth: z.coerce
      .number()
      .default(20)
      .transform(value => Math.max(0, Math.min(100, Math.round(value)))),
  })
  .prefault({});
export type MaterialSettings = z.infer<typeof MaterialSettingsSchema>;

/**
 * 请求技巧(对标烟火, 2026-10-14 #55)。**四项默认全关** —— 用户明确要求。
 * 它们只改「怎么把请求发出去」, 不改提示词内容本身。
 */
export const RequestSettingsSchema = z
  .object({
    /** 破限: 两段式(系统段缝在系统提示词后 + 应答段伪装成模型自己说过的话), 接口有内容政策拦截时用 */
    jailbreak: z.boolean().default(false),
    /** 头部填充: 把填充文本作为第一条消息单独发送(无指令, 占注意力防截断) */
    headFiller: z.boolean().default(false),
    /** 头部填充的自定义文本: 留空使用内置小说原文 */
    headFillerText: z.string().default(''),
    /** 防截断: 用户指定的免责声明段缝在 system 末尾 */
    antiTruncation: z.boolean().default(false),
    /** 预填充: 塞第一个勾选模块的标题(不是 JSON 的 `{`)引导模型直接从标题起手 */
    prefill: z.boolean().default(false),
    /**
     * 流式输出(2026-10-15 用户要求非流)。**默认关** —— 整段生成完才进结果区。
     * 开着: 结果边生成边显示(STREAM_TOKEN_RECEIVED_FULLY)。
     *
     * ★ 与「停止」**无关**: `stopGenerationById` 按 `generation_id` 停, 不依赖流式
     *   (`generate.d.ts:210-216`), 所以关掉流式后「停止」按钮照样有效。
     */
    stream: z.boolean().default(false),
  })
  .prefault({});
export type RequestSettings = z.infer<typeof RequestSettingsSchema>;

/** 用户设置(存脚本变量) */
export const SettingsSchema = z
  .object({
    mode: z.enum(['user', 'npc']).default('user'),

    /**
     * 勾选的模块 id。默认勾选按注册表的 defaultOn: M1 anchor / M2 palette /
     * M4 reinterpret / M5 corpus 默认开, M3 facets / M6 collision 默认关。
     */
    enabled: z.array(z.string()).default(['anchor', 'palette', 'basic', 'reinterpret', 'corpus']),
    /** 模块细项的值, 按 field id 存 */
    fieldValues: z.record(z.string(), z.unknown()).default({}),

    /** 一句话需求 */
    brief: z.string().default(''),

    /** 信息不足时的策略 */
    onMissing: z.enum(['mark', 'infer', 'skip']).default('mark'),

    /** 生成后跑一遍输出模块白名单校验 */
    strictWhitelist: z.boolean().default(true),
    /** 生成后跑一遍自查清单(不输出, 只用于重写) */
    selfCheck: z.boolean().default(true),

    api: ApiSettingsSchema,
    /** 多套接口配置预设(名字 → 完整配置) */
    apiPresets: z.record(z.string(), ApiSettingsSchema).default({}),
    material: MaterialSettingsSchema,
    request: RequestSettingsSchema,

    /** 用户可编辑的提示词覆盖(id -> 片段), 留空则用注册表默认 */
    promptOverrides: z.record(z.string(), z.string()).default({}),

    /** 全局前缀/后缀, 包在整个提示词外面 */
    globalPrefix: z.string().default(''),
    globalSuffix: z.string().default(''),
  })
  .prefault({});
export type Settings = z.infer<typeof SettingsSchema>;

/** 草稿(P1 落地, P0 先占位) */
export const DraftSchema = z.object({
  id: z.string(),
  mode: z.enum(['user', 'npc']),
  modules: z.array(z.string()),
  text: z.string(),
  brief: z.string().default(''),
  created_at: z.coerce.number(),
});
export type Draft = z.infer<typeof DraftSchema>;
