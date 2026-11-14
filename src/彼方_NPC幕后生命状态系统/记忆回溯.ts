// 彼方 · 记忆回溯块处理(纯函数)
//
// 记忆插件会把 <recall>…</recall> 编码块追加在用户输入后面, 前面还带一段写给主 AI 的说明
// ("以上是用户的本轮输入，以下是<记忆回溯>的编码…")。世界书扫描要用原文——AM 编码靠它激活纪要条目;
// 但发给彼方更新 AI 的"本轮用户输入"若原样带着它, 更新 AI 会把说明当指令、把旧记忆当本轮事件。
// 这里把整块压成一行: 编码 + 距今时长, 明确标注"历史, 不是本轮发生的事"。

/** 说明段的识别: 以"以上是用户的本轮输入"开头、到 <recall> 之前的那一段 */
const 说明段 = /[^\n]*以上是用户的本轮输入[\s\S]*?(?=<recall>)/g;
const 回溯块 = /<recall>([\s\S]*?)<\/recall>/g;

/** 从 <recall> 块正文里取 "AM0256 | 0m" 这样的行 → ['AM0256(0m)', …] */
function 取编码(块: string): string[] {
    const 结果: string[] = [];
    for (const 行 of 块.split('\n')) {
        const m = 行.match(/(AM\d+)\s*\|\s*([^\s|]+)/);
        if (m)
            结果.push(`${m[1]}(${m[2]})`);
    }
    return 结果;
}

/** 把文本里的记忆回溯块压成一行; 没有 <recall> 时原样返回 */
function 压缩记忆回溯(文本: string): string {
    const 原文 = String(文本 ?? '');
    if (!原文.includes('<recall>'))
        return 原文;
    return 原文
        .replace(说明段, '')
        .replace(回溯块, (_, 块: string) => {
            const 编码 = 取编码(块);
            return 编码.length > 0
                ? `[记忆回溯·历史, 不是本轮发生的事, 括号内为距今时长: ${编码.join(' ')}]`
                : '';
        })
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export { 压缩记忆回溯, 取编码 };
