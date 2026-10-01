// 彼方 · 接口调用(候选6: 只走酒馆服务器) —— 用假宿主跑真实源码
//
// 覆盖: 取模型列表走酒馆服务器、地址没填时明确报错、对话请求组装成 generateRaw 的
// custom_api + ordered_prompts(最后一条 user 消息拆成 user_input)、中断时调用停止生成、空正文的提示、
// 以及"服务端转发开关已删除""关闭思维链已删除"这两条: 老设置里残留的字段必须被忽略而不是报错。
// (老设置里残留的同名字段会被忽略)"。另外全程盯着浏览器 fetch 不许被调用。
import { createPinia, setActivePinia } from 'pinia';
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import { getSettings } from '../src/彼方_NPC幕后生命状态系统/settings';
import { chatCompletion, fetchModelList } from '../src/彼方_NPC幕后生命状态系统/api';

const SETTINGS_KEY = '彼方_settings';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// settings.ts 会用到页面注入的 lodash 全局与浏览器 localStorage(node 里都没有), 给最小替身
(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
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
/** 跑一段应当报错的代码, 返回错误消息 */
async function 抓错误(fn: () => Promise<unknown>) {
  try {
    await fn();
    return '(没有报错)';
  }
  catch (error: any) {
    return String(error?.message ?? error);
  }
}

interface 假宿主选项 {
  /** 全局变量表里的彼方设置 */
  设置?: any;
  /** 酒馆服务器取的模型列表 */
  模型列表?: string[];
  /** 生成接口的返回; 传 'never' 表示一直不返回(用来测中断); 传 '' 表示空正文 */
  生成结果?: string | 'never';
}

function makeFake(选项: 假宿主选项 = {}) {
  const 记录 = { list: [] as any[], raw: [] as any[], stop: [] as string[], fetch次数: 0 };
  let 全局: any = 选项.设置 === undefined ? {} : { [SETTINGS_KEY]: 选项.设置 };
  const host: any = {
    vars: {
      scriptId: () => 'script-1',
      get: (option: any) => (option.type === 'script' ? {} : 全局),
      update: (updater: any, option: any) => {
        if (option.type === 'global')
          全局 = updater(全局) ?? 全局;
        return 全局;
      },
      del: () => ({}),
      insertOrAssign: () => ({}),
    },
    model: {
      list: async (请求: any) => {
        记录.list.push(请求);
        return 选项.模型列表 ?? ['m1', 'm2'];
      },
      raw: async (请求: any) => {
        记录.raw.push(请求);
        if (选项.生成结果 === 'never')
          return new Promise(() => {});
        return 选项.生成结果 ?? '模型回复';
      },
      stop: (generationId: string) => {
        记录.stop.push(generationId);
      },
    },
  };
  return { host, 记录 };
}

/** 装假宿主, 并埋一个"谁敢直接请求接口就炸"的 fetch */
function 装(选项: 假宿主选项 = {}) {
  const 假 = makeFake(选项);
  injectHostForTest(假.host);
  // getSettings() 在全局变量里读不到设置时会回退到设置 store, 那需要有一个活着的 pinia
  setActivePinia(createPinia());
  (globalThis as any).fetch = () => {
    假.记录.fetch次数++;
    throw new Error('直连分支已经被删掉了, 不该出现浏览器 fetch');
  };
  return 假;
}

/** 对话请求的显式接口参数(绕开 getSettings 的 500ms 缓存, 每个用例互不影响) */
const 接口参数 = { 地址: 'https://api.example.com', 密钥: 'sk-测试', 模型: 'm1' };

console.log('\n[1] 地址没填 → 明确报错, 不去请求');
{
  const 假 = 装();
  check('提示填写接口地址', await 抓错误(() => fetchModelList()), '请先填写接口地址');
  check('没问酒馆服务器要模型列表', 假.记录.list.length, 0);
  check('没走浏览器 fetch', 假.记录.fetch次数, 0);
}

await sleep(600); // getSettings 有 500ms 缓存, 等它过期再换一份设置

console.log('\n[2] 取模型列表 → 交给酒馆服务器(地址自动补 /v1)');
{
  const 假 = 装({ 设置: { 接口: { 地址: 'https://api.example.com', 密钥: 'sk-测试' } } });
  check('拿到的列表', await fetchModelList(), ['m1', 'm2']);
  check('传给服务器的地址', 假.记录.list[0].apiurl, 'https://api.example.com/v1');
  check('带上密钥', 假.记录.list[0].key, 'sk-测试');
  check('没走浏览器 fetch', 假.记录.fetch次数, 0);
}

console.log('\n[3] 对话请求 → 组装成 generateRaw(最后一条 user 消息拆成 user_input)');
{
  const 假 = 装();
  const 内容 = await chatCompletion(
    [{ role: 'system', content: '你是助手' }, { role: 'user', content: '你好' }],
    { 接口: 接口参数 },
  );
  check('返回正文', 内容, '模型回复');
  const 请求 = 假.记录.raw[0];
  check('custom_api 地址', 请求.custom_api.apiurl, 'https://api.example.com/v1');
  check('custom_api 模型', 请求.custom_api.model, 'm1');
  check('custom_api 密钥', 请求.custom_api.key, 'sk-测试');
  check('source 默认 openai', 请求.custom_api.source, 'openai');
  check('最后一条 user 消息作为 user_input', 请求.user_input, '你好');
  check('其余消息作为 ordered_prompts', 请求.ordered_prompts, [{ role: 'system', content: '你是助手' }]);
  check('不带聊天历史(只用彼方自己的提示词)', 请求.max_chat_history, 0);
  check('静默生成(不显示在酒馆界面上)', 请求.should_silence, true);
  ok('带了 generation_id', typeof 请求.generation_id === 'string' && 请求.generation_id.startsWith('bifang_'));
  check('没走浏览器 fetch', 假.记录.fetch次数, 0);
}

console.log('\n[4] 温度 / 最大token / 流式 从设置带过去');
{
  const 假 = 装();
  await chatCompletion([{ role: 'user', content: 'x' }], {
    接口: { ...接口参数, 温度: 0.5, 最大token: 4096, 流式: true },
    max_tokens: 512,
  });
  const 请求 = 假.记录.raw[0];
  check('温度', 请求.custom_api.temperature, 0.5);
  check('单次调用的 max_tokens 优先于设置', 请求.custom_api.max_tokens, 512);
  check('流式开关对应 should_stream', 请求.should_stream, true);
}

console.log('\n[5] 关闭思维链已删除: 固定走 openai 源, 老设置里残留的开关被忽略');
{
  const 假 = 装();
  await chatCompletion([{ role: 'user', content: 'x' }], { 接口: { ...接口参数, 关闭思维链: true } });
  const 请求 = 假.记录.raw[0];
  check('source 固定 openai', 请求.custom_api.source, 'openai');
  check('不再注入 custom_include_body', 请求.custom_api.custom_include_body, undefined);
}

console.log('\n[6] 已经中断 → 直接报中断, 不发起生成');
{
  const 假 = 装();
  const controller = new AbortController();
  controller.abort();
  check('报中断', await 抓错误(() => chatCompletion([{ role: 'user', content: 'x' }], { 接口: 接口参数, signal: controller.signal })), '用户已中断本次更新');
  check('没发起生成', 假.记录.raw.length, 0);
}

console.log('\n[7] 生成中途点中断 → 立即返回并叫服务器停止生成');
{
  const 原warn = console.warn;
  let 中断日志数 = 0;
  console.warn = (...args: any[]) => {
    if (String(args[0] ?? '').includes('接口请求被中断'))
      中断日志数++;
    原warn(...args);
  };
  const 假 = 装({ 生成结果: 'never' });
  const controller = new AbortController();
  const 进行中 = chatCompletion([{ role: 'user', content: 'x' }], { 接口: 接口参数, signal: controller.signal });
  await sleep(20);
  controller.abort();
  check('报中断', await 抓错误(() => 进行中), '用户已中断本次更新');
  check('叫服务器停止生成', 假.记录.stop.length, 1);
  check('停的就是这次生成的 id', 假.记录.stop[0], 假.记录.raw[0].generation_id);
  console.warn = 原warn;
  check('只发起了一次生成', 假.记录.raw.length, 1);
  check('中断日志只打一条', 中断日志数, 1);
}

console.log('\n[8] 模型只回了空正文 → 提示调大最大输出Token');
{
  装({ 生成结果: '' });
  const 消息 = await 抓错误(() => chatCompletion([{ role: 'user', content: 'x' }], { 接口: 接口参数 }));
  ok('提示里说了正文为空', 消息.includes('响应中没有找到有效的正文内容'));
  ok('提示里给了处理办法', 消息.includes('最大输出Token'));
}

await sleep(600); // 同样等缓存过期, 好验证"老设置里的残留字段"

console.log('\n[9] 服务端转发开关已经删掉: 老设置里残留同名字段也不会生效');
{
  装({ 设置: { 接口: { 地址: 'https://api.example.com', 密钥: 'sk-测试', 模型: 'm1', 服务端转发: true } } });
  const 接口 = getSettings().接口;
  check('设置里已经没有这一项', 接口.服务端转发, undefined);
  check('其余设置照常读到', 接口.模型, 'm1');
  check('地址照常读到', 接口.地址, 'https://api.example.com');
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
