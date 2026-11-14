// Vue 以 external 形式从酒馆网页全局获取 (var Vue),
// 因此 vue 内部引用的 __VUE_PROD_DEVTOOLS__ 等全局变量需要在 vue 被使用前定义好,
// 否则运行时会抛出 ReferenceError: __VUE_PROD_DEVTOOLS__ is not defined.
// 本模块在顶层 (模块加载时立即执行) 定义这些全局变量,
// 通过在 index.ts 中第一个 import 本模块, 保证它在 vue 之前执行.
const polyfills: Array<[string, unknown]> = [
  ['__VUE_OPTIONS_API__', false],
  ['__VUE_PROD_DEVTOOLS__', false],
  ['__VUE_PROD_HYDRATION_MISMATCH_DETAILS__', false],
];
for (const [key, value] of polyfills) {
  if (!(key in globalThis)) {
    (globalThis as any)[key] = value;
  }
}
