// 彼方 · 设置读写(候选4 搬的 settings.ts) —— 用假变量表跑真实源码
//
// 覆盖: 默认值 / 全局变量优先 / 旧版脚本变量迁移(读到→写全局→清脚本) /
// 改动合并写回(300ms 防抖, 且不冲掉用户自己加的顶层字段) / getSettings 的 500ms 缓存。
// 测不了的那条: 更早版本把设置放在浏览器 localStorage 里, node 没有 localStorage ——
// 但那条分支本来就是"读不到就跳过", 用 try/catch 兜着, 不影响这里的结论。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import { getSettings, useSettingsStore } from '../src/彼方_NPC幕后生命状态系统/settings';

const SETTINGS_KEY = '彼方_settings';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 酒馆页面会注入 lodash 到全局 `_`(node 里没有)。settings.ts 的设置表里只用到了 `_.clamp`;
// 这里给个最小替身, 免得为了一个 clamp 把整包 lodash 打进测试产物。
// 如果以后设置表里又用了别的 lodash 方法, 这里会明确报 "_.xxx is not a function", 不会悄悄放过。
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
};

// 上一版设置存在浏览器 localStorage 里(更早的一版在脚本变量里, 见下)。node 没有 localStorage,
// 这里给个内存版替身: 既能覆盖那条迁移分支, 也让"读不到"时不再刷一屏堆栈。
let 本地存储: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => (key in 本地存储 ? 本地存储[key] : null),
  setItem: (key: string, value: string) => {
    本地存储[key] = String(value);
  },
  removeItem: (key: string) => {
    delete 本地存储[key];
  },
};

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 假变量表: 只需要全局/脚本两个作用域 */
function makeFakeVars(初始全局: any = {}, 初始脚本: any = {}) {
  const 记录 = { 读全局: 0, 读脚本: 0, 写全局: 0, 清脚本: 0 };
  let 全局 = 初始全局;
  let 脚本 = 初始脚本;
  const host: any = {
    vars: {
      scriptId: () => 'script-1',
      get: (option: any) => {
        if (option.type === 'global') {
          记录.读全局++;
          return 全局;
        }
        if (option.type === 'script') {
          记录.读脚本++;
          return 脚本;
        }
        return {};
      },
      update: (updater: any, option: any) => {
        if (option.type === 'global') {
          全局 = updater(全局) ?? 全局;
          记录.写全局++;
          return 全局;
        }
        if (option.type === 'script') {
          脚本 = updater(脚本) ?? 脚本;
          记录.清脚本++;
          return 脚本;
        }
        return {};
      },
      del: () => ({}),
      insertOrAssign: () => ({}),
    },
  };
  return { host, 记录, 取全局: () => 全局, 取脚本: () => 脚本 };
}

/** 每个用例换一份变量表与一个干净的 pinia(设置 store 在构造时读一次设置) */
function 装(初始全局: any = {}, 初始脚本: any = {}, 本地设置?: any) {
  本地存储 = 本地设置 === undefined ? {} : { [SETTINGS_KEY]: JSON.stringify(本地设置) };
  const 假 = makeFakeVars(初始全局, 初始脚本);
  injectHostForTest(假.host);
  setActivePinia(createPinia());
  return 假;
}

console.log('\n[1] 什么都没存过 → 用默认值');
{
  装();
  const s = useSettingsStore().settings;
  check('默认开启幕后', s.启用幕后, true);
  ok('更新设置是一组对象', s.更新 && typeof s.更新 === 'object');
  ok('自动更新有默认布尔值', typeof s.更新.自动更新 === 'boolean');
  ok('读取最近回复数有默认数字', typeof s.更新.读取最近回复数 === 'number');
}

console.log('\n[2] 全局变量里有设置 → 以它为准, 其余字段补默认值');
{
  装({ [SETTINGS_KEY]: { 启用幕后: false } });
  const s = useSettingsStore().settings;
  check('读到全局里的关闭状态', s.启用幕后, false);
  ok('没存的字段仍有默认值', typeof s.更新.自动更新 === 'boolean');
}

console.log('\n[3] 旧版脚本变量 → 迁移到全局, 并清空脚本变量');
{
  const 假 = 装({}, { 启用幕后: false, 更新: { 自动更新: false } });
  const s = useSettingsStore().settings;
  check('读到了旧脚本变量里的设置', s.启用幕后, false);
  check('旧设置也一并迁移', s.更新.自动更新, false);
  check('已写入全局变量', 假.取全局()[SETTINGS_KEY].启用幕后, false);
  check('脚本变量被清空', 假.取脚本(), {});
  check('清空动作只做了一次', 假.记录.清脚本, 1);
}

console.log('\n[4] 改设置 → 300ms 防抖写回, 且不冲掉用户自己加的顶层字段');
{
  const 假 = 装({ [SETTINGS_KEY]: { 启用幕后: true, 用户自己加的字段: '别丢' } });
  const store = useSettingsStore();
  check('刚开始没写回过', 假.记录.写全局, 0);
  store.settings.启用幕后 = false;
  await sleep(450);
  const 写进去 = 假.取全局()[SETTINGS_KEY];
  check('改动写回了全局', 写进去.启用幕后, false);
  check('用户自己加的字段没被冲掉', 写进去.用户自己加的字段, '别丢');
  check('只写了一次(防抖生效)', 假.记录.写全局, 1);
}

console.log('\n[5] 更早版本存在浏览器本地 → 迁移到全局');
{
  const 假 = 装({}, {}, { 启用幕后: false, 更新: { 自动更新: false } });
  const s = useSettingsStore().settings;
  check('读到了本地设置', s.启用幕后, false);
  check('旧设置一并带过来', s.更新.自动更新, false);
  check('已写入全局变量', 假.取全局()[SETTINGS_KEY].启用幕后, false);
  check('没去动脚本变量', 假.记录.清脚本, 0);
}

console.log('\n[6] getSettings 的 500ms 缓存: 连续读只查一次全局');
{
  const 假 = 装({ [SETTINGS_KEY]: { 启用幕后: false } });
  const 一 = getSettings();
  const 二 = getSettings();
  check('两次拿到同一份', 二 === 一, true);
  check('只读了一次全局', 假.记录.读全局, 1);
  check('内容正确', 一.启用幕后, false);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
