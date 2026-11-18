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
import { 加打散标记, 生成打散标记 } from './请求打散';
import { 新建请求态, 归属标记, 请求日志 } from './请求归属';
import type { 功能状态, 请求态 } from './请求归属';
import { 建工具定义, 建工具选择, 取回包正文, 是工具通道拒绝, 工具通道失败提示, 工具空回包提示 } from './工具通道';
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
    const 请求打散 = options?.接口?.请求打散 ?? baseCfg.请求打散 ?? false;
    const 工具通道 = options?.接口?.工具通道 ?? baseCfg.工具通道 ?? false;
    const 上下文进工具 = options?.接口?.上下文进工具 ?? baseCfg.上下文进工具 ?? false;
    // 流式在工具通道开启期间**强制关闭**(方案 §11.1): tool_call 的参数是分片到达的,
    // 拼接是最容易产生偶发空回包的地方, 而这类 bug 极难复现。用户明确接受这个代价。
    const 流式 = (options?.接口?.流式 ?? baseCfg.流式 ?? false) && !工具通道;
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
    // 上下文进工具(W4, 第三个开关): 整份上下文搬进工具的 description, messages 只留一句无害指令。
    // 为什么要有它: 这是"防服务端按请求形态/内容降级"的另一半 —— 上下文本身也不留在 messages 里。
    // 代价(面板灰字里写了): description 每轮都变 → 前缀缓存全失效; description 变长可能变慢。
    // 边界: 工具通道关着时请求里根本没有 tools, 这个开关**无效** —— 必须明确提示, 不许静默。
    //
    // ⚠️ 顺序有讲究: 必须在**打散之前**收上下文。否则打散标记会被收进工具说明里
    // (违反 P2-7: 标记只能进 messages, 进了 tools 就让前缀每轮都变),
    // 而且 messages 被换成单句之后标记就没了 —— 打散等于白开。
    let 工具上下文 = '';
    if (上下文进工具) {
        if (!工具通道) {
            console.warn('[彼方] 「上下文进工具」已开启但「工具通道」关着: 请求里没有工具, 这个开关本次不生效。'
                + '要让它起作用, 请同时打开「工具通道」。');
        }
        else {
            工具上下文 = messages
                .map((message: any) => `【${message.role === 'system' ? '系统指令' : message.role === 'user' ? '用户' : '助手'}】\n${String(message.content ?? '')}`)
                .join('\n\n────────\n\n');
            // messages 只留一句无害指令: 上下文已经在 description 里了, 再留一份等于发两遍。
            // 末条必须是 user —— 转发路径会把末条 user 抽成 user_input, 抽不到就会追加空消息。
            messages = [{ role: 'user', content: '请按工具说明里的要求，把本轮 NPC 状态写入缓冲区。' }];
        }
    }
    // 请求打散(K1): 每次请求换一个随机标记, 让同一份提示词不再字节相同。
    // 放在宏展开与 W4 搬上下文**之后**: 标记本身不该被宏替换, 也不该被收进工具说明。
    if (请求打散)
        messages = 加打散标记(messages, 生成打散标记());
    // 一次更新的多次重试共用一个请求态(由调用方创建并传下来): 请求序号要连续,
    // 否则"第几次请求"这条归属信息在重试时全是 1。
    const 请求态: 请求态 = options?.请求态 ?? 新建请求态();
    请求态.请求序号 += 1;
    const 功能: 功能状态 = { 工具通道, 请求打散 };
    const 路径 = 直连 ? '直连' : '转发';
    // 每次**实际请求**一条日志(不是每次更新一条): 重试时才定位得到是哪一发出了问题。
    // 酒馆会在模型名匹配 o1/o3/o4 / gpt-5-chat-latest 时静默删掉 tools 再发(openai.js:3000-3012),
    // 那条路唯一的可检测痕迹就是这里的 tools 计数。
    const 日志 = 请求日志(功能, 路径, 请求态, 工具通道 ? 建工具定义().length : 0);
    if (日志)
        console.info(日志);
    if (工具通道 && 上下文进工具)
        console.info(`[彼方] 上下文已搬进工具说明(${工具上下文.length} 字), messages 只剩一句指令`);
    // 归属标记: 两个开关全关时是空串 —— 老报错逐字节不变(验收 G2)。
    const 归属 = 归属标记(功能, 路径, 请求态);
    const base = normalizeBaseUrl(地址);
    if (!base)
        throw Error('请先填写接口地址');
    if (!模型)
        throw Error('请先选择模型');
    // 直连: 浏览器直接 POST /chat/completions, 不经过酒馆的生成管线
    if (直连)
        return await 直连请求(host, { base, 密钥, 模型, 温度, 最大token, 流式, messages, options, 工具通道, 工具上下文, 归属 });
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
        const 请求配置: Record<string, any> = {
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
        };
        // 工具通道(K2): 带一个强制调用的工具。上下文**仍留在 ordered_prompts 里** ——
        // 搬进 description 是 (b), 留第二轮独立开关(方案 §12.1)。
        // tools 与 json_schema 互斥, 这里只用 tools。
        if (工具通道) {
            请求配置.tools = 建工具定义(工具上下文);
            请求配置.tool_choice = 建工具选择();
        }
        const result = await Promise.race([
            host.model.raw(请求配置 as any),
            cancelBlocker,
        ]);
        // 回包取正文: 工具参数优先 → 正文兜底 → 两者都像载荷时取更长(方案 §11.2 必需项)。
        // 有 tool_calls 时 generateRaw 返回 GenerateDetailedResult 而不是 string,
        // 而且 arguments 是 **JSON 字符串**, 所以这里只取原文, 二次 parse 交给既有的解析层。
        const 取到 = 工具通道
            ? 取回包正文({
                工具参数: (result as any)?.tool_calls?.[0]?.function?.arguments,
                正文: typeof result === 'string' ? result : (result as any)?.content,
            })
            : { 文本: typeof result === 'string' ? result : (result as any)?.content ?? '', 来源: '正文' as const };
        const content = 取到.文本;
        if (!content) {
            // 工具通道下"什么都没拿到"有它自己的成因(接口不认强制 tool_choice → 模型不调工具),
            // 说清楚比丢一句"没有正文"有用 —— 这是 §18.3 对新增出口的同一要求。
            if (工具通道) {
                const 参数有无 = (result as any)?.tool_calls?.[0]?.function?.arguments ? '有' : '无';
                const 正文字数 = typeof result === 'string' ? result.length : String((result as any)?.content ?? '').length;
                throw Error(`${工具空回包提示(`(工具参数=${参数有无}, 正文=${正文字数} 字)${requestContext(host)}`)}${归属}`);
            }
            throw Error(`响应中没有找到有效的正文内容(${requestContext(host)})。可能是推理模型把最大输出Token用尽(无正文), 或模型不支持当前参数。请调大「最大输出Token」或更换模型后重试。${归属}`);
        }
        return content;
    }
    catch (error) {
        if (abortSignal?.aborted)
            throw Error('用户已中断本次更新', { cause: error });
        if (error instanceof Error && /无法连接到|接口返回错误|响应中|获取模型|工具通道/.test(error.message))
            throw error;
        // 工具相关的失败: 报错必须直接说出原因和动作, 不能只丢状态码(§18.3)。
        // 判据只看"4xx + 工具关键词" —— 5xx / 超时 / 密钥错都与开关无关, 照旧走下面的老文案。
        if (工具通道 && 是工具通道拒绝(error)) {
            throw Error(`${工具通道失败提示(error)}${归属}`, { cause: error });
        }
        // 超时通常是推理模型把时间花在思考上, 或接口负载高: 提示调小最大输出Token或换模型
        if (error instanceof Error && /Gateway|timeout|time-out|超时/i.test(error.message)) {
            throw Error(`生成超时(可能是推理模型的思考时间过长, 或接口负载高)。可调小「最大输出Token」或换更快的模型后重试。原始错误: ${error.message}${归属}`, { cause: error });
        }
        const errText = error instanceof Error ? error.message : String(error);
        throw Error(`通过酒馆服务器请求失败(${requestContext(host)}): ${errText}${policyBlockHint(errText)}${归属}`, { cause: error });
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
    工具通道: boolean;
    工具上下文: string;
    归属: string;
}) {
    const body: Record<string, any> = {
        model: p.模型,
        messages: p.messages,
        stream: p.流式,
        temperature: p.options?.temperature ?? p.温度,
        max_tokens: p.options?.max_tokens ?? p.最大token,
    };
    // 工具通道(K2): 与转发同一条定义、同一种 tool_choice 对象形式。
    // 直连这边本来是自己解 SSE, 而工具通道强制关流式 —— 等于这条支路顺带少一条代码路径。
    if (p.工具通道) {
        body.tools = 建工具定义(p.工具上下文);
        body.tool_choice = 建工具选择();
    }
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
            // 工具相关的失败: 直接说原因和动作(§18.3); 其余照旧 —— 文案与开关全关时逐字节一致。
            if (p.工具通道 && 是工具通道拒绝({ status: response.status, message: errText }))
                throw Error(`${工具通道失败提示(errText)}${p.归属}`);
            throw Error(`请求失败 (${errText})${policyBlockHint(errText)}${p.归属}`);
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
                    ? `响应中没有找到有效的正文内容。模型只返回了推理内容(${reasoning.length}字)而没有正文, 通常是「最大输出Token」被推理占满, 请调大最大输出Token。${p.归属}`
                    : `响应中没有找到有效的正文内容(${requestContext(host)})。请检查模型名是否正确、是否支持当前参数。${p.归属}`);
            }
            return content;
        }
        const data = await response.json();
        if (data?.error) {
            const message = typeof data.error === 'string' ? data.error : (data.error?.message ?? JSON.stringify(data.error));
            if (p.工具通道 && 是工具通道拒绝({ message: String(message) }))
                throw Error(`${工具通道失败提示(message)}${p.归属}`);
            throw Error(`接口返回错误: ${String(message).slice(0, 300)}${policyBlockHint(String(message))}${p.归属}`);
        }
        // 回包取正文: 与转发路径同一套判据(工具参数优先 → 正文兜底 → 都像载荷取更长)。
        // 直连拿得到完整的 data, 所以这里直接把 tool_calls 与 content 一起交给它。
        const 取到 = p.工具通道
            ? 取回包正文({
                工具参数: data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments,
                正文: extractTextContent(data?.choices?.[0]),
            })
            : { 文本: extractTextContent(data?.choices?.[0]), 来源: '正文' as const };
        const content = 取到.文本;
        if (!content) {
            if (p.工具通道) {
                const 参数有无 = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ? '有' : '无';
                const 正文字数 = extractTextContent(data?.choices?.[0]).length;
                throw Error(`${工具空回包提示(`(工具参数=${参数有无}, 正文=${正文字数} 字)${requestContext(host)}`)}${p.归属}`);
            }
            throw Error(`响应中没有找到有效的正文内容。${describeEmptyContent(data?.choices?.[0], data)}${p.归属}`);
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
