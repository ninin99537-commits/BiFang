// 彼方 · 数据变更(候选9) —— 四个入口各自走完整套协议: 草稿合并 · 最后更新 · 写快照 · 重同步世界书
//
// 以前这套协议摊在界面里: 三段几乎逐字重复的内联序列, 清空是第四个变体(绕过闸门、写死"不写入"),
// 闸门口径三处两种, 清空之后界面还要重读存储用启发式判断清干净没有。现在四个入口在 数据变更.ts,
// 依赖走"变更环境"——这里塞假环境就能把四种变更、闸门开/关、返回数据是不是新对象全跑一遍;
// 最后一个用例用假平台跑真实现(快照真的进楼层变量、世界书条目真的被写/删)。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import {
  加NPC,
  移除NPC,
  更新状态卡,
  清空彼方数据,
  建变更环境,
  扩展编辑字段,
} from '../src/彼方_NPC幕后生命状态系统/数据变更';
import {
  BIFANG_WORLDBOOK_ENTRY_NAME,
} from '../src/彼方_NPC幕后生命状态系统/彼方条目';
import {
  clearAllData,
  emptyData,
  loadData,
  saveData,
} from '../src/彼方_NPC幕后生命状态系统/快照';
import { syncNpcStatesWorldbook } from '../src/彼方_NPC幕后生命状态系统/worldbook-inject';
import { useHost } from '../src/彼方_NPC幕后生命状态系统/host';

setActivePinia(createPinia());

// settings.ts 用的是酒馆注入的全局 `_`(只用到了 _.clamp) 与浏览器 localStorage;
// [8] 要碰设置(建变更环境的闸门从设置取), 这里给两个最小替身, 免得为一个 clamp 和一条迁移分支报错。
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
};
(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
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
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 假平台: 聊天楼层 + 变量表 + 一本世界书, 照酒馆助手的行为来——
 * 读不存在的楼层会抛错(数据层靠这个判定楼层已删), 世界书条目真的会增删改。
 */
function 假平台() {
  const floors: Record<string, any> = { 1: { role: 'assistant', message: '第1楼正文' } };
  const floorVars: Record<string, any> = {};
  const 世界书: any[] = [];
  const 被删的楼层: string[] = [];
  let chatVars: Record<string, any> = {};
  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat')
          return chatVars;
        if (option.type !== 'message')
          return {};
        const id = String(option.message_id);
        if (!(id in floors))
          throw new Error(`楼层 #${id} 不存在`);
        return floorVars[id] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        if (option.type !== 'message')
          return {};
        const id = String(option.message_id);
        if (!(id in floors))
          throw new Error(`楼层 #${id} 不存在`);
        floorVars[id] = updater(floorVars[id] ?? {}) ?? floorVars[id];
        return floorVars[id];
      },
      del(path: string, option: any) {
        if (option.type === 'chat') {
          delete chatVars[path];
          return { variables: chatVars, delete_occurred: true };
        }
        const id = String(option.message_id);
        被删的楼层.push(id);
        if (floorVars[id])
          delete floorVars[id][path];
        return { variables: floorVars[id] ?? {}, delete_occurred: true };
      },
      insertOrAssign: () => {},
      scriptId: () => 'test-script',
    },
    chat: {
      messages(range: any, options: any = {}) {
        const parts = typeof range === 'number' ? [range] : String(range).split('-').map(Number);
        const [from, to] = parts.length === 2 ? parts : [parts[0], parts[0]];
        const out = [];
        for (let i = from; i <= to; i++) {
          const m = floors[String(i)];
          if (!m)
            continue;
          if (options.role && options.role !== 'all' && m.role !== options.role)
            continue;
          out.push({ message_id: i, name: 'AI', role: m.role, is_hidden: !!m.is_hidden, message: m.message, data: {}, extra: {} });
        }
        return out;
      },
      lastMessageId() {
        const ids = Object.keys(floors).map(Number);
        return ids.length > 0 ? Math.max(...ids) : -1;
      },
    },
    worldbook: {
      boundNames: () => ({ primary: '主世界书' }),
      entries: async () => [...世界书],
      create: async (_name: string, list: any[]) => {
        世界书.push(...list);
      },
      update: async (_name: string, 改: any) => {
        const 新 = 改([...世界书]);
        世界书.length = 0;
        世界书.push(...新);
      },
      remove: async (_name: string, 判定: any) => {
        const 留 = 世界书.filter(e => !判定(e));
        世界书.length = 0;
        世界书.push(...留);
      },
    },
    toast: { warn() {}, info() {}, error() {} },
  };
  return { host, floors, floorVars, 世界书, 被删的楼层 };
}

/** 假环境: 只记录被调用了什么、按什么参数, 不碰平台 */
function 假环境(注入世界书条目 = true) {
  const 记 = {
    保存: [] as any[],
    清空次数: 0,
    同步: [] as Array<{ 数据: any; 写入: boolean }>,
  };
  const 环境 = {
    注入世界书条目,
    保存: (数据: any) => {
      记.保存.push(数据);
    },
    清空: () => {
      记.清空次数 += 1;
    },
    同步世界书: (数据: any, 写入: boolean) => {
      记.同步.push({ 数据, 写入 });
    },
    现在: () => 1234567890,
  };
  return { 记, 环境: 环境 as any };
}

const 造数据 = () => ({ ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭' } } } as any);

console.log('\n[1] 加 NPC: 名单补名 + 草稿合并(去首尾空白) + 最后更新 + 写快照 + 同步世界书');
{
  const { 记, 环境 } = 假环境();
  const 原数据 = 造数据();
  const 结果 = 加NPC(原数据, '乙', { 当前在做: '  扫地  ', 位置: '家' }, 环境);
  check('名单补上乙', 结果.数据.名单, ['甲', '乙']);
  check('草稿写入并去空白', 结果.数据.NPC.乙['当前在做'], '扫地');
  check('草稿第二个字段也写入', 结果.数据.NPC.乙['位置'], '家');
  check('最后更新取环境时间', 结果.数据.NPC.乙['最后更新'], 1234567890);
  check('写了一次快照', 记.保存.length, 1);
  ok('写的就是返回的那份数据', 记.保存[0] === 结果.数据);
  check('世界书同步一次且是"写入"', 记.同步.map(s => s.写入), [true]);
  check('说明文案', 结果.说明, '已添加 NPC: 乙');
  check('入参没被改动(名单)', 原数据.名单, ['甲']);
  check('入参没被改动(没多出乙)', Object.keys(原数据.NPC), ['甲']);
  ok('返回的是新对象', 结果.数据 !== 原数据 && 结果.数据.名单 !== 原数据.名单);
}

console.log('\n[2] 加同名 NPC: 名单不重复, 卡是合并(草稿空串不删旧值)');
{
  const { 环境 } = 假环境();
  const 结果 = 加NPC(造数据(), '甲', { 当前在做: '', 位置: '广场' }, 环境);
  check('名单不重复', 结果.数据.名单, ['甲']);
  check('旧字段保留(空串不删除)', 结果.数据.NPC.甲['当前在做'], '做饭');
  check('新字段写入', 结果.数据.NPC.甲['位置'], '广场');
}

console.log('\n[3] 移除 NPC: 名单与状态卡一起去掉, 剩下的不动, 同步改成"删除条目"');
{
  const { 记, 环境 } = 假环境();
  const 原数据 = { ...emptyData(), 名单: ['甲', '乙'], NPC: { 甲: { 位置: '家' }, 乙: { 位置: '店' } } } as any;
  const 结果 = 移除NPC(原数据, '甲', 环境);
  check('名单去掉甲', 结果.数据.名单, ['乙']);
  check('状态卡去掉甲', Object.keys(结果.数据.NPC), ['乙']);
  check('乙的状态原样保留', 结果.数据.NPC.乙, { 位置: '店' });
  check('入参没被改动', 原数据.名单, ['甲', '乙']);
  check('写快照一次', 记.保存.length, 1);
  check('还有 NPC → 同步仍是写入', 记.同步.map(s => s.写入), [true]);
}

console.log('\n[4] 改状态卡: 空字符串删字段, 扩展字段可写(受孕日期等), 非字符串不动');
{
  const { 记, 环境 } = 假环境();
  const 原数据 = { ...emptyData(), 名单: ['甲'], NPC: { 甲: { 当前在做: '做饭', 位置: '家', 身份锚点: '护士' } } } as any;
  const 结果 = 更新状态卡(原数据, '甲', {
    当前在做: '',
    位置: '  广场 ',
    受孕日期: '0137-03-01',
    身份锚点: undefined,
  }, 环境);
  check('空字符串删掉该字段', 结果.数据.NPC.甲['当前在做'], undefined);
  ok('字段真的没了(不是空串)', !('当前在做' in 结果.数据.NPC.甲));
  check('有值就写(去空白)', 结果.数据.NPC.甲['位置'], '广场');
  check('扩展字段可写', 结果.数据.NPC.甲['受孕日期'], '0137-03-01');
  check('undefined 不动原值', 结果.数据.NPC.甲['身份锚点'], '护士');
  check('最后更新', 结果.数据.NPC.甲['最后更新'], 1234567890);
  check('说明文案', 结果.说明, '已保存 甲 的状态');
  check('写快照 + 同步各一次', [记.保存.length, 记.同步.length], [1, 1]);
  check('入参的卡没被改动', 原数据.NPC.甲['当前在做'], '做饭');
}

console.log('\n[5] 闸门: 关闭「写入世界书条目」时, 四次变更一次都不碰世界书, 但快照照写');
{
  const { 记, 环境 } = 假环境(false);
  加NPC(造数据(), '乙', {}, 环境);
  移除NPC(造数据(), '甲', 环境);
  更新状态卡(造数据(), '甲', { 位置: '家' }, 环境);
  清空彼方数据(环境);
  check('一次都没同步世界书', 记.同步.length, 0);
  check('但写了三次快照(清空不写)', 记.保存.length, 3);
  check('清空仍然真的执行', 记.清空次数, 1);
}

console.log('\n[6] 清空: 物理清空 + 不写快照 + 同步改成"删除条目" + 返回空数据');
{
  const { 记, 环境 } = 假环境();
  const 结果 = 清空彼方数据(环境);
  check('清空被调用', 记.清空次数, 1);
  check('清空不写快照', 记.保存.length, 0);
  check('空数据 → 同步是删除条目', 记.同步.map(s => s.写入), [false]);
  check('返回空名单', 结果.数据.名单, []);
  check('返回空 NPC', 结果.数据.NPC, {});
  check('说明文案', 结果.说明, '彼方: 数据已清空，清空后只分析清空之后的新楼层');
}

console.log('\n[7] 扩展编辑字段: 常量就是那 13 个(界面不再各写一份)');
{
  check('字段表', 扩展编辑字段, ['受孕日期', '生理周期日期', '怀孕知晓', '孕程周数', '哺乳期月数', '恋爱对象', '情感倾向', '好感值', '情欲值', '好感阶段', '情欲阶段', '名分', '恋爱动向', '恋爱开局']);
}

console.log('\n[7.5] 恋爱字段走的是既有编辑通道: 手改数值生效、清空名分即删字段、标记只写一个字段');
{
  // 玩家手改 好感值 → 下一轮合并前读到的就是它(不是被代码覆盖的旧值)
  const 手改 = 更新状态卡(造数据(), '甲', { 好感值: '88.5', 情欲值: '30', 情感倾向: '病娇' }, 假环境().环境);
  check('手改好感值/情欲值/情感倾向落进卡', [手改.数据.NPC.甲['好感值'], 手改.数据.NPC.甲['情欲值'], 手改.数据.NPC.甲['情感倾向']], ['88.5', '30', '病娇']);
  // 清空名分 = 删掉该字段(空值即删除), 于是下轮按"未设置"惰性补成 无
  const 清名分 = 更新状态卡({ ...造数据(), NPC: { 甲: { 名分: '恋人', 好感值: '50' } } } as any, '甲', { 名分: '' }, 假环境().环境);
  check('清空名分即删字段', '名分' in 清名分.数据.NPC.甲, false);
  check('没碰的字段原样保留', 清名分.数据.NPC.甲['好感值'], '50');
  // 标记按钮: 只写 恋爱对象 一个字段, 其余恋爱字段由首轮更新惰性补齐
  const 标记 = 更新状态卡(造数据(), '甲', { 恋爱对象: '是' }, 假环境().环境);
  check('标记只写 恋爱对象', 标记.数据.NPC.甲['恋爱对象'], '是');
  check('标记不凭空造出其他恋爱字段', Object.keys(标记.数据.NPC.甲).filter(k => ['情感倾向', '好感值', '情欲值', '好感阶段', '情欲阶段', '名分', '恋爱动向'].includes(k)), []);
  const 取消 = 更新状态卡(标记.数据, '甲', { 恋爱对象: '' }, 假环境().环境);
  check('取消标记 = 删字段', '恋爱对象' in 取消.数据.NPC.甲, false);
  // 必修 2: 玩家这条写入路径也必须过闭合词表——否则"词表外的词"能从详情页进卡, 再随注入喂给主 AI
  const 带旧标签 = () => ({ ...造数据(), NPC: { 甲: { 当前在做: '做饭', 恋爱标签: '冷战' } } } as any);
  const 手改合法 = 更新状态卡(带旧标签(), '甲', { 恋爱标签: '心结,占有欲' }, 假环境().环境);
  check('手改合法标签: 归一化后落库', 手改合法.数据.NPC.甲['恋爱标签'], '心结,占有欲');
  const 手改半非法 = 更新状态卡(带旧标签(), '甲', { 恋爱标签: '冷战,深情,数字123' }, 假环境().环境);
  check('手改半非法: 只留词表里的那个', 手改半非法.数据.NPC.甲['恋爱标签'], '冷战');
  const 手改全非法 = 更新状态卡(带旧标签(), '甲', { 恋爱标签: '深情,偏执' }, 假环境().环境);
  check('手改全非法: 保留旧值冷战(不是清空)', 手改全非法.数据.NPC.甲['恋爱标签'], '冷战');
  const 手改清空 = 更新状态卡(带旧标签(), '甲', { 恋爱标签: '' }, 假环境().环境);
  check('手改清空(空串): 明确要清空 → 删字段', '恋爱标签' in 手改清空.数据.NPC.甲, false);
  const 手改重复 = 更新状态卡(带旧标签(), '甲', { 恋爱标签: '心结;心结、冷战' }, 假环境().环境);
  check('手改去重/多分隔符: 与 AI 路径同一把尺子', 手改重复.数据.NPC.甲['恋爱标签'], '心结,冷战');
}

console.log('\n[8] 建变更环境: 连的是真实现(保存/清空与 state.ts 同一函数), 闸门从设置取');
{
  const p = 假平台();
  injectHostForTest(p.host);
  const 环境 = 建变更环境();
  ok('保存就是 state.ts 的 saveData', 环境.保存 === saveData);
  ok('清空就是 state.ts 的 clearAllData', 环境.清空 === clearAllData);
  check('闸门是布尔', typeof 环境.注入世界书条目, 'boolean');
  check('取时是 Date.now 这类函数', typeof 环境.现在(), 'number');
}

console.log('\n[9] 端到端(假平台 + 真协议): 快照真的进楼层变量, 世界书条目真的被写和删');
{
  const p = 假平台();
  injectHostForTest(p.host);

  // 真环境: 保存/清空用 state.ts, 同步用 worldbook-inject(宿主是上面那个假的)
  const 真环境 = (注入: boolean) => ({
    注入世界书条目: 注入,
    保存: saveData,
    清空: clearAllData,
    同步世界书: (数据: any, 写入: boolean) => syncNpcStatesWorldbook(useHost(), 数据, 写入),
    现在: Date.now,
  } as any);

  const 加后 = 加NPC(emptyData() as any, '甲', { 当前在做: '做饭', 位置: '家' }, 真环境(true));
  await sleep(10);
  ok('快照写进了楼层 #1 的变量', Boolean(p.floorVars['1'] && Object.keys(p.floorVars['1']).length > 0));
  const 读回 = loadData();
  check('重新读回: 名单有甲', 读回.名单, ['甲']);
  check('重新读回: 状态卡在', 读回.NPC.甲['当前在做'], '做饭');
  check('世界书写入了一条彼方条目', p.世界书.map(e => e.name), [BIFANG_WORLDBOOK_ENTRY_NAME]);
  ok('条目按防递归常驻写入', p.世界书[0]?.recursion?.prevent_incoming === true && p.世界书[0]?.strategy?.type === 'constant');
  ok('条目内容带着这个 NPC', String(p.世界书[0]?.content ?? '').includes('甲'));
  check('返回的数据与读回的一致(名单)', 加后.数据.名单, 读回.名单);

  const 清后 = 清空彼方数据(真环境(true));
  await sleep(10);
  check('清空后重新读回是空名单', loadData().名单, []);
  check('清空后返回的也是空名单', 清后.数据.名单, []);
  ok('楼层的快照键被物理删除', p.被删的楼层.includes('1'));
  check('世界书里的彼方条目也被删掉', p.世界书.filter(e => e.name === BIFANG_WORLDBOOK_ENTRY_NAME).length, 0);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
