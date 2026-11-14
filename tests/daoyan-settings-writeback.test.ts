// 剧情导演 · P1 设置写回缺陷：用户接口密钥被抹掉 —— 事故复现与回归
//
// 真机事故(dsh 实测时间线)：00:30 用户 `地址=http://127.0.0.1:8046/v1`、`密钥` 已配置(长度 11)；
// 01:16:46 刷新页面后 `settings.json` 被写回成 `地址=旧值`、`密钥 长度 0` → **用户的密钥被抹掉**。
// 三件事叠加成"陈旧副本覆盖真数据"：
//   ① 浅合并 `{...prev, ...settings}` = 顶层键整体替换（`接口` 整个被内存那份覆盖）；
//   ② 读失败静默返回默认值（密钥=空）→ 300ms 防抖把默认值写回存储；
//   ③ 初始化/解析填充也触发写回（没有"只写用户真正改过的字段"）。
// 本文件按 dsh 要求的四例钉住修法：①陈旧 store 不覆盖 ②读失败不落盘 ③深合并保留未提及子字段 ④正常路径不回归。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/剧情导演/host';
import { useSettingsStore, getSettings, 立即保存设置, resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import 偏好来源 from '../src/共用/界面偏好.ts?raw';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const KEY = '剧情导演_settings';
const 原console = { warn: console.warn, error: console.error };

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}
const 睡 = (毫秒: number) => new Promise(解决 => setTimeout(解决, 毫秒));
/** 300ms 防抖 + 一点余量 */
const 等防抖 = () => 睡(380);

/** 假全局变量存储: 支持抛错(模拟存储读不出来)与直接改存储(模拟另一个窗口写过了) */
function 假存储(初始: Record<string, any> = {}) {
  const 全局: Record<string, any> = JSON.parse(JSON.stringify(初始));
  let 抛错 = false;
  const vars: any = {
    get: () => {
      if (抛错) throw new Error('存储不可用');
      return 全局;
    },
    update: (fn: (variables: Record<string, any>) => Record<string, any>) => {
      if (抛错) throw new Error('存储不可用');
      const 结果 = fn(全局);
      Object.assign(全局, 结果);
      return 全局;
    },
    insertOrAssign: (补丁: Record<string, any>) => {
      Object.assign(全局, 补丁);
      return 全局;
    },
  };
  return { vars, 全局, 设抛错: (值: boolean) => (抛错 = 值) };
}

/** 每个用例: 全新存储 + 全新 pinia(store 会重新 loadSettings) */
function 起(初始: Record<string, any>) {
  const 存储 = 假存储(初始);
  injectHostForTest({ vars: 存储.vars });
  resetSettingsReadCacheForTest();
  setActivePinia(createPinia());
  return 存储;
}
function 抓警告<T>(跑: () => Promise<T>): Promise<{ 结果: T; 警告: string[] }> {
  const 警告: string[] = [];
  console.warn = (...args: unknown[]) => 警告.push(args.map(String).join(' '));
  return 跑().finally(() => {
    console.warn = 原console.warn;
  }).then(结果 => ({ 结果, 警告 }));
}

async function 主流程() {
  // -------------------------------------------------------------------------
  console.log('\n[P1] ① 陈旧 store + 无关字段改动 → 接口.密钥/地址 不被覆盖（事故最小复现）');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://127.0.0.1:8046/v1', 密钥: '' } } });
    const store = useSettingsStore(); // 读到的是"密钥还没填"的那份
    check('读到密钥为空', store.settings.接口.密钥, '');
    // 用户在另一个窗口把密钥填好了 → 存储侧已变, 本实例并不知情(真实的 01:16 场景)
    存储.全局[KEY].接口.密钥 = 'sk-SECRET-11';
    存储.全局[KEY].接口.地址 = 'http://127.0.0.1:8046/v1';
    // 本实例只改了一个**无关字段**
    store.settings.导演.强度档位 = 4;
    await 等防抖();
    check('密钥没有被覆盖', 存储.全局[KEY].接口.密钥, 'sk-SECRET-11');
    check('地址没有被覆盖', 存储.全局[KEY].接口.地址, 'http://127.0.0.1:8046/v1');
    check('真正改动过的字段落盘了', 存储.全局[KEY].导演.强度档位, 4);
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ①b 陈旧 store 连"地址"都不知道(内存里是空) → 依然不覆盖存储里的真值');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://real/v1', 密钥: 'K' }, 导演: { 强度档位: 3 } } });
    const store = useSettingsStore();
    存储.全局[KEY].接口.地址 = 'http://changed-by-other-window/v1';
    store.settings.导演.强度档位 = 2;
    await 等防抖();
    check('地址保留存储侧最新值', 存储.全局[KEY].接口.地址, 'http://changed-by-other-window/v1');
    check('密钥保留', 存储.全局[KEY].接口.密钥, 'K');
    check('改动生效', 存储.全局[KEY].导演.强度档位, 2);
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ② 读失败（存储抛错）→ 绝不落盘，存储里的旧值仍在');
  {
    const 存储 = 假存储({ [KEY]: { 接口: { 地址: 'http://keep/v1', 密钥: 'KEEP' } } });
    存储.设抛错(true);
    injectHostForTest({ vars: 存储.vars });
    resetSettingsReadCacheForTest();
    setActivePinia(createPinia());
    const { 警告 } = await 抓警告(async () => {
      const store = useSettingsStore(); // 读失败 → 内存里是默认值(密钥空), 但闸门是关的
      store.settings.接口.密钥 = '被面板改成的值';
      await 等防抖();
    });
    存储.设抛错(false);
    check('存储里密钥仍是旧值', 存储.全局[KEY].接口.密钥, 'KEEP');
    check('存储里地址仍是旧值', 存储.全局[KEY].接口.地址, 'http://keep/v1');
    check('没有把默认值写进去(结构也没变)', Object.keys(存储.全局[KEY]).length, 1);
    ok('日志说明"已暂停写回"', 警告.some(行 => 行.includes('暂停写回')));
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ②b 全局变量格式坏了/解析失败 → 同样禁止写回(不用默认值覆盖真数据)');
  {
    const 存储 = 起({ [KEY]: '这不是对象' });
    const store = useSettingsStore();
    store.settings.导演.强度档位 = 4;
    await 等防抖();
    check('坏数据原样保留', 存储.全局[KEY], '这不是对象');
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ③ 深合并保留未提及子字段（只改 导演.强度档位，接口.* 与导演其它字段原样保留）');
  {
    const 存储 = 起({
      [KEY]: {
        接口: { 地址: 'http://a/v1', 密钥: 'K', 模型: 'deepseek-flash', 温度: 0.5, 流式: true },
        导演: { 强度档位: 3, 接管轮数: 7, 连续高阈值: 5, 红线: ['不许死人'] },
        标签: { 排除: ['思维链'] },
      },
    });
    const store = useSettingsStore();
    store.settings.导演.强度档位 = 2;
    await 等防抖();
    const 存 = 存储.全局[KEY];
    check('改动的字段生效', 存.导演.强度档位, 2);
    check('接口.地址 保留', 存.接口.地址, 'http://a/v1');
    check('接口.密钥 保留', 存.接口.密钥, 'K');
    check('接口.模型 保留', 存.接口.模型, 'deepseek-flash');
    check('接口.温度 保留', 存.接口.温度, 0.5);
    check('接口.流式 保留', 存.接口.流式, true);
    check('导演.接管轮数 保留(用户改过的非默认值)', 存.导演.接管轮数, 7);
    check('导演.连续高阈值 保留', 存.导演.连续高阈值, 5);
    check('导演.红线 保留', 存.导演.红线, ['不许死人']);
    check('标签 保留', 存.标签, { 排除: ['思维链'] });
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ④ 正常路径不回归：改设置能落盘、防抖仍在、未被改动的字段一个都不写');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://a/v1', 密钥: 'K' } } });
    const store = useSettingsStore();
    store.settings.接口.密钥 = 'K2';
    check('防抖期内还没落盘', 存储.全局[KEY].接口.密钥, 'K');
    await 等防抖();
    check('防抖后落盘', 存储.全局[KEY].接口.密钥, 'K2');
    check('地址没被顺带改写', 存储.全局[KEY].接口.地址, 'http://a/v1');
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ④b 无变化不写盘 / 首次使用(键不存在)仍能保存');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://a/v1', 密钥: 'K' } } });
    const store = useSettingsStore();
    // 读出来的原样再存一次: 不该产生任何写入
    let 写入次数 = 0;
    const 原update = 存储.vars.update;
    存储.vars.update = (fn: any) => {
      写入次数++;
      return 原update(fn);
    };
    injectHostForTest({ vars: 存储.vars });
    立即保存设置(store.settings);
    check('无变化 → 0 次写入', 写入次数, 0);

    // 首次使用: 全局里还没有这个键 → 允许写回(否则新装用户永远存不下设置)
    const 空 = 起({});
    const 空store = useSettingsStore();
    check('首次使用读到默认值', 空store.settings.接口.密钥, '');
    空store.settings.接口.密钥 = '第一次填的密钥';
    await 等防抖();
    check('首次使用能保存', 空.全局[KEY].接口.密钥, '第一次填的密钥');
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ④c 立即保存设置(「测试连接」路径) 也能正确落盘, 且不动未改字段');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://a/v1', 密钥: 'K', 模型: 'm' } } });
    const store = useSettingsStore();
    store.settings.接口.密钥 = '即时改的';
    立即保存设置(store.settings);
    check('立即保存生效', 存储.全局[KEY].接口.密钥, '即时改的');
    check('未改的模型保留', 存储.全局[KEY].接口.模型, 'm');
    check('未改的地址保留', 存储.全局[KEY].接口.地址, 'http://a/v1');
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ④d getSettings() 走同一读路径: 读到就用, 读不到回退内存那份且不写盘');
  {
    const 存储 = 起({ [KEY]: { 接口: { 地址: 'http://a/v1', 密钥: 'K' } } });
    useSettingsStore();
    check('getSettings 读到存储值', getSettings().接口.密钥, 'K');
    存储.全局[KEY].接口.密钥 = '别的窗口刚改的';
    resetSettingsReadCacheForTest();
    check('缓存失效后读到新值', getSettings().接口.密钥, '别的窗口刚改的');

    // 读失败: 回退内存那份, 但**不许**把回退值写回存储
    存储.设抛错(true);
    resetSettingsReadCacheForTest();
    const 回退 = getSettings();
    ok('读失败仍返回一份可用设置', typeof 回退 === 'object' && 回退 !== null);
    存储.设抛错(false);
    check('存储未被回退值污染', 存储.全局[KEY].接口.密钥, '别的窗口刚改的');
  }

  // -------------------------------------------------------------------------
  console.log('\n[P1] ⑤ UI 偏好写入同样只写改动字段（dsh 点名的 insertOrAssign(UI_KEY) 那处）');
  {
    ok('偏好写入有写回基线', 偏好来源.includes('基线 = klona('));
    ok('偏好写入先算变化字段再写', 偏好来源.includes('有变化'));
    ok('与存储里那份合并而不是整键替换', 偏好来源.includes('存储里那份') && 偏好来源.includes('...变化'));
    ok('没有"从没读到过也照写全局"的路径', 偏好来源.includes('if (基线)'));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exitCode = 1;
}

await 主流程();
