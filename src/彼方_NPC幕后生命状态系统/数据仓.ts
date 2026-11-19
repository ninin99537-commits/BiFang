// 彼方 · 数据仓: 界面读写「当前状态」的那一个 pinia 仓。
//
// 它只是 `当前状态.ts` 上面薄薄一层响应式容器（`data` 这个 ref）。
// 单独成文件是为了让 `快照.ts` / `当前状态.ts` 里"谁拥有那份数据"的判断能脱离界面单独测。
//
// 宿主由调用方传进来(约定见 host.ts 顶部): store 的 setup 不碰平台, 所以测试里 createPinia()
// 之后可以直接 reload(假宿主), 不需要任何全局注入。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
//
// ── 2026-11-20 C2：`reload` 与 `当前状态.从存储重读` 是同一件事 ──
//  两边都只是 `data.value = loadData(host)`。为什么没有合并成一次调用：
//  `当前状态.ts` 需要这个 store 才能写 `data`，本文件再反过来 import 它就成环了。
//  所以"同一份存储"由判据保证（`tests/bifang-当前状态.test.ts` 的 [结构] 段
//  断言两边都走 `loadData`），而不是靠互相调用。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { emptyData, loadData } from './快照';
import type { 快照宿主 } from './快照';

const useStateStore = defineStore('bifang-state', () => {
    // 初始为空状态; 边界在挂载时调一次 reload(host), 之后每次变更由调用方提交新数据。
    const data = ref(emptyData());
    function reload(host: 快照宿主) {
        data.value = loadData(host);
    }
    return { data, reload };
});

export { useStateStore };
