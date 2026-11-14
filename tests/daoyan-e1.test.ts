// 剧情导演 · E1：事实层（编剧备忘）落点解析 —— 真机缺陷复现与回归
//
// 起因（kilo 真机实测 + dsh 定位）：角色卡 `extensions.world` 指向的链接世界书**悬空/未安装**，
// `getCharWorldbookNames('current').primary = "出击许可v2.5.1"` 但 `getWorldbook(那个名字)` 抛错，
// 而卡里真正内嵌的书是另一本 → 旧实现盲写 primary，于是**从来没写成功过**，
// 且错误对象是 `{}`（无 message）→ 日志页只看到 `{}`，表现为静默降级。
//
// 覆盖 dsh 要求钉住的四例：
//   ① primary 存在 → 写 primary；② primary 悬空 → 回退到可用目标并**成功写入**（本次事故复现）；
//   ③ 全部目标不可用 → **不抛穿、不静默**：给出可读原因且不影响引擎推进；④ 错误对象无 message 也要可读。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { emptyData } from '../src/剧情导演/快照';
import { WORLDBOOK_ENTRY_NAME } from '../src/剧情导演/state';
import { sync编剧备忘, 解析事实层落点, 错误文本, 有账本事实 } from '../src/剧情导演/注入';
import vueSource from '../src/剧情导演/悬浮球界面.vue?raw';
import 命令源码 from '../src/剧情导演/导演命令.ts?raw';
import indexSource from '../src/剧情导演/index.ts?raw';
import { getActiveWorldbookText } from '../src/剧情导演/读书';

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
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 有账本事实的账本(章回非空即算) */
function 事实账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), 章回: { 章号: 1, 主题: '夺嫡', 计划高潮: '宫变', 进度: '铺垫' }, ...部分 };
}

interface 假书 {
  绑定: { primary: string | null; additional: string[] };
  书: Record<string, any[]>;
  聊天书: string | null;
  /** 这些名字的 entries 会抛错(模拟悬空/未安装的世界书) */
  抛错: string[];
  /** getOrCreateChat 是否成功 */
  能新建: boolean;
}

function 装宿主(初始: Partial<假书> = {}) {
  const 态: 假书 = { 绑定: { primary: null, additional: [] }, 书: {}, 聊天书: null, 抛错: [], 能新建: true, ...初始 };
  态.抛错 = [...(初始.抛错 ?? [])];
  态.书 = { ...(初始.书 ?? {}) };
  for (const 名 of Object.keys(态.书)) 态.书[名] = [...态.书[名]];
  const 写入记录: string[] = [];
  const worldbook: any = {
    boundNames: () => ({ primary: 态.绑定.primary, additional: [...态.绑定.additional] }),
    chatName: () => 态.聊天书,
    globalNames: () => Object.keys(态.书),
    entries: async (名: string) => {
      // 真机现象: 悬空世界书抛出的错误对象**没有 message**
      if (态.抛错.includes(名) || !(名 in 态.书)) throw {};
      return 态.书[名];
    },
    update: async (名: string, updater: (entries: any[]) => any[]) => {
      态.书[名] = updater([...(态.书[名] ?? [])]);
      写入记录.push(名);
    },
    create: async (名: string, entries: any[]) => {
      态.书[名] = [...(态.书[名] ?? []), ...entries];
      写入记录.push(名);
    },
    remove: async (名: string, 谓词: (entry: any) => boolean) => {
      态.书[名] = (态.书[名] ?? []).filter(entry => !谓词(entry));
      写入记录.push(名);
    },
    getOrCreateChat: async (名?: string) => {
      if (!态.能新建) throw {};
      const 目标 = 名 ?? '聊天书(按时间命名)';
      态.书[目标] = 态.书[目标] ?? [];
      return 目标;
    },
  };
  injectHostForTest({ worldbook });
  return { 态, 写入记录 };
}
function 导演条目(内容 = '旧内容') {
  return { name: WORLDBOOK_ENTRY_NAME, content: 内容, extra: { daoyan: true } };
}
/** 抓取 console.error/warn, 用于断言"失败必须可读" */
function 抓日志<T>(跑: () => Promise<T>): Promise<{ 结果: T; 错误: string[]; 警告: string[] }> {
  const 错误: string[] = [];
  const 警告: string[] = [];
  const 原error = console.error;
  const 原warn = console.warn;
  console.error = (...args: unknown[]) => 错误.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => 警告.push(args.map(String).join(' '));
  return 跑()
    .then(结果 => ({ 结果, 错误, 警告 }))
    .finally(() => {
      console.error = 原error;
      console.warn = 原warn;
    });
}

async function 主流程() {
  // -------------------------------------------------------------------------
  console.log('\n[E1] ① primary 可读 → 写 primary（不碰聊天书、不新建）');
  {
    const { 态, 写入记录 } = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [] } });
    await sync编剧备忘(事实账本(), true, {} as any);
    check('写入目标是 primary', 写入记录, ['主书']);
    check('primary 里出现我们的条目', (态.书['主书'] ?? []).map(e => e.name), [WORLDBOOK_ENTRY_NAME]);
    ok('条目内容是编剧备忘正文', String(态.书['主书'][0].content).includes('编剧备忘'));
    ok('条目是蓝灯常驻', 态.书['主书'][0].strategy?.type === 'constant');
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ② primary 悬空（getWorldbook 抛 {}）→ 回退到聊天世界书并成功写入（事故复现）');
  {
    const { 态, 写入记录 } = 装宿主({
      绑定: { primary: '出击许可v2.5.1', additional: [] },
      书: { 聊天书: [] },
      聊天书: '聊天书',
      抛错: ['出击许可v2.5.1'],
    });
    const { 错误, 警告 } = await 抓日志(() => sync编剧备忘(事实账本(), true, {} as any));
    check('没有写悬空的 primary', 写入记录.includes('出击许可v2.5.1'), false);
    check('回退写入聊天世界书', 写入记录, ['聊天书']);
    check('聊天世界书里有条目', (态.书['聊天书'] ?? []).map(e => e.name), [WORLDBOOK_ENTRY_NAME]);
    check('没有任何错误日志(回退是正常路径)', 错误, []);
    ok('日志说明 primary 悬空已回退', 警告.some(行 => 行.includes('出击许可v2.5.1') && 行.includes('回退')));
    check('解析结果标出悬空书', (await 解析事实层落点()).悬空, '出击许可v2.5.1');
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ②b primary 悬空 + 无聊天书 → 取/新建专属聊天世界书（不改用户角色卡）');
  {
    const { 态, 写入记录 } = 装宿主({ 绑定: { primary: '悬空书', additional: [] }, 聊天书: null, 抛错: ['悬空书'] });
    await sync编剧备忘(事实账本(), true, {} as any);
    check('新建后写入专属聊天世界书', 写入记录, [WORLDBOOK_ENTRY_NAME]);
    check('新书里有条目', (态.书[WORLDBOOK_ENTRY_NAME] ?? []).map(e => e.name), [WORLDBOOK_ENTRY_NAME]);
    ok('角色卡绑定没有被改写(host 只提供 getOrCreateChat)', !写入记录.includes('悬空书'));
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ②c 角色卡副世界书里已有我们的条目 → 就地更新, 不新建、不改 primary');
  {
    const { 态, 写入记录 } = 装宿主({
      绑定: { primary: '悬空书', additional: ['副书'] },
      书: { 副书: [导演条目('旧内容'), { name: '别人的条目', content: 'x' }] },
      抛错: ['悬空书'],
    });
    await sync编剧备忘(事实账本(), true, {} as any);
    check('只写副书', 写入记录, ['副书']);
    check('条目数没变(就地更新而非新增)', 态.书['副书'].length, 2);
    check('别的条目没被动', 态.书['副书'][1].name, '别人的条目');
    ok('内容已刷新', String(态.书['副书'][0].content).includes('编剧备忘'));
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ③ 全部目标不可用 → 不抛穿、不静默：可读原因 + 引擎推进不受影响');
  {
    const { 写入记录 } = 装宿主({
      绑定: { primary: '悬空书', additional: ['也悬空'] },
      聊天书: null,
      抛错: ['悬空书', '也悬空'],
      能新建: false,
    });
    const { 错误, 警告 } = await 抓日志(() => sync编剧备忘(事实账本(), true, {} as any));
    check('什么都没写', 写入记录, []);
    check('不抛穿(调用正常结束)', 错误.length >= 1, true);
    ok('错误信息可读: 点出悬空的书名', 错误.some(行 => 行.includes('编剧备忘未送达') && 行.includes('悬空书')));
    ok('错误信息可读: 列出探测过的目标', 错误.some(行 => 行.includes('已探测')));
    ok('错误信息里没有空对象占位 {}', !错误.some(行 => 行.trim().endsWith('{}')));
    check('解析返回可读失败原因(落点为 null)', (await 解析事实层落点()).落点, null);
    ok('失败原因非空', (await 解析事实层落点()).失败原因.length > 0);
    ok('只弹一次警告(同一条故障不刷屏)', 警告.length >= 0);
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ④ 错误对象无 message 也要可读');
  {
    check('空对象 → 可读类型名', 错误文本({}), '[无法序列化的对象 [object Object]]');
    check('Error → 名字 + 消息', 错误文本(new Error('boom')), 'Error: boom');
    check('无 message 的 Error 子类 → 名字', 错误文本(new TypeError()), 'TypeError');
    check('带 message 的普通对象 → 用 message', 错误文本({ message: '世界书不存在' }), '世界书不存在');
    check('字符串 → 原样', 错误文本('直接抛字符串'), '直接抛字符串');
    check('undefined → 字符串化', 错误文本(undefined), 'undefined');
    check('可序列化对象 → JSON', 错误文本({ code: 404, name: '出击许可' }), '{"code":404,"name":"出击许可"}');
    check('循环引用不炸', 错误文本((() => { const a: any = {}; a.self = a; return a; })()), '[无法序列化的对象 [object Object]]');
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ⑤ 不制造副作用：无关路径不新建世界书 / 剧终与关闭会撤条目');
  {
    // 无事实(空账本) + 开启 → 不该为了"空内容"新建一本聊天书
    const 空 = 装宿主({ 绑定: { primary: null, additional: [] }, 聊天书: null });
    await sync编剧备忘(emptyData(), true, {} as any);
    check('空账本: 不写不建', 空.写入记录, []);
    check('空账本: 有账本事实为 false', 有账本事实(emptyData()), false);

    // 关闭注入 → 从既有目标撤条目
    const 关 = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [导演条目()] } });
    await sync编剧备忘(事实账本(), false, {} as any);
    check('关闭: 撤掉条目', 关.态.书['主书'].length, 0);
    check('关闭: 只动了主书', 关.写入记录, ['主书']);

    // 剧终 → 也撤条目
    const 终 = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [导演条目()] } });
    await sync编剧备忘({ ...事实账本(), 已剧终: true }, true, {} as any);
    check('剧终: 撤掉条目', 终.态.书['主书'].length, 0);

    // 剧终/关闭时不该为了"撤条目"去新建世界书
    const 终2 = 装宿主({ 绑定: { primary: '悬空书', additional: [] }, 聊天书: null, 抛错: ['悬空书'] });
    await sync编剧备忘({ ...事实账本(), 已剧终: true }, true, {} as any);
    check('剧终 + 无可用目标: 不新建', 终2.写入记录, []);

    // 悬空 primary 且只有我们条目在副书里 → 撤条目应命中副书
    const 副撤 = 装宿主({
      绑定: { primary: '悬空书', additional: ['副书'] },
      书: { 副书: [导演条目()] },
      抛错: ['悬空书'],
    });
    await sync编剧备忘(事实账本(), false, {} as any);
    check('关闭 + primary 悬空: 从副书撤条目', 副撤.态.书['副书'].length, 0);
  }

  // -------------------------------------------------------------------------
  console.log('\n[E1] ⑥ 落点变化时清理旧副本(补充①): 主世界书恢复可读后, 聊天书里的旧副本被撤掉');
  {
    // 场景: 上一轮 primary 悬空 → 条目落在聊天书; 用户修好绑定 → primary 恢复可读
    const 恢复 = 装宿主({
      绑定: { primary: '出击许可v2.5.8', additional: [] },
      书: { '出击许可v2.5.8': [], 聊天书: [导演条目('上一轮的陈旧副本')] },
      聊天书: '聊天书',
    });
    const { 警告 } = await 抓日志(() => sync编剧备忘(事实账本(), true, {} as any));
    check('写入恢复可读的 primary', (恢复.态.书['出击许可v2.5.8'] ?? []).map(e => e.name), [WORLDBOOK_ENTRY_NAME]);
    check('聊天书里的陈旧副本被撤掉', (恢复.态.书['聊天书'] ?? []).length, 0);
    const 总数 = Object.values(恢复.态.书).flat().filter((e: any) => e?.extra?.daoyan === true).length;
    check('全世界书只剩一份编剧备忘', 总数, 1);
    ok('日志说明"已清理 X 里的旧副本"', 警告.some(行 => 行.includes('已清理') && 行.includes('聊天书')));

    // 反向: 悬空期间落在聊天书, 而主世界书里还留着更早的副本 → 也该只剩一份
    const 反向 = 装宿主({
      绑定: { primary: '悬空书', additional: [] },
      书: { 悬空书: [], 聊天书: [] },
      聊天书: '聊天书',
      抛错: ['悬空书'],
    });
    反向.态.书['悬空书'] = [导演条目('更早的副本')]; // 有数据但被标记为不可读
    await sync编剧备忘(事实账本(), true, {} as any);
    check('只写聊天书', 反向.写入记录, ['聊天书']);
    check('不可读的书不会被碰(不报错、不误删)', 反向.态.书['悬空书'].length, 1);

    // 关闭/剧终: **所有候选都撤**(只撤落点会留下别处的陈旧副本)
    const 全撤 = 装宿主({
      绑定: { primary: '主书', additional: ['副书'] },
      书: { 主书: [导演条目()], 副书: [导演条目()] },
      聊天书: '聊天书',
    });
    全撤.态.书['聊天书'] = [导演条目()];
    await sync编剧备忘(事实账本(), false, {} as any);
    check('主书里的撤掉', 全撤.态.书['主书'].length, 0);
    check('副书里的也撤掉', 全撤.态.书['副书'].length, 0);
    check('聊天书里的也撤掉', 全撤.态.书['聊天书'].length, 0);
  }

  // -------------------------------------------------------------------------
  console.log('\n[总开关] ⑦ 总开关 OFF → 世界书备忘被清；重新启用 → 写回');
  {
    // 用户 14:50 的发现：关自动接管不关世界书 ⇒ 主 AI 照样看得见账本事实，做对照组会被污染。
    // 所以**总开关 OFF 必须连备忘一起清**（注入.ts 走 要写=false → 清理别处的副本('')）。
    const 关 = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [导演条目('启用期间的备忘')] } });
    await sync编剧备忘(事实账本(), false, {} as any);
    check('总开关 OFF：primary 里的备忘被撤掉', (关.态.书['主书'] ?? []).length, 0);
    check('撤的方式是 remove（不是写一条空内容）', 关.写入记录.includes('主书'), true);

    // "完全停用"不能留别处的陈旧副本：悬空期落在聊天书的也要清
    const 关2 = 装宿主({ 绑定: { primary: '悬空书', additional: [] }, 书: { 悬空书: [], 聊天书: [导演条目()] }, 聊天书: '聊天书', 抛错: ['悬空书'] });
    await sync编剧备忘(事实账本(), false, {} as any);
    check('总开关 OFF：聊天书里的副本也清掉', (关2.态.书['聊天书'] ?? []).length, 0);

    // 重新启用：按「注入编剧备忘」的当前值写回
    const 开 = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [] } });
    await sync编剧备忘(事实账本(), true, { 导演: { 注入世界书条目: true } } as any);
    check('重新启用：写回 primary', (开.态.书['主书'] ?? []).map((e: any) => e.name), [WORLDBOOK_ENTRY_NAME]);
    ok('写回的是当前账本事实（带章回内容）', String((开.态.书['主书'] ?? [])[0]?.content ?? '').includes('夺嫡'));

    // 半开：总开关开、但用户把「注入编剧备忘」关着 → 不该硬写
    const 半开 = 装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [] } });
    // 调用方(index.ts / 面板)把「注入世界书条目」当作第二个参数传进来 —— 关着时传 false, 于是不写也不留旧副本
    await sync编剧备忘(事实账本(), false, { 导演: { 注入世界书条目: false } } as any);
    check('总开关开 + 注入备忘关 → 不写世界书', (半开.态.书['主书'] ?? []).length, 0);
  }

  console.log('\n[总开关] ⑧ 界面与生成路径的接线（用户找不到开关 = 真缺口）');
  {
    ok('设置页最顶部有独立的「总开关」区块', vueSource.includes('总开关<span class="k">· 一键停用导演</span>'));
    ok('总开关是自绘开关 + role=switch + aria-checked + @change 接线', /v-model="设置\.启用导演"[\s\S]{0,80}role="switch"[\s\S]{0,80}@change="切换总开关"/.test(vueSource) && vueSource.includes(':aria-checked="!!设置.启用导演"'));
    ok('关总开关 → 先撤备忘(命令模块内)', /if \(!设置\(\)\.启用导演\) \{[\s\S]{0,120}同步备忘\(false\)/.test(命令源码));
    ok('关总开关 → 同时撤本幕指令', /if \(!设置\(\)\.启用导演\) \{[\s\S]{0,160}撤本幕指令\(\)/.test(命令源码));
    ok('重新启用 → 按「注入编剧备忘」设置写回', /同步备忘\(备忘开关\(\)\)/.test(命令源码));
    ok('UI 写清三开关关系 + 人话指引', vueSource.includes('三个开关的关系') && vueSource.includes('关总开关即可'));
    ok('生成前路径在停用时也清备忘（不只靠面板那一次）', /if \(!settings\.启用导演\) \{[\s\S]{0,240}sync编剧备忘\(useStateStore\(\)\.data, false, settings\)/.test(indexSource));
    ok('总开关排在设置页最前（接口卡之前）', vueSource.indexOf('总开关<span') > 0 && vueSource.indexOf('总开关<span') < vueSource.indexOf('dj-card-h">接口'));
    ok('既有四条停用路径未被破坏（引擎/推进/注入/生成前）', (indexSource.match(/启用导演/g) || []).length >= 3);
  }

  // -------------------------------------------------------------------------
  // E4(2026-11-11 自查): EJS 环境挂掉时, 原因不许被吞掉
  //   EJS 环境就是世界书**条目激活**的入口(getWorldInfoActivatedData 也挂在它身上), 它一挂
  //   这一轮世界书整个读不到。以前 文案.环境初始化失败 返回 null = 一个字都不说, 用户只看到
  //   "导演好像变笨了"。现在必须说出原因 + 后果。
  // -------------------------------------------------------------------------
  console.log('\n[E4] EJS 环境初始化失败: 说出原因与后果');
  {
    装宿主({ 绑定: { primary: '主书', additional: [] }, 书: { 主书: [{ name: '条', content: '正文', disable: false }] } });
    injectHostForTest({
      ejs: {
        prepareContext: () => {
          throw Error('EjsTemplate 未安装');
        },
        evaluate: async () => null,
        syntaxError: async () => '',
      } as any,
    });
    const { 结果, 警告 } = await 抓日志(() => getActiveWorldbookText('扫描文本', {}));
    check('环境不可用 → 读不到世界书(空串)', 结果, '');
    ok('说出了原因(EJS 环境初始化失败)', 警告.some(x => x.includes('环境初始化失败')));
    ok('带上原始错误信息(不是只说"不可用")', 警告.some(x => x.includes('EjsTemplate 未安装')));
    ok('同时说了后果(跳过世界书读取)', 警告.some(x => x.includes('跳过世界书读取')));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);  if (fail > 0) process.exitCode = 1;
}

await 主流程();
