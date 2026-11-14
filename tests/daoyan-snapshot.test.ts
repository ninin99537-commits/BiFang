// 剧情导演 · 存储层 / 删楼三场景 —— C8 + C10
// 快照.ts 通过可替换宿主访问平台, 不装酒馆也能跑: 写读快照 / 删尾楼回退 / 删超窗口归零 /
// 保留份数默认 30 与可调 / 修笔落盘 / 清空层。
import { createPinia, setActivePinia } from 'pinia';
import type { 导演账本 } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { resetSettingsReadCacheForTest } from '../src/剧情导演/settings';
import { clearAllData, emptyData, loadData, saveData, SNAPSHOT_LIMIT, STORAGE_KEY, writeStateSnapshot } from '../src/剧情导演/快照';
import { sanitizeSnapshot, 快照载荷, 账本字段表 } from '../src/剧情导演/账本迁移';
import 快照源 from '../src/剧情导演/快照.ts?raw';
import 账本迁移源 from '../src/剧情导演/账本迁移.ts?raw';

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
  const deleted: string[] = [];
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
        deleted.push(id);
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
    deleted,
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

console.log('\n[C8] 空聊天 → 空账本, 不往聊天变量写垃圾');
{
  const p = 准备();
  const d = loadData();
  check('锚点楼层 = -1', d.锚点楼层, -1);
  check('四本账为空', [d.章回, d.伏笔, d.冲突, d.弧线, d.当前指令], [null, [], [], [], null]);
  check('聊天变量未写', p.chatVars(), {});
}

console.log('\n[C6] 写快照 → 读回一致, 且含「当前指令」本体');
{
  const p = 准备();
  p.addFloor(5);
  const data = 账本({
    // 2026-11-13 P0: 收束起始场 登记进字段表后，读回会补默认 0（它不是丢数据，是规范化）
    章回: { 章号: 2, 主题: '夺嫡', 计划高潮: '朝堂对峙', 进度: '推进', 收束起始场: 0 },
    伏笔: [{ 编号: 3, 内容: '缺角的玉佩', 埋设层: 2, 埋设章: 2, 状态: '发酵', 回收窗口: '第3章收束前', 关联冲突: '夺嫡' }],
    // 同上: 最后行动幕/最后行动天 登记后读回补默认 0
    冲突: [{ 名: '夺嫡', 对立面: '二皇子', 赌注: '继承权', 强度: 6, 阶段: '升级', 下一步: '逼宫', 顶回次数: 0, 最后行动幕: 0, 最后行动天: 0 }],
    弧线: [{ 角色: '主角', 缺口: '优柔寡断', 阶段: '启程', 下一步契机: '师门变故' }],
    当前指令: { 编号: 4, 节拍: '受挫', 硬性要求: '计划失败', 伏笔现场: '#3 兑现', 禁止事项: '不许解决', 生成楼层: 5, 核验升级次数: 1, 已跳过: false, 代码调整: ['张力曲线：安排喘息幕'], 档位: 3, 红线: ['主角不死'], 本幕揭示: ['揭示一', '揭示二'], 必须保留: ['【红线】主角不死(高于一切, 不得触碰)'] },
    张力: { 当前: 6, 距上次高潮楼层: 1, 连续低张力: 0, 最近节拍: ['受挫', '反转'] },
    下一伏笔编号: 4,
    下一指令编号: 5,
    已分析轮数: 7,
    统计: { 引擎调用次数: 7, 最后调用: 111 },
    处理到楼层: 5,
    清空层: 3,
  });
  check('写入成功', writeStateSnapshot(data, 5, 5, true), true);
  const back = loadData();
  check('章回读回一致', back.章回, data.章回);
  // 阶段 A 起伏笔带证据链字段(公开线头/幕后真相/埋设证据…): 断言**旧字段逐字保留**,
  // 新字段由规范化补默认值(这是结构升级, 不是内容丢失)
  const 只取旧字段 = (条: any) => ({
    编号: 条.编号,
    内容: 条.内容,
    埋设层: 条.埋设层,
    埋设章: 条.埋设章,
    状态: 条.状态,
    回收窗口: 条.回收窗口,
    关联冲突: 条.关联冲突,
  });
  check('伏笔旧字段读回一致', back.伏笔.map(只取旧字段), data.伏笔.map(只取旧字段));
  check('伏笔新结构已补齐(证据链默认空)', [Array.isArray(back.伏笔[0].埋设证据), Array.isArray(back.伏笔[0].中间回响), Array.isArray(back.伏笔[0].兑现证据)], [true, true, true]);
  check('冲突读回一致', back.冲突, data.冲突);
  // 纠偏: 迁移曾丢掉 `本幕揭示` / `必须保留` —— 删楼回退重载后演员的硬约束会凭空消失。
  // 这里断言旧字段逐字保留, 且两个新字段**真的被重建**(不是默认空)。
  const 只取指令旧字段 = (条: any) => ({
    编号: 条.编号,
    节拍: 条.节拍,
    硬性要求: 条.硬性要求,
    伏笔现场: 条.伏笔现场,
    禁止事项: 条.禁止事项,
    生成楼层: 条.生成楼层,
    核验升级次数: 条.核验升级次数,
    已跳过: 条.已跳过,
    代码调整: 条.代码调整,
    档位: 条.档位,
    红线: 条.红线,
  });
  check('当前指令旧字段读回一致(核验依据)', 只取指令旧字段(back.当前指令), 只取指令旧字段(data.当前指令));
  check('当前指令的「本幕揭示」读回保留(纠偏: 迁移不再丢)', back.当前指令?.本幕揭示, ['揭示一', '揭示二']);
  check('当前指令的「必须保留」读回保留(纠偏)', back.当前指令?.必须保留, ['【红线】主角不死(高于一切, 不得触碰)']);
  check('张力读回一致', back.张力, data.张力);
  check('进度/发号器读回', [back.下一伏笔编号, back.下一指令编号, back.已分析轮数], [4, 5, 7]);
  check('清空层被本次写入消费', back.清空层, 0);
  check('快照按键写入楼层变量', p.floorVars['5'][STORAGE_KEY].楼层, 5);
}

console.log('\n[C10 场景1] 删尾楼 = 账本精确回退到更早快照');
{
  const p = 准备();
  p.addFloor(3);
  p.addFloor(7);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: '起', 计划高潮: '', 进度: '铺垫' }, 伏笔: [{ 编号: 1, 内容: '老线头', 埋设层: 1, 状态: '埋下', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2 }), 3, 3, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: '夺嫡', 计划高潮: '', 进度: '推进' }, 伏笔: [{ 编号: 1, 内容: '老线头', 埋设层: 1, 状态: '已引爆', 回收窗口: '', 关联冲突: '' }], 下一伏笔编号: 2 }), 7, 7, false);
  check('当前读到最新快照', loadData().章回?.章号, 2);
  delete p.floors['7'];
  const back = loadData();
  check('删尾楼 → 章回回退', back.章回?.章号, 1);
  check('伏笔状态也跟着回退', back.伏笔[0].状态, '埋下');
  check('锚点回退', back.锚点楼层, 3);
  check('失效索引被清', p.chatVars()[STORAGE_KEY].快照楼层, [3]);
}

console.log('\n[C10 场景2] 删超窗口(锚点被裁光) → 账本归零, 重新冷启动');
{
  const p = 准备({ 导演: { 快照保留份数: 2 } });
  p.addFloor(1);
  p.addFloor(2);
  p.addFloor(3);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: 'a', 计划高潮: '', 进度: '铺垫' } }), 1, 1, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: 'b', 计划高潮: '', 进度: '铺垫' } }), 2, 2, false);
  writeStateSnapshot(账本({ 章回: { 章号: 3, 主题: 'c', 计划高潮: '', 进度: '铺垫' } }), 3, 3, false);
  check('保留份数=2: 只留最新两层', p.chatVars()[STORAGE_KEY].快照楼层, [2, 3]);
  // 把全部锚点楼层删光
  delete p.floors['2'];
  delete p.floors['3'];
  const back = loadData();
  check('锚点归零 = -1', back.锚点楼层, -1);
  check('章回归零(重新冷启动)', back.章回, null);
  check('索引被清空', p.chatVars()[STORAGE_KEY].快照楼层, []);
}

console.log(`\n[C10] 快照保留份数: 默认 ${SNAPSHOT_LIMIT}(=30), 可调 1~100`);
{
  const p = 准备();
  for (let i = 1; i <= SNAPSHOT_LIMIT + 2; i++) p.addFloor(i);
  for (let i = 1; i <= SNAPSHOT_LIMIT + 2; i++) writeStateSnapshot(账本({ 章回: { 章号: i, 主题: `t${i}`, 计划高潮: '', 进度: '铺垫' } }), i, i, false);
  check('默认保留 30 份', p.chatVars()[STORAGE_KEY].快照楼层.length, SNAPSHOT_LIMIT);
  check('最早两层被物理删除', p.deleted, ['1', '2']);

  const p2 = 准备({ 导演: { 快照保留份数: 3 } });
  for (let i = 1; i <= 5; i++) p2.addFloor(i);
  for (let i = 1; i <= 5; i++) writeStateSnapshot(账本({ 章回: { 章号: i, 主题: `t${i}`, 计划高潮: '', 进度: '铺垫' } }), i, i, false);
  check('可调为 3 份', p2.chatVars()[STORAGE_KEY].快照楼层, [3, 4, 5]);
}

console.log('\n[C10] 面板修笔: saveData 写回**原锚点**, 不挪到最新楼, 不改进度(2026-11-11)');
{
  const p = 准备();
  p.addFloor(1);
  p.addFloor(6);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: '旧', 计划高潮: '', 进度: '铺垫' } }), 1, 1, false);
  const 修 = loadData();
  check('读回来的锚点 = 1', 修.锚点楼层, 1);
  修.章回 = { 章号: 9, 主题: '手改', 计划高潮: '', 进度: '收束' };
  check('saveData 成功', saveData(修), true);
  const back = loadData();
  check('修笔内容已保存', back.章回?.主题, '手改');
  // 以前这里写的是"锚点 = 最新楼层(6)" —— 那会让「重新推进」以为 6 楼推过(撤掉重来),
  // 也会让删楼回退的粒度错位。手改只改内容, 不改"这次编排算在哪一楼"。
  check('锚点仍是原锚点(1), 没被挪到最新楼', back.锚点楼层, 1);
  check('最新楼(6) 没有被写进快照索引', p.chatVars()[STORAGE_KEY].快照楼层, [1]);
  // 反面对照: 从没推进过(锚点 -1) → 才用最新楼占位, 否则手改白丢
  const p2 = 准备();
  p2.addFloor(1);
  p2.addFloor(6);
  const 空账 = 账本({ 章回: { 章号: 1, 主题: '手改', 计划高潮: '', 进度: '铺垫' } });
  check('没锚点时也能存', saveData(空账), true);
  check('落到最新楼', p2.chatVars()[STORAGE_KEY].快照楼层, [6]);
}

console.log('\n[C8] 清空: 物理删快照 + 重置元数据 + 记录清空层');
{
  const p = 准备();
  p.addFloor(2);
  p.addFloor(9);
  writeStateSnapshot(账本({ 章回: { 章号: 1, 主题: 'a', 计划高潮: '', 进度: '铺垫' } }), 2, 2, false);
  writeStateSnapshot(账本({ 章回: { 章号: 2, 主题: 'b', 计划高潮: '', 进度: '铺垫' } }), 9, 9, false);
  const layer = clearAllData();
  check('清空层 = 最后楼层', layer, 9);
  check('快照被物理删除', p.deleted, ['2', '9']);
  check('清空后读到空账本', loadData().章回, null);
  check('清空层仍生效', loadData().清空层, 9);
}

// ---------------------------------------------------------------------------
// C11 往返完整性(2026-11-11 自查): "存了没读"与"读了没存"都等于静默丢字段
// ---------------------------------------------------------------------------
console.log('\n[C11] 快照往返完整性: 表里每个字段都要"存得下、读得回"');
{
  // 2026-11-12(架构深化 ①): 这条以前是**正则扫两份源码**对账(payload 的键 vs `data.X =` 的键)。
  // 那时字段名单有六份, 只能这样兜着。现在字段只有一处声明(`账本字段表`), 所以改成**行为**往返:
  // 造一份每个字段都有值的账本 → 存 → 读回 → 再存 → 两轮逐字相同。
  // 这比"两边都提到了这个名字"强: 它证明的是"读回来的值没走样"。
  check('字段表至少有 25 个字段(防表被删空)', 账本字段表.length >= 25, true);
  // 真正的"加字段"闸门: emptyData 里出现了表里没有的键 = 你加了字段但没登记它的存/读规则,
  // 那条字段会**存进快照却读不回来**(或反过来)。运行时三兄弟不在快照里, 明确排除。
  const 运行时字段 = new Set(['版本', '锚点楼层', '处理到楼层', '清空层']);
  check(
    'emptyData 的每个键都在字段表里(加字段忘了登记会红)',
    Object.keys(emptyData()).filter(k => !运行时字段.has(k) && !账本字段表.some(行 => 行.键 === k)),
    [],
  );

  const 账 = emptyData();
  账.章回 = { 章号: 2, 主题: 'T', 计划高潮: 'H', 进度: '推进', 幕纲: ['第1幕｜类型: 事件'], 当前幕号: 1, 起始场: 5 } as any;
  账.伏笔 = [{ 编号: 1, 内容: '线头', 状态: '埋下', 埋设章: 0 } as any];
  账.冲突 = [{ 名: '北坡威胁', 阶段: '升级' } as any];
  账.弧线 = [{ 角色: 'A', 缺口: 'g' } as any];
  账.角色命运 = [{ 角色ID: 'A', 状态: '活跃' } as any];
  账.待读队列 = [{ 记忆引用: 'AM0001', 理由: 'r', 目标: 't', 入队楼层: 3, 已读次数: 0 } as any];
  账.记忆审计 = { 楼层: 1, 请求条数: 2, 读到条数: 2, 缺失: [], 歧义: [], 索引外: [], 扫描书: ['书'], 索引条数: 9, 纪要字数: 99, 失败原因: '', 时间: 5 } as any;
  账.代价 = [{ 楼层: 1, 章号: 1, 内容: '代价', 核验: '已核' } as any];
  账.连胜无代价 = 3;
  账.读者领先 = [{ 事项: 'x', 哪些角色还不知道: ['B'], 建立幕: 1, 最后更新幕: 2 } as any];
  账.当前节拍 = { 节拍: '受挫', 已持续轮: 2 };
  账.世界时间 = { 天数: 1.5, 文本: '第2天 傍晚' };
  账.书纲 = { 核心问题: '该不该救人' } as any;
  账.反转记录 = [{ 场: 1, 类型: '身份揭露' } as any];
  账.续演视角 = 'B';
  账.当前视角 = 'A';
  账.当前指令 = { 编号: 4, 节拍: '高潮', 硬性要求: '打起来' } as any;
  账.张力 = { 当前: 5, 距上次高潮楼层: 2, 连续低张力: 1, 最近节拍: ['受挫'] };
  账.已剧终 = false;
  账.收官请求 = true; // 用 true 才能验出"它真的进快照了"(false 与默认值分不开)
  账.下一伏笔编号 = 2;
  账.下一指令编号 = 5;
  账.已分析轮数 = 9;
  账.平静场数 = 3;
  账.终局步 = 2;
  账.待决死亡 = true;
  账.死亡抉择 = '视角转移';
  账.统计 = { 引擎调用次数: 3, 最后调用: 7 };

  const 规范 = sanitizeSnapshot(账 as any); // 先让它变成"规范形状", 再验幂等
  const 一 = 快照载荷(规范);
  for (const 行 of 账本字段表) ok(`payload 里有「${行.键}」`, 行.键 in 一);
  const 二 = 快照载荷(sanitizeSnapshot(一));
  check('存 → 读 → 存, 两轮逐字相同(幂等)', 二, 一);
  // 逐字段点名: 万一某行读回时被清空, 这里的差异会直接指出是哪个字段
  for (const 行 of 账本字段表) check(`读回来没走样: ${行.键}`, (二 as any)[行.键], (一 as any)[行.键]);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);if (fail > 0) process.exit(1);
