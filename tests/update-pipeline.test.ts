// 彼方 · 更新主流程(=候选2 的安全网) —— 用假平台 + 假模型把整条流水线跑通
//
// 更新主流程以前一条用例都没有: 它要聊天楼层、变量表、世界书、模型接口四样东西齐备才能跑,
// 所以拆它之前先在这里把"能观察到的行为"钉住:
//   成功一轮 → 状态落进聊天变量与新楼层快照、提示文案、统计;
//   模型第一次输出坏 JSON → 带着错误原因重试一次就成功;
//   三次都坏 → 报错提示, 且**数据一个字段都不许动**;
//   接口没配置 / 没有可分析的回复 → 提前退出, 一次模型都不调;
//   关闭自动建档 → 新角色不建档, 也不计入"已更新"。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import { emptyData, writeStateSnapshot } from '../src/彼方_NPC幕后生命状态系统/快照';
import { useStateStore } from '../src/彼方_NPC幕后生命状态系统/数据仓';
import { useDebugStore } from '../src/彼方_NPC幕后生命状态系统/日志仓';
import { updateNpcStates } from '../src/彼方_NPC幕后生命状态系统/update';

const SETTINGS_KEY = '彼方_settings';

// settings.ts 用酒馆注入的 `_` 与浏览器 localStorage; 流水线里还用到 _.cloneDeep(深拷贝旧卡)
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

/** 一份能跑通的彼方模型输出: NPC 名字直接在顶层(现在提示词要求的形式),
 *  剧情时间是 {开始, 结束} 对象(页面提示词里的标准格式)。更新已有 NPC 只要核心三字段。 */
const 正常输出 = JSON.stringify({
  剧情时间: { 开始: '2025-11-15 19:20', 结束: '2025-11-15 19:25' },
  爱丽丝: { 当前在做: '整理书架', 位置: '书房', 当前状态: '专注' },
});

interface 造平台选项 {
  设置?: any;
  /** 模型逐次返回的内容; 用完就重复最后一个 */
  生成序列?: string[];
  楼层?: Record<string, any>;
}

/** 假平台: 聊天楼层 + 变量表 + 人物卡 + 世界书 + 模型接口, 全部记账, 不碰酒馆。
 *  提示条不在这里断言: toast.ts 是自己往父窗口文档里画 DOM 的, node 里没有那个文档,
 *  提示会被静默丢弃 —— 所以用户可见的结果改用"日志页记录 + 数据本身"来观察。 */
function 造平台(选项: 造平台选项 = {}) {
  const 记录 = { raw: [] as any[] };
  const floors: Record<string, any> = {
    '1': { role: 'assistant', message: '第一楼: 爱丽丝在书房整理账本。', is_hidden: false },
    ...(选项.楼层 ?? {}),
  };
  const floorVars: Record<string, any> = {};
  let chatVars: Record<string, any> = {};
  全局设置 = 选项.设置 ?? {
    接口: { 地址: 'https://example.invalid/v1', 模型: 'test-model', 密钥: 'k', 最大token: 2048 },
    更新: { 读取最近回复数: 3, 注入世界书: false, 注入世界书条目: false, 自动建档: true, 生理监测: false },
    标签: { 列表: [], 模式: '排除' },
  };
  let 第几次 = 0;

  const host: any = {
    vars: {
      scriptId: () => 'script-1',
      get(option: any) {
        if (option.type === 'chat')
          return chatVars;
        if (option.type === 'global')
          return { [SETTINGS_KEY]: 全局设置 };
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
        if (option.type === 'global') {
          全局设置 = updater({ [SETTINGS_KEY]: 全局设置 })?.[SETTINGS_KEY] ?? 全局设置;
          return { [SETTINGS_KEY]: 全局设置 };
        }
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
        if (floorVars[id])
          delete floorVars[id][path];
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
      async create() { return 0; },
    },
    persona: {
      name: () => '主角',
      description: () => '主角设定描述',
    },
    worldbook: {
      boundNames: () => ({ primary: '测试世界书', additional: [] }),
      chatName: () => null,
      entries: async () => [],
      create: async () => {},
      update: async () => {},
      remove: async () => {},
    },
    model: {
      list: async () => ['test-model'],
      raw: async (配置: any) => {
        记录.raw.push(配置);
        const 序列 = 选项.生成序列 ?? [正常输出];
        const 项: any = 序列[Math.min(第几次, 序列.length - 1)];
        第几次++;
        // 序列里放 { 抛错: '...' } 表示这一次请求直接失败(网络/超时那一路)
        if (项 && typeof 项 === 'object')
          throw new Error(String(项.抛错));
        return 项;
      },
      stop: () => true,
    },
  };

  return {
    host,
    记录,
    floors,
    floorVars,
    chatVars: () => chatVars,
    addFloor(id: number, message: string, role = 'assistant') {
      floors[String(id)] = { role, message, is_hidden: false };
    },
  };
}
let 全局设置: any = {};

/** 把初始状态落到 1 楼(既写聊天变量也写楼层快照, 和真实保存路径一致) */
async function 播种(含爱丽丝: any = { 当前在做: '整理账本', 位置: '书房', 当前状态: '平静' }) {
  const 初始 = {
    ...emptyData(),
    名单: ['爱丽丝'],
    NPC: { 爱丽丝: { ...含爱丽丝, 最后更新: 1 } },
    处理到楼层: 1,
  };
  writeStateSnapshot(初始, 1, 1, false);
  return 初始;
}
const 取状态 = () => useStateStore().data;
const 取日志 = () => useDebugStore().log as any;

console.log('\n[1] 成功一轮: 状态写进新楼层快照, 提示与统计都对');
{
  const p = 造平台();
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  await 播种();
  p.addFloor(3, '第三楼: 爱丽丝把账本收好, 从书架上取了一本书。');

  await updateNpcStates(true);

  const 状态: any = 取状态();
  check('NPC 的字段按模型输出更新', [状态.NPC['爱丽丝']['当前在做'], 状态.NPC['爱丽丝']['位置']], ['整理书架', '书房']);
  check('处理到楼层 = 锚点楼层', 状态.处理到楼层, 3);
  check('清空层归零', 状态.清空层, 0);
  ok('锚点楼层快照已写入楼层变量', Object.keys(p.floorVars['3'] ?? {}).length > 0);
  ok('快照里就是新状态', JSON.stringify(p.floorVars['3'] ?? {}).includes('整理书架'));
  ok('聊天变量里存的是快照索引(数据本身只在楼层快照里)', Array.isArray(p.chatVars()['彼方']?.快照楼层));
  check('日志页记下"已更新的 NPC"', 取日志().updatedNpcs, ['爱丽丝']);
  check('只调了一次模型', p.记录.raw.length, 1);
}

console.log('\n[2] 接口出错(网络/超时) → 自动重试, 第二次成功');
{
  const p = 造平台({ 生成序列: [{ 抛错: '网络超时' }, 正常输出] });
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  await 播种();
  p.addFloor(3, '第三楼正文');

  await updateNpcStates(true);

  check('调了两次模型', p.记录.raw.length, 2);
  ok('接口出错没有可回喂的输出, 第二次请求不带"上次输出"那段', !JSON.stringify(p.记录.raw[1] ?? '').includes('上次输出不符合要求'));
  check('这次成功', 取日志().updatedNpcs, ['爱丽丝']);
  check('数据照常更新', (取状态() as any).NPC['爱丽丝']['当前在做'], '整理书架');
}

console.log('\n[3] 输出不是 JSON → 带着错误原因重试, 第二次成功');
{
  const p = 造平台({ 生成序列: ['爱丽丝在整理书架, 但我没有输出 JSON', 正常输出] });
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  await 播种();
  p.addFloor(3, '第三楼正文');

  await updateNpcStates(true);

  check('调了两次模型', p.记录.raw.length, 2);
  ok('第二次请求带上了错误原因与上次输出', JSON.stringify(p.记录.raw[1] ?? '').includes('上次输出不符合要求'));
  check('这次成功', 取日志().updatedNpcs, ['爱丽丝']);
  check('数据照常更新', (取状态() as any).NPC['爱丽丝']['当前在做'], '整理书架');
}

console.log('\n[3b] 三次都不是 JSON → 报错, 数据一个字段都不许动');
{
  const p = 造平台({ 生成序列: ['不是 JSON 一', '不是 JSON 二', '不是 JSON 三'] });
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  await 播种();
  p.addFloor(3, '第三楼正文');

  await updateNpcStates(true);

  check('调了三次模型', p.记录.raw.length, 3);
  ok('日志页记下这次失败, 并说明是 JSON 的问题', /JSON|解析/.test(String(取日志().error ?? '')));
  check('没有"已更新"的计数', 取日志().updatedNpcs, []);
  ok('日志页这一条是失败记录', Boolean(取日志().error));
  check('处理到楼层仍是旧值', (取状态() as any).处理到楼层, 1);
  check('旧卡原样', (取状态() as any).NPC['爱丽丝']['当前在做'], '整理账本');
}

console.log('\n[4] 提前退出: 接口没配置 / 没有可分析的回复 → 一次模型都不调');
{
  const a = 造平台({ 设置: { 接口: { 地址: '', 模型: '' }, 更新: {}, 标签: {} } });
  injectHostForTest(a.host);
  setActivePinia(createPinia());
  await 播种();
  // getSettings 有 500ms 全局读缓存: 换一套设置前先等它过期, 否则读到的还是上一个用例的设置
  await sleep(600);
  const 记录前 = JSON.stringify(取日志());
  await updateNpcStates(true);
  check('没调模型', a.记录.raw.length, 0);
  check('提前退出, 连日志都不写', JSON.stringify(取日志()), 记录前);

  const b = 造平台({ 楼层: {}, 生成序列: [正常输出] });
  injectHostForTest(b.host);
  setActivePinia(createPinia());
  b.floors['1'] = { role: 'user', message: '只有用户楼层', is_hidden: false };
  b.addFloor(2, '第二楼', 'user');
  await sleep(600);
  const 日志前 = JSON.stringify(取日志());
  await updateNpcStates(true);
  check('没有 AI 回复 → 不调模型', b.记录.raw.length, 0);
  check('日志也不动', JSON.stringify(取日志()), 日志前);
}

console.log('\n[5] 关闭自动建档: 新角色不建档, 也不计入"已更新"');
{
  const p = 造平台({
    设置: {
      接口: { 地址: 'https://example.invalid/v1', 模型: 'test-model', 密钥: 'k', 最大token: 2048 },
      更新: { 读取最近回复数: 3, 注入世界书: false, 注入世界书条目: false, 自动建档: false, 生理监测: false },
      标签: { 列表: [], 模式: '排除' },
    },
    生成序列: [JSON.stringify({
      剧情时间: { 开始: '2025-11-15 19:20', 结束: '2025-11-15 19:25' },
      爱丽丝: { 当前在做: '整理书架', 位置: '书房', 当前状态: '专注' },
      陌生人: { 当前在做: '路过', 位置: '街口', 当前状态: '匆忙' },
    })],
  });
  injectHostForTest(p.host);
  setActivePinia(createPinia());
  await 播种();
  p.addFloor(3, '第三楼正文');
  await sleep(600);

  await updateNpcStates(true);

  const 状态: any = 取状态();
  check('新角色没有被建档', 状态.NPC['陌生人'], undefined);
  check('名单里也没有它', 状态.名单, ['爱丽丝']);
  check('已更新的仍是 1 个', 取日志().updatedNpcs, ['爱丽丝']);
  check('老角色照常更新', 状态.NPC['爱丽丝']['当前在做'], '整理书架');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
