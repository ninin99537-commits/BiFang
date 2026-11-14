// 彼方 · 数据仓: 界面读写「当前状态」的那一个 pinia 仓。
//
// 它只是 快照.ts 上面薄薄一层响应式包装(loadData / saveData)。单独成文件是为了让 快照.ts
// 保持"不碰 Vue、不碰 pinia"——那一层可以脱离界面单独测。
//
// 宿主由调用方传进来(约定见 host.ts 顶部): store 的 setup 不碰平台, 所以测试里 createPinia()
// 之后可以直接 reload(假宿主), 不需要任何全局注入。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { emptyData, loadData, saveData } from './快照';
import type { 快照宿主 } from './快照';

const useStateStore = defineStore('bifang-state', () => {
    // 初始为空状态; 边界在挂载时调一次 reload(host), 之后每次变更由调用方提交新数据。
    const data = ref(emptyData());
    function reload(host: 快照宿主) {
        data.value = loadData(host);
    }
    function save(host: 快照宿主) {
        saveData(host, data.value);
    }
    return { data, reload, save };
});

export { useStateStore };
