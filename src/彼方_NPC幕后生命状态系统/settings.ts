/** 一套完整的接口配置(当前配置与预设共用同一结构) */
const ApiConfigSchema = z
  .object({
    地址: z.string().default(''),
    密钥: z.string().default(''),
    模型: z.string().default(''),
    模型列表: z.array(z.string()).default([]),
    /** 走酒馆服务器转发请求(绕开浏览器跨域限制), 用于不支持 CORS 的接口(如 tokenrhythm.studio) */
    服务端转发: z.boolean().default(false),
    /** 关闭模型思维链(推理/思考), 加快响应并避免正文被推理占满; 通过 thinking.type=disabled 实现(Responses API 风格, 原生支持 Responses API 的模型可用) */
    关闭思维链: z.boolean().default(false),
    温度: z.coerce.number().default(0.7).transform(value => _.clamp(value, 0, 2)),
    最大token: z.coerce.number().default(2048).transform(value => Math.max(1, Math.min(131072, Math.round(value)))),
  })
  .prefault({});

const Settings = z
  .object({
    接口: ApiConfigSchema,
    /** 保存的多套接口配置预设(名字 → 完整接口配置), 用于快速切换不同 AI */
    接口预设: z.record(z.string(), ApiConfigSchema).default({}),
    更新: z
      .object({
        自动更新: z.boolean().default(true),
        更新频率: z.coerce.number().default(1).transform(value => Math.max(1, Math.round(value))),
        读取最近回复数: z.coerce.number().default(3).transform(value => Math.max(1, Math.min(20, Math.round(value)))),
        追踪当前角色: z.boolean().default(false),
        后台互动: z.boolean().default(false),
        注入到AI: z.boolean().default(false),
        /** 把幕后状态写入当前角色卡主世界书里的常驻条目(蓝灯常开), 切换聊天时会自动重新注入当前聊天的内容 */
        注入世界书条目: z.boolean().default(false),
        生理监测: z.boolean().default(false),
        注入世界书: z.boolean().default(true),
        注入世界书上限: z.coerce.number().default(8000).transform(value => Math.max(500, Math.min(200000, Math.round(value)))),
        注入世界书条数: z.coerce.number().default(40).transform(value => Math.max(1, Math.min(200, Math.round(value)))),
      })
      .prefault({}),
    标签: z
      .object({
        模式: z.enum(['排除', '只读']).default('排除'),
        列表: z.array(z.string()).default(['aftertalk']),
      })
      .prefault({}),
  })
  .prefault({});

export type BifangSettings = z.infer<typeof Settings>;

const SETTINGS_KEY = '彼方_settings';

/** 设置写入全局变量(存在服务器端): 局域网各设备共享同一份, 不随脚本导出, 不在脚本变量列表 */
function saveToGlobal(settings: BifangSettings): void {
  try {
    updateVariablesWith(variables => {
      variables[SETTINGS_KEY] = klona(settings);
      return variables;
    }, { type: 'global' });
  } catch (error) {
    console.warn('[彼方] 保存全局设置失败:', error);
  }
}

function loadSettings(): BifangSettings {
  // 1. 优先读全局变量(服务器端共享, 局域网各设备共用)
  try {
    const global = getVariables({ type: 'global' })?.[SETTINGS_KEY];
    if (global && typeof global === 'object' && !Array.isArray(global)) {
      return Settings.parse(global);
    }
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.warn('[彼方] 迁移旧设置失败:', error);
  }
  return Settings.parse({});
}

export const useSettingsStore = defineStore('bifang-settings', () => {
  const settings = ref<BifangSettings>(loadSettings());

  watchEffect(() => {
    saveToGlobal(settings.value);
  });

  return { settings };
});

export function getSettings(): BifangSettings {
  return useSettingsStore().settings;
}
