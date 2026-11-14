// 烟火 · 设置写回的"基线 + 叶子差异" —— 2026-11-01 审查 P0-5 的验收用例
//
// 事故(代码可达): 设置存在全局变量里, 面板各自留一份内存副本。
//   · 所谓"合并写回"只合并**顶层**: `接口`/`运转` 是顶层键, 于是整个对象被内存里那份(可能陈旧)
//     覆盖 —— 旧面板只改一个"世界密度", 另一窗口刚换的接口地址/密钥/模型一起没了;
//   · 读失败静默返回全默认值, 300ms 防抖照样把它写回存储 → 用默认值覆盖真数据;
//   · 初始化/解析补默认值也触发写回 → 没改过的字段也可能被写。
//
// 修法(参考 剧情导演/settings.ts 已实现的纪律, 不是移植整个模块):
//   · 写回基线**每个 Pinia store 各一份**, 代表"这个面板已读到/已成功提交的视图";
//     读取(含 getFreshSettings 的强制重读)绝不改写它, 只有成功写回才推进;
//   · 只写相对基线**真正改过的叶子字段**, 深合并进存储里那份(数组整体替换, 未知字段保留);
//   · 从没成功读到过全局 → 一律不写; 写之前先真读一次, 并用**三方差量**(默认/全局/本地)
//     判断哪片叶子是用户改的 —— 不把"读不到时填的全默认草稿"当成新全局;
//   · 初次键确实不存在 → 仍能初始化; 全局读坏/格式异常 → 不写, 更不拿 {} 清掉存储。
//
// 本文件用真实模块 + 假变量表 + **虚构配置**(地址/密钥/模型全是编的, 不读任何真实密钥)。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/烟火_世界运转/host';
import {
  getFreshSettings,
  getSettings,
  resetSettingsReadCacheForTest,
  useSettingsStore,
} from '../src/烟火_世界运转/settings';

const KEY = '烟火_settings';
const sleep = (毫秒: number) => new Promise(解决 => setTimeout(解决, 毫秒));
/** 300ms 防抖 + 一点余量 */
const 等防抖 = () => sleep(380);

// 设置表里用到酒馆注入的 `_`(node 里没有): 给最小替身
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

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

/** 假全局变量表: 可抛错(读不出来/写不进去)、可直接改(模拟另一窗口写过)、记账 */
function 假存储(初始: Record<string, any> = {}) {
  const 全局: Record<string, any> = JSON.parse(JSON.stringify(初始));
  const 记 = { 读: 0, 写: 0 };
  let 读抛错 = false;
  let 写抛错 = false;
  const vars: any = {
    scriptId: () => 'script-1',
    get: (option: any) => {
      if (option?.type !== 'global')
        return {};
      记.读++;
      if (读抛错)
        throw Error('存储读不到');
      return 全局;
    },
    update: (fn: (variables: Record<string, any>) => Record<string, any>, option: any) => {
      if (option?.type !== 'global')
        return {};
      if (写抛错)
        throw Error('存储写不进去');
      const 结果 = fn(全局);
      Object.assign(全局, 结果);
      记.写++;
      return 全局;
    },
    del: () => ({}),
    insertOrAssign: () => ({}),
  };
  return {
    vars,
    记,
    设读抛错: (值: boolean) => {
      读抛错 = 值;
    },
    设写抛错: (值: boolean) => {
      写抛错 = 值;
    },
    取全局: () => 全局[KEY],
    设全局: (值: any) => {
      全局[KEY] = 值;
    },
  };
}

/** 每个用例: 全新存储 + 干净的 pinia(store 里的写回基线随之是新的) + 复位读取缓存 */
function 起(初始: Record<string, any>) {
  const 存储 = 假存储(初始);
  injectHostForTest({ vars: 存储.vars });
  resetSettingsReadCacheForTest();
  setActivePinia(createPinia());
  return 存储;
}

/** 抓 console.warn(只在该用例期间生效) */
async function 收警告<T>(跑: () => Promise<T>): Promise<{ 结果: T; 警告: string[] }> {
  const 原 = console.warn;
  const 警告: string[] = [];
  console.warn = (...参数: unknown[]) => 警告.push(参数.map(String).join(' '));
  try {
    return { 结果: await 跑(), 警告 };
  }
  finally {
    console.warn = 原;
  }
}

// 虚构配置(一律假值): 用来区分"存储里那份"和"内存里那份", 不涉及任何真实密钥
const 假接口甲 = { 地址: 'http://假接口-甲.local/v1', 密钥: '假密钥-甲-不是真的', 模型: '假模型-甲' };
const 假接口乙 = { 地址: 'http://假接口-乙.local/v1', 密钥: '假密钥-乙-不是真的', 模型: '假模型-乙', 模型列表: ['假模型-乙'] };

async function 主流程() {
  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ① 旧面板只改"世界密度" → 另一窗口新填的接口(地址/密钥/模型)一个都不许被覆盖');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界密度: '正常', 注入隐秘事件: false }, 接口: { ...假接口甲 } } });
    const store = useSettingsStore();
    // 另一窗口(新面板)已经把接口换掉了 —— 直接改存储, 本实例并不知情
    存储.设全局({ 运转: { 世界密度: '正常', 注入隐秘事件: false }, 接口: { ...假接口乙 } });
    // 本实例只改了一个无关的叶子字段
    store.settings.运转.世界密度 = '密集';
    await 等防抖();

    check('用户确实改的那片叶子写进去了', 存储.取全局().运转.世界密度, '密集');
    check('新地址没被覆盖', 存储.取全局().接口.地址, 'http://假接口-乙.local/v1');
    check('新密钥没被覆盖', 存储.取全局().接口.密钥, '假密钥-乙-不是真的');
    check('新模型没被覆盖', 存储.取全局().接口.模型, '假模型-乙');
    check('另一窗口的模型列表也没被动', 存储.取全局().接口.模型列表, ['假模型-乙']);
    check('同层没改的叶子也没被动', 存储.取全局().运转.注入隐秘事件, false);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ② 从未成功读到全局(读抛错) → 一次都不许写, 存储原样');
  {
    const 原样 = { 接口: { 地址: 'http://假接口-保命.local/v1', 密钥: '假密钥-保命' } };
    const 存储 = 假存储({ [KEY]: JSON.parse(JSON.stringify(原样)) });
    存储.设读抛错(true);
    injectHostForTest({ vars: 存储.vars });
    resetSettingsReadCacheForTest();
    setActivePinia(createPinia());
    const { 警告 } = await 收警告(async () => {
      const store = useSettingsStore(); // 读失败 → 内存里是默认值(密钥空), 但闸门是关的
      store.settings.运转.世界密度 = '密集';
      await 等防抖();
      store.settings.接口.密钥 = '面板里乱写的';
      await 等防抖();
    });
    存储.设读抛错(false);
    check('存储一个字节都没变', 存储.取全局(), 原样);
    check('一次写入都没发生', 存储.记.写, 0);
    ok('日志说明"尚未成功读到 / 不落盘"', 警告.some(行 => 行.includes('尚未成功读到')));
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ②b 全局格式坏了(不是对象) → 不许写, 更不许拿 {} 清掉它');
  {
    const 存储 = 起({ [KEY]: '这不是对象(另一个窗口写坏的)' });
    useSettingsStore().settings.运转.世界密度 = '密集';
    await 等防抖();
    check('坏数据原样保留', 存储.取全局(), '这不是对象(另一个窗口写坏的)');
    check('没有写入', 存储.记.写, 0);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ②c 读到过之后存储被写坏(闸门还是开的) → 本次写回放弃, 不用空对象顶上');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://假接口-真.local/v1' } } });
    const store = useSettingsStore();
    存储.设全局('被另一个窗口写坏了');
    store.settings.运转.世界密度 = '密集';
    await 等防抖();
    check('坏值没被 {} 顶掉', 存储.取全局(), '被另一个窗口写坏了');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ③ 初次使用(键确实不存在) → 仍能初始化, 且只写用户改过的那片叶子');
  {
    const 存储 = 起({});
    useSettingsStore().settings.运转.世界密度 = '稀疏';
    await 等防抖();
    check('首个设置存下去了(否则新装用户永远存不下)', 存储.取全局()?.运转?.世界密度, '稀疏');
    check('没有把整份默认值灌进存储', Object.keys(存储.取全局() ?? {}), ['运转']);
    check('只写了改动的那一个叶子, 默认值不算"用户改动"', Object.keys(存储.取全局()?.运转 ?? {}), ['世界密度']);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ④ 显式写回失败 → 基线不前进, 下次变化时重试写进去');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://假接口-真.local/v1' } } });
    const store = useSettingsStore();
    存储.设写抛错(true);
    store.settings.运转.世界密度 = '密集';
    await 等防抖();
    check('写失败: 存储没被动过', 存储.取全局(), { 接口: { 地址: 'http://假接口-真.local/v1' } });
    check('写失败不算写成功(写入次数 0)', 存储.记.写, 0);

    存储.设写抛错(false);
    store.settings.运转.世界密度 = '稀疏'; // 用户又改了一次 → 差异重算, 把上次没写成的叶子一起落盘
    await 等防抖();
    check('重试后落盘的是用户当前的值', 存储.取全局().运转.世界密度, '稀疏');
    check('另一窗口的地址仍在', 存储.取全局().接口.地址, 'http://假接口-真.local/v1');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑤ 数组当整体字段替换; 存储里 schema 不认识的字段原样保留');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界书排除: ['甲条目', '乙条目'] }, 用户自己加的字段: '别丢' } });
    const store = useSettingsStore();
    store.settings.运转.世界书排除 = ['丙条目'];
    await 等防抖();
    check('数组整体替换(不按元素合并)', 存储.取全局().运转.世界书排除, ['丙条目']);
    check('未知顶层字段保留', 存储.取全局().用户自己加的字段, '别丢');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑤b 删掉一个动态键(接口预设)→ 要真的删掉, 不能因为"差异里没有它就当没改"');
  {
    const 存储 = 起({ [KEY]: { 接口预设: { 甲套: { ...假接口甲 }, 乙套: { ...假接口乙 } } } });
    const store = useSettingsStore();
    delete store.settings.接口预设.甲套;
    await 等防抖();
    check('甲套被删掉', Object.keys(存储.取全局().接口预设), ['乙套']);
    check('乙套没被顺带删掉', 存储.取全局().接口预设.乙套.地址, 'http://假接口-乙.local/v1');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑥ 同一片叶子: 另一窗口改过, 但本窗口用户确实又改了 → 按本次请求最后写入');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界密度: '正常' } } });
    const store = useSettingsStore();
    存储.取全局().运转.世界密度 = '密集'; // 另一窗口刚改成密集
    store.settings.运转.世界密度 = '稀疏'; // 本窗口用户明确改了
    await 等防抖();
    check('用户本次的修改最后写入', 存储.取全局().运转.世界密度, '稀疏');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑦ getFreshSettings(): 严格读, 只更新读取缓存, 不做任何写入');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界密度: '正常' }, 接口: { ...假接口甲 } } });
    check('先读到正常', getSettings().运转.世界密度, '正常');
    存储.取全局().运转.世界密度 = '密集'; // 另一窗口刚改
    存储.取全局().接口 = { ...假接口乙 };
    check('getSettings 在 500ms 窗口内仍给旧值(语义不变)', getSettings().运转.世界密度, '正常');
    const 新 = getFreshSettings();
    check('强制重读拿到最新', 新.运转.世界密度, '密集');
    check('重读同时看到新接口', 新.接口.地址, 'http://假接口-乙.local/v1');
    check('强制重读不写存储', 存储.记.写, 0);

    存储.设读抛错(true);
    let 读失败抛错 = false;
    let 读失败提示 = '';
    try {
      getFreshSettings();
    }
    catch (错误: any) {
      读失败抛错 = true;
      读失败提示 = String(错误?.message ?? '');
    }
    check('读失败 → 抛错, 不拿内存副本冒充"读到的最新全局"', 读失败抛错, true);
    ok('抛错说清了是读不到/不合法', 读失败提示.includes('读取全局设置失败'));
    check('抛错期间也没有写入', 存储.记.写, 0);
    存储.设读抛错(false);

    存储.设全局('这不是对象');
    let 坏结构抛错 = false;
    try {
      getFreshSettings();
    }
    catch {
      坏结构抛错 = true;
    }
    check('坏结构 → 同样抛错', 坏结构抛错, true);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑦b B 换了接口 → 旧面板用 getFreshSettings 读到新接口, 之后只改密度: B 的接口仍不被覆盖');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界密度: '正常' }, 接口: { ...假接口甲 } } });
    const store = useSettingsStore(); // 旧面板 A: 它的写回基线是 假接口甲
    存储.设全局({ 运转: { 世界密度: '正常' }, 接口: { ...假接口乙 } }); // B 窗口把接口换成乙
    const 闸门读 = getFreshSettings();
    check('提交闸门读到的是 B 的新地址', 闸门读.接口.地址, 'http://假接口-乙.local/v1');
    check('强制重读本身不写入', 存储.记.写, 0);
    store.settings.运转.世界密度 = '密集'; // A 只改密度
    await 等防抖();
    check('密度写入', 存储.取全局().运转.世界密度, '密集');
    check('B 的新地址仍未被覆盖(强制重读没有变成写回基线)', 存储.取全局().接口.地址, 'http://假接口-乙.local/v1');
    check('B 的新密钥仍未被覆盖', 存储.取全局().接口.密钥, '假密钥-乙-不是真的');
    check('B 的新模型仍未被覆盖', 存储.取全局().接口.模型, '假模型-乙');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑧ 读失败后恢复: 恢复允许写之前先做三方差量, 不把全默认草稿当新全局');
  {
    const 真配置 = {
      运转: { 世界密度: '正常', 快照保留份数: 3, 注入世界书条目: false },
      接口: { ...假接口乙 },
    };
    const 存储 = 假存储({ [KEY]: JSON.parse(JSON.stringify(真配置)) });
    存储.设读抛错(true);
    injectHostForTest({ vars: 存储.vars });
    resetSettingsReadCacheForTest();
    setActivePinia(createPinia());
    const { 警告 } = await 收警告(async () => {
      const store = useSettingsStore(); // 读失败 → 内存里是默认值(快照保留份数=10、注入世界书条目=开、接口全空)
      check('内存里确实是默认值', store.settings.运转.快照保留份数, 10);
      store.settings.运转.世界密度 = '密集'; // 断读期间用户真的改了一处
      await 等防抖();
    });
    check('读不到时一次都没写', 存储.记.写, 0);
    ok('日志说明"尚未成功读到"', 警告.some(行 => 行.includes('尚未成功读到')));

    存储.设读抛错(false); // 存储恢复
    const store = useSettingsStore();
    store.settings.运转.注入隐秘事件 = true; // 再改一处 → 触发写回: 先真读, 再三方差量
    await 等防抖();

    check('用户第一次的改动补写进去了', 存储.取全局().运转.世界密度, '密集');
    check('用户第二次的改动也写进去了', 存储.取全局().运转.注入隐秘事件, true);
    check('存储里的快照保留份数没被默认值 10 盖掉', 存储.取全局().运转.快照保留份数, 3);
    check('存储里的"注入世界书条目=关"没被默认值 true 盖掉', 存储.取全局().运转.注入世界书条目, false);
    check('存储里的接口没被空默认值盖掉', 存储.取全局().接口.地址, 'http://假接口-乙.local/v1');
    check('接口密钥也没被动', 存储.取全局().接口.密钥, '假密钥-乙-不是真的');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[P0-5] ⑨ 既有语义不变: 500ms 窗口内只打一次存储; 读不到回退内存那份且不写回');
  {
    const 存储 = 起({ [KEY]: { 运转: { 世界密度: '正常' } } });
    const 一 = getSettings();
    const 读次数 = 存储.记.读;
    const 二 = getSettings();
    check('两次拿到同一份', 二 === 一, true);
    check('窗口内没再打存储', 存储.记.读 - 读次数, 0);

    const store = useSettingsStore();
    store.settings.运转.世界密度 = '密集'; // 本地改了(300ms 后才会写回)
    存储.设读抛错(true);
    await sleep(520); // 跨过 500ms 窗口
    check('读失败 → 回退内存那份', getSettings().运转.世界密度, '密集');
    存储.设读抛错(false);
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0)
    process.exitCode = 1;
}

await 主流程();
