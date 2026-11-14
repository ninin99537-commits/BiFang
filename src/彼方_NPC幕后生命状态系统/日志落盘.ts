// 彼方 · 日志落盘(批次 3-3): 把"最近一次更新"的请求/响应存进**聊天变量**, 重载后还读得到。
//
// 为什么存聊天变量而不是楼层变量: 它只是"最近一轮的现场", 不随楼层增长; 清空数据时跟着清掉。
// 为什么单独一个文件: 快照层(快照.ts)明确不碰 pinia, 而日志仓(日志仓.ts)是 pinia store ——
// 两边都要用同一个键名与同一份形状, 于是把它放在这个既没有 pinia 也没有平台全局的小模块里。
// 依赖按实际用到的符号具名导入(形态守卫见 tests/no-bundle-artifacts.test.ts)
import type { Host } from './host';

/** 聊天变量里的键名(需求钉死; 只留 1 份, 每轮整体覆盖) */
const 日志键 = '彼方_日志';

/** 落盘的那一份。字段与需求一致: 时间 / 请求 / 响应 / 错误(可选)。 */
interface 落盘日志 {
    时间: number;
    请求: string;
    响应: string;
    错误?: string;
}

/** 只读写变量表的宿主(快照层与日志仓都拿得到这一项) */
type 日志宿主 = Pick<Host, 'vars'>;

/** 读回上一次落盘的日志; 没有/形状不对/读失败都返回 null(不抛) */
function 读取日志(host: 日志宿主): 落盘日志 | null {
    try {
        const 份 = host.vars.get({ type: 'chat' })?.[日志键];
        if (!份 || typeof 份 !== 'object' || Array.isArray(份))
            return null;
        return {
            时间: Number(份.时间) || 0,
            请求: String(份.请求 ?? ''),
            响应: String(份.响应 ?? ''),
            ...(份.错误 ? { 错误: String(份.错误) } : {}),
        };
    }
    catch (error) {
        console.warn('[彼方] 读取落盘日志失败(不影响本轮更新):', error);
        return null;
    }
}

/**
 * 写一份日志(整体覆盖该键, 别的聊天变量键不动)。返回是否写成功 ——
 * 调用方据此决定要不要提示; 提示不在这一层弹(与快照层同一纪律)。
 */
function 写入日志(host: 日志宿主, 份: 落盘日志): boolean {
    try {
        host.vars.update(variables => {
            variables[日志键] = {
                时间: 份.时间,
                请求: 份.请求,
                响应: 份.响应,
                ...(份.错误 ? { 错误: 份.错误 } : {}),
            };
            return variables;
        }, { type: 'chat' });
        return true;
    }
    catch (error) {
        console.error('[彼方] 日志写入聊天变量失败:', error);
        return false;
    }
}

/** 清空日志(清空数据时一并清; 没有该键也不算失败) */
function 清空日志(host: 日志宿主): void {
    try {
        host.vars.del(日志键, { type: 'chat' });
    }
    catch (error) {
        console.warn('[彼方] 清空落盘日志失败:', error);
    }
}

export { 日志键, 读取日志, 写入日志, 清空日志 };
export type { 落盘日志, 日志宿主 };
