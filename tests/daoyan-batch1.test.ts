// 剧情导演 · 批次一（H/I/F/K/J）—— 指标账 / 剧终停引擎 / 接口健康检查 / 离线可观测 / 面板接线
//
// 覆盖 dsh 的《批次一审查清单》要求钉住的用例：
//   K: 埋设章由代码签发 + 老账本回填 / 章节结算幂等 / 有界淘汰 / 核验累计 / 判据可算 / 零 AI 负担
//   F: 剧终后不注入不调引擎(文本) / 二次确认 / 清除出口 / 已剧终双写与回退
//   H: 三空校验 / 错误分类 / 测试连接(含"推理模型吃满小预算"这一类)
//   I: 连败计数与暂停·恢复 / 失败不丢计数(存 meta 不在快照)
import { createPinia, setActivePinia } from 'pinia';
import { klona } from 'klona';
import type { 导演账本 } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { emptyData, loadData, writeStateSnapshot, 读离线状态, 读已剧终, 写已剧终, 记推进失败, 清推进失败, 设自动暂停 } from '../src/剧情导演/快照';
import { 应用引擎输出 } from '../src/剧情导演/账本数据';
import { 计算判据 } from '../src/剧情导演/指标';
import { 应注入的指令文本 } from '../src/剧情导演/注入';
import { 诊断接口配置, 分类接口错误, 测试连接 } from '../src/剧情导演/api';
import { SettingsSchema } from '../src/剧情导演/schema';
import indexSource from '../src/剧情导演/index.ts?raw';
import updateSource from '../src/剧情导演/update.ts?raw';
import promptSource from '../src/剧情导演/prompts.ts?raw';
import vueSource from '../src/剧情导演/悬浮球界面.vue?raw';
import 运行状态源码 from '../src/剧情导演/球状态.ts?raw';

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

function 账本(部分: Partial<导演账本> = {}): 导演账本 {
  return { ...emptyData(), ...部分 };
}

function makeFakePlatform(全局设置: Record<string, any> = {}) {
  const floors: Record<string, { role: string; message: string; is_hidden: boolean }> = {};
  const floorVars: Record<string, any> = {};
  let chatVars: Record<string, any> = {};
  const host: any = {
    vars: {
      get(option: any) {
        if (option.type === 'chat') return chatVars;
        if (option.type === 'global') return { 剧情导演_settings: 全局设置 };
        const id = String(option.message_id);
        if (!(id in floors)) throw new Error(`楼层 #${id} 不存在`);
        return floorVars[id] ?? {};
      },
      update(updater: any, option: any) {
        if (option.type === 'chat') {
          chatVars = updater(chatVars) ?? chatVars;
          return chatVars;
        }
        const id = String(option.message_id);
        if (!(id in floors)) throw new Error(`楼层 #${id} 不存在`);
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
        const out = [];
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
    floors,
    floorVars,
    chatVars: () => chatVars,
    addFloor(id: number, message = `第${id}楼正文`) {
      floors[String(id)] = { role: 'assistant', message, is_hidden: false };
    },
  };
}

function 准备(全局设置: Record<string, any> = {}) {
  const p = makeFakePlatform(全局设置);
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  resetSettingsReadCacheForTest();
  return p;
}

const 章 = (章号: number, 进度: 导演账本['章回'] extends null ? never : any = '推进') =>
  章号 > 0 ? { 章号, 主题: `第${章号}章`, 计划高潮: '', 进度 } : null;

console.log('\n[K] 标的账: 埋设章由代码签发, 既有伏笔沿用原值');
{
  准备();
  const 旧 = 账本({ 章回: 章(2) });
  const 应用 = 应用引擎输出(旧, { 章回: 章(2), 伏笔: [{ 内容: '缺角的玉佩', 状态: '埋下', 回收窗口: '第3章内' }] }, 10);
  check('新伏笔: 编号由代码签发', 应用.账本.伏笔[0].编号, 1);
  check('新伏笔: 埋设层=楼层', 应用.账本.伏笔[0].埋设层, 10);
  check('新伏笔: 埋设章=当前章号(不是 AI 填的)', 应用.账本.伏笔[0].埋设章, 2);

  const 旧2 = 账本({ 章回: 章(3), 伏笔: [{ 编号: 1, 内容: 'A', 埋设层: 2, 埋设章: 1, 状态: '潜伏', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2 });
  const 应用2 = 应用引擎输出(旧2, { 章回: 章(3), 伏笔: [{ 编号: 1, 内容: 'A', 埋设章: 99, 状态: '发酵', 回收窗口: '', 关联冲突: '' }] }, 20);
  check('既有伏笔: 埋设章沿用原值(AI 报 99 不采信)', 应用2.账本.伏笔[0].埋设章, 1);
  check('既有伏笔: 状态仍可改', 应用2.账本.伏笔[0].状态, '发酵');
}

console.log('\n[K] 老 v1.0 账本迁移: 埋设章回填当前章号 + 指标默认填充 + 不清空');
{
  const p = 准备();
  p.addFloor(5);
  // 真实 v1.0 快照结构(见 docs/剧情导演-v1.0账本样本.md): 无 指标 / 无 埋设章 / 版本 1
  writeStateSnapshot(
    账本({
      章回: 章(3),
      伏笔: [{ 编号: 1, 内容: '老线头', 埋设层: 2, 埋设章: 0, 状态: '埋下', 回收窗口: '第3章收束前', 关联冲突: '夺嫡' }],
      冲突: [{ 名: '夺嫡', 对立面: '二皇子', 赌注: '继承权', 强度: 6, 阶段: '升级', 下一步: '逼宫', 顶回次数: 0 }],
      下一伏笔编号: 2,
    }),
    5,
    5,
    false,
  );
  const 读 = loadData();
  check('埋设章回填当前章号', 读.伏笔[0].埋设章, 3);
  check('指标默认填充为结构', [typeof 读.指标, Array.isArray(读.指标.章节统计), typeof 读.指标.核验.总], ['object', true, 'number']);
  check('旧数据没被清空(伏笔/冲突/章回)', [读.伏笔.length, 读.冲突.length, 读.章回?.章号], [1, 1, 3]);
  check('已剧终默认 false', 读.已剧终, false);
}

console.log('\n[K] 章节结算: 章号变化触发 + 幂等 + 有界 20 章');
{
  准备();
  let 账 = 账本({ 章回: 章(1), 张力: { 当前: 2, 距上次高潮楼层: 1, 连续低张力: 0, 最近节拍: [] } });
  // 第 1 章内推进两轮(埋 1 条伏笔 + 一次受挫 + 一次冲突阶段推进)
  账 = 应用引擎输出(账, { 章回: 章(1), 伏笔: [{ 内容: '线头 A', 状态: '埋下' }], 上一幕节拍: '受挫', 冲突: [{ 名: '夺嫡', 对立面: 'x', 赌注: 'y', 强度: 5, 阶段: '铺垫', 下一步: 'z', 顶回次数: 0 }] }, 10).账本;
  账 = 应用引擎输出(账, { 章回: 章(1), 上一幕节拍: '反转', 冲突: [{ 名: '夺嫡', 对立面: 'x', 赌注: 'y', 强度: 5, 阶段: '升级', 下一步: 'z', 顶回次数: 0 }] }, 11).账本;
  check('结算前: 尚无章节统计', 账.指标.章节统计.length, 0);
  check('本章累计: 埋设 1 / 受挫 1 / 冲突推进 1', [账.指标.本章累计.埋设数, 账.指标.本章累计.受挫数, 账.指标.本章累计.冲突推进数], [1, 1, 1]);
  check('张力历史每轮追加', 账.指标.张力历史.length, 2);

  // 章号 1 → 2: 旧章结算
  账 = 应用引擎输出(账, { 章回: 章(2), 上一幕节拍: '阴影' }, 12).账本;
  check('章号变化 → 旧章结算一条', 账.指标.章节统计.length, 1);
  check('结算内容: 章号', 账.指标.章节统计[0].章号, 1);
  check('结算内容: 埋设/受挫/推进', [账.指标.章节统计[0].埋设数, 账.指标.章节统计[0].受挫数, 账.指标.章节统计[0].冲突推进数], [1, 1, 1]);
  // 峰谷口径: 只由本章实际轮次产生(入章前的张力不当种子); 结算轮也属于旧章 —— 章回是这一轮才滚动的
  const 章一观测 = 账.指标.张力历史.slice(0, 3).map(项 => 项.值);
  check('结算内容: 张力峰谷', [账.指标.章节统计[0].张力峰, 账.指标.章节统计[0].张力谷], [Math.max(...章一观测), Math.min(...章一观测)]);
  check('累计器已重置为新章', 账.指标.本章累计.章号, 2);
  check('累计器清零', [账.指标.本章累计.埋设数, 账.指标.本章累计.受挫数], [0, 0]);

  // 幂等: 同一章号不会结算两次
  账 = 应用引擎输出(账, { 章回: 章(2, '已完结'), 上一幕节拍: '高潮' }, 13).账本;
  账 = 应用引擎输出(账, { 章回: 章(2, '已完结'), 上一幕节拍: '余波' }, 14).账本;
  check('同一章号只结算一次(幂等)', 账.指标.章节统计.filter(项 => 项.章号 === 2).length, 1);
  check('「已完结」也是结算触发面', 账.指标.章节统计.some(项 => 项.章号 === 2), true);

  // 有界 20 章
  for (let i = 3; i <= 27; i++) 账 = 应用引擎输出(账, { 章回: 章(i), 上一幕节拍: '阴影' }, 100 + i).账本;
  check('章节统计有界 20 章', 账.指标.章节统计.length, 20);
  check('最旧的被淘汰(保留最新 20 条 → 7..26)', 账.指标.章节统计[0].章号, 7);
  check('最新的留着', 账.指标.章节统计[19].章号, 26);
}

console.log('\n[K] 节拍/张力历史有界 40 轮, 核验只在「有上一幕指令」时累计');
{
  准备();
  let 账 = 账本({ 章回: 章(1) });
  for (let i = 1; i <= 45; i++) 账 = 应用引擎输出(账, { 章回: 章(1), 上一幕节拍: '阴影' }, i).账本;
  check('节拍历史有界 40', 账.指标.节拍历史.length, 40);
  check('张力历史有界 40', 账.指标.张力历史.length, 40);
  check('历史留下的是最新那批', 账.指标.张力历史[39].楼层, 45);
  check('冷启动没有指令 → 核验不虚增', [账.指标.核验.总, 账.指标.核验.未执行], [0, 0]);

  const 带指令 = { 编号: 1, 节拍: '阴影' as const, 硬性要求: '', 伏笔现场: '', 禁止事项: '', 生成楼层: 1, 核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [] };
  let 账2 = 账本({ 章回: 章(1), 当前指令: { ...带指令 } });
  账2 = 应用引擎输出(账2, { 章回: 章(1), 上一幕核验: { 已执行: true }, 上一幕节拍: '小胜' }, 2).账本;
  账2 = 应用引擎输出(账2, { 章回: 章(1), 上一幕核验: { 已执行: false }, 上一幕节拍: '受挫' }, 3).账本;
  账2 = 应用引擎输出(账2, { 章回: 章(1), 上一幕节拍: '阴影' }, 4).账本;
  check('核验累计: 3 轮都有上一幕指令可核验(指令未被替换前一直有效)', 账2.指标.核验.总, 3);
  // 纠偏: 缺省不再默认成功 —— 第 3 轮没写"上一幕核验"字段, 按未执行计。
  // (旧断言"缺省视为已执行"会让执行率永远虚高, 也永远发现不了"上一幕没演出来")
  check('核验累计: 未执行 2(第 2 轮明确 false + 第 3 轮缺省按未执行)', 账2.指标.核验.未执行, 2);
  const 已跳过 = { ...带指令, 已跳过: true };
  let 账3 = 账本({ 章回: 章(1), 当前指令: 已跳过 });
  账3 = 应用引擎输出(账3, { 章回: 章(1), 上一幕核验: { 已执行: false }, 上一幕节拍: '受挫' }, 5).账本;
  check('已跳过的指令不计入核验', 账3.指标.核验.总, 0);
}

console.log('\n[K] 判据: 五项可从指标账算出(无样本给 -1, 不用 0 冒充)');
{
  准备();
  check('空账本: 回收率无样本', 计算判据(账本()).伏笔回收率, -1);
  check('空账本: 执行率无样本', 计算判据(账本()).指令执行率, -1);
  const 有样本 = 账本({
    章回: 章(2),
    张力: { 当前: 7, 距上次高潮楼层: 0, 连续低张力: 0, 最近节拍: ['高潮'] },
    指标: {
      章节统计: [
        { 章号: 1, 埋设数: 4, 回收数: 3, 张力峰: 9, 张力谷: 1, 起伏次数: 3, 冲突推进数: 2, 受挫数: 2 },
        { 章号: 2, 埋设数: 2, 回收数: 0, 张力峰: 7, 张力谷: 2, 起伏次数: 1, 冲突推进数: 1, 受挫数: 0 },
      ],
      节拍历史: [{ 楼层: 1, 节拍: '阴影' }],
      张力历史: [
        { 楼层: 1, 值: 2 },
        { 楼层: 2, 值: 7 },
      ],
      核验: { 总: 4, 未执行: 1 },
      本章累计: { 章号: 3, 埋设数: 2, 回收数: 0, 张力峰: 7, 张力谷: 2, 起伏次数: 1, 冲突推进数: 1, 受挫数: 0 },
       累计埋设: 8,
       累计了结: 3,
       已了结编号: [1, 2, 3],
    },
  });
  const 判 = 计算判据(有样本);
  // 口径(P1 111% 修复后): 回收率 = **队列** 累计了结/累计埋设 —— 不再拿章节统计求和相除
  check('回收率 = 累计了结/累计埋设 = 3/8', 判.伏笔回收率, 0.375);
  check('执行率 = 1 - 1/4', 判.指令执行率, 0.75);
  check('冲突推进数 = 4(含本章累计)', 判.冲突推进数, 4);
  check('受挫次数 = 2', 判.受挫次数, 2);
  check('张力峰/谷', [判.张力峰, 判.张力谷], [9, 1]);
  check('波形取张力历史', 判.张力波形, [2, 7]);
  check('明细: 队列分子分母 + 章节活动量 + 核验 + 已结算章数', 判.明细, {
    埋设数: 8,
    回收数: 3,
    累计埋设: 8,
    累计了结: 3,
    章节活动埋设: 8,
    章节活动回收: 3,
    核验总: 4,
    核验未执行: 1,
    已结算章数: 2,
  });
}

console.log('\n[K] 零 AI 负担: 提示词不要求 AI 输出指标字段');
{
  ok('prompts.ts 里没有「指标」', !promptSource.includes('指标'));
  ok('prompts.ts 里没有「埋设章」', !promptSource.includes('埋设章'));
  // 2026-11-20（需求方 #507 ③）：原来是 `updateSource.includes('应用引擎输出') || true` ——
  // `|| true` 让条件**永真**。删掉它。
  ok('★ 账本数据.ts 由代码写入指标', updateSource.includes('应用引擎输出'),
     '账本数据.ts 里找不到「应用引擎输出」—— 可能改名或删了');
}

console.log('\n[F] 剧终停引擎: 不注入 / 自动路径跳过 / 双写 / 清除出口');
{
  准备();
  const 设置 = SettingsSchema.parse({});
  const 指令 = { 编号: 1, 节拍: '阴影' as const, 硬性要求: 'x', 伏笔现场: '', 禁止事项: '', 生成楼层: 9, 核验升级次数: 0, 已跳过: false, 代码调整: [], 档位: 3, 红线: [] };
  const 带指令 = (部分 = {}) => 账本({ 当前指令: { ...指令 }, 已分析轮数: 9, ...部分 });
  ok('正常 → 注入', 应注入的指令文本(带指令(), 设置, false).length > 0);
  check('已剧终 → 不注入', 应注入的指令文本(带指令({ 已剧终: true }), 设置, false), '');

  ok('入口 gate 判已剧终', indexSource.includes('已剧终') && indexSource.includes('自动路径整体跳过'));
  ok('推进管线 gate 判已剧终', updateSource.includes('已剧终') && updateSource.includes('不调引擎、不注入'));
  // 剧终撤条目: 旧版是"先判 已剧终 再 remove"; E1 修法改为统一 gate `要写`(enabled && 有事实 && !已剧终),
  // 且撤条目走"**所有候选都撤**"(清理别处的副本, 防漏掉回退期留下的陈旧副本)。
  // "剧终 ⇒ 撤条目"的行为断言在 tests/daoyan-e1.test.ts 里(真调 sync编剧备忘)。
  ok('事实层剧终撤条目', /要写[\s\S]{0,80}已剧终/.test(注入来源) && /if \(!要写\)[\s\S]{0,120}清理别处的副本/.test(注入来源));

  // 双写与回退: 账本侧被删楼回退, meta 侧仍在
  const p = 准备();
  p.addFloor(3);
  writeStateSnapshot(账本({ 章回: 章(1), 已剧终: true }), 3, 3, false);
  check('账本侧读到已剧终', loadData().已剧终, true);
  写已剧终(true);
  delete p.floors['3'];
  const 回退 = loadData();
  check('删楼回退后 meta 侧兜住已剧终', 回退.已剧终, true);
  check('账本本体确实回退了(章回没了)', 回退.章回, null);
  写已剧终(false);
  const p2 = 准备();
  p2.addFloor(4);
  writeStateSnapshot(账本({ 章回: 章(1) }), 4, 4, false);
  check('清除已剧终后可继续(未剧终)', loadData().已剧终, false);
  ok('面板留清除出口', vueSource.includes('清除已剧终'));
  ok('剧终结算有二次确认', vueSource.includes('确认剧终结算') && vueSource.includes('待确认剧终'));
}

import 注入来源 from '../src/剧情导演/注入.ts?raw';

console.log('\n[H] 接口健康检查: 三空校验分类');
{
  准备();
  check('地址空 → 地址未配置', 诊断接口配置({ 地址: '', 密钥: 'k', 模型: 'm' }).类别, '地址未配置');
  check('三空 → 先报地址', 诊断接口配置({}).类别, '地址未配置');
  check('密钥空 → 密钥未配置(R0 根因)', 诊断接口配置({ 地址: 'https://x/v1', 密钥: '', 模型: 'm' }).类别, '密钥未配置');
  check('模型空 → 模型未选择', 诊断接口配置({ 地址: 'https://x/v1', 密钥: 'k', 模型: '' }).类别, '模型未选择');
  check('地址不合法', 诊断接口配置({ 地址: 'x/v1', 密钥: 'k', 模型: 'm' }).类别, '地址不合法');
  check('三空校验: 齐备才可用', 诊断接口配置({ 地址: 'https://x/v1', 密钥: 'k', 模型: 'm' }).可用, true);
  ok('推进前拦截(密钥空不发请求)', updateSource.includes('诊断接口配置') && updateSource.includes('接口未配置完成'));
  ok('设置页接口区标红提示', vueSource.includes('接口诊断') && vueSource.includes('dj-err-line'));
  ok('面板有「测试连接」按钮', vueSource.includes('测试连接'));
  ok('max_token 不擅自改小(回退 ≥16384)', vueSource.includes('16384'));
}

console.log('\n[H] 错误分类: 密钥错 / 地址错 / 参数错 / 超时 / 正文空');
{
  check('401 → 密钥错', 分类接口错误('接口返回错误: 401 Unauthorized').类别, '密钥错');
  check('404 → 地址错', 分类接口错误('接口返回错误: 404 not found').类别, '地址错');
  check('400 max_tokens → 参数错', 分类接口错误('接口返回错误: 400 invalid max_tokens value').类别, '参数错');
  check('超时 → 超时', 分类接口错误('生成超时(可能是模型思维链/推理过长)').类别, '超时');
  check('正文空 → 正文空(与接口错区分开)', 分类接口错误('响应中没有找到有效的正文内容(模型=m, 最大token=512)。可能是推理模型把最大输出Token用尽(无正文)').类别, '正文空');
}

console.log('\n[H] 测试连接: 三分支(正常 / 推理模型吃满小预算 / 端点拒绝 max_token)');
{
  const 配置 = { 地址: 'https://x/v1', 密钥: 'k', 模型: 'm', 最大token: 60000 };
  const p = 准备({ 接口: 配置 });

  // ① 正常: 小预算就返回正文
  injectHostForTest({ ...p.host, model: { raw: async () => '就绪', list: async () => [], stop: () => true } } as any);
  resetSettingsReadCacheForTest();
  let 结果 = await 测试连接();
  check('正常: 可用', 结果.可用, true);
  check('正常: 类别', 结果.类别, '正常');

  // ② 推理模型: 小预算正文空, 满预算有正文 → 可用 + 提示"推理模型"(不是接口错)
  injectHostForTest({
    ...p.host,
    model: { raw: async (cfg: any) => {
      if (cfg?.custom_api?.max_tokens <= 512) throw Error('响应中没有找到有效的正文内容(空)');
      return '就绪';
    }, list: async () => [], stop: () => true },
  } as any);
  resetSettingsReadCacheForTest();
  结果 = await 测试连接();
  check('推理模型: 判为可用', 结果.可用, true);
  ok('推理模型: 提示里点明推理模型', 结果.提示.includes('推理模型'));
  ok('推理模型: 明确不许改小', 结果.提示.includes('不要调小'));
  check('推理模型: 两步探测都有记录', 结果.探测.length, 3);

  // ③ 端点拒绝 max_token → 参数错(明确提示调小)
  injectHostForTest({
    ...p.host,
    model: { raw: async (cfg: any) => {
      if (cfg?.custom_api?.max_tokens > 512) throw Error('接口返回错误: 400 invalid max_tokens (maximum context)');
      throw Error('响应中没有找到有效的正文内容(空)');
    }, list: async () => [], stop: () => true },
  } as any);
  resetSettingsReadCacheForTest();
  结果 = await 测试连接();
  check('端点拒绝: 不可用', 结果.可用, false);
  check('端点拒绝: 类别=参数错', 结果.类别, '参数错');
  ok('端点拒绝: 提示回退值 ≥16384', 结果.提示.includes('16384'));

  // ④ 密钥错直接报出(不再静默 401)
  injectHostForTest({
    ...p.host,
    model: { raw: async () => { throw Error('接口返回错误: 401 Unauthorized (invalid api key)'); }, list: async () => [], stop: () => true },
  } as any);
  resetSettingsReadCacheForTest();
  结果 = await 测试连接();
  check('密钥错: 类别', 结果.类别, '密钥错');
  check('密钥错: 不做第二步探测', 结果.探测.length, 2);
}

console.log('\n[I] 熔断: 连败 3 次自动暂停 / 成功清零 / 失败计数不丢');
{
  准备();
  check('初始: 无连败', [读离线状态().连败次数, 读离线状态().自动暂停], [0, false]);
  记推进失败('第一次');
  记推进失败('第二次');
  check('连败累计 2', 读离线状态().连败次数, 2);
  check('未达阈值: 不暂停', 读离线状态().自动暂停, false);
  const 三 = 记推进失败('第三次');
  check('连败 3: 触发自动暂停', [三.连败次数, 三.自动暂停], [3, true]);
  check('保留最后失败原因与时间', [三.最后失败原因, 三.最后失败时间 > 0], ['第三次', true]);

  // 失败计数不丢: 它不在账本快照里(删楼回退带不走), 所以要在**同一份 chat 变量**的平台上复现
  const p = 准备();
  记推进失败('甲');
  记推进失败('乙');
  记推进失败('丙');
  p.addFloor(7);
  writeStateSnapshot(账本({ 章回: 章(1) }), 7, 7, false);
  delete p.floors['7'];
  check('删楼回退后连败计数仍在(存 chat meta, 不在快照)', 读离线状态().连败次数, 3);
  check('同一平台上账本确实回退了(章回没了)', loadData().章回, null);

  check('面板可手动恢复', 设自动暂停(false).自动暂停, false);
  check('恢复即清零', 读离线状态().连败次数, 0);
  记推进失败('又一次');
  清推进失败();
  check('推进成功 → 清零(成功清零)', [读离线状态().连败次数, 读离线状态().自动暂停], [0, false]);
}

console.log('\n[I] 状态条三态 + 优先级高于冷启动(故障不得再被冷启动伪装)');
{
  ok('面板有状态条', vueSource.includes('状态条'));
  ok('三态: 冷启动攒轮', 运行状态源码.includes('冷启动攒轮'));
  ok('三态: 引擎离线(原因+时间+连败)', 运行状态源码.includes('引擎离线') && 运行状态源码.includes('最后失败原因'));
  ok('三态: 运行中·上次编排成功于 #某楼', 运行状态源码.includes('上次编排成功于'));
  ok('离线态先于冷启动判定(优先级)', 运行状态源码.indexOf('自动暂停') < 运行状态源码.indexOf('冷启动攒轮'));
  ok('已剧终态也在状态条里', vueSource.includes('已剧终'));
  ok('运行中 gate 用 meta 熔断', indexSource.includes('读离线状态') && updateSource.includes('读离线状态'));
  ok('失败写 meta / 成功清零都在推进管线里', updateSource.includes('记推进失败') && updateSource.includes('清推进失败'));
}

console.log('\n[K] 审查三条的行为用例: 消亡算回收 / 埋设回收并入本章累计 / 空窗轮事件不丢');
{
  准备();
  // F1: 回收口径 = 已了结(引爆 or 消亡)
  // 指标: undefined = **真·老账本形态**(完全没有指标账, 更没有队列计数器) → 装载时用现存伏笔播种。
  // 不用 emptyData() 自带的 空指标()(它带的是**显式 0**, 语义上等于"新代码跑过且计数就是 0", 不会播种)。
  let 账 = 账本({ 章回: 章(1), 伏笔: [{ 编号: 1, 内容: 'A', 埋设层: 1, 埋设章: 1, 状态: '埋下', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2, 指标: undefined as any });
  // 阶段 A 起「已引爆」必须有可用兑现证据, 否则代码降级为「待兑现」(见 证据链.守卫伏笔状态)。
  // 消亡不要求兑现证据(它是世界内原因, 不是回收), 所以这条用例走**消亡**口径 —— 与它的标题一致。
  账 = 应用引擎输出(账, { 章回: 章(1), 伏笔: [{ 编号: 1, 内容: 'A', 状态: '已消亡', 回收窗口: '', 关联冲突: '' }], 上一幕节拍: '阴影' }, 2).账本;
  check('F1: 消亡计入回收数', 账.指标.本章累计.回收数, 1);
  check('F1: 埋设计数不受影响', 账.指标.本章累计.埋设数, 0);
  check('F1: 消亡条目归档进历史档案(不再占活跃工作集)', [账.伏笔.length, 账.历史档案.伏笔.length], [0, 1]);

  // F2: 单章未结算期(10 轮试水的真实形态)判据照样能算。
  // P1 111% 修复后: 分子分母取**队列**计数器(这里被迁移播种了: 现存 1 条伏笔 → 埋设 1), 不取章节活动量。
  const 判 = 计算判据(账);
  check('F2: 单章期 分母来自队列(迁移播种: 现存 1 条)', 判.明细.埋设数, 1);
  check('F2: 单章期 分子来自队列(累计了结 1)', 判.明细.回收数, 1);
  check('F2: 历史条目也进分母 → 回收率 1/1 = 100%(不再是 0/1)', 判.伏笔回收率, 1);
  check('F2: 章节活动口径单独保留(埋 0 收 1)', [判.明细.章节活动埋设, 判.明细.章节活动回收], [0, 1]);

  // F2': 埋设了 1 条、未回收 → 单章期回收率 0, 不是 -1
  let 账b = 应用引擎输出(账本({ 章回: 章(1) }), { 章回: 章(1), 伏笔: [{ 内容: '线头', 状态: '埋下' }], 上一幕节拍: '阴影' }, 2).账本;
  check('F2: 单章埋 1 收 0 → 回收率 0(样本存在)', 计算判据(账b).伏笔回收率, 0);

  // F3: 章已完结但引擎还没开新章 → 空窗轮事件攒在"待开新章"桶, 开新章时补章号并入
  let 账2 = 账本({ 章回: 章(1) });
  账2 = 应用引擎输出(账2, { 章回: 章(1, '已完结'), 上一幕节拍: '高潮' }, 2).账本;
  check('F3: 第 1 章已结算', 账2.指标.章节统计.length, 1);
  check('F3: 结算后累计器切到待开新章(章号 0)', 账2.指标.本章累计.章号, 0);
  账2 = 应用引擎输出(账2, { 章回: 章(1, '已完结'), 伏笔: [{ 内容: '空窗期新埋的线', 状态: '埋下' }], 上一幕节拍: '受挫' }, 3).账本;
  check('F3: 空窗轮事件攒在待开新章桶里', [账2.指标.本章累计.埋设数, 账2.指标.本章累计.受挫数], [1, 1]);
  账2 = 应用引擎输出(账2, { 章回: 章(2), 上一幕节拍: '阴影' }, 4).账本;
  check('F3: 新章补章号(不重置丢弃)', 账2.指标.本章累计.章号, 2);
  check('F3: 空窗轮事件并入新章', [账2.指标.本章累计.埋设数, 账2.指标.本章累计.受挫数], [1, 1]);
  check('F3: 第 1 章不被重复结算', 账2.指标.章节统计.filter(项 => 项.章号 === 1).length, 1);

  // F3 守卫: 一个缺 章回 字段的载荷不会误判结算, 也不会清掉累计
  let 账3 = 账本({ 章回: 章(1) });
  账3 = 应用引擎输出(账3, { 上一幕节拍: '受挫' }, 5).账本;
  check('F3: 缺 章回 载荷不结算进行中的章', 账3.指标.章节统计.length, 0);
  账3 = 应用引擎输出(账3, { 章回: 章(1), 上一幕节拍: '阴影' }, 6).账本;
  check('F3: 章回来后累计仍在(没被重建清掉)', 账3.指标.本章累计.受挫数, 1);
}

console.log('\n[K] 未观测哨兵: 「未观测」不用 0 冒充(否则每章谷值被初值 0 污染)');
{
  准备();
  let 账 = 账本({ 章回: 章(1) });
  const 观测: number[] = [];
  账 = 应用引擎输出(账, { 章回: 章(1), 上一幕节拍: '阴影' }, 2).账本;
  观测.push(账.张力.当前);
  账 = 应用引擎输出(账, { 章回: 章(1), 上一幕节拍: '高潮' }, 3).账本;
  观测.push(账.张力.当前);
  check('本章实测张力序列(阴影+1 → 1, 高潮+4 → 5)', 观测, [1, 5]);
  check('孤章未结算: 峰/谷 = 本章实测极值', [计算判据(账).张力峰, 计算判据(账).张力谷], [Math.max(...观测), Math.min(...观测)]);
  check('谷 = 1, 没被"未观测"的 0 拉低', 计算判据(账).张力谷, 1);
  check('空账本: 峰谷 = -1(未观测, 面板显示「—」)', [计算判据(账本()).张力峰, 计算判据(账本()).张力谷], [-1, -1]);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
