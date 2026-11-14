// 彼方 · 身体迹象(纯函数, 不依赖酒馆平台)
//
// 只在注入时由代码算出, 不增加更新 AI 的负担:
//   - 孕期: 按孕周给出身体能感觉到的变化(月经推迟 → 孕吐嗜睡 → 显怀), 孕程按「孕程周数」等比缩放;
//   - 普通周期: 经期头两天腹痛乏力、经前两三天易烦躁。
// 这些是身体事实, 不是"知道自己怀孕"——知晓程度仍由「怀孕」列单独说明。

/** 人类孕程(周): 未填「孕程周数」时按它 */
const 人类孕程 = 40;

function 取整数(值: unknown): number | null {
    const n = Number(String(值 ?? '').trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** 孕周 → 迹象。孕程不是 40 周的种族按比例换算到人类孕周再查表 */
export function 孕期迹象(孕周: number, 孕程周数: number | null = null): string {
    const 孕程 = 孕程周数 ?? 人类孕程;
    const 等效 = (孕周 / 孕程) * 人类孕程;
    if (等效 >= 人类孕程 - 3)
        return '临近预产期, 肚子沉, 睡不安稳';
    if (等效 >= 28)
        return '肚子明显隆起, 行动变慢, 容易腰酸';
    if (等效 >= 16)
        return '小腹开始隆起';
    if (等效 >= 13)
        return '孕吐减轻, 胃口回来了';
    if (等效 >= 6)
        return '恶心反胃, 嗜睡, 胸口胀痛';
    if (等效 >= 4)
        return '月经推迟了';
    return '';
}

/** 周期日 → 迹象 */
export function 周期迹象(日: number, 周期长度: number): string {
    if (日 >= 1 && 日 <= 2)
        return '经期第一二天, 腹痛乏力';
    if (日 >= 3 && 日 <= 5)
        return '经期中';
    if (周期长度 > 0 && 日 >= 周期长度 - 2 && 日 <= 周期长度)
        return '经前几天, 容易烦躁、胸胀';
    return '';
}

/** 从卡上算出注入用的身体迹象; 认不出就返回空串 */
export function 身体迹象(卡: Record<string, any>): string {
    const 周期 = String(卡?.['生理周期'] ?? '');
    const 孕 = 周期.match(/孕期\s*孕\s*(\d+)\s*周/);
    if (孕)
        return 孕期迹象(+孕[1], 取整数(卡?.['孕程周数']));
    if (周期.includes('哺乳期'))
        return '';
    const 日 = 周期.match(/Day\s*(\d+)\s*\/\s*(\d+)/i);
    if (日)
        return 周期迹象(+日[1], +日[2]);
    return '';
}
