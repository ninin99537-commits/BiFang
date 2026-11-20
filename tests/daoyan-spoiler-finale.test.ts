// 剧情导演 · 防剧透改造 + 手动全书结算（用户两问：「伏笔账看不到内容」「怎么样才会走到结局」）
//
// 规格: docs/剧情导演-防剧透与手动结算-规格-v1.md
//   A: 一刀切开关拆成两键 + 整行点击**临时**揭开(内存态, 不写盘) + 旧键迁移播种
//   B: 不依赖主角死亡的两段式收官(代码编排收束幕 → 用户确认落幕) + 判据终值快照
// 红线: 折叠只活在显示层 —— 账本数据与发往引擎的内容一条不许少(零截断)。
import { createPinia, setActivePinia } from 'pinia';
import type { 冲突, 伏笔, 导演账本 } from '../src/剧情导演/schema';
import { SettingsSchema } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { emptyData, loadData, writeStateSnapshot } from '../src/剧情导演/快照';
import { 请求收官, 落定剧终, 解除剧终 } from '../src/剧情导演/快照';
import { 计算判据, 空指标, 规范化指标, 终值日志行 } from '../src/剧情导演/指标';
import { 构造本幕指令 } from '../src/剧情导演/引擎规则';
import {
  伏笔受管,
  伏笔键,
  章回受管,
  章回键,
  折叠中,
  切换揭开,
  折叠文案,
  揭开提示,
} from '../src/剧情导演/防剧透';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;
import 命令源码 from '../src/剧情导演/导演命令.ts?raw';
// 2026-11-20：`落定剧终` 的真实定义在 终局.ts（快照.ts 只是再导出）。
// 要断言"它是纯函数"，必须看**定义它的那个文件**，不能看调用方。
import 终局源码 from '../src/剧情导演/终局.ts?raw';
import 快照源 from '../src/剧情导演/快照.ts?raw';
import updateSource from '../src/剧情导演/update.ts?raw';
// 2026-11-20：`剥注释` 抽到共用（今天三次断言被注释干扰，不再各处手写）
import { 剥注释 } from './helpers/源码扫描';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());
resetSettingsReadCacheForTest();

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

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}

/** 与 daoyan-batch1 同款的假平台(楼层 + 聊天变量), 用于真走一遍"老快照 → 装载"的迁移路径 */
function makeFakePlatform(全局设置: Record<string, any> = {}) {
  const floors: Record<string, { role: string; message: string; is_hidden: boolean }> = {};
  const floorVars: Record<string, any> = {};
  let chatVars: Record<string, any> = {};
  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat') return chatVars;
        if (option.type === 'global') return { 剧情导演_settings: 全局设置 };
        return floorVars[String(option.message_id)] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        const id = String(option.message_id);
        floorVars[id] = updater(floorVars[id] ?? {}) ?? floorVars[id];
        return floorVars[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete chatVars[path];
          return { variables: chatVars, delete_occurred: true };
        }
        const id = String(option.message_id);
        if (floorVars[id]) delete floorVars[id][path];
        return { variables: floorVars[id] ?? {}, delete_occurred: true };
      },
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out: any[] = [];
        for (let i = from; i <= to; i++) {
          const m = floors[String(i)];
          if (!m) continue;
          if (options.role && options.role !== 'all' && m.role !== options.role) continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId() {
        const ids = Object.keys(floors).map(Number);
        return ids.length > 0 ? Math.max(...ids) : -1;
      },
    },
  };
  return {
    host,
    addFloor(id: number, message = `第${id}楼正文`) {
      floors[String(id)] = { role: 'assistant', message, is_hidden: false };
    },
  };
}
function 伏条(编号: number, 状态: string, 内容 = `线头${编号}`): 伏笔 {
  return { 编号, 内容, 埋设层: 编号, 埋设章: 1, 状态: 状态 as any, 回收窗口: '第3章内', 关联冲突: '夺嫡' };
}
function 冲条(名: string, 阶段: string): 冲突 {
  return { 名, 对立面: '对手', 赌注: '王位', 强度: 7, 阶段: 阶段 as any, 下一步: '对决', 顶回次数: 0 };
}
/** 已经过了冷启动、有未了结伏笔与冲突、且张力历史不会触发其它规则的账本 */
function 收官账本(): 导演账本 {
  return 账本({
    章回: { 章号: 3, 主题: '夺嫡', 计划高潮: '宫变', 进度: '收束' },
    伏笔: [伏条(1, '潜伏'), 伏条(2, '已引爆'), 伏条(3, '发酵')],
    冲突: [冲条('夺嫡', '决战'), 冲条('旧怨', '已收档')],
    张力: { 当前: 6, 距上次高潮楼层: 0, 连续低张力: 0, 最近节拍: ['阴影'] },
    已分析轮数: 5,
    下一指令编号: 10,
    指标: {
      ...空指标(),
      章节统计: [
        { 章号: 1, 埋设数: 4, 回收数: 3, 张力峰: 9, 张力谷: 1, 起伏次数: 3, 冲突推进数: 2, 受挫数: 2 },
        { 章号: 2, 埋设数: 2, 回收数: 0, 张力峰: 7, 张力谷: 2, 起伏次数: 1, 冲突推进数: 1, 受挫数: 0 },
      ],
      累计埋设: 9,
      累计了结: 5,
      已了结编号: [2],
      核验: { 总: 4, 未执行: 1 },
      本章累计: { 章号: 3, 埋设数: 0, 回收数: 0, 张力峰: 6, 张力谷: 6, 起伏次数: 0, 冲突推进数: 0, 受挫数: 0 },
    },
  });
}
function 构造(账本: 导演账本, 下一幕?: any) {
  return 构造本幕指令({
    旧指令: null,
    下一幕: 下一幕 ?? { 节拍: '高潮', 硬性要求: 'AI 的原要求：把新反派引进来', 伏笔现场: '', 禁止事项: '' },
    账本,
    核验: { 已执行: true, 顶回冲突: '', 说明: '', 主角死亡: false } as any,
    档位: 3,
    红线: ['不许写死主角'],
    楼层: 20,
    暂停注入: false,
    接管轮数: 4,
    阈值: { 高: 3, 低: 3 },
  });
}

async function 主流程() {
  // =========================================================================
  console.log('\n[A] ① 两个开关各自独立(不再一刀切)');
  {
    const 只防伏笔 = { 防剧透伏笔: true, 防剧透章回: false };
    const 只防章回 = { 防剧透伏笔: false, 防剧透章回: true };
    const 全防 = { 防剧透伏笔: true, 防剧透章回: true };
    const 全不防 = { 防剧透伏笔: false, 防剧透章回: false };
    check('伏笔开/章回关 → 伏笔受管', 伏笔受管(只防伏笔, '埋下'), true);
    check('  → 章回不受管', 章回受管(只防伏笔, '宫变'), false);
    check('伏笔关/章回开 → 伏笔不受管', 伏笔受管(只防章回, '发酵'), false);
    check('  → 章回受管', 章回受管(只防章回, '宫变'), true);
    check('两键都开 → 都受管', [伏笔受管(全防, '潜伏'), 章回受管(全防, '宫变')], [true, true]);
    check('两键都关 → 都不受管(用户想看就全摊开)', [伏笔受管(全不防, '潜伏'), 章回受管(全不防, '宫变')], [false, false]);
    check('已引爆的伏笔不防(它本身就是结局揭晓)', 伏笔受管(全防, '已引爆'), false);
    check('空白计划高潮不给"假按钮"(点了没内容可揭)', 章回受管(全防, '   '), false);
    check('没有计划高潮也不给假按钮', 章回受管(全防, undefined), false);
  }

  console.log('\n[A] ② 点一下只揭开被点的那一条');
  {
    let 集 = new Set<string>();
    check('初始: 第 2 条折叠中', 折叠中(true, 集, 伏笔键(2)), true);
    集 = 切换揭开(集, 伏笔键(2));
    check('点开第 2 条 → 不再折叠', 折叠中(true, 集, 伏笔键(2)), false);
    check('第 3 条仍然折叠(不牵连其它条目)', 折叠中(true, 集, 伏笔键(3)), true);
    check('再点第 2 条 → 收回', 折叠中(true, 切换揭开(集, 伏笔键(2)), 伏笔键(2)), true);
    const 原 = new Set(['x']);
    切换揭开(原, 'y');
    check('切换返回**新集合**、不改原集合(Vue 才能感知变化)', [...原], ['x']);
    check('不受管的条目永远不折叠(受管=false 时点开也没意义)', 折叠中(false, new Set(), 章回键), false);
  }

  console.log('\n[A] ③ 展开态不落盘(内存态)');
  {
    check('账本里没有"已揭开"这类字段', '已揭开' in (emptyData() as any), false);
    check('账本里没有"展开态"别名', Object.keys(emptyData() as any).filter(k => /揭开|展开/.test(k)), []);
    ok('面板用 ref<Set> 存揭开状态(只在内存)', vueSource.includes('const 已揭开 = ref<Set<string>>(new Set())'));
    // 断言"行为"而不是逐字形状: 切页签时一定把 已揭开 清空(参数名变化、后面多做一件事都不影响这条纪律)
    ok('切页签即全部收回(规格 A2)', /watch\(当前页,[\s\S]{0,40}?=>\s*\{[\s\S]{0,400}?已揭开\.value = new Set\(\);/.test(vueSource));
    ok('揭开状态从不落盘(不进账本、不进快照、不进 localStorage)', !/saveData\([^)]*已揭开/.test(vueSource) && !快照源.includes('已揭开') && !vueSource.includes("localStorage.setItem('已揭开"));
    ok('title 写明"不写盘"', 揭开提示(true).includes('不写盘'));
    check('折叠文案沿用旧措辞(不给用户新词)', [折叠文案('伏笔'), 折叠文案('章回')], ['（防剧透已折叠内容）', '（防剧透已折叠）']);
  }

  console.log('\n[A] ④ 旧键迁移播种(新键缺失才用旧键)');
  {
    const 旧关 = SettingsSchema.parse({ 导演: { 防剧透: false } }).导演;
    check('旧键 false → 两个新键都 false', [旧关.防剧透伏笔, 旧关.防剧透章回], [false, false]);
    const 旧开 = SettingsSchema.parse({ 导演: { 防剧透: true } }).导演;
    check('旧键 true → 都 true', [旧开.防剧透伏笔, 旧开.防剧透章回], [true, true]);
    const 全新 = SettingsSchema.parse({}).导演;
    check('旧键也缺失 → 默认都 true(防剧透仍是默认行为)', [全新.防剧透伏笔, 全新.防剧透章回], [true, true]);
    const 混合 = SettingsSchema.parse({ 导演: { 防剧透: false, 防剧透伏笔: true } }).导演;
    check('新键存在就以新键为准(旧键此后不再有影响)', [混合.防剧透伏笔, 混合.防剧透章回], [true, false]);
    ok('旧键已从设置页消失(UI 只剩两个新开关)', !vueSource.includes('v-model="设置.导演.防剧透"') && vueSource.includes('v-model="设置.导演.防剧透伏笔"') && vueSource.includes('v-model="设置.导演.防剧透章回"'));
  }

  console.log('\n[B] ⑤ 确认结算 → 下一道指令是收束幕');
  {
    const 账 = 收官账本();
    check('请求成功', 请求收官(账), true);
    check('账本记下收官请求', 账.收官请求, true);
    const 指令 = 构造(账).指令!;
    // 终局五步(2026-11-12): 收官是一串戏, 每轮只做一步 —— 第 1 步「召集」, 节拍跟着这一步走
    check('第 1 步的节拍 = 阴影(不采用 AI 报的高潮)', 指令.节拍, '阴影');
    // 2026-11-12 硬约束通道: 收官幕的所有要求都是**代码裁定** → 现在住 `硬约束`。
    // 以前它们在 `硬性要求` 里, 被渲染成「2. 剧情参考」→ 落进"不必逐字照做"的伞下。
    // 反向断言(不该出现的那句)看 裁定∪建议 两个通道 —— 漏到哪一边都是漏。
    const 裁定 = (i: any) => (i?.硬约束 ?? []).join('\n');
    const 正文可见 = (i: any) => `${裁定(i)}\n${i?.硬性要求 ?? ''}`;
    ok('硬约束 是收官指令且写明第几步', 裁定(指令).includes('【全书收官 · 终局第 1/5 步：召集】'));
    ok('点明这一幕只做这一步', 裁定(指令).includes('这一幕只做这一步'));
    ok('列出待了结的伏笔编号与内容(已引爆的 #2 不在列)', 裁定(指令).includes('#1「线头1」') && 裁定(指令).includes('#3「线头3」') && !裁定(指令).includes('#2「线头2」'), true);
    ok('未收档冲突点名(已收档的「旧怨」不在列)', 裁定(指令).includes('「夺嫡」') && !裁定(指令).includes('「旧怨」'), true);
    ok('dsh 补充: 收不了的明确留白, 不许硬塞回收', 裁定(指令).includes('不许为了圆满硬塞回收'));
    // 禁令归属(2026-11-12): 代码写的那句已移进 `硬约束`; `禁止事项` 只留导演原文(这里导演没给 → 空)
    ok('禁令在硬约束里(不再占 禁止事项)', 裁定(指令).includes('不硬塞回收') && 裁定(指令).includes('不向读者告别'));
    check('禁止事项 只留导演原文(本例没给 → 空串)', 指令.禁止事项, '');
    ok('代码调整留痕(面板"本轮代码规则触发"看得见)', 构造(账).调整.some(项 => 项.includes('全书结算')), true);
    ok('AI 的"下一段剧情"要求被替换掉(收官不该再引新反派)', !正文可见(指令).includes('把新反派引进来'));
    check('红线仍然带进指令(不因收官绕过用户红线)', 指令.红线, ['不许写死主角']);

    // 第 5 步才是"落幕": 不总结、不升华、自然停下
    const 五步账 = 收官账本();
    请求收官(五步账);
    五步账.终局步 = 5;
    const 落幕 = 构造(五步账).指令!;
    check('第 5 步的节拍 = 余波', 落幕.节拍, '余波');
    ok('第 5 步: 不总结、不升华', 裁定(落幕).includes('不总结、不升华'));
    ok('第 5 步: 在故事内部自然停下', 裁定(落幕).includes('自然停下'));
    ok('第 5 步: 活线不许留', 裁定(落幕).includes('活线不许留'));

    // 让步不是"常规五条规则"之一, 而是玩家体验的独立保护(同冲突连续 2 次顶回 → 本轮必须让玩家赢)。
    // 收束幕也一样受它管: 收尾可以悲壮, 但不该在这一幕额外踩玩家一脚(自查补的一条)。
    const 让步账 = 收官账本();
    请求收官(让步账);
    让步账.冲突[0].顶回次数 = 1;
    const 让步构造 = 构造本幕指令({
      旧指令: null,
      下一幕: { 节拍: '高潮', 硬性要求: '', 伏笔现场: '', 禁止事项: '' },
      账本: 让步账,
      核验: { 已执行: true, 顶回冲突: '夺嫡', 说明: '', 主角死亡: false } as any,
      档位: 2,
      红线: [],
      楼层: 20,
      暂停注入: false,
      接管轮数: 4,
      阈值: { 高: 3, 低: 3 },
    });
    // 档位改为 2: 第二轮方案 7.1 起, 连败保送只在档 1/2 存在
    ok('收束幕也保留「连败让步」', 裁定(让步构造.指令!).includes('连败让步') && 裁定(让步构造.指令!).includes('收官幕也不例外'));
    ok('让步与收官要求并存(谁也没顶掉谁)', 裁定(让步构造.指令!).includes('【全书收官 · 终局第'));
  }

  console.log('\n[B] ⑥ 幂等：重复点击不产生第二道收束幕');
  {
    const 账 = 收官账本();
    check('第一次请求', 请求收官(账), true);
    check('第二次请求 → false', 请求收官(账), false);
    check('第三次请求 → false(状态没被反复翻)', 请求收官(账), false);
    check('收官请求仍是 true(没被翻成 false)', 账.收官请求, true);
    const 已剧终 = 账本({ 已剧终: true });
    check('已剧终时请求 → false(落幕无需再收官)', 请求收官(已剧终), false);
    check('  且不改已剧终', 已剧终.已剧终, true);
    ok('面板: 已有收官请求时按钮不再出现', vueSource.includes('v-if="!剧终 && !账本.收官请求 && !待确认结算"'));
    ok('命令: 函数里再拦一道(双保险)', 命令源码.includes('if (!请求收官(当前)) {'));
    const 账2 = 收官账本();
    请求收官(账2);
    const 编号前 = 账2.下一指令编号;
    构造(账2);
    构造(账2);
    check('构造本幕指令不改账本(纯函数, 编号不会被撑出两道)', 账2.下一指令编号, 编号前);
  }

  console.log('\n[B] ⑦ 收官期间照常推进（收官请求 ≠ 已剧终）');
  {
    const 账 = 收官账本();
    请求收官(账);
    check('未剧终(引擎没停)', 账.已剧终, false);
    ok('仍能出指令', !!构造(账).指令);
    // 2026-11-12: update.ts 现在会读收官请求(推进「终局五步」的步数), 但它**不许因此短路** ——
    // 停摆只看已剧终。所以钉的是"没有因收官请求 return", 不是"不出现这三个字"。
    ok('update.ts 不因"收官请求"而 return', !/if\s*\([^)]*收官请求[\s\S]{0,40}?return/.test(updateSource));
    ok('update.ts 里推进终局步数(只有真产出收束幕才算一步)', /账本\.终局步 = 构造\.指令 && 新楼层 \? Math\.min\(5, 已走 \+ 1\) : 已走/.test(updateSource));
    ok('停摆仍只看已剧终', updateSource.includes('data.已剧终') && vueSource.includes('const 剧终 = computed(() => !!账本.value.已剧终);'));
  }

  console.log('\n[B] ⑧ 确认剧终 → 终值快照 + 卡片数据 + 清收官请求');
  {
    const 账 = 收官账本();
    请求收官(账);
    check('剧终前没有成绩单', 账.指标.终值, null);
    落定剧终(账);
    check('已剧终', 账.已剧终, true);
    check('收官请求被清(否则恢复用会一直出收束幕)', 账.收官请求, false);
    ok('终值已快照', !!账.指标.终值);
    const 终 = 账.指标.终值!;
    check('终值里的回收率 = 那一刻的队列比 5/9', Math.round(终.伏笔回收率 * 100), 56);
    check('终值带章数', 终.明细.已结算章数, 2);
    check('终值带起伏次数(规格 B3 要的项, 原先只在章节统计里)', 终.起伏次数, 4);
    check('终值带冲突推进与受挫', [终.冲突推进数, 终.受挫次数], [3, 2]);
    check('终值带执行率(1 - 1/4)', Math.round(终.指令执行率 * 100), 75);
    // ── 2026-11-20 改法：原来用一个「距离」当代理，太脆 ──
    //
    //  旧断言：`/落定剧终\(当前\);[\s\S]{0,160}写已剧终\(true\)/.test(命令源码)`
    //  —— 它用「两个调用相距不超过 160 字符」来间接证明"双写由调用方做"。
    //
    //  而本批给 `确认剧终` 加了落盘块（① 落盘 → ② 写 meta → ③ 结算死亡），
    //  两个调用之间的距离变成 368 字符 → **旧断言红，但代码是对的**。
    //
    //  **这不是"测试过时"，是那个代理本来就绑错了形态**：
    //  它证明的是"两个调用挨得近"，而不是"落定剧终 不碰平台"。
    //  挨得近只是当时巧合 —— 任何人插一行注释都会让它红。
    //
    //  现在拆成两条**直接**断言，各自说清一件事。
    //
    //  ⚠ 第一条必须**先剥注释** —— 终局.ts 的文档注释里写着
    //    "落盘由调用方 `saveData` 负责"，那是在**说明**纯函数约束，
    //    扫全文会把它当成"平台调用"。这是本批自己踩的第二个坑（同一条断言两次假红）。
    //
    //  2026-11-20 #539：`剥注释` 已抽到 `tests/helpers/源码扫描.ts` ——
    //  今天**三次**断言被注释干扰，抽成单一构造点，不再各处手写（否则改一处漏两处）。
    const 终局代码 = 剥注释(终局源码);
    ok('★ 落定剧终 是纯函数（终局.ts 的**代码**里不碰平台）',
       !/写已剧终|toast|saveData|getVariables|replaceVariables/.test(终局代码),
       '终局.ts 的代码里出现了平台调用 —— 纯函数约束被破坏');
    ok('★ 双写由调用方做（导演命令.ts 里调 写已剧终）',
       命令源码.includes('依赖.写已剧终(true)'),
       '命令模块里没有 `依赖.写已剧终(true)` —— meta 侧没人写了');
    // **自证**：把平台调用写进**代码**，第一条必须红
    ok('[自证] 代码里含 写已剧终 会被抓到（剥注释不影响这个）',
       !!/写已剧终|toast|saveData/.test('依赖.写已剧终(true);'),
       '那条正则抓不到平台调用 —— 它是假的');
    ok('[自证] 注释里的 saveData 会被剥掉（否则第一条永远红）',
       !/saveData/.test(剥注释('// 落盘由调用方 saveData 负责\nexport function f() {}')),
       '剥注释没生效');

    // ── 2026-11-20 #539①：钉住"落定剧终 定义在哪个文件" ──
    //
    //  ⚠ 这是本批自曝的缺口：上面的"纯函数"断言看的是 `终局源码`。
    //    如果将来有人把 `落定剧终` 挪回 `快照.ts`，那条会**假绿** ——
    //    因为 `终局源码` 里还是干净的（函数已经不在了，但正则照样不命中平台调用）。
    //
    //  **"函数不在这个文件里" 和 "函数在这个文件里但没碰平台" 是两件事**，
    //  前者必须单独断言。
    ok('★ 落定剧终 的定义就在 终局.ts',
       /export function 落定剧终\s*\(/.test(剥注释(终局源码)),
       '终局.ts 里找不到 `export function 落定剧终(` —— 它被挪走了？');
    ok('★ 快照.ts 里只有 re-export，没有 落定剧终 的**定义**',
       !/function 落定剧终\s*\(/.test(剥注释(快照源)),
       '快照.ts 里出现了 `function 落定剧终(` —— 定义被挪回存储层了');
    ok('★ 快照.ts 确实 re-export 了它（调用方不用改 import）',
       /export\s*\{[^}]*落定剧终[^}]*\}\s*from\s*'\.\/终局'/.test(剥注释(快照源)),
       '快照.ts 里没有 `export { ... 落定剧终 ... } from \'./终局\'`');
    // **自证**：把定义写进快照.ts 的"代码"，上面第二条必须红
    ok('[自证] 快照.ts 里若真写了 `function 落定剧终(`，那条会红',
       /function 落定剧终\s*\(/.test(剥注释('export function 落定剧终(账本) { return 账本; }')),
       '那条正则抓不到定义 —— 它是假的');

    const 行 = 终值日志行(账.指标.终值);
    ok('成绩单同时写一行进日志页(清除已剧终后仍可回看)', ['已结算 2 章', '伏笔回收 5/9', '张力峰 9', '起伏 4 次', '冲突推进 3', '受挫 2', '指令执行率 75%'].every(片段 => 行.includes(片段)));
    ok('剧终时确实打了这一行', 命令源码.includes('终值日志行(当前.指标?.终值)'));
    check('没有快照时给明确文案(不显示空壳)', 终值日志行(null), '全书结算：无判据快照');
  }

  console.log('\n[B] ⑨ 清除已剧终 → 恢复游玩且不再出收束幕');
  {
    const 账 = 收官账本();
    请求收官(账);
    落定剧终(账);
    解除剧终(账);
    check('已剧终解除', 账.已剧终, false);
    check('收官请求一并清', 账.收官请求, false);
    check('终值一并清(恢复游玩后挂旧成绩单会误导)', 账.指标.终值, null);
    const 指令 = 构造(账).指令!;
    check('恢复后走常规规则(采用 AI 报的节拍)', 指令.节拍, '高潮');
    ok('恢复后不再有收官字样', !`${(指令.硬约束 ?? []).join('\n')}\n${指令.硬性要求 ?? ''}`.includes('全书收官'));
    ok('面板: 清除入口仍是唯一出口(视图只调命令, 解除剧终 只在命令模块)', vueSource.includes('命令.清除剧终()') && 命令源码.includes('解除剧终(当前);'));
  }

  console.log('\n[B] ⑩ 老账本迁移：没有 收官请求 / 终值 也不崩');
  {
    check('空账本默认 收官请求=false', emptyData().收官请求, false);
    check('空指标默认 终值=null', 空指标().终值, null);
    check('老指标账(没这个字段)→ null', 规范化指标({ 章节统计: [] } as any, []).终值, null);
    check('老指标账有坏值也不炸', 规范化指标({ 终值: 'x' } as any, []).终值, null);
    check('半截终值(缺 明细)一律拒收, 免得结算卡读到 undefined', 规范化指标({ 终值: {} } as any, []).终值, null);
    // 真走一遍装载路径: 楼层快照里**没有**这两个字段(v1.4 之前的账本就是这个形状)
    const p = makeFakePlatform();
    p.addFloor(9);
    injectHostForTest(p.host);
    const 老 = 收官账本();
    delete (老 as any).收官请求;
    老.指标 = { ...(老.指标 as any) };
    delete ((老.指标 as any).终值);
    writeStateSnapshot(老, 9, 9, false);
    const 装载 = loadData();
    check('装载后 收官请求=false(不崩、不伪造)', 装载.收官请求, false);
    check('装载后 终值=null', 装载.指标.终值, null);
    check('其余数据一条没丢(迁移不清空)', [装载.伏笔.length, 装载.指标.累计埋设, 装载.指标.章节统计.length], [3, 9, 2]);
    injectHostForTest(null as any);
  }

  console.log('\n[呈现] ⑪ 折叠与结算面板接线(改版不许把行为弄丢)');
  {
    const 模板 = vueSource.slice(0, vueSource.indexOf('<script'));
    ok('伏笔行: 折叠态换成占位文案', 模板.includes("伏笔折叠中(s) ? 折叠文案('伏笔') : s.内容"));
    ok('伏笔行: 受管才给可点样式(role/tabindex/title)', 模板.includes(':role="伏笔可点(s) ? \'button\' : undefined"') && 模板.includes(':tabindex="伏笔可点(s) ? 0 : undefined"') && 模板.includes('揭开提示(伏笔折叠中(s))'));
    ok('伏笔行: Enter/Space 也能触发(键盘可达)', 模板.includes('@keydown.enter.prevent="伏笔可点(s)') && 模板.includes('@keydown.space.prevent="伏笔可点(s)'));
    ok('章回行同样处理', 模板.includes("章回折叠中() ? 折叠文案('章回')") && 模板.includes('@keydown.enter.prevent="章回可点()'));
    ok('揭开/合上两种图标(内联 SVG)', (模板.match(/dj-fold-icon/g) || []).length === 2 && 模板.includes('M2 12s3.6-7 10-7'));
    // 2026-11-01: 标题去掉内部说法「读快照不重算」, 改成「定格在落幕那一刻」(语义不变: 只读 终值)
    ok('结算卡只在剧终后出现, 且只读 终值', 模板.includes('v-if="剧终 && 终值"') && 模板.includes('定格在落幕那一刻') && 模板.includes('终值.起伏次数'));
    ok('结算卡数字仍走等宽口径(复用 dj-metric/dj-metrics)', 模板.includes('class="dj-metrics"') && 模板.includes('{{ 终值.起伏次数 }}'));
    ok('异常态口径在结算卡里也保留(>100%?)', 模板.includes(':class="{ \'dj-bad\': 终值.伏笔回收率异常 }"') && 模板.includes('回收率文本of(终值)'));
    ok('终局操作区在账本页底部(与结算卡同页)', 模板.indexOf('class="dj-card dj-final"') < 模板.indexOf('class="dj-card dj-final-ops"'));
    ok('两段都要二次确认(都不是一点就生效)', 模板.includes('v-if="待确认结算 && !剧终 && !账本.收官请求"') && 模板.includes('v-if="!待确认落幕"') && 模板.includes('v-else class="dj-confirm"'));
    ok('折叠样式已定义', vueSource.includes('.dj-folded { cursor: pointer; }') && vueSource.includes('.dj-fold-icon'));
    ok('折叠不靠裁正文(不是 overflow 隐藏)', !/\.dj-fold[^-][^{]*\{[^}]*overflow:\s*hidden/.test(vueSource));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exitCode = 1;
}


await 主流程();
