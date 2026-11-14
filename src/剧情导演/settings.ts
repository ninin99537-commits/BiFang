import { klona } from 'klona';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useHost } from './host';
import { SettingsSchema, 故事类型旧名, type Settings, type 故事类型 } from './schema';
import { 建写回闸门, type 写回闸门 as 写回闸门类型 } from '../共用/设置写回';

const SETTINGS_KEY = '剧情导演_settings';

/** 全局设置读取缓存(写入即失效 / 读失败即失效) */
let globalReadCache: Settings | null = null;
let globalReadTime = 0;

/**
 * 写回闸门(2026-11-12 架构深化 ⑨ 的第二步: 让这条接缝真有第二个适配器)。
 *
 * 这里原来是自己的一套 `可写回` + `写回基线` + `深合并` + `取差异` + `saveToGlobalMerged` ——
 * 与烟火、彼方各写一遍同一套纪律(P1 事故之后立的)。现在三家用 `共用/设置写回` 的同一份实现,
 * 这一层只剩"端口怎么接"和"警告怎么说"。
 *
 * `收集删除: false`: 剧情导演的设置对象每次都由 schema 补满、键不会消失, 所以不需要
 * "按路径删" 那一路 —— 关掉它, 写回语义与原来逐字一致(不多删任何一个键)。
 */
let 闸门: 写回闸门类型 | null = null;
function 取闸门(): 写回闸门类型 {
  if (!闸门) {
    闸门 = 建写回闸门(
      {
        读: () => useHost().vars.get({ type: 'global' })?.[SETTINGS_KEY],
        写: 份 => {
          useHost().vars.update(variables => {
            variables[SETTINGS_KEY] = 份;
            return variables;
          }, { type: 'global' });
        },
      },
      { 收集删除: false },
    );
  }
  return 闸门;
}
/** 读失败/解析失败时**关掉闸门**: 重建一个没记过基线的闸门(它一个字节都不会写) */
function 关闸门() {
  闸门 = null;
}

function invalidateReadCache() {
  globalReadCache = null;
  globalReadTime = 0;
}

/** 用例用: 清掉读取缓存 + 重置写回闸门 */
export function resetSettingsReadCacheForTest() {
  invalidateReadCache();
  关闸门();
}

function 是普通对象(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 读全局设置。成功 → 记下基线(打开闸门)；失败(抛错/格式异常/解析失败) → **关闭闸门**,
 * 返回默认值但**绝不落盘**(P1 事故的根因(3): 读失败必须与"没配置"区分开)。
 */
function 读全局设置(): { 设置: Settings; 成功: boolean } {
  let 原始: any;
  try {
    原始 = useHost().vars.get({ type: 'global' })?.[SETTINGS_KEY];
  } catch (error) {
    console.warn('[剧情导演] 读取全局设置失败, 已暂停写回(绝不用默认值覆盖真数据):', error);
    关闸门();
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  if (原始 === undefined || 原始 === null) {
    // 首次使用: 成功读到"还没配置" → 允许写回(否则新装用户永远存不下设置), 基线=默认值
    const 默认 = SettingsSchema.parse({});
    取闸门().记录基线(默认);
    return { 设置: 默认, 成功: true };
  }
  if (!是普通对象(原始)) {
    console.warn('[剧情导演] 全局设置格式异常(不是对象), 已暂停写回:', 原始);
    关闸门();
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  const 解析 = SettingsSchema.safeParse(原始);
  if (!解析.success) {
    console.warn('[剧情导演] 全局设置解析失败, 已暂停写回(请检查/清理全局变量 剧情导演_settings):', 解析.error?.message);
    关闸门();
    return { 设置: SettingsSchema.parse({}), 成功: false };
  }
  取闸门().记录基线(解析.data);
  return { 设置: 解析.data, 成功: true };
}

/** 写回: 只把**相对基线改动过的字段**深合并进存储里那份(其余一律保留) */
function saveToGlobalMerged(settings: Settings) {
  const 当前闸门 = 取闸门();
  if (!当前闸门.可写回()) {
    console.warn('[剧情导演] 尚未成功读到全局设置, 本次改动不落盘(防止用默认值覆盖已配置的接口密钥等)');
    return;
  }
  try {
    if (当前闸门.立即写(settings)) invalidateReadCache();
  } catch (error) {
    console.warn('[剧情导演] 保存全局设置失败:', error);
  }
}

function loadSettings(): Settings {
  return 读全局设置().设置;
}

export const useSettingsStore = defineStore('daoyan-settings', () => {
  const settings = ref<Settings>(loadSettings());
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    settings,
    value => {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveToGlobalMerged(klona(value));
      }, 300);
    },
    { deep: true },
  );
  return { settings };
});

/** 立即落盘设置: 「测试连接」这类"马上要用刚输入的配置"的场景(平时靠 300ms 防抖) */
export function 立即保存设置(settings: Settings) {
  saveToGlobalMerged(klona(settings));
  invalidateReadCache();
}

/**
 * 清掉旧版本("生成前规划"那一版)留在存储里的键(2026-10-29)。
 *
 * 为什么单独做: 这些键在新 schema 里已经不存在, zod 会静默丢弃, **不影响行为** ——
 * 但只要它们还躺在存储里, 排查"一发消息就发请求"时就会误以为在跑旧代码。
 * 这里**只删这几个键**, 其余字段一个字节都不动(不用归一化后的设置覆盖整份存储, 避免抹掉接口密钥)。
 *
 * @returns 实际删掉的键名
 */
export const 旧版残留键 = ['生成前规划', '生成前规划超时秒', '记忆未就绪策略', '提前启动规划', '真实命运模式'] as const;

/**
 * 「真实命运模式」并进档位的迁移(第二轮方案 7.1, 纯函数): 老值为 true 且档位 < 3 → 档位提到 3。
 * 返回要写回的档位(null = 不改)。档位缺省按 schema 默认 3 处理(本来就 ≥ 3, 不用动)。
 */
export function 迁移真实命运(原始: any): number | null {
  if (!是普通对象(原始) || 原始.真实命运模式 !== true) return null;
  const 档 = Number(原始?.导演?.强度档位);
  if (!Number.isFinite(档) || 档 >= 3) return null;
  return 3;
}

/**
 * 故事类型改名迁移(2026-11-12, 纯函数): 老值「金羊毛」这类术语译名 → 新的大白话名字。
 *
 * 为什么必须做: schema 里是 `z.enum(新列表).catch('不限')` —— 老值解析会**静默**掉成「不限」,
 * 用户明明选过类型, 升级后一声不响地没了。迁移不到位就是"不静默失败"那条红线破了。
 *
 * 与 `迁移真实命运` 一样做成纯函数: 存储读写留给调用方, 这里只回答"该换成什么"。
 * @returns 新类型名(null = 不用换: 没设过 / 已是新名 / 不认识的脏值交给 schema 回落)
 */
export function 迁移故事类型(原始: any): 故事类型 | null {
  if (!是普通对象(原始)) return null;
  const 旧值 = 是普通对象(原始.导演) ? 原始.导演.类型 : undefined;
  if (typeof 旧值 !== 'string') return null;
  return 故事类型旧名[旧值] ?? null;
}

/**
 * 把老类型名写回存储。
 *
 * 只改 `导演.类型` 这一个键, 其余字段一个字节都不动(与 清掉旧版残留键 同一纪律)。
 * @returns 换掉了什么(null = 不用换)
 */
export function 迁移故事类型名(): { 从: string; 到: 故事类型 } | null {
  try {
    const 原始 = useHost().vars.get({ type: 'global' })?.[SETTINGS_KEY];
    const 新值 = 迁移故事类型(原始);
    if (!新值) return null;
    const 旧值 = (原始 as any).导演.类型 as string;
    useHost().vars.update(variables => {
      const 份 = variables[SETTINGS_KEY];
      if (是普通对象(份)) {
        const 导 = 是普通对象(份.导演) ? 份.导演 : {};
        份.导演 = { ...导, 类型: 新值 };
      }
      return variables;
    }, { type: 'global' });
    invalidateReadCache();
    console.info(`[剧情导演] 故事类型已改名: 「${旧值}」→「${新值}」（只是名字改了, 你选的东西没变）`);
    return { 从: 旧值, 到: 新值 };
  } catch {
    return null;
  }
}

export function 清掉旧版残留键(): string[] {
  try {
    const 原始 = useHost().vars.get({ type: 'global' })?.[SETTINGS_KEY];
    if (!是普通对象(原始)) return [];
    const 命中 = 旧版残留键.filter(key => Object.prototype.hasOwnProperty.call(原始, key));
    if (命中.length === 0) return [];
    const 新档 = 迁移真实命运(原始);
    useHost().vars.update(variables => {
      const 份 = variables[SETTINGS_KEY];
      if (是普通对象(份)) {
        // 先迁移再删键: 删了旧键再迁移就丢了"用户开过真实命运"这个信息
        if (新档 !== null) 份.导演 = { ...(是普通对象(份.导演) ? 份.导演 : {}), 强度档位: 新档 };
        for (const key of 命中) delete 份[key];
      }
      return variables;
    }, { type: 'global' });
    if (新档 !== null) console.info(`[剧情导演] 「真实命运模式」已并进档位: 你之前开着它, 强度档位已提到第 ${新档} 档`);
    invalidateReadCache();
    return 命中;
  } catch {
    return [];
  }
}

/**
 * 读取设置: 优先实时读全局, 读不到回退本地 store; 500ms 窗口内不重复打存储。
 */
export function getSettings(): Settings {
  const now = Date.now();
  if (now - globalReadTime <= 500) {
    return globalReadCache ?? useSettingsStore().settings;
  }
  globalReadTime = now;
  // 走同一条读取路径: 成功则刷新写回基线, 失败则关闭写回闸门(不会把回退的那份写回存储)
  const 结果 = 读全局设置();
  if (结果.成功) {
    globalReadCache = 结果.设置;
    return 结果.设置;
  }
  globalReadCache = null;
  return useSettingsStore().settings;
}
