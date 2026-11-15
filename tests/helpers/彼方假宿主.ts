// 彼方 · 端到端假宿主 —— 批次 2 系列用例(锚点冲突/缓存新鲜度/模块直测)共用的地基。
//
// 它模拟了什么:
//   - 三层变量表(global/chat/message): message 每楼一个对象(写前自动初始化), chat 只存彼方元数据;
//   - chat.messages 同时收**数字锚点**(快照层)与**区间串**(取料层), 按 role/is_hidden 过滤, 返回副本;
//   - 模型队列钩在 host.model.raw(非直连路): 按序弹出字符串回复, 记下每次调用的完整入参(重试断言用);
//   - pinia 三仓(debug/updating/state)由用例自建(createPinia), 设置种子走真 zod 解析(塞 彼方_settings);
//   - persona/character/macros 给最小假; worldbook 全家桶给"能跑通但不开"的最小假。
// 它**没**模拟什么: 真实酒馆事件时序(CHAT_CHANGED/楼层删除)、世界书写入路径、persona 注入、
//   宏展开的真实酒馆宏、流式/SSE、直连 fetch —— 这些各有专测或不在本系列范围, 别把它当真环境。
// 最小骨架:
//   import { 彼方假宿主, 种已有状态 } from '../helpers/彼方假宿主';
//   setActivePinia(createPinia());
//   const { host, 存, 记 } = 彼方假宿主({ 模型回复: [JSON.stringify({...})] });
//   种已有状态(host);            // 可选: 在楼层 1 种甲/丙两人的旧快照
//   await updateNpcStates(host); // 断言读 存.message[锚点楼层][STORAGE_KEY] 与 记.rawCalls
import { STORAGE_KEY, writeStateSnapshot, emptyData } from '../../src/彼方_NPC幕后生命状态系统/快照';
import { invalidateReadCache } from '../../src/彼方_NPC幕后生命状态系统/settings';

export { STORAGE_KEY };

export type 假平台选项 = { 模型回复?: string[]; 最后楼层号?: number };

export function 模型卡乙() {
  return {
    身份锚点: '28岁巡逻队成员, 独居',
    当前在做: '在广场东角巡逻',
    当前状态: '警觉',
    位置: '广场',
    近期关键事件: '2026-01-02 广场集合',
    生活状态: '吃饭(2026-01-02 08:00); 睡眠(2026-01-01 23:00-次日07:00)',
    接下来想做: '换岗后去买菜',
    当前目标: '保住巡逻队的差事',
    未完成事项: [],
    心事: '弟弟的学费; 其实想离开这座城',
    藏起来的打算: '查清父亲失踪的真相',
  };
}

export function 彼方假宿主(选项: 假平台选项 = {}) {
  const 最后楼层号 = 选项.最后楼层号 ?? 3;
  const 存: any = { global: {}, chat: {}, message: {} };
  // 造一份新假宿主 = 换一份假全局设置 = 换数据源 —— getSettings 的 500ms 读缓存必须失效。
  // 这是同一个坑第三次咬人(总开关清理[1]→[2]、慢一步[1]→[2]、慢一步[2]→[3]/[4]→[5]/[5]→[6]),
  // 上提到共享 helper: 所有用例一次性免疫, 与生产路径 写回全局() 成功后调 invalidateReadCache() 同一概念。
  invalidateReadCache();
  const 楼层 = [
    { message_id: 1, role: 'assistant', is_hidden: false, message: '（较早的剧情：小镇的清晨, 集市的喧闹声渐起。）' },
    { message_id: 2, role: 'user', is_hidden: false, message: '玩家输入：大家去广场集合。' },
    { message_id: 3, role: 'assistant', is_hidden: false, message: '剧情正文：广场上人声鼎沸, 乙按队长的命令守在东角, 扫视着人群。' },
  ];
  const 记 = { rawCalls: [] as any[] };
  const 队列 = [...(选项.模型回复 ?? [])];
  const 变量表 = (arg: any) => (arg?.type === 'global' ? 存.global : arg?.type === 'chat' ? 存.chat : 存.message[arg?.message_id]);
  const host = {
    vars: {
      get: (arg: any) => 变量表(arg),
      update: (fn: any, arg: any) => {
        // 楼层变量在真平台上是"每楼一个对象"(新楼层 = 空对象), 不是 undefined
        if (arg?.type === 'message')
          存.message[arg.message_id] ??= {};
        const 新 = fn(变量表(arg));
        if (arg?.type === 'global') 存.global = 新;
        else if (arg?.type === 'chat') 存.chat = 新;
        else 存.message[arg.message_id] = 新;
      },
      del: (key: string, arg: any) => {
        delete 变量表(arg)[key];
      },
      insertOrAssign: () => undefined,
      scriptId: () => 't',
    },
    chat: {
      lastMessageId: () => 最后楼层号,
      messages: (range: number | string, opts?: any) => {
        // 快照层传单层号(数字), 取料层传区间串 —— 两种形态都接
        const [start, end] = typeof range === 'number' ? [range, range] : String(range).split('-').map(Number);
        return 楼层
          .filter(m => m.message_id >= start && m.message_id <= (Number.isNaN(end) ? start : end))
          .filter(m => !opts?.role || m.role === opts.role)
          .sort((a, b) => a.message_id - b.message_id) // 真平台按时间序返回
          .map(m => ({ ...m }));
      },
    },
    persona: { name: () => '玩家', description: () => '主角设定: 流浪的旅行者。', lorebook: () => '' },
    character: { name: () => '' },
    macros: { expand: (t: string) => t },
    model: {
      list: async () => ['fake-model'],
      raw: async (cfg: any) => {
        记.rawCalls.push(cfg);
        const next = 队列.shift();
        if (next === undefined)
          throw new Error('模型队列空了(测试编排错误)');
        return next;
      },
      stop: () => undefined,
    },
    worldbook: {
      boundNames: () => ({ primary: null, additional: [] }),
      boundNamesOf: () => ({ primary: null, additional: [] }),
      groupMemberNames: () => [] as string[],
      chatName: () => null,
      getOrCreateChat: async () => '聊天书',
      entries: async () => [],
      update: async () => undefined,
      create: async () => undefined,
      remove: async () => undefined,
    },
    toast: {
      warn: (text: string, header: string) => 存.global['__toast_warn'] = [...(存.global['__toast_warn'] ?? []), { text, header }],
      error: (text: string, header: string) => 存.global['__toast_error'] = [...(存.global['__toast_error'] ?? []), { text, header }],
      success: (text: string, header: string) => 存.global['__toast_success'] = [...(存.global['__toast_success'] ?? []), { text, header }],
      info: (text: string, header: string) => 存.global['__toast_info'] = [...(存.global['__toast_info'] ?? []), { text, header }],
    },
  };
  // 设置: 接口指向假模型; 注入世界书关(世界书读取另有专测); 世界书写入关(同步另有专测)
  存.global['彼方_settings'] = {
    接口: { 地址: 'https://fake.local', 模型: 'fake-model', 密钥: '', 直连: false, 流式: false },
    更新: { 读取最近回复数: 3, 注入世界书: false, 自动建档: true, 生理监测: false, 预填充: false, 世界书写入: '关闭' },
  };
  return { host, 存, 记, 队列, 楼层 };
}

/** 种一份"已有状态"(甲/丙 两人)在楼层 1, 让 loadData 有真快照可读; 返回种子数据 */
export function 种已有状态(host: any) {
  const 种子: any = {
    ...emptyData(),
    名单: ['甲', '丙'],
    NPC: {
      甲: { 当前在做: '做饭', 当前状态: '平静', 位置: '家', 身份锚点: '面包师' },
      丙: { 当前在做: '看店', 当前状态: '无聊', 位置: '杂货铺', 身份锚点: '店主' },
    },
    统计: { 更新次数: 7, 最后更新: 1000 },
    剧情时间: '2026-01-01 20:00',
  };
  if (writeStateSnapshot(host, 种子, 1, 1, false) !== true)
    throw new Error('种子快照写入楼层 1 失败(假宿主编排错误)');
  return 种子;
}

/** 读某类 toast 的记录(helper 的 toast 记录在 global 表的 __toast_* 键里) */
export function 弹窗记录(存: any, 档位: 'warn' | 'error' | 'success' | 'info') {
  return 存.global[`__toast_${档位}`] ?? [];
}
