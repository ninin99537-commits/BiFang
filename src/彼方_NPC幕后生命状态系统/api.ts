// 已从酒馆导出的打包产物恢复 (webpack 编译形态还原)
import * as _settings__WEBPACK_IMPORTED_MODULE_0__ from './settings';

/* harmony export */ 
const REQUEST_TIMEOUT = 120_000;
function normalizeBaseUrl(url) {
    const trimmed = (url ?? '').trim().replace(/\/+$/, '');
    if (!trimmed)
        return '';
    return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}
function buildHeaders(apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    const key = apiKey.trim();
    if (key)
        headers['Authorization'] = `Bearer ${key}`;
    return headers;
}
function readableError(status, bodyText) {
    let message = bodyText.slice(0, 300);
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
/** 请求上下文(脱敏), 附加到错误信息方便排查 */
function requestContext() {
    const { 模型, 最大token, 服务端转发, 关闭思维链 } = _settings__WEBPACK_IMPORTED_MODULE_0__.getSettings().接口;
    return `模型=${模型 || '(未选)'}, 最大token=${最大token}, 服务端转发=${服务端转发 ? '开' : '关'}, 关闭思维链=${关闭思维链 ? '开' : '关'}`;
}
/** 检测接口/模型的成人内容政策拦截(如 Google Gemini 的 Prohibited Use policy), 返回友好提示 */
function policyBlockHint(message) {
    return /violat|prohibit|policy|sensitive words|unsupported content|content filter/i.test(message)
        ? '\n(疑似被接口/模型的成人内容政策拦截, 如 Google Gemini 的 Prohibited Use policy——这类服务在请求输入层就会拒绝含敏感词的提示词, 无法靠提示词绕过。可尝试: 关闭「女性NPC生理监测」, 或换用 DeepSeek/GLM/Qwen/Claude 等无此类硬过滤的模型)'
        : '';
}
async function fetchModelList() {
    const { 地址, 密钥, 服务端转发 } = _settings__WEBPACK_IMPORTED_MODULE_0__.getSettings().接口;
    const base = normalizeBaseUrl(地址);
    if (!base)
        throw Error('请先填写接口地址');
    // 走酒馆服务器转发(绕开浏览器跨域), 用于不支持 CORS 的接口
    if (服务端转发) {
        try {
            return await getModelList({ apiurl: base, key: 密钥 });
        }
        catch (error) {
            throw Error('通过酒馆服务器获取模型列表失败, 请检查地址与密钥', { cause: error });
        }
    }
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
    const list = (data?.data ?? [])
        .map(model => (typeof model === 'string' ? model : model?.id))
        .filter((id) => typeof id === 'string' && id.length > 0);
    return list;
}
function extractTextContent(choice) {
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
    if (typeof choice?.message?.content_text === 'string' && choice.message.content_text.length > 0) {
        return choice.message.content_text;
    }
    return '';
}
/** 判断响应是否为"只有推理、无正文"的典型情况(推理模型常把 max_tokens 消耗在推理上) */
function describeEmptyContent(choice, data) {
    const reasoning = choice?.message?.reasoning_content;
    const finish = choice?.finish_reason;
    const choicesCount = Array.isArray(data?.choices) ? data.choices.length : 0;
    const detail = JSON.stringify(data)?.slice(0, 300);
    if (reasoning) {
        return `模型只返回了推理内容而没有正文(reasoning_content 非空, finish_reason=${finish})。这通常是「最大输出Token」被推理过程占满所致, 请调大最大输出Token, 或改用不带思考/推理的模型。\n响应摘要: ${detail}`;
    }
    return `choices 数量=${choicesCount}, finish_reason=${finish}, content 为空。请检查模型名是否正确、是否支持当前参数。\n响应摘要: ${detail}`;
}
async function chatCompletion(messages, options) {
    const baseCfg = _settings__WEBPACK_IMPORTED_MODULE_0__.getSettings().接口;
    const 地址 = options?.接口?.地址 ?? baseCfg.地址;
    const 密钥 = options?.接口?.密钥 ?? baseCfg.密钥;
    const 模型 = options?.接口?.模型 ?? baseCfg.模型;
    const 温度 = options?.接口?.温度 ?? baseCfg.温度;
    const 最大token = options?.接口?.最大token ?? baseCfg.最大token;
    const 服务端转发 = options?.接口?.服务端转发 ?? baseCfg.服务端转发;
    const 关闭思维链 = options?.接口?.关闭思维链 ?? baseCfg.关闭思维链;
    // 展开酒馆骰子宏 {{roll 1d100}} → 真实随机数:
    // 彼方直连 API / generateRaw 都不经过酒馆的 substituteParams, 宏不会自动展开,
    // 这里手动替换, 保证受孕判定等需要随机数的场景拿到真实 D100 结果。
    messages = messages.map(message => ({
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
    // 走酒馆服务器转发(绕开浏览器跨域), 用于不支持 CORS 的接口
    if (服务端转发) {
        // 最后一条 user 消息作为 user_input 传入, 避免 generateRaw 追加空消息
        let userInput = '';
        const orderedPrompts = messages.map(message => ({
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
                stopGenerationById(generationId);
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
                generateRaw({
                    generation_id: generationId,
                    user_input: userInput,
                    should_silence: true,
                    // 流式接收: 上游边生成边返回, 避免长时间无响应触发网关超时(504/499)
                    should_stream: true,
                    max_chat_history: 0,
                    custom_api: {
                        apiurl: base,
                        key: 密钥.trim(),
                        model: 模型,
                        // 关闭思维链: 注入 thinking.type=disabled(Responses API 风格, 原生支持 Responses API 的模型如 deepseek-v4-flash-0731 可用)。
                        // 该参数需走 custom 源, 酒馆才会透传 custom_include_body
                        source: 关闭思维链 ? 'custom' : 'openai',
                        temperature: options?.temperature ?? 温度,
                        max_tokens: options?.max_tokens ?? 最大token,
                        ...(关闭思维链 ? { custom_include_body: { thinking: { type: 'disabled' } } } : {}),
                    },
                    ordered_prompts: orderedPrompts,
                }),
                cancelBlocker,
            ]);
            const content = typeof result === 'string' ? result : result?.content ?? '';
            if (!content) {
                throw Error(`响应中没有找到有效的正文内容(${requestContext()})。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。`);
            }
            return content;
        }
        catch (error) {
            if (abortSignal?.aborted)
                throw Error('用户已中断本次更新', { cause: error });
            if (error instanceof Error && /无法连接到|接口返回错误|响应中|获取模型/.test(error.message))
                throw error;
            // 超时通常是因为模型思维链/推理过长: 提示用户开启「关闭思维链」或调小最大输出Token
            if (error instanceof Error && /Gateway|timeout|time-out|超时/i.test(error.message)) {
                throw Error(`生成超时(可能是模型思维链/推理过长或接口负载高)。可开启「关闭思维链」或调小「最大输出Token」后重试。原始错误: ${error.message}`, { cause: error });
            }
            const errText = error instanceof Error ? error.message : String(error);
            throw Error(`通过酒馆服务器请求失败(${requestContext()}): ${errText}${policyBlockHint(errText)}`, { cause: error });
        }
        finally {
            if (abortSignal)
                abortSignal.removeEventListener('abort', stopHandler);
        }
    }
    const body = {
        model: 模型,
        messages,
        stream: false,
        temperature: options?.temperature ?? 温度,
        max_tokens: options?.max_tokens ?? 最大token,
        ...(关闭思维链 ? { thinking: { type: 'disabled' } } : {}),
    };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const signal = options?.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
        let response;
        try {
            response = await fetch(`${base}/chat/completions`, {
                method: 'POST',
                headers: buildHeaders(密钥),
                body: JSON.stringify(body),
                signal,
            });
        }
        catch (error) {
            if (options?.signal?.aborted)
                throw Error('用户已中断本次更新', { cause: error });
            if (error instanceof DOMException && error.name === 'AbortError')
                throw Error('请求超时', { cause: error });
            throw Error(`无法连接到接口地址(${requestContext()})。请检查地址是否正确或是否允许跨域(CORS)`, { cause: error });
        }
        if (!response.ok) {
            const bodyText = await response.text();
            const errText = readableError(response.status, bodyText);
            throw Error(`请求失败 (${errText})${policyBlockHint(errText)}`);
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
        window.clearTimeout(timer);
    }
}

export { chatCompletion, fetchModelList, normalizeBaseUrl };
