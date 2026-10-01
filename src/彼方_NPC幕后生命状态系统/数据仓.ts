// 彼方 · 数据仓: 界面读写「当前状态」的那一个 pinia 仓。
//
// 它只是 快照.ts 上面薄薄一层响应式包装(loadData / saveData)。单独成文件是为了让 快照.ts
// 保持"不碰 Vue、不碰 pinia"——那一层可以脱离界面单独测。
import * as pinia__WEBPACK_IMPORTED_MODULE_1__ from 'pinia';
import * as vue__WEBPACK_IMPORTED_MODULE_2__ from 'vue';
import { loadData, saveData } from './快照';

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

export { useStateStore };
