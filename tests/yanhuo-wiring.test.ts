// 烟火 · 入口接线(候选 7 + 候选 10) —— 一半真跑, 一半文本断言
//
// 候选 7: "世界有没有数据"以前是三个各抄一遍的判据(面板 9 条 / 注入闸门 9 条 / 启动补读只查「时间」与「事件」两项)。
//   这里真跑注入闸门: 只推了五层档案、还没长事件的世界, 世界书条目必须被**写入**——
//   旧写法会把这种世界判成空, 于是删掉条目(事故记录在 inject.ts 那段注释里)。
// 候选 10: "删楼后重新对齐"被无条件取消的洞(删楼后 2 秒内来一条过短/隐藏的回复, 这次重新对齐被永久吞掉,
//   面板继续显示已删楼层的数据)。修的是"取消"的位置, 而这段接线在 $() 里跑不进 node, 所以用文本断言钉住。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/烟火_世界运转/host';
import { syncWorldbookEntry } from '../src/烟火_世界运转/inject';
import { SettingsSchema, type WorldData } from '../src/烟火_世界运转/schema';
import { emptyData } from '../src/烟火_世界运转/state';
import indexSource from '../src/烟火_世界运转/index.ts?raw';
import injectSource from '../src/烟火_世界运转/inject.ts?raw';
import updateSource from '../src/烟火_世界运转/update.ts?raw';
import panelSource from '../src/烟火_世界运转/悬浮球界面.vue?raw';
import { 版本号, 版本标签 } from '../src/烟火_世界运转/版本';

// schema/settings 会用到酒馆注入的 `_`; 给最小替身(node 里没有 lodash)
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

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

/** 假世界书: 只记账, 不碰酒馆。同步一次会走 update(有条目) 或 create(没条目) 之一 */
function 假世界书() {
  const 记 = { 删除: 0, 写入: 0, 新建: 0 };
  let 条目: any[] = [];
  let 绑定: string | null = '测试世界书';
  const host: any = {
    worldbook: {
      boundNames: () => ({ primary: 绑定 }),
      entries: async () => 条目,
      update: async (_name: string, updater: any) => {
        条目 = updater(条目);
        记.写入++;
      },
      create: async (_name: string, list: any[]) => {
        条目 = 条目.concat(list);
        记.新建++;
      },
      remove: async (_name: string, 判据: any) => {
        条目 = 条目.filter(entry => !判据(entry));
        记.删除++;
      },
    },
    vars: { scriptId: () => 'script-1', get: () => ({}), update: () => ({}), del: () => ({}), insertOrAssign: () => ({}) },
  };
  return { host, 记, 取条目: () => 条目, 设绑定: (v: string | null) => { 绑定 = v; } };
}

console.log('\n[1] 注入闸门: 只推了五层档案(还没长事件) → 算有世界, 条目要被写入');
{
  const 假 = 假世界书();
  injectHostForTest(假.host as any);
  const 只有五层: WorldData = { ...emptyData(), 地域: { 某城: { 名称: '某城', 概况: '刚推出来的一层' } } };
  await syncWorldbookEntry(只有五层, true, SettingsSchema.parse({}));
  check('写了一或建了条目', 假.记.写入 + 假.记.新建 >= 1, true);
  check('没有误删条目', 假.记.删除, 0);
}

console.log('\n[2] 注入闸门: 真空白(什么都没有) → 条目要被删掉');
{
  const 假 = 假世界书();
  injectHostForTest(假.host as any);
  await syncWorldbookEntry(emptyData(), true, SettingsSchema.parse({}));
  check('删了条目', 假.记.删除, 1);
  check('没有写入', 假.记.写入 + 假.记.新建, 0);
}

console.log('\n[3] 注入闸门: 开关关掉(enabled=false) → 照样删条目, 不看有没有数据');
{
  const 假 = 假世界书();
  injectHostForTest(假.host as any);
  const 有货: WorldData = { ...emptyData(), 世界: { ...emptyData().世界, 时间: '2026-10-01 12:00' } };
  await syncWorldbookEntry(有货, false, SettingsSchema.parse({}));
  check('删了条目', 假.记.删除, 1);
}

console.log('\n[4] 候选 7: 三处判据只剩一份');
{
  ok('注入闸门不再自带一份判据', !injectSource.includes('const hasWorld'));
  ok('注入闸门改问 有世界数据', injectSource.includes('有世界数据(data)'));
  ok('启动补读改问 有世界数据', indexSource.includes('!有世界数据(store.data)'));
  ok('启动补读不再是只查两项的弱判据', !indexSource.includes('!store.data.世界.时间 && store.data.事件.length === 0'));
}

console.log('\n[5] 候选 10: 取消待刷新挪到"确认会推进"之后');
{
  const 收到消息段 = indexSource.slice(indexSource.indexOf('onMessageReceived('), indexSource.indexOf('onMessageDeleted('));
  ok('收到消息时不再无条件取消待刷新', 收到消息段.length > 0 && !收到消息段.includes('clearPendingRefresh()'));
  const 推进处 = indexSource.indexOf('await updateWorld();');
  ok('文件里有推进调用', 推进处 > 0);
  ok('推进成功之后才取消待刷新', indexSource.indexOf('clearPendingRefresh();', 推进处) > 推进处);
  ok('删楼本身仍会安排一次重新对齐', indexSource.includes('refreshTimer = setTimeout(') && indexSource.includes('refreshAfterFloorChange();'));
}

console.log('\n[6] 版本锚点(v2.8.5 D2 · B 栏「每轮开跑前先确认版本」): 发布号 + 构建信息 + 启动日志, 三者对齐');
{
  // 【版本锚点】真正的锚点只有两个, 别把旁证混进"必须一起动"的清单:
  //   ① `src/烟火_世界运转/版本.ts` 的 `版本号`(下面这条 check 的期望值必须跟着它走);
  //   ② 启动串的形状 —— `[烟火] 世界运转系统已加载 v…`(源码里是模板串, 产物里会被 webpack 拆开)。
  // 旁证, 只能参考、不当判据、不进"必须一起动"的清单:
  //   · 产物 ≈ 406K 字节 / 341957 字符 —— **同一份源码构建两次数值确定性相同**(本地与 CI 重建
  //     的字符数逐字一致), 换源码才变; 它只是旁证, 别拿它当判据;
  //   · 注入的 commit 随构建环境变 —— 本地注的是工作区 HEAD(9cd3107), CI 重建注的是**被推送的
  //     那个提交**(本次 46fb3c9); 两者都是真提交号, 只是来源不同;
  //   · 兜底的 {commit:'dev',…} 恒在产物里, 更不能拿"有没有 dev/unknown"当判据。
  // 要核版本就认**独有判据**: 「世界运转系统已加载」+「v2.8.6」两段都命中。
  // 历史上正是"版本漂移"害过人: 第三轮建档那轮跑的是比 v2.8.3 还旧的 bundle, 报错里连「诊断:」都没有,
  //   于是把旧代码的失败当成新代码的失败查了半天。
  check('发布号就是锚点 v2.8.6', 版本号, 'v2.8.6');
  ok('版本标签形状对(测试环境没有 DefinePlugin → 退化成 dev, 不许因此炸)',
    /^v2\.8\.6 \((dev|[0-9a-f]{7,40}) · 构建 (dev|\d{4}-\d{2}-\d{2} \d{2}:\d{2})\)$/.test(版本标签()));
  ok('启动日志打的就是版本标签', indexSource.includes('世界运转系统已加载') && indexSource.includes('${版本标签()}'));
  ok('推进记录抬头也带版本(报错报告同款)', updateSource.includes('版本: 版本标签()'));
  ok('面板上看得见(meta 行渲染 版本)', panelSource.includes('debugLog.版本'));
  ok('版本号的来源单一 —— 别处不许再散落一份人工维护的版本字面量',
    [indexSource, updateSource, panelSource].every(源 => !/['"]v2\.\d+\.\d+['"]/.test(源)));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
