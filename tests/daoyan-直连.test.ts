// 剧情导演 · 直连接口(2026-11-07, 学彼方)。
//   以前只有一条路: 请求交给酒馆服务器转发(generateRaw)。现在默认**直连** ——
//   导演自己在脚本里 POST {地址}/chat/completions, 预设/世界书/别的扩展都碰不到请求体。
//   本文件钉四件事: ① 请求体就是导演拼的那份(不拆 user_input、不多一个字);
//   ② 流式按 SSE 事件块解析(允许跨行 data / 跨网络分片); ③ 直连连不上才降级成转发, 只试一次;
//   ④ 401/400 这类"配置或上游的错"不许偷偷改走转发(换了也一样, 但会掩盖真问题)。
import { chatCompletion, fetchModelList, 直连是否已降级, 重置直连降级, 直连超时 } from '../src/剧情导演/api';
import { 立即保存设置, getSettings } from '../src/剧情导演/settings';
import { SettingsSchema } from '../src/剧情导演/schema';
import { injectHostForTest } from '../src/剧情导演/host';
import { createPinia, setActivePinia } from 'pinia';

(globalThis as any)._ = {
  clamp: (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi),
  cloneDeep: (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v))),
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
async function 抛出(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '(没有抛错)';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// ---- 假平台: 转发那条路会走到 model.raw / model.list ----
const 平台调用: string[] = [];
let 转发返回 = '转发拿到的正文';
const 存储: any = {};
injectHostForTest({
  model: {
    raw: async () => {
      平台调用.push('raw');
      return { content: 转发返回 };
    },
    list: async () => {
      平台调用.push('list');
      return ['从酒馆转发拿到的模型'];
    },
    stop: () => {},
  },
  vars: {
    get: () => 存储,
    update: (fn: any) => {
      fn(存储);
      return 存储;
    },
    del: () => ({}),
    insertOrAssign: () => ({}),
    scriptId: () => 'test',
  },
} as any);

// ---- 假 fetch: 记录每次请求 ----
interface 记录 {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}
const 请求记录: 记录[] = [];
let fetch实现: (url: string) => Promise<Response> = async () => new Response('{}');
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  请求记录.push({
    url,
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
    body: init.body ? JSON.parse(init.body) : null,
  });
  return fetch实现(url);
};
const 上次请求 = () => 请求记录[请求记录.length - 1];

function 设(部分: Record<string, any> = {}) {
  重置直连降级();
  // 先成功读一次全局设置: 否则写回闸门关着, 设置根本落不下去(与真实首装路径同一条)
  const 设置 = SettingsSchema.parse({
    接口: { 地址: 'https://gw.example.com', 密钥: 'sk-test', 模型: 'm-1', 最大token: 4096, 温度: 0.6, 直连: true, 流式: false, ...部分 },
  });
  getSettings();
  立即保存设置(设置);
  return 设置;
}
const 正常响应 = (data: any) => async () => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const 流式响应 = (分片: string[]) => async () => {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const 片 of 分片) controller.enqueue(enc.encode(片));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};
const 消息 = [{ role: 'system' as const, content: '你是导演' }, { role: 'user' as const, content: '这一幕怎么演' }];

async function 主流程() {
  console.log('\n[1] 默认就是直连');
  {
    check('schema 默认开', SettingsSchema.parse({}).接口.直连, true);
    check('超时固定 300 秒', 直连超时, 300_000);
    check('一开始没有降级', 直连是否已降级(), false);
  }

  console.log('\n[2] 请求体就是导演拼的那份(不拆 user_input)');
  {
    设();
    请求记录.length = 0;
    fetch实现 = 正常响应({ choices: [{ message: { content: '这一幕的正文' } }] });
    const 正文 = await chatCompletion(消息);
    check('拿回正文', 正文, '这一幕的正文');
    check('只发了一次请求', 请求记录.length, 1);
    const r = 上次请求();
    check('打到 /v1/chat/completions', r.url, 'https://gw.example.com/v1/chat/completions');
    check('POST', r.method, 'POST');
    check('带 Bearer 密钥', r.headers.Authorization, 'Bearer sk-test');
    check('两条消息原样发出去(最后一条没被拆走)', r.body.messages, 消息);
    check('参数按设置', [r.body.model, r.body.temperature, r.body.max_tokens, r.body.stream], ['m-1', 0.6, 4096, false]);
    check('直连不走酒馆转发', 平台调用.length, 0);
  }

  console.log('\n[3] 地址末尾自动补 /v1');
  {
    设({ 地址: 'https://gw.example.com/v1' });
    请求记录.length = 0;
    fetch实现 = 正常响应({ choices: [{ message: { content: 'ok' } }] });
    await chatCompletion(消息);
    check('已经是 /v1 就不再补', 上次请求().url, 'https://gw.example.com/v1/chat/completions');
  }

  console.log('\n[4] 兼容 content 是数组的响应');
  {
    设();
    fetch实现 = 正常响应({ choices: [{ message: { content: [{ text: '前半' }, { text: '后半' }] } }] });
    check('数组拼起来', await chatCompletion(消息), '前半后半');
  }

  console.log('\n[5] 流式: SSE 跨分片、多行 data、[DONE]');
  {
    设({ 流式: true });
    请求记录.length = 0;
    fetch实现 = 流式响应([
      'data: {"choices":[{"delta":{"content":"雨"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"停了"}}]}\n\ndata: {"choi',
      'ces":[{"delta":{"content":"。"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const 正文 = await chatCompletion(消息);
    check('拼接完整', 正文, '雨停了。');
    check('stream:true 发出去了', 上次请求().body.stream, true);
  }

  console.log('\n[6] 流式只有推理、没有正文 → 明确报"推理吃满预算"');
  {
    设({ 流式: true });
    fetch实现 = 流式响应(['data: {"choices":[{"delta":{"reasoning_content":"想很久"}}]}\n\n', 'data: [DONE]\n\n']);
    const 错 = await 抛出(() => chatCompletion(消息));
    ok('提示推理内容而非泛泛失败', /推理/.test(错) && /最大输出/.test(错));
  }

  console.log('\n[7] 401/400 不许偷偷改走转发(配置错换条路也一样)');
  {
    设();
    请求记录.length = 0;
    平台调用.length = 0;
    fetch实现 = async () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 });
    const 错 = await 抛出(() => chatCompletion(消息));
    ok('报出 401 与接口原话', /401/.test(错) && /invalid api key/.test(错));
    check('没有降级', 直连是否已降级(), false);
    check('没有偷偷走转发', 平台调用.length, 0);
  }

  console.log('\n[8] 连不上(跨域/网络)才降级: 本轮走转发, 之后不再重试');
  {
    设();
    请求记录.length = 0;
    平台调用.length = 0;
    转发返回 = '转发救回来的正文';
    fetch实现 = async () => {
      throw new TypeError('Failed to fetch');
    };
    const 正文 = await chatCompletion(消息);
    check('本轮拿到转发结果', 正文, '转发救回来的正文');
    check('降级标记立起来了', 直连是否已降级(), true);
    check('确实走了转发', 平台调用, ['raw']);
    const 次数 = 请求记录.length;
    await chatCompletion(消息);
    check('第二次不再试直连', 请求记录.length, 次数);
    check('第二次直接转发', 平台调用, ['raw', 'raw']);
  }

  console.log('\n[9] 重新给直连机会');
  {
    设();
    请求记录.length = 0;
    fetch实现 = 正常响应({ choices: [{ message: { content: '直连活了' } }] });
    check('重置后标记清掉', 直连是否已降级(), false);
    check('又走直连', await chatCompletion(消息), '直连活了');
    check('确实打了直连', 请求记录.length, 1);
  }

  console.log('\n[10] 关掉直连 → 全部走酒馆转发, fetch 一次都不打');
  {
    设({ 直连: false });
    请求记录.length = 0;
    平台调用.length = 0;
    转发返回 = '只走转发';
    check('正文来自转发', await chatCompletion(消息), '只走转发');
    check('平台被调用', 平台调用, ['raw']);
    check('浏览器没发请求', 请求记录.length, 0);
  }

  console.log('\n[11] 模型列表也跟着走同一条路');
  {
    设();
    请求记录.length = 0;
    fetch实现 = 正常响应({ data: [{ id: 'deepseek-chat' }, { id: 'gpt-x' }, 'plain-id'] });
    check('直连拉列表', await fetchModelList(), ['deepseek-chat', 'gpt-x', 'plain-id']);
    check('打到 /v1/models', 上次请求().url, 'https://gw.example.com/v1/models');
    check('也带密钥', 上次请求().headers.Authorization, 'Bearer sk-test');

    设({ 直连: false });
    请求记录.length = 0;
    平台调用.length = 0;
    check('转发拉列表', await fetchModelList(), ['从酒馆转发拿到的模型']);
    check('平台被调用', 平台调用, ['list']);
    check('浏览器没发请求', 请求记录.length, 0);
  }

  console.log('\n[12] 空正文/空响应要说清楚');
  {
    设();
    fetch实现 = 正常响应({ choices: [{ message: { content: '', reasoning_content: '想了很久' }, finish_reason: 'length' }] });
    const 错 = await 抛出(() => chatCompletion(消息));
    ok('指出是推理吃满预算', /推理/.test(错) && /最大输出Token/.test(错));
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exit(1);
}

await 主流程();
