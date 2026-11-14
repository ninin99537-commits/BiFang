// 接口调用有两条路, 由设置里的「直连」开关决定(2026-11-07 加回直连, 学彼方):
//   直连(默认): 导演自己在脚本 iframe 里 fetch `{地址}/chat/completions` ——
//              **完全不经过酒馆的生成管线**: 预设、世界书、其他扩展都碰不到请求体(需要接口允许跨域 CORS)。
//   转发: 请求交给酒馆服务器转发(getModelList / generateRaw / stopGenerationById, 都收在 host.ts 里),
//        浏览器不碰跨域, 但请求要过酒馆那一层。
//
// 直连不通(多半是 CORS)时**自动降级成转发**并只提醒一次: 否则用户会看到每一轮都失败,
// 却不知道只是"这条路走不通"。降级标记只在本次页面有效, 重新加载后会再试一次直连。
import { useHost } from './host';
import { getSettings } from './settings';
import { toastWarning } from './toast';

export function normalizeBaseUrl(url: string): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/** 脱敏接口地址(隐藏 token/key 查询参数) */
export function maskBaseUrl(url: string): string {
  const value = String(url || '').trim();
  return value.replace(/([?&](?:key|token|api_key|apiKey|apikey)=)[^&]*/gi, '$1***');
}

// ---------------------------------------------------------------------------
// 直连(学彼方): 浏览器自己发 OpenAI 兼容请求
// ---------------------------------------------------------------------------

/** 直连的整体超时(含流式读取): 固定 300 秒, 不按最大输出 Token 缩放 */
export const 直连超时 = 300_000;

/** 本次页面里直连已被判"连不上"(降级成转发后不再每轮重试) */
let 直连降级 = false;

/** 直连是否已降级给转发(面板用它提示"现在走的是酒馆转发") */
export function 直连是否已降级(): boolean {
  return 直连降级;
}

/** 重新给直连一次机会(用户在设置里改地址/关掉再打开开关时调) */
export function 重置直连降级(): void {
  直连降级 = false;
}

/** 直连的请求头: 有密钥才带 Authorization(部分本地网关不需要密钥) */
function 直连请求头(密钥: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = String(密钥 ?? '').trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/** 把接口的错误体整理成一句可读的话(优先取 error.message) */
function 可读错误(status: number, bodyText: string): string {
  let message = String(bodyText ?? '').slice(0, 300);
  try {
    const data = JSON.parse(bodyText);
    const detail = data?.error?.message ?? data?.message;
    if (detail) message = String(detail).slice(0, 300);
  } catch {
    // 非 JSON 错误体, 用原文
  }
  return `${status}: ${message || '未知错误'}`;
}

/** 从 OpenAI 兼容响应里取正文(兼容 content 为数组/纯文本等形态) */
function 取正文(choice: any): string {
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.length > 0) return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part: any) => (typeof part === 'string' ? part : part?.text ?? part?.content ?? ''))
      .filter((part: string) => part.length > 0)
      .join('');
    if (parts) return parts;
  }
  if (typeof choice?.text === 'string' && choice.text.length > 0) return choice.text;
  if (typeof choice?.message?.text === 'string' && choice.message.text.length > 0) return choice.message.text;
  if (typeof choice?.message?.content_text === 'string' && choice.message.content_text.length > 0) return choice.message.content_text;
  return '';
}

/** 空正文的诊断: 推理模型常把 max_tokens 全花在推理上, 这种情况要单独说清楚 */
function 空正文说明(choice: any, data: any): string {
  const reasoning = choice?.message?.reasoning_content;
  const finish = choice?.finish_reason;
  const count = Array.isArray(data?.choices) ? data.choices.length : 0;
  const 摘要 = JSON.stringify(data)?.slice(0, 300);
  if (reasoning) {
    return `模型只返回了推理内容而没有正文(reasoning_content 非空, finish_reason=${finish})。通常是「最大输出Token」被推理过程占满, 请调大, 或换不带思考的模型。\n响应摘要: ${摘要}`;
  }
  return `choices 数量=${count}, finish_reason=${finish}, content 为空。请检查模型名是否正确。\n响应摘要: ${摘要}`;
}

/** 这次失败算不算"这条路走不通"(网络/跨域), 而不是配置错或上游错 */
function 是连不上(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch|NetworkError|Load failed|TypeError|无法连接到接口地址|CORS|跨域|ERR_NETWORK/i.test(text);
}


function requestContext(): string {
  const { 模型, 最大token } = getSettings().接口;
  return `模型=${模型 || '(未选)'}, 最大token=${最大token}`;
}

function policyBlockHint(message: string): string {
  return /violat|prohibit|policy|sensitive words|unsupported content|content filter/i.test(message)
    ? '\n(疑似被接口/模型的内容政策拦截——可尝试换用其他模型)'
    : '';
}

export async function fetchModelList(): Promise<string[]> {
  const { 地址, 密钥, 直连 } = getSettings().接口;
  const base = normalizeBaseUrl(地址);
  if (!base) throw Error('请先填写接口地址');
  // 直连: 浏览器自己请求 /models(与聊天请求走同一条路, 免得"能拉列表不能发请求")
  if (直连 && !直连降级) {
    let response: Response;
    try {
      response = await fetch(`${base}/models`, { headers: 直连请求头(密钥) });
    } catch (error) {
      throw Error('无法连接到接口地址, 请检查地址是否正确、或该接口是否允许浏览器跨域(CORS)', { cause: error });
    }
    if (!response.ok) throw Error(`获取模型列表失败 (${可读错误(response.status, await response.text())})`);
    const data = await response.json();
    return (data?.data ?? [])
      .map((model: any) => (typeof model === 'string' ? model : model?.id))
      .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
  }
  try {
    return await useHost().model.list({ apiurl: base, key: 密钥 });
  } catch (error) {
    throw Error('通过酒馆服务器获取模型列表失败, 请检查地址与密钥', { cause: error });
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  max_tokens?: number;
}

/** 真实请求序号: 用来数"这一次到底发了几次请求"(与提示条的档位无关, 永远打) */
let 请求序号 = 0;

/** 记账: 每一次真实请求各打一行(重试也各打一行) —— "到底发了几次"的唯一凭据 */
function 记一次请求(方式: string, 提示字数: number, 最大token: number, 流式: boolean) {
  请求序号 += 1;
  console.info(
    `[剧情导演] 请求 #${请求序号} 发出 · ${方式} · 提示 ${提示字数} 字 · max_tokens ${最大token} · 流式 ${流式 ? '是' : '否'}`,
  );
}

export async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const baseCfg = getSettings().接口;
  const 地址 = baseCfg.地址;
  const 密钥 = baseCfg.密钥;
  const 模型 = baseCfg.模型;
  const 温度 = options.temperature ?? baseCfg.温度;
  const 最大token = options.max_tokens ?? baseCfg.最大token;
  const 流式 = baseCfg.流式 ?? false;

  // H 接口健康检查: 地址/密钥/模型**三空**都在这里拦住(R0 不止"密钥空"——空密钥会每轮静默 401)
  const 诊断 = 诊断接口配置({ 地址, 密钥, 模型 });
  if (!诊断.可用) {
    const 错 = Error(诊断.提示);
    错.name = '接口配置';
    throw 错;
  }
  const base = normalizeBaseUrl(地址);
  if (!base) {
    const 错 = Error('接口地址不合法: 需要以 http:// 或 https:// 开头(末尾自动补 /v1)');
    错.name = '接口配置';
    throw 错;
  }

  const abortSignal = options.signal;
  if (abortSignal?.aborted) throw Error('用户已中断本次导演推进');
  const 提示字数 = messages.reduce((合计, 条) => 合计 + String(条.content ?? '').length, 0);

  // 直连(默认): 浏览器自己 POST {base}/chat/completions —— 预设/世界书/扩展都碰不到请求体。
  // 连不上(多半是 CORS)才降级: 401/400/超时是配置或上游的问题, 换条路也一样, 不该偷偷换。
  if (baseCfg.直连 && !直连降级) {
    记一次请求('直连', 提示字数, 最大token, 流式);
    try {
      return await 直连请求({ base, 密钥, 模型, 温度, 最大token, 流式, messages, signal: abortSignal });
    } catch (error) {
      if (abortSignal?.aborted || !是连不上(error)) throw error;
      直连降级 = true;
      console.warn('[剧情导演] 直连不通, 本轮改走酒馆转发:', error);
      toastWarning('直连不通（接口多半不允许浏览器跨域），本轮改走酒馆转发。想固定用转发，到设置里关掉「直连」。', '剧情导演');
    }
  }

  // 转发: 最后一条 user 消息作为 user_input 传入, 避免 generateRaw 追加空消息
  let userInput = '';
  const orderedPrompts = messages.map(message => ({ role: message.role, content: message.content }));
  const lastMessage = orderedPrompts[orderedPrompts.length - 1];
  if (lastMessage && lastMessage.role === 'user') {
    userInput = lastMessage.content;
    orderedPrompts.pop();
  }
  const generationId = `daoyan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  记一次请求('酒馆转发', 提示字数, 最大token, 流式);
  const stopHandler = () => {
    try {
      useHost().model.stop(generationId);
    } catch {
      // 忽略
    }
  };
  const cancelBlocker = new Promise<never>((_, reject) => {
    if (!abortSignal) return;
    abortSignal.addEventListener('abort', () => reject(Error('用户已中断本次导演推进')), { once: true });
  });
  if (abortSignal) abortSignal.addEventListener('abort', stopHandler, { once: true });
  try {
    const result = await Promise.race([
      useHost().model.raw({
        generation_id: generationId,
        user_input: userInput,
        should_silence: true,
        should_stream: 流式,
        max_chat_history: 0,
        custom_api: {
          apiurl: base,
          key: 密钥.trim(),
          model: 模型,
          source: 'openai',
          temperature: 温度,
          max_tokens: 最大token,
        },
        ordered_prompts: orderedPrompts,
      }),
      cancelBlocker,
    ]);
    const content = typeof result === 'string' ? result : (result as { content?: string })?.content ?? '';
    if (!content) {
      throw Error(`响应中没有找到有效的正文内容(${requestContext()})。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。`);
    }
    return content;
  } catch (error) {
    if (abortSignal?.aborted) throw Error('用户已中断本次导演推进', { cause: error });
    if (error instanceof Error && /无法连接到|接口返回错误|响应中|获取模型|直连/.test(error.message)) throw error;
    if (error instanceof Error && /Gateway|timeout|time-out|超时/i.test(error.message)) {
      throw Error(`生成超时(可能是模型思维链/推理过长或接口负载高)。调小「最大输出Token」后重试。原始错误: ${error.message}`, { cause: error });
    }
    const errText = error instanceof Error ? error.message : String(error);
    throw Error(`通过酒馆服务器请求失败(${requestContext()}): ${errText}${policyBlockHint(errText)}`, { cause: error });
  } finally {
    if (abortSignal) abortSignal.removeEventListener('abort', stopHandler);
  }
}

/**
 * 直连请求: 导演自己 POST `${base}/chat/completions`(学彼方)。
 *
 * 与转发那条路的差别只有"谁来发": 消息数组原样发出去(不再拆 user_input),
 * 没有酒馆的预设/世界书/扩展钩子参与, 所以请求体就是我们拼出来的那份, 一个字都不会多。
 * 流式按 SSE 事件块解析(允许 data: 跨网络分片、同一事件多行 data)。
 */
async function 直连请求(p: {
  base: string;
  密钥: string;
  模型: string;
  温度: number;
  最大token: number;
  流式: boolean;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: p.模型,
    messages: p.messages.map(条 => ({ role: 条.role, content: 条.content })),
    stream: p.流式,
    temperature: p.温度,
    max_tokens: p.最大token,
  };
  const 外部 = p.signal;
  if (外部?.aborted) throw Error('用户已中断本次导演推进');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 直连超时);
  const onAbort = () => controller.abort();
  外部?.addEventListener('abort', onAbort, { once: true });
  const 翻译中断 = (error: unknown): never => {
    if (外部?.aborted) throw Error('用户已中断本次导演推进', { cause: error });
    if (error instanceof Error && error.name === 'AbortError') throw Error('直连请求超时(300 秒)', { cause: error });
    throw error;
  };
  try {
    let response: Response;
    try {
      response = await fetch(`${p.base}/chat/completions`, {
        method: 'POST',
        headers: 直连请求头(p.密钥),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (外部?.aborted || (error instanceof Error && error.name === 'AbortError')) return 翻译中断(error);
      throw Error(`无法连接到接口地址(${requestContext()}), 请检查地址是否正确、或该接口是否允许浏览器跨域(CORS)`, { cause: error });
    }
    if (!response.ok) {
      const errText = 可读错误(response.status, await response.text());
      throw Error(`请求失败 (${errText})${policyBlockHint(errText)}`);
    }
    if (p.流式) {
      if (!response.body) throw Error('接口不支持流式响应(body 为空), 请关闭「流式」后重试');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let reasoning = '';
      let buffer = '';
      const 处理事件 = (事件文本: string) => {
        const 载荷 = 事件文本
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).replace(/^ /, ''))
          .join('\n')
          .trim();
        if (!载荷 || 载荷 === '[DONE]') return;
        try {
          const chunk = JSON.parse(载荷);
          const delta = chunk?.choices?.[0]?.delta ?? {};
          if (typeof delta.content === 'string') content += delta.content;
          if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
        } catch {
          // 单个事件坏掉不影响后续读取; 最终没正文时下面统一报错
        }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let 边界 = buffer.search(/\r?\n\r?\n/);
          while (边界 >= 0) {
            const 事件文本 = buffer.slice(0, 边界);
            buffer = buffer.slice(边界).replace(/^\r?\n\r?\n/, '');
            处理事件(事件文本);
            边界 = buffer.search(/\r?\n\r?\n/);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) 处理事件(buffer);
      } catch (error) {
        return 翻译中断(error);
      }
      if (!content) {
        throw Error(
          reasoning.length > 0
            ? `响应中没有找到有效的正文内容。模型只返回了推理内容(${reasoning.length} 字)而没有正文, 通常是「最大输出Token」被推理占满, 请调大。`
            : `响应中没有找到有效的正文内容(${requestContext()})。请检查模型名是否正确、是否支持当前参数。`,
        );
      }
      return content;
    }
    const data = await response.json();
    if (data?.error) {
      const message = typeof data.error === 'string' ? data.error : data.error?.message ?? JSON.stringify(data.error);
      throw Error(`接口返回错误: ${String(message).slice(0, 300)}${policyBlockHint(String(message))}`);
    }
    const content = 取正文(data?.choices?.[0]);
    if (!content) throw Error(`响应中没有找到有效的正文内容。${空正文说明(data?.choices?.[0], data)}`);
    return content;
  } finally {
    clearTimeout(timer);
    外部?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// H 接口健康检查: 三空校验 / 错误分类 / 「测试连接」两步探测
//
// 为什么要有这一块: R0 的根因是**空密钥不校验 → 每轮静默 401**, 插件看着装好了却一轮都没生效,
// 而且冷启动设计把这个故障伪装成了正常特性。所以配置缺失必须在**发请求之前**就拦住,
// 接口真错要分类报出, 而"推理模型把预算吃在思维链上导致正文空"必须与接口错分开诊断。
// ---------------------------------------------------------------------------

export type 接口问题类别 = '正常' | '地址未配置' | '地址不合法' | '密钥未配置' | '模型未选择';

export interface 接口诊断 {
  可用: boolean;
  类别: 接口问题类别;
  提示: string;
}

/** 三空校验: 地址/密钥/模型任一缺失都分类报出(R0 不止"密钥空") */
export function 诊断接口配置(配置: { 地址?: string; 密钥?: string; 模型?: string } | null | undefined): 接口诊断 {
  const 地址 = String(配置?.地址 ?? '').trim();
  const 密钥 = String(配置?.密钥 ?? '').trim();
  const 模型 = String(配置?.模型 ?? '').trim();
  if (!地址) return { 可用: false, 类别: '地址未配置', 提示: '接口地址未配置: 请填写 OpenAI 兼容地址(末尾自动补 /v1)' };
  if (!/^https?:\/\//i.test(地址)) {
    return { 可用: false, 类别: '地址不合法', 提示: `接口地址不合法: ${maskBaseUrl(地址)}(需要以 http:// 或 https:// 开头)` };
  }
  if (!密钥) {
    return {
      可用: false,
      类别: '密钥未配置',
      提示: '接口密钥未配置: 空密钥会让每一轮都静默 401 —— 插件看着装好了, 实际一轮都不会生效',
    };
  }
  if (!模型) return { 可用: false, 类别: '模型未选择', 提示: '模型未选择: 请先「获取模型列表」再选一个模型' };
  return { 可用: true, 类别: '正常', 提示: '接口配置齐备' };
}

export type 失败类别 = '密钥错' | '地址错' | '参数错' | '超时' | '未连上' | '正文空' | '未知';

/** 把接口错误文本归类(「测试连接」与推进失败提示共用) */
export function 分类接口错误(文本: string): { 类别: 失败类别; 提示: string } {
  const text = String(文本 ?? '');
  if (/没有找到有效的正文|正文内容|正文为空|empty content/i.test(text)) {
    return {
      类别: '正文空',
      提示: '接口通了但正文为空 —— 推理模型会把输出预算先花在思维链上: 请把「最大输出Token」调大(回退值 ≥16384), 或换非推理模型',
    };
  }
  if (/401|403|unauthor|invalid[\s_-]*(api[\s_-]*)?key|api[_-]?key|密钥|鉴权/i.test(text)) {
    return { 类别: '密钥错', 提示: '密钥被拒(401/403): 请核对密钥是否正确、是否过期' };
  }
  if (/404|not found|unknown model|模型不存在|接口地址/i.test(text)) {
    return { 类别: '地址错', 提示: '地址或模型名不对(404): 请核对接口地址(含 /v1)与模型名' };
  }
  if (/400|invalid|参数|max_tokens|maximum context|too large|context length/i.test(text)) {
    return { 类别: '参数错', 提示: '参数被拒(400): 常见是「最大输出Token」超过端点上限 —— 请调小(回退值 ≥16384)' };
  }
  if (/timeout|time-out|超时|Gateway|502|503|504/i.test(text)) {
    return { 类别: '超时', 提示: '请求超时或网关错误: 可能是推理模型思考过长/接口负载高, 稍后重试' };
  }
  if (/无法连接|ECONN|ENOTFOUND|fetch failed|network/i.test(text)) {
    return { 类别: '未连上', 提示: '连不上接口: 请检查地址可达性与网络/代理' };
  }
  return { 类别: '未知', 提示: `未识别的失败: ${text}` };
}

export interface 测试连接结果 {
  可用: boolean;
  类别: 接口问题类别 | 失败类别;
  提示: string;
  /** 逐步探测记录(面板与日志可读) */
  探测: string[];
}

/** 小预算探测的预算: 足以让普通模型秒回, 又足以暴露"推理模型吃满预算 → 正文空"这一类 */
export const 短探测预算 = 512;

/**
 * 「测试连接」: 两步探测, 把三类失败分开——
 *  ① 配置缺失(地址/密钥/模型) —— 不发请求就能判;
 *  ② 接口真错(401/404/400/连不上) —— 分类报出;
 *  ③ **正文空**: 接口通了但预算被思维链吃满(推理模型) —— 这不是接口错, 要提示调大 max_token。
 * 绝不擅自改小用户配置的 max_token(实测 60000 可用; 改小到 4096 会正文空)。
 */
export async function 测试连接(): Promise<测试连接结果> {
  const 配置 = getSettings().接口;
  const 诊断 = 诊断接口配置(配置);
  if (!诊断.可用) return { 可用: false, 类别: 诊断.类别, 提示: 诊断.提示, 探测: [`配置校验: 未通过 → ${诊断.类别}`] };
  const 探测: string[] = [`配置校验: 通过(地址 ${maskBaseUrl(配置.地址)}, 模型 ${配置.模型}, 最大token ${配置.最大token})`];

  const 试探 = async (预算: number): Promise<{ 正文: string; 错: string; 类别?: 失败类别; 提示?: string }> => {
    try {
      const 正文 = await chatCompletion([{ role: 'user', content: '回复两个字: 就绪' }], { max_tokens: 预算 });
      return { 正文, 错: '' };
    } catch (error) {
      const 文本 = error instanceof Error ? error.message : String(error);
      const 归类 = 分类接口错误(文本);
      return { 正文: '', 错: 文本, 类别: 归类.类别, 提示: 归类.提示 };
    }
  };

  // 第一步: 小预算探测(推理模型会把小预算吃在思维链上 → 正文空; 这是最容易被误判成"接口坏了"的一类)
  const 小 = await 试探(短探测预算);
  探测.push(`小预算探测(max_tokens=${短探测预算}): ${小.正文 ? `返回正文「${小.正文.trim()}」` : `失败 → ${小.类别}`}`);
  if (小.正文) return { 可用: true, 类别: '正常', 提示: '接口可用(小预算探测即返回正文)', 探测 };
  if (小.类别 && 小.类别 !== '正文空') {
    return { 可用: false, 类别: 小.类别, 提示: 小.提示 ?? 小.错, 探测 };
  }

  // 第二步: 用用户真实的 max_token 再探一次(R1: 端点可能直接拒绝超上限的请求; 也可能只是小预算被思维链吃光)
  const 大 = await 试探(配置.最大token);
  探测.push(`满预算探测(max_tokens=${配置.最大token}): ${大.正文 ? `返回正文「${大.正文.trim()}」` : `失败 → ${大.类别}`}`);
  if (大.正文) {
    return {
      可用: true,
      类别: '正常',
      提示: `接口可用, 但小预算(${短探测预算})下正文为空 —— 该模型是推理模型, 思维链吃满了预算。当前 max_token=${配置.最大token} 已验证通过, 请保持较大值(≥16384), 不要调小`,
      探测,
    };
  }
  if (大.类别 === '参数错') {
    return { 可用: false, 类别: '参数错', 提示: `端点不接受 max_token=${配置.最大token}(参数错): 请调小(回退值 ≥16384)`, 探测 };
  }
  if (大.类别 && 大.类别 !== '正文空') return { 可用: false, 类别: 大.类别, 提示: 大.提示 ?? 大.错, 探测 };
  return {
    可用: false,
    类别: '正文空',
    提示: `两次探测都只拿到思维链、没有正文: 请把「最大输出Token」再调大(当前 ${配置.最大token}, 回退值 ≥16384)或换非推理模型`,
    探测,
  };
}
