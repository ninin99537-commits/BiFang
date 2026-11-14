import { klona } from 'klona';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { SettingsSchema, type Settings } from './schema';

// ---------------------------------------------------------------------------
// 人设工坊 · 设置持久化 (脚本变量)
//
// 设置存在脚本变量表的一个键下(`人设工坊_settings`), 不整表覆盖 —— 同一脚本变量里
// 还要放草稿箱(P1), 整表 replace 会把别的键一起抹掉。
// ---------------------------------------------------------------------------

const 设置键 = '人设工坊_settings';

function 读设置(): Settings {
  try {
    const 变量 = getVariables({ type: 'script', script_id: getScriptId() });
    const 原始 = 变量?.[设置键];
    if (原始 === undefined || 原始 === null) return SettingsSchema.parse({});
    return SettingsSchema.parse(原始);
  } catch (error) {
    console.warn('[人设工坊] 读取设置失败, 使用默认值(不覆盖原数据):', error);
    return SettingsSchema.parse({});
  }
}

export const useSettingsStore = defineStore('人设工坊-settings', () => {
  const settings = ref<Settings>(读设置());

  watch(
    settings,
    value => {
      try {
        const 变量 = getVariables({ type: 'script', script_id: getScriptId() });
        变量[设置键] = klona(value);
        replaceVariables(变量, { type: 'script', script_id: getScriptId() });
      } catch (error) {
        console.warn('[人设工坊] 保存设置失败:', error);
      }
    },
    { deep: true },
  );

  return { settings };
});
