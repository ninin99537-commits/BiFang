// 接口调用有两条路, 由设置里的「直连」开关决定:
//   转发(默认): 请求交给酒馆服务器转发(酒馆助手接口的 getModelList / generateRaw /
//               stopGenerationById, 都收在 host.ts 里), 浏览器不碰跨域;
//   直连: 彼方自己在脚本 iframe 里 fetch 接口, **完全不经过酒馆的生成管线**——
//         没有预设、没有世界书、没有任何扩展能在中间改写请求体(需要接口允许跨域 CORS)。
// 直连这条支路 2026-09 曾随"接口只走酒馆服务器"一起删除, 2026-10 作为可选开关加回。
//
// 宿主由调用方传进来(约定见 host.ts 顶部), 本文件不再自己取。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import { getSettings } from './settings';
import type { Host } from './host';

/** 本层需要的平台能力: 模型调用 + 变量表(读设置)。直连时只用得到 vars */
type 接口宿主 = Pick<Host, 'model' | 'vars'>;

/** 直连的整体超时(含流式读取): 固定 300 秒, 不按最大输出 Token 缩放 */
const 直连超时 = 300_000;

function normalizeBaseUrl(url: string) {
    const trimmed = (url ?? '').trim().replace(/\/+$/, '');
    if (!trimmed)
        return '';
    return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}
/** 请求上下文(脱敏), 附加到错误信息方便排查 */
function requestContext(host: 接口宿主) {
    const { 模型, 最大token, 直连 } = getSettings(host).接口;
    return `模型=${模型 || '(未选)'}, 最大token=${最大token}, 方式=${直连 ? '直连' : '酒馆转发'}`;
}
/** 检测接口/模型的成人内容政策拦截(如 Google Gemini 的 Prohibited Use policy), 返回友好提示 */
function policyBlockHint(message: string) {
    return /violat|prohibit|policy|sensitive words|unsupported content|content filter/i.test(message)
        ? '\n(疑似被接口/模型的成人内容政策拦截, 如 Google Gemini 的 Prohibited Use policy——这类服务在请求输入层就会拒绝含敏感词的提示词, 无法靠提示词绕过。可尝试: 关闭「女性NPC生理监测」, 或换用 DeepSeek/GLM/Qwen/Claude 等无此类硬过滤的模型)'
        : '';
}
/** 直连的请求头: 有密钥才带 Authorization(部分本地网关不需要密钥) */
function buildHeaders(密钥: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = String(密钥 ?? '').trim();
    if (key)
        headers.Authorization = `Bearer ${key}`;
    return headers;
}
/** 把接口的错误体整理成一句可读的话(优先取 error.message) */
function readableError(status: number, bodyText: string) {
    let message = String(bodyText ?? '').slice(0, 300);
    try {
        const data = JSON.parse(bodyText);
        const detail = data?.error?.message ?? data?.message;
        if (detail)
            message = String(detail).slice(0, 300);
    }
    catch {
        // 非 JSON 错误体, 直接使用原文
    }
    return `${status}: ${message || '未知错误'}`;
}
/** 从 OpenAI 兼容响应里取出正文(兼容 content 为数组/纯文本等形态) */
function extractTextContent(choice: any) {
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.length > 0)
        return content;
    if (Array.isArray(content)) {
        const parts = content
            .map((part) => (typeof part === 'string' ? part : part?.text ?? part?.content ?? ''))
            .filter((part) => part.length > 0)
            .join('');
        if (parts)
            return parts;
    }
    if (typeof choice?.text === 'string' && choice.text.length > 0)
        return choice.text;
    if (typeof choice?.message?.text === 'string' && choice.message.text.length > 0)
        return choice.message.text;
    if (typeof choice?.message?.content_text === 'string' && choice.message.content_text.length > 0)
        return choice.message.content_text;
    return '';
}
/** 空正文的诊断: 推理模型常把 max_tokens 全花在推理上, 这种情况要单独说清楚 */
function describeEmptyContent(choice: any, data: any) {
    const reasoning = choice?.message?.reasoning_content;
    const finish = choice?.finish_reason;
    const choicesCount = Array.isArray(data?.choices) ? data.choices.length : 0;
    const detail = JSON.stringify(data)?.slice(0, 300);
    if (reasoning) {
        return `模型只返回了推理内容而没有正文(reasoning_content 非空, finish_reason=${finish})。这通常是「最大输出Token」被推理过程占满所致, 请调大最大输出Token, 或改用不带思考/推理的模型。\n响应摘要: ${detail}`;
    }
    return `choices 数量=${choicesCount}, finish_reason=${finish}, content 为空。请检查模型名是否正确、是否支持当前参数。\n响应摘要: ${detail}`;
}
async function fetchModelList(host: 接口宿主) {
    const { 地址, 密钥, 直连 } = getSettings(host).接口;
    const base = normalizeBaseUrl(地址);
    if (!base)
        throw Error('请先填写接口地址');
    // 走酒馆服务器转发(绕开浏览器跨域)
    if (!直连) {
        try {
            return await host.model.list({ apiurl: base, key: 密钥 });
        }
        catch (error) {
            throw Error('通过酒馆服务器获取模型列表失败, 请检查地址与密钥', { cause: error });
        }
    }
    // 直连: 浏览器自己请求 /models
    let response;
    try {
        response = await fetch(`${base}/models`, { headers: buildHeaders(密钥) });
    }
    catch (error) {
        throw Error('无法连接到接口地址, 请检查地址是否正确或是否允许跨域(CORS)', { cause: error });
    }
    if (!response.ok) {
        throw Error(`获取模型列表失败 (${readableError(response.status, await response.text())})`);
    }
    const data = await response.json();
    return (data?.data ?? [])
        .map((model: any) => (typeof model === 'string' ? model : model?.id))
        .filter((id: any) => typeof id === 'string' && id.length > 0);
}
/** 接口请求计时包装: 单次请求耗时 + 输入/输出字数, 用于定位"更新慢"的瓶颈(模型生成 vs 本地处理) */
async function chatCompletion(host: 接口宿主, messages: any[], options?: any) {
    const startedAt = Date.now();
    const inputChars = messages.reduce((sum: number, message: any) => sum + String(message.content ?? '').length, 0);
    try {
        const content = await chatCompletionInner(host, messages, options);
        console.info(`[彼方] 接口请求完成: ${((Date.now() - startedAt) / 1000).toFixed(1)}s, 输入${inputChars}字, 输出${content.length}字`);
        return content;
    }
    catch (error) {
        console.warn(`[彼方] 接口请求${error instanceof Error && /中断/.test(error.message) ? '被中断' : '失败'}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s 后结束, ${error instanceof Error ? error.message.split('\n')[0] : error}`);
        throw error;
    }
}
async function chatCompletionInner(host: 接口宿主, messages: any[], options?: any) {
    const baseCfg = getSettings(host).接口;
    const 地址 = options?.接口?.地址 ?? baseCfg.地址;
    const 密钥 = options?.接口?.密钥 ?? baseCfg.密钥;
    const 模型 = options?.接口?.模型 ?? baseCfg.模型;
    const 温度 = options?.接口?.温度 ?? baseCfg.温度;
    const 最大token = options?.接口?.最大token ?? baseCfg.最大token;
    const 直连 = options?.接口?.直连 ?? baseCfg.直连;
    const 流式 = options?.接口?.流式 ?? baseCfg.流式 ?? false;
    // 展开酒馆骰子宏 {{roll 1d100}} → 真实随机数:
    // 直连 / generateRaw 都不经过酒馆的 substituteParams, 宏不会自动展开,
    // 这里手动替换, 保证受孕判定等需要随机数的场景拿到真实 D100 结果。
    messages = messages.map((message: any) => ({
        ...message,
        content: String(message.content ?? '').replace(/\{\{\s*roll\s+(\d+)d(\d+)\s*\}\}/gi, (_match, count, sides) => {
            let total = 0;
            for (let i = 0; i < +count; i++)
                total += 1 + Math.floor(Math.random() * +sides);
            // 记录骰子结果到彼方日志(供受孕判定等场景回溯"到底投出了多少")
            console.info(`[彼方] 掷骰: ${count}d${sides} = ${total}`);
            return String(total);
        }),
    }));
    const base = normalizeBaseUrl(地址);
    if (!base)
        throw Error('请先填写接口地址');
    if (!模型)
        throw Error('请先选择模型');
    // 直连: 浏览器直接 POST /chat/completions, 不经过酒馆的生成管线
    if (直连)
        return await 直连请求(host, { base, 密钥, 模型, 温度, 最大token, 流式, messages, options });
    // 最后一条 user 消息作为 user_input 传入, 避免 generateRaw 追加空消息
    let userInput = '';
    const orderedPrompts = messages.map((message: any) => ({
        role: message.role,
        content: message.content,
    }));
    const lastMessage = orderedPrompts[orderedPrompts.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
        userInput = lastMessage.content;
        orderedPrompts.pop();
    }
    // generateRaw 不支持 signal: 用 generation_id + stopGenerationById 取消后台请求,
    // 并用 Promise.race 让"取消信号"立即中断等待(否则要等服务器端请求自然结束, 反馈很慢)
    const generationId = `bifang_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const abortSignal = options?.signal;
    if (abortSignal?.aborted)
        throw Error('用户已中断本次更新');
    const stopHandler = () => {
        try {
            host.model.stop(generationId);
        }
        catch {
            // 忽略
        }
    };
    const cancelBlocker = new Promise((_, reject) => {
        if (!abortSignal)
            return;
        abortSignal.addEventListener('abort', () => reject(Error('用户已中断本次更新')), { once: true });
    });
    if (abortSignal)
        abortSignal.addEventListener('abort', stopHandler, { once: true });
    try {
        const result = await Promise.race([
            host.model.raw({
                generation_id: generationId,
                user_input: userInput,
                should_silence: true,
                // 流式接收: 上游边生成边返回, 避免长时间无响应触发网关超时(504/499)
                should_stream: 流式,
                max_chat_history: 0,
                custom_api: {
                    apiurl: base,
                    key: 密钥.trim(),
                    model: 模型,
                    source: 'openai',
                    temperature: options?.temperature ?? 温度,
                    max_tokens: options?.max_tokens ?? 最大token,
                },
                ordered_prompts: orderedPrompts,
            }),
            cancelBlocker,
        ]);
        const content = typeof result === 'string' ? result : (result as any)?.content ?? '';
        if (!content) {
            throw Error(`响应中没有找到有效的正文内容(${requestContext(host)})。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。`);
        }
        return content;
    }
    catch (error) {
        if (abortSignal?.aborted)
            throw Error('用户已中断本次更新', { cause: error });
        if (error instanceof Error && /无法连接到|接口返回错误|响应中|获取模型/.test(error.message))
            throw error;
        // 超时通常是推理模型把时间花在思考上, 或接口负载高: 提示调小最大输出Token或换模型
        if (error instanceof Error && /Gateway|timeout|time-out|超时/i.test(error.message)) {
            throw Error(`生成超时(可能是推理模型的思考时间过长, 或接口负载高)。可调小「最大输出Token」或换更快的模型后重试。原始错误: ${error.message}`, { cause: error });
        }
        const errText = error instanceof Error ? error.message : String(error);
        throw Error(`通过酒馆服务器请求失败(${requestContext(host)}): ${errText}${policyBlockHint(errText)}`, { cause: error });
    }
    finally {
        if (abortSignal)
            abortSignal.removeEventListener('abort', stopHandler);
    }
}
/**
 * 直连请求: 彼方自己 POST `${base}/chat/completions`。
 *
 * 与转发那条路的差别只有"谁来发": 消息数组原样发出去(不再拆 user_input), 没有酒馆的
 * 预设/世界书/扩展钩子参与, 所以请求体就是彼方拼出来的那份, 一个字都不会多。
 */
async function 直连请求(host: 接口宿主, p: {
    base: string;
    密钥: string;
    模型: string;
    温度: number;
    最大token: number;
    流式: boolean;
    messages: any[];
    options: any;
}) {
    const body: Record<string, any> = {
        model: p.模型,
        messages: p.messages,
        stream: p.流式,
        temperature: p.options?.temperature ?? p.温度,
        max_tokens: p.options?.max_tokens ?? p.最大token,
    };
    const 外部 = p.options?.signal as AbortSignal | undefined;
    if (外部?.aborted)
        throw Error('用户已中断本次更新');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 直连超时);
    const onAbort = () => controller.abort();
    外部?.addEventListener('abort', onAbort, { once: true });
    /** 把 fetch/读取阶段的中断与超时翻译成彼方的文案 */
    const 翻译中断 = (error: unknown): never => {
        if (外部?.aborted)
            throw Error('用户已中断本次更新', { cause: error });
        if (error instanceof Error && error.name === 'AbortError')
            throw Error('请求超时', { cause: error });
        throw error;
    };
    try {
        let response: Response;
        try {
            response = await fetch(`${p.base}/chat/completions`, {
                method: 'POST',
                headers: buildHeaders(p.密钥),
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        catch (error) {
            if (外部?.aborted || (error instanceof Error && error.name === 'AbortError'))
                return 翻译中断(error);
            throw Error(`无法连接到接口地址(${requestContext(host)})。请检查地址是否正确或是否允许跨域(CORS)`, { cause: error });
        }
        if (!response.ok) {
            const bodyText = await response.text();
            const errText = readableError(response.status, bodyText);
            throw Error(`请求失败 (${errText})${policyBlockHint(errText)}`);
        }
        // 流式: 逐 token 读 SSE 并拼接 content(边生成边返回)
        if (p.流式) {
            if (!response.body) {
                throw Error('接口不支持流式响应(body 为空), 请关闭「流式输出」后重试');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let content = '';
            let reasoning = '';
            let buffer = '';
            /** 按 SSE 空行划事件, 合并同一事件的多行 data 后再解析(允许跨网络分片) */
            const 处理事件 = (事件文本: string) => {
                const 载荷 = 事件文本.split(/\r?\n/)
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).replace(/^ /, ''))
                    .join('\n')
                    .trim();
                if (!载荷 || 载荷 === '[DONE]')
                    return;
                try {
                    const chunk = JSON.parse(载荷);
                    const delta = chunk?.choices?.[0]?.delta ?? {};
                    if (typeof delta.content === 'string')
                        content += delta.content;
                    if (typeof delta.reasoning_content === 'string')
                        reasoning += delta.reasoning_content;
                }
                catch {
                    // 保留可继续读取的后续事件; 最终无正文时由下方报错
                }
            };
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    // SSE 事件以空行结束; 数据行可能分散在任意网络分片中
                    let 边界;
                    while ((边界 = buffer.search(/\r?\n\r?\n/)) >= 0) {
                        const 事件文本 = buffer.slice(0, 边界);
                        buffer = buffer.slice(边界).replace(/^\r?\n\r?\n/, '');
                        处理事件(事件文本);
                    }
                }
                buffer += decoder.decode();
                if (buffer.trim())
                    处理事件(buffer);
            }
            catch (error) {
                return 翻译中断(error);
            }
            if (!content) {
                throw Error(reasoning.length > 0
                    ? `响应中没有找到有效的正文内容。模型只返回了推理内容(${reasoning.length}字)而没有正文, 通常是「最大输出Token」被推理占满, 请调大最大输出Token。`
                    : `响应中没有找到有效的正文内容(${requestContext(host)})。请检查模型名是否正确、是否支持当前参数。`);
            }
            return content;
        }
        const data = await response.json();
        if (data?.error) {
            const message = typeof data.error === 'string' ? data.error : (data.error?.message ?? JSON.stringify(data.error));
            throw Error(`接口返回错误: ${String(message).slice(0, 300)}${policyBlockHint(String(message))}`);
        }
        const content = extractTextContent(data?.choices?.[0]);
        if (!content) {
            throw Error(`响应中没有找到有效的正文内容。${describeEmptyContent(data?.choices?.[0], data)}`);
        }
        return content;
    }
    finally {
        clearTimeout(timer);
        外部?.removeEventListener('abort', onAbort);
    }
}

export { chatCompletion, fetchModelList, normalizeBaseUrl };
export type { 接口宿主 };
