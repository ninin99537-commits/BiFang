// 彼方 · 界面偏好接线 —— 球落点与面板主题现在走 共用/界面偏好.ts 的读写纪律。
//
// 这一份钉的是**接线**本身(键名、脏数据判定、旧键迁移、哨兵), 纪律(只写改动字段 / 没基线不写全局 /
// localStorage 兜底)在 共用 那边测 —— 彼方这边不再自己实现一遍, 所以也不该在这里重复断言。
import { nextTick } from 'vue';
import { use面板主题, 读球位置, 存球位置 } from '../src/彼方_NPC幕后生命状态系统/悬浮球偏好';

let pass = 0;
let fail = 0;
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

/** 假宿主: 全局变量表 + 记录写了多少次 */
function 造宿主(初始: Record<string, any> = {}) {
  const 全局: Record<string, any> = { ...初始 };
  let 写次数 = 0;
  const host = {
    vars: {
      get: () => ({ ...全局 }),
      insertOrAssign: (patch: Record<string, any>) => {
        Object.assign(全局, patch);
        写次数++;
      },
    },
  };
  return { host, 全局, 写次数: () => 写次数 };
}

/** 假 localStorage(node 里没有): 每个用例换一份, 免得互相污染 */
const 本地 = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => 本地.get(k) ?? null,
  setItem: (k: string, v: string) => void 本地.set(k, v),
  removeItem: (k: string) => void 本地.delete(k),
};

console.log('\n[1] 全新的聊天: 什么都读不到, 界面用自己的默认');
{
  本地.clear();
  const { host, 全局, 写次数 } = 造宿主();
  eq('球位置 = 没存过', 读球位置(host), null);
  eq('主题 = 默认深色', use面板主题(host).theme.value, 'dark');
  eq('没写过全局(不该拿默认值去盖)', 全局['彼方_界面偏好'], undefined);
  eq('一次都没写', 写次数(), 0);
}

console.log('\n[2] 存球位置 → 读得回来, 且落在新键上');
{
  本地.clear();
  const { host, 全局 } = 造宿主();
  存球位置(host, { x: 120, y: 340 });
  eq('读回来一致', 读球位置(host), { x: 120, y: 340 });
  eq('新键是 彼方_界面偏好', Object.keys(全局), ['彼方_界面偏好']);
  eq('形状是 {x,y,主题}', 全局['彼方_界面偏好'], { x: 120, y: 340, 主题: 'dark' });
  ok('同时写了本机缓存', (本地.get('彼方_界面偏好') ?? '').includes('120'));
}

console.log('\n[3] 主题切换: 写回时**不丢**已存的位置');
{
  本地.clear();
  const { host, 全局 } = 造宿主();
  存球位置(host, { x: 88, y: 66 });
  const { theme, toggleTheme } = use面板主题(host);
  toggleTheme();
  await nextTick();
  eq('主题变了', theme.value, 'light');
  eq('全局里主题是 light', 全局['彼方_界面偏好'].主题, 'light');
  eq('位置没被主题写回冲掉', [全局['彼方_界面偏好'].x, 全局['彼方_界面偏好'].y], [88, 66]);
}

console.log('\n[4] 旧版两个键: 第一次读到就迁进新形状');
{
  本地.clear();
  const { host, 全局 } = 造宿主({ 彼方_主题: 'light', 彼方_悬浮球: { x: 210, y: 90 } });
  eq('球位置来自旧键', 读球位置(host), { x: 210, y: 90 });
  eq('主题来自旧键', use面板主题(host).theme.value, 'light');
  eq('已经写成新键', 全局['彼方_界面偏好'], { x: 210, y: 90, 主题: 'light' });
  ok('旧键原样留着(回退上一版还能用)', 全局['彼方_主题'] === 'light' && 全局['彼方_悬浮球'] !== undefined);
}

console.log('\n[5] 旧键只迁了主题: 位置仍是"没存过"(0,0 是哨兵, 不是坐标)');
{
  本地.clear();
  const { host, 全局 } = 造宿主({ 彼方_主题: 'light' });
  eq('主题迁过来了', use面板主题(host).theme.value, 'light');
  eq('位置不编造', 读球位置(host), null);
  eq('存的是哨兵 0,0', [全局['彼方_界面偏好'].x, 全局['彼方_界面偏好'].y], [0, 0]);
  // 之后真存了位置就正常
  存球位置(host, { x: 40, y: 50 });
  eq('存过就正常', 读球位置(host), { x: 40, y: 50 });
}

console.log('\n[6] 脏数据: 认不出就当没存过, 不炸');
{
  本地.clear();
  const 脏 = 造宿主({ 彼方_界面偏好: '这不是偏好' });
  eq('脏值 → 位置没存过', 读球位置(脏.host), null);
  eq('脏值 → 主题回默认', use面板主题(脏.host).theme.value, 'dark');
  const 半截 = 造宿主({ 彼方_界面偏好: { x: 'left', y: 2 } });
  eq('x 不是数字 → 没存过', 读球位置(半截.host), null);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
