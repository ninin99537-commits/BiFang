// 剧情导演 · 界面偏好(悬浮球位置 / 面板位置 / 主题)
//
// 这三条纪律原先长在 面板机制.ts 的闭包里, 与 iframe 几何/拖动/阴影混在一个 589 行的 composable,
// 没有 DOM 就测不到:
//   ① 全局变量优先、localStorage 兜底(刷新时全局变量可能还没从服务器加载完);
//   ② 写回**只写相对基线改动过的字段**(insertOrAssign 是整键替换, 直接写会冲掉别的窗口刚改的字段);
//   ③ 从没成功读到过(基线为空)就**不写全局**(否则拿默认值盖掉用户的真实坐标)。
// 现在用一份内存存储就能把三条全钉住。
import { 建偏好会话 } from '../src/共用/界面偏好';
import type { 界面偏好, 偏好存储 } from '../src/共用/界面偏好';

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
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

/** 内存存储: 记录每次写全局/写本地, 用来断言"该不该写、写了什么" */
function 造存储(初始: { 全局?: unknown; 本地?: string | null } = {}) {
  const 状态 = { 全局: 初始.全局 as unknown, 本地: 初始.本地 ?? null };
  const 写全局记录: any[] = [];
  const 写本地记录: string[] = [];
  const 存储: 偏好存储 = {
    读全局: () => 状态.全局,
    写全局: 值 => {
      状态.全局 = 值;
      写全局记录.push(值);
    },
    读本地: () => 状态.本地,
    写本地: 文本 => {
      状态.本地 = 文本;
      写本地记录.push(文本);
    },
  };
  return { 存储, 状态, 写全局记录, 写本地记录 };
}

const 一份: 界面偏好 = { x: 120, y: 340, 主题: 'dark', 面板x: 10, 面板y: 20 };

console.log('\n[1] 读取: 全局优先, 本地兜底, 都没有就是 null');
{
  const a = 造存储({ 全局: { ...一份, x: 999 } });
  check('全局有值 → 用全局', 建偏好会话(a.存储).读()?.x, 999);

  const b = 造存储({ 全局: undefined, 本地: JSON.stringify(一份) });
  check('全局空 → 用本地', 建偏好会话(b.存储).读(), 一份);

  const c = 造存储({ 全局: undefined, 本地: '{坏掉的 JSON' });
  check('本地损坏 → null', 建偏好会话(c.存储).读(), null);

  const d = 造存储();
  check('都没有 → null', 建偏好会话(d.存储).读(), null);

  const e = 造存储({ 全局: { y: 1 } });
  check('全局形状不对(没有 x) → 不算读到', 建偏好会话(e.存储).读(), null);
}

console.log('\n[2] 写回只带改动过的字段: 别的窗口刚加的字段不能被冲掉');
{
  const 存储侧 = 造存储({ 全局: { x: 1, y: 2, 主题: 'dark' } });
  const 会话 = 建偏好会话(存储侧.存储);
  会话.读(); // 建立基线
  // 另一个窗口在两次写之间改了 面板x
  存储侧.状态.全局 = { x: 1, y: 2, 主题: 'dark', 面板x: 77 };
  会话.写({ x: 1, y: 2, 主题: 'light' });
  check('只把 主题 合并进去', 存储侧.状态.全局, { x: 1, y: 2, 主题: 'light', 面板x: 77 });
  check('全局只写了一次', 存储侧.写全局记录.length, 1);
}

console.log('\n[3] 没改动就不写全局(避免无意义的跨窗口写入)');
{
  const 存储侧 = 造存储({ 全局: { ...一份 } });
  const 会话 = 建偏好会话(存储侧.存储);
  会话.读();
  会话.写({ ...一份 });
  check('一次都没写全局', 存储侧.写全局记录.length, 0);
  check('但本地照写', 存储侧.写本地记录.length, 1);
}

console.log('\n[4] 从没读到过(基线为空) → 绝不写全局, 只写本地');
{
  const 存储侧 = 造存储();
  const 会话 = 建偏好会话(存储侧.存储);
  check('读不到 → null', 会话.读(), null);
  会话.写(一份);
  check('没写全局(默认值不该盖掉用户真实坐标)', 存储侧.写全局记录.length, 0);
  check('本地写了', 存储侧.写本地记录.length, 1);
  check('本地内容是这份偏好', JSON.parse(存储侧.写本地记录[0]), 一份);
}

console.log('\n[5] 面板坐标缺省时不写(免得用 null 覆盖存储里那份)');
{
  const 存储侧 = 造存储({ 全局: { x: 1, y: 2, 主题: 'dark', 面板x: 50, 面板y: 60 } });
  const 会话 = 建偏好会话(存储侧.存储);
  会话.读();
  // 面板没被拖过: 只带 x/y/主题
  会话.写({ x: 9, y: 8, 主题: 'dark' });
  check('面板坐标原样保留', [存储侧.状态.全局.面板x, 存储侧.状态.全局.面板y], [50, 60]);
  check('球位已更新', [存储侧.状态.全局.x, 存储侧.状态.全局.y], [9, 8]);
}

console.log('\n[6] 本地缓存始终写(它是本机自己的, 不涉及跨窗口覆盖)');
{
  const 存储侧 = 造存储({ 全局: { ...一份 }, 本地: null });
  const 会话 = 建偏好会话(存储侧.存储);
  会话.读();
  会话.写({ ...一份, x: 5 });
  check('本地被写了一次', 存储侧.写本地记录.length, 1);
  check('本地内容是完整偏好', JSON.parse(存储侧.写本地记录[0]).x, 5);
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);
