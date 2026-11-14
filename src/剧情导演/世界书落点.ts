// 剧情导演 · 世界书落点
// ---------------------------------------------------------------------------
// 「编剧备忘」写进哪本世界书 —— 这是 E1 真机缺陷的修复所在, 一整套按可用性解析的分支:
//   ① 角色卡主世界书(primary): 先探测存在性, 悬空/未安装就跳过;
//   ② 角色卡副世界书(additional)里已经有我们条目的那本(避免在多本里重复注入同一条);
//   ③ 聊天世界书(聊天文件级, 与账本同隔离粒度);
//   ④ 仅当确实要写入时: 取/新建专属聊天世界书(不改用户角色卡)。
// 外加"确保只有一份"的清理: 落点会随绑定修复而变化, 不清理旧副本主 AI 会同时读到两份。
//
// 以前这些和指令层一起塞在 注入.ts(336 行) 里, 接口上只露出三个导出 —— 落点策略只能在
// 真机上试。现在它自己一个 module: 假 worldbook 就能把四条路径 + 全不可用各走一遍。
import { useHost } from './host';
import { WORLDBOOK_ENTRY_NAME } from './state';
import type { 导演账本 } from './schema';

/**
 * 是不是"我们写的"导演条目 —— **只认精确标记**（2026-11-13 用户拍板 A 案）。
 *
 * 以前这里有 `/剧情导演/`（**无锚定**）这类宽松模式，后果是**数据丢失**：
 * 用户自建的《我的剧情导演笔记》《剧情导演参考》《关于剧情导演的设定》，以及一条
 * 备注里带「剧情导演」的 NPC 卡，全被判成"我们的条目"，然后被启动清理/落点清理**自动删掉**。
 * （`tmp/prove-wb.mjs` 实测 4/4 中招。）
 *
 * 现在只认四条，任一成立才算：
 *   ① `extra.daoyan === true` —— 我们写入时打的标记；
 *   ② 名字或备注**恰好等于** `WORLDBOOK_ENTRY_NAME`；
 *   ③ 内容以 `[剧情导演 · 编剧备忘]` 开头 —— `buildInjectionPrompt` 的第一行；
 *   ④ 内容以 `【本幕参考】` 开头 —— 旧版指令层条目，确实是我们写的。
 *
 * 旧的宽松判定没有丢，挪进了 `列出疑似旧条目()`：**只列不删**，由用户手动清理。
 */
export function is导演条目(entry: any): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.extra?.daoyan === true) return true;
  const 名 = String(entry.name ?? '');
  const 注 = String(entry.comment ?? '');
  if (名 === WORLDBOOK_ENTRY_NAME || 注 === WORLDBOOK_ENTRY_NAME) return true;
  const 内容 = String(entry.content ?? '').trimStart();
  return 内容.startsWith('[剧情导演 · 编剧备忘]') || 内容.startsWith('【本幕参考】');
}

/** 一条"疑似旧版命名"的条目（只报告，不删除） */
export interface 疑似旧条目 {
  书: string;
  条目: string;
  原因: string;
}

/**
 * 宽松判定：给"疑似旧条目"用，**绝不进 `is导演条目`**。
 * 返回空串 = 不疑似。
 */
function 疑似原因(entry: any): string {
  const 名 = String(entry?.name ?? '');
  const 注 = String(entry?.comment ?? '');
  const 内容 = String(entry?.content ?? '').trimStart();
  const 标题 = `${名}\n${注}`;
  if (/^【导演/m.test(标题)) return '名字/备注以【导演 开头（旧版命名）';
  if (/^导演指令/m.test(标题)) return '名字/备注以「导演指令」开头（旧版命名）';
  if (/^编剧备忘/m.test(标题)) return '名字/备注以「编剧备忘」开头（旧版命名）';
  if (标题.includes('剧情导演')) return '名字/备注含「剧情导演」';
  if (内容.startsWith('【导演')) return '内容以【导演 开头（旧版条目）';
  if (内容.startsWith('【编剧备忘】')) return '内容以【编剧备忘】开头（旧版条目）';
  return '';
}

/**
 * 账本是否有可注入的事实(章回/冲突/伏笔/弧线/命运册任一非空)。
 * **阶段 B 起命运册也算**: 一个"只有死亡与永久后果"的账本同样必须让主 AI 知道
 * (否则死者在下一幕就能作为活人出场, 而这正是本次要修的缺陷)。
 */
export function 有账本事实(data: 导演账本): boolean {
  return !!(
    data?.章回 ||
    (data?.冲突?.length ?? 0) > 0 ||
    (data?.伏笔?.length ?? 0) > 0 ||
    (data?.弧线?.length ?? 0) > 0 ||
    (data?.角色命运?.length ?? 0) > 0 ||
    String(data?.当前视角 ?? '').trim() !== '' ||
    String(data?.续演视角 ?? '').trim() !== ''
  );
}

/** 事实层落点(哪本世界书 + 为什么选它) */
export interface 事实层落点 {
  名: string;
  来源: string;
}

/**
 * 错误对象的**可读文本**。真机实测遇到过 `getWorldbook` 抛出的错误对象是 `{}`(无 message)——
 * 直接 `console.error('...失败:', error)` 在日志页只会看到 `{}`, 等于静默降级。这里必须兜底。
 */
export function 错误文本(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name;
  const 任意 = error as any;
  if (任意 && typeof 任意 === 'object') {
    if (typeof 任意.message === 'string' && 任意.message) return 任意.message;
    try {
      const 串 = JSON.stringify(任意);
      if (串 && 串 !== '{}') return 串;
    } catch {
      // 循环引用等 → 落到下面的类型名
    }
    return `[无法序列化的对象 ${Object.prototype.toString.call(任意)}]`;
  }
  return String(error);
}

/** 探测世界书**是否真的可读**: 卡里 extensions.world 指向未安装/改名的书时 getWorldbook 会抛错 */
async function 世界书可读(名: string | null | undefined): Promise<boolean> {
  if (!名) return false;
  try {
    await useHost().worldbook.entries(名);
    return true;
  } catch {
    return false;
  }
}

/**
 * 事实层落点解析 —— **按可用性解析, 不盲写 primary**(E1 真机缺陷的修法)。
 * 顺序(dsh 审定):
 *   ① 角色卡主世界书(primary): **先探测存在性**, 悬空/未安装就跳过;
 *   ② 角色卡副世界书(additional)里**已经有我们条目**的那本(避免在多本里重复注入同一条);
 *   ③ 聊天世界书(聊天文件级, 与账本同隔离粒度);
 *   ④ 仅当"确实要写入"时: 取/新建专属**聊天**世界书(酒馆标准能力, 自动对当前聊天生效, **不改用户角色卡**)。
 * 全不可用 → 落点 null + 可读的 失败原因(**不抛穿、不静默**)。
 */
export async function 解析事实层落点(
  选项: { 允许新建: boolean } = { 允许新建: true },
): Promise<{ 落点: 事实层落点 | null; 悬空: string | null; 失败原因: string }> {
  let 悬空: string | null = null;
  let 附加: string[] = [];
  try {
    const 绑定 = useHost().worldbook.boundNames();
    附加 = [...(绑定?.additional ?? [])];
    if (绑定?.primary) {
      if (await 世界书可读(绑定.primary)) return { 落点: { 名: 绑定.primary, 来源: '角色卡主世界书' }, 悬空: null, 失败原因: '' };
      悬空 = 绑定.primary;
    }
  } catch (error) {
    return { 落点: null, 悬空: null, 失败原因: `读取角色卡世界书绑定失败: ${错误文本(error)}` };
  }

  const 探测过: string[] = [];
  for (const 名 of 附加) {
    try {
      if (!(await 世界书可读(名))) {
        探测过.push(`${名}(不可读)`);
        continue;
      }
      if ((await useHost().worldbook.entries(名)).some(is导演条目)) {
        return { 落点: { 名, 来源: '角色卡副世界书(已有条目)' }, 悬空, 失败原因: '' };
      }
      探测过.push(`${名}(可读但无我们的条目)`);
    } catch (error) {
      探测过.push(`${名}(${错误文本(error)})`);
    }
  }

  try {
    const 聊天书 = useHost().worldbook.chatName();
    if (聊天书) {
      if (await 世界书可读(聊天书)) return { 落点: { 名: 聊天书, 来源: '聊天世界书' }, 悬空, 失败原因: '' };
      探测过.push(`${聊天书}(不可读)`);
    }
  } catch (error) {
    探测过.push(`聊天世界书探测失败(${错误文本(error)})`);
  }

  if (选项.允许新建) {
    try {
      const 新建 = await useHost().worldbook.getOrCreateChat(WORLDBOOK_ENTRY_NAME);
      if (新建 && (await 世界书可读(新建))) return { 落点: { 名: 新建, 来源: '聊天世界书(自动创建)' }, 悬空, 失败原因: '' };
      探测过.push('新建聊天世界书失败(返回空)');
    } catch (error) {
      探测过.push(`新建聊天世界书失败(${错误文本(error)})`);
    }
  }

  const 细节 = 探测过.length > 0 ? `；已探测: ${探测过.join(' / ')}` : '';
  const 头部 = 悬空 ? `角色卡主世界书「${悬空}」不可读(链接悬空/未安装)` : '角色卡没有绑定世界书';
  return { 落点: null, 悬空, 失败原因: `${头部}${细节}` };
}

/**
 * 确保"编剧备忘**只有一份**"(E1 补充①, dsh 2026-10-07):
 * 落点会因为绑定修复而变化(悬空 → 聊天书, 后来主世界书可读了 → 又写回主世界书),
 * 若不清理旧副本, 主 AI 会**同时读到两份**, 其中一份永远是陈旧的。
 * `保留` 传目标书名(撤掉别处的副本); 传空串 = 全部撤掉(关闭注入/剧终时用)。
 */
export async function 清理别处的副本(保留: string): Promise<void> {
  const 候选 = new Set<string>();
  try {
    const 绑定 = useHost().worldbook.boundNames();
    if (绑定?.primary) 候选.add(绑定.primary);
    for (const 名 of 绑定?.additional ?? []) 候选.add(名);
  } catch {
    // 忽略: 绑定读不到就当没有候选
  }
  try {
    const 聊天书 = useHost().worldbook.chatName();
    if (聊天书) 候选.add(聊天书);
  } catch {
    // 忽略
  }
  候选.delete(保留);
  for (const 名 of 候选) {
    try {
      if (!(await 世界书可读(名))) continue;
      if (!(await useHost().worldbook.entries(名)).some(is导演条目)) continue;
      await useHost().worldbook.remove(名, is导演条目);
      console.warn(
        保留
          ? `[剧情导演] 编剧备忘落点改为「${保留}」, 已清理「${名}」里的旧副本(避免双份/陈旧)`
          : `[剧情导演] 已撤掉「${名}」里的编剧备忘条目`,
      );
    } catch (error) {
      console.warn(`[剧情导演] 清理「${名}」里的编剧备忘副本失败: ${错误文本(error)}`);
    }
  }
}

/** 候选世界书: 角色卡主/副 + 聊天书(读不到的跳过) */
function 候选世界书名(): string[] {
  const 候选 = new Set<string>();
  try {
    const 绑定 = useHost().worldbook.boundNames();
    if (绑定?.primary) 候选.add(绑定.primary);
    for (const 名 of 绑定?.additional ?? []) 候选.add(名);
  } catch {
    // 忽略
  }
  try {
    const 聊天书 = useHost().worldbook.chatName();
    if (聊天书) 候选.add(聊天书);
  } catch {
    // 忽略
  }
  // 全局世界书也要扫(2026-10-30): 旧版本可能把条目写进全局书, 不扫就永远清不掉
  try {
    for (const 名 of useHost().worldbook.globalNames() ?? []) 候选.add(名);
  } catch {
    // 忽略
  }
  return [...候选];
}

/**
 * 扫描(不删除): 列出世界书里所有当前会被认作"导演条目"的项。
 * 给面板的"清理世界书条目"用 —— 先让用户看见有几条、叫什么, 再决定删。
 */
export async function 列出导演条目(): Promise<{ 书: string; 条目: string }[]> {
  const 结果: { 书: string; 条目: string }[] = [];
  for (const 名 of 候选世界书名()) {
    try {
      if (!(await 世界书可读(名))) continue;
      for (const 条 of await useHost().worldbook.entries(名)) {
        if (is导演条目(条)) 结果.push({ 书: 名, 条目: String(条?.name ?? '(无名)') });
      }
    } catch {
      // 忽略
    }
  }
  return 结果;
}

/**
 * 扫描(不删除): 列出**疑似旧版命名**的条目 —— 插件**不会删它们**，只是告诉用户去手动清理。
 *
 * 为什么要有这个：收窄 `is导演条目` 之后，旧版本留在世界书里的条目（`【导演】角色状态`、
 * `导演指令 · …` 等）不再被自动删除，它们**仍在注入**。静默不管等于"关了插件还在生效"，
 * 所以必须有一个只说不动口的出口。
 *
 * 判定用宽松规则（`疑似原因`），且**排除**已被 `is导演条目` 精确命中的那些（那些会被正常清理）。
 * 扫描范围与 `清空导演条目` 相同（`候选世界书名`）。
 */
export async function 列出疑似旧条目(): Promise<疑似旧条目[]> {
  const 结果: 疑似旧条目[] = [];
  for (const 名 of 候选世界书名()) {
    try {
      if (!(await 世界书可读(名))) continue;
      for (const 条 of await useHost().worldbook.entries(名)) {
        if (is导演条目(条)) continue; // 精确命中的交给正常清理，不算"疑似"
        const 原因 = 疑似原因(条);
        if (原因) 结果.push({ 书: 名, 条目: String(条?.name ?? '(无名)'), 原因 });
      }
    } catch {
      // 忽略
    }
  }
  return 结果;
}

/**
 * 把**精确命中**的导演条目从世界书里删掉（2026-10-30；2026-11-13 收紧为 A 案）。
 *
 * 总开关关掉时就该是这个效果: 不是"写一条空条目", 而是**条目本身消失** ——
 * 否则主 AI 仍会读到标题与占位文本, 等于插件还在施加影响。
 *
 * ⚠️ 现在**只删精确命中的**；疑似旧命名的**一条都不删**，只随返回值交出去让用户手动清理
 * （见 `疑似`）。这是用户拍板的 A 案：宁可漏删，绝不误删用户的条目。
 */
export async function 清空导演条目(): Promise<{ 删掉: string[]; 疑似: 疑似旧条目[] }> {
  const 删掉: string[] = [];
  for (const 名 of 候选世界书名()) {
    try {
      if (!(await 世界书可读(名))) continue;
      const 命中 = (await useHost().worldbook.entries(名)).filter(is导演条目);
      if (命中.length === 0) continue;
      await useHost().worldbook.remove(名, is导演条目);
      const 本批 = 命中.map(条 => `${名}#${String(条?.name ?? '(无名)')}`);
      删掉.push(...本批);
      // 只打印**本批**（以前打印累计清单，第二本书看起来像"又删了一遍同一批"）
      console.warn(`[剧情导演] 已删除世界书条目: ${本批.join('、')}`);
    } catch (error) {
      console.warn(`[剧情导演] 清理「${名}」的导演条目失败: ${错误文本(error)}`);
    }
  }
  const 疑似 = await 列出疑似旧条目();
  if (疑似.length > 0) {
    const 前几条 = 疑似.filter((_, i) => i < 3).map(项 => `${项.书}#${项.条目}`);
    console.warn(
      `[剧情导演] 世界书里还有 ${疑似.length} 条**疑似旧版命名**的条目（${前几条.join('、')}${疑似.length > 3 ? ' 等' : ''}）` +
        ' —— 插件不再自动删除它们, 请在酒馆的世界书面板里手动清理。',
    );
  }
  return { 删掉, 疑似 };
}
