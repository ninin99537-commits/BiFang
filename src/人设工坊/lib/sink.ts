import type { Settings, Draft } from '../schema';
import type { 素材 } from './prompt';
import { 取预填充标题 } from './prompt';
import { 模块注册表 } from './modules';
import { JB_ASSISTANT, JB_SYSTEM, 工坊系统提示, 内置头部填充, 防截断段 } from './prompts';
import { 取短名 } from './取名';
import { 取条目标题 } from './世界书';
import { 拆分人设 } from './拆分';
import { 归一接口地址 } from './接口';

// ---------------------------------------------------------------------------
// 人设工坊 · 取料 / 生成 / 落地
//
// 取料: 角色卡 / user 人设 / 聊天记录 → 素材
// 生成: generateRaw + 流式 + 停止
// 落地: 复制 / 覆盖 user 人设 / 写入世界书 / 存草稿
//
// 所有落地动作都不静默失败: 成功 toastr.success, 失败 console.error + toastr.error。
// ---------------------------------------------------------------------------

/** 草稿箱上限 */
export const 草稿上限 = 50;
/** 草稿在脚本变量里的键 */
const 草稿键 = '人设工坊_drafts';

/**
 * 取纯文本: 只去首尾空白, **不做任何长度处理**。
 *
 * 这里以前有一个按上限切片的 helper(角色卡各字段切 2000、user 人设切 2000、聊天记录切 4000)。
 * 2026-10-14 用户报"参考的内容会截断"并要求全部去掉 —— 理由是对的, 而且严重:
 * 从句子中间切、切完补 `…`, 一句话被切一半意思可能直接反过来
 * ("她不会拒绝" → "她不会…")。这不是"少一点信息", 是**注入了错误的语义**。
 * 素材是给 AI 判断角色用的, 完整性优先于省 context;
 * 体量改为在提示词预览里显示字符数, 由用户知情决定要不要关掉某个素材源。
 */
function 取文本(文本: unknown): string {
  return String(文本 ?? '').trim();
}

/**
 * 取注入素材: 角色卡 / user 人设 / 聊天记录 / 一句话需求。
 *
 * 世界书那一段**不在这里拼** —— 读条目是异步的(getWorldbook 返回 Promise), 而本函数是同步的,
 * 供 computed 直接调用。世界书由 App.vue 异步加载条目、按选择拼好后覆盖 结果.worldbook。
 * 这里给个空串占位, 保证 素材 类型完整。
 */
export function 取素材(设置: Settings): 素材 {
  const 结果: 素材 = { charInfo: '', userPersona: '', chatHistory: '', worldbook: '', brief: 设置.brief };

  if (设置.material.charCard) {
    try {
      const 卡 = getCharData('current');
      if (卡) {
        const 段: string[] = [];
        const 加 = (名: string, 值: unknown) => {
          const 净 = 取文本(值);
          if (净) 段.push(`### ${名}\n${净}`);
        };
        加('角色名', 卡.name);
        加('描述', 卡.description);
        加('性格', 卡.personality);
        加('场景', 卡.scenario);
        加('示例对话', 卡.mes_example);
        结果.charInfo = 段.join('\n\n');
      }
    } catch (error) {
      console.warn('[人设工坊] 读取角色卡失败:', error);
    }
  }

  if (设置.material.userPersona) {
    try {
      结果.userPersona = 取文本(getPersona('current').description);
    } catch (error) {
      console.warn('[人设工坊] 读取 user 人设失败:', error);
    }
  }

  if (设置.material.chatHistory && 设置.material.chatDepth > 0) {
    try {
      const 末 = getLastMessageId();
      if (末 >= 0) {
        // 记录条数 = 取最后 N 条**完整消息**拼起来, 不是从句子中间切:
        // 每条楼层的 message 原样进入, 楼与楼之间只加分隔。所以这不是"截断", 不会破坏任何一句话。
        const 起 = Math.max(0, 末 - 设置.material.chatDepth + 1);
        const 记录 = getChatMessages(`${起}-${末}`)
          .map(楼 => `${楼.name}：${楼.message}`)
          .join('\n\n');
        结果.chatHistory = 取文本(记录);
      }
    } catch (error) {
      console.warn('[人设工坊] 读取聊天记录失败:', error);
    }
  }

  return 结果;
}

// ── 生成 ───────────────────────────────────────────────────────────────────

export type 生成句柄 = {
  id: string;
  /** 生成结束(成功或失败)后 resolve; 失败时 reject */
  完成: Promise<string>;
};

/** 请求技巧的兜底(测试直接构造 Settings 时可能缺 request 字段) */
const 请求兜底 = { jailbreak: false, headFiller: false, headFillerText: '', antiTruncation: false, prefill: false };

/**
 * 拼消息数组(对标烟火 prompts.ts:271-290 的六段结构)。
 *
 * 顺序:
 *   ① [user]      头部填充(开时; 无任何标注)
 *   ② [system]    工坊身份 + (防截断? 用户指定的免责声明段)
 *   ③ [user]      任务提示词(user_input 占位符展开)
 *   ④ [system]    JB_SYSTEM   ← 破限开
 *   ⑤ [assistant] JB_ASSISTANT ← 破限开(伪装成模型自己说过的话)
 *   ⑥ [assistant] 预填充(第一个勾选模块标题) ← 预填充开
 *   ⑦ [user]      "现在, 按上述全部规则开始执行任务。" ← 破限开 且 预填充关
 *
 * ★★ 2026-10-15 「工坊身份在日志里变成 user」的真凶**不是**这里的占位符。
 *   实测结论(证据: SillyTavern\src\prompt-converters.js:932-938 与 :890-896):
 *     ST 的「提示词后处理」(oai_settings.custom_prompt_post_processing) 本机 = 'strict',
 *     服务端在 chat-completions.js:2164 调 postProcessPrompt(messages, 'strict'):
 *       ① 把所有 **下标 > 0** 的 system 消息**改写成 user**;
 *       ② 再把**相邻同角色**的消息合并(用 '\n\n' 拼接)。
 *     于是 [user(头部填充), system(工坊身份), user(正文), system(破限段), assistant, user]
 *     变成 [user(填充\n\n工坊身份\n\n正文\n\n破限段), assistant, user] ——
 *     这就是"填充后面直接接身份、且没有 role 行"的来源。
 *   **有没有这个占位符都会这样** —— system 排在下标 1(>0) 就已经注定。
 *   豁免的只有**下标 0** 的 system; 烟火之所以看着正常, 最可能是它的「头部填充」没开,
 *   于是 system 落在下标 0。
 *   日志出处: SillyTavern\src\endpoints\backends\chat-completions.js:2588
 *     console.debug('Chat Completion request:', requestBody)  ← 打的是**发给 API 的 payload**(已被改写)
 *
 * ★ 曾经的误判(留档, 别再犯): 我一度以为是占位符导致 RolePrompt 被折进前一条消息,
 *   删掉占位符改成真实消息 —— 结果**改废了**, 因为收尾那条 user 还留在数组里,
 *   末尾成了两条**连续同角色** user 被 ST 合并, 承诺(assistant)被埋。
 */
export function 拼消息(设置: Settings): (PlaceholderPrompt | RolePrompt)[] {
  const 请求 = { ...请求兜底, ...(设置.request ?? {}) };
  const 有序: (PlaceholderPrompt | RolePrompt)[] = [];

  if (请求.headFiller) {
    有序.push({ role: 'user', content: String(请求.headFillerText ?? '').trim() || 内置头部填充 });
  }

  有序.push({ role: 'system', content: 工坊系统提示 + (请求.antiTruncation ? 防截断段 : '') });

  有序.push('user_input');

  if (请求.jailbreak) {
    有序.push({ role: 'system', content: JB_SYSTEM });
    有序.push({ role: 'assistant', content: JB_ASSISTANT });
  }

  const 预填充 = 取预填充标题(设置, 模块注册表);
  if (请求.prefill && 预填充) {
    有序.push({ role: 'assistant', content: 预填充 });
  } else if (请求.jailbreak) {
    有序.push({ role: 'user', content: '现在, 按上述全部规则开始执行任务。' });
  }

  return 有序;
}

/**
 * 调 generateRaw 生成人设。
 * - 流式(**可选**, 见 `请求.stream`, 默认关): 监听 STREAM_TOKEN_RECEIVED_FULLY, 按 generation_id 过滤。
 *   关掉时不订阅、`should_stream: false` —— 结果整段出来才进面板。
 * - 停止: 用返回的 id 调 stopGenerationById。
 *   ★ **不依赖流式** —— stopGenerationById 按 generation_id 停(generate.d.ts:210-216),
 *   所以关流式之后「停止」按钮照样有效, 不是拿中止换来的。
 * - ordered_prompts 不带 chat_history —— 聊天记录已在素材区放了一份, 不塞两遍。
 */
export function 生成人设(设置: Settings, 提示词: string, on流式: (文本: string) => void): 生成句柄 {
  const id = `forge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const 流式 = 设置.request.stream;
  // 关流式就不挂监听器 —— 挂了也永远收不到本 id 的 token, 白占一个订阅
  const 订阅 = 流式
    ? eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (全文: string, gid: string) => {
        if (gid === id) on流式(全文);
      })
    : null;

  const 配置: GenerateRawConfig = {
    generation_id: id,
    user_input: 提示词,
    should_silence: true,
    should_stream: 流式,
    ordered_prompts: 拼消息(设置),
  };

  if (设置.api.source === 'custom' && 设置.api.apiurl.trim()) {
    配置.custom_api = {
      // #193: 地址走归一化(去尾斜杠 + 补 /v1) —— SettingsPanel 的 placeholder 承诺的就是这个
      apiurl: 归一接口地址(设置.api.apiurl),
      key: 设置.api.key.trim(),
      model: 设置.api.model.trim(),
      source: 'openai',
    };
  }

  const 完成 = generateRaw(配置)
    .then(结果 => (typeof 结果 === 'string' ? 结果 : (结果?.content ?? '')))
    .finally(() => 订阅?.stop());

  return { id, 完成 };
}

// ── 落地一: 复制 ───────────────────────────────────────────────────────────

/** 换行归一: `\r\n` 与单独的 `\r` 都归一成 `\n`(Windows 剪贴板会把 `\n` 变成 `\r\n`) */
function 归一换行(文本: string): string {
  return 文本.replace(/\r\n?/g, '\n');
}

/**
 * 回读比对: 剪贴板读回的内容与写入的是否一致。
 *
 * 导出成纯函数是为了**可测** —— #157 那个回归(Windows 上多行文本必然误报)就是因为
 * 比对逻辑埋在 `复制文本` 里、依赖 `navigator.clipboard`, 没法写单元测试。
 * 比对前两边都归一换行, 否则 `\n` 被剪贴板改成 `\r\n` 就会误判成"不一致"。
 */
export function 剪贴板内容一致(写入: string, 回读: string): boolean {
  return 归一换行(回读) === 归一换行(写入);
}

/**
 * 复制到剪贴板。
 *
 * #124 1.1: 旧实现有两个独立缺陷 ——
 *   ① **回退分支是死代码**: 它用 `$('<textarea>')`, 而面板挂在嵌套 iframe 里,
 *      那里 `typeof $ === 'undefined'`, 主路径一失败就抛 `$ is not defined`, 回退从未生效;
 *   ② **主路径不验证**: `writeText` 只要 resolve 就 return, 文档未聚焦 / 浏览器静默吞掉时
 *      照样 resolve → 弹「成功」但剪贴板没变。
 * 现在: 先聚焦 → 写 → 回读比对(有权限时) → 回退改纯 DOM → 都不行如实抛错; 空白内容直接抛。
 *
 * #157 P0 回归修复: 回读比对**必须先归一换行** —— Windows 剪贴板把 `\n` 归一成 `\r\n`,
 * 而人设文本必然多行, 所以不归一时**每次复制都会误报「内容不一致」**(剪贴板其实是对的)。
 * 这是加了回读验证引入的反向缺陷: 修掉了"静默失败", 却造出"成功却报失败"。
 */
export async function 复制文本(文本: string): Promise<void> {
  const 内容 = String(文本 ?? '');
  // #157: 纯空白也算空 —— 复制一个空格没有意义, 而"成功"提示会误导。
  if (!内容.trim()) throw Error('内容为空, 没有可复制的内容');

  // 剪贴板写入要求文档聚焦 —— 这是最常见的一种静默失败。
  try {
    window.focus();
  } catch {
    // 某些环境拿不到焦点, 不致命, 继续尝试写入
  }

  // 主路径: Clipboard API。writeText resolve ≠ 真写进去了, 所以回读验证;
  // 没有 clipboard-read 权限(读不了)时按成功处理 —— 能读才比对, 不因"验不了"判失败。
  try {
    await navigator.clipboard.writeText(内容);
    let 可读 = true;
    let 回读 = '';
    try {
      回读 = await navigator.clipboard.readText();
    } catch {
      可读 = false;
    }
    // 比对前两边都归一换行(\r\n 与单独的 \r 都管) —— 否则 Windows 上多行文本必误报
    if (可读 && !剪贴板内容一致(内容, 回读)) throw Error('复制失败: 剪贴板内容与写入不一致');
    return;
  } catch (错误) {
    // 内容不一致是硬失败(不静默); 其它(权限/不支持)落到下面的回退
    if (错误 instanceof Error && 错误.message.startsWith('复制失败: 剪贴板内容')) throw 错误;
  }

  // 回退: 纯 DOM, **不依赖 jQuery** —— 面板在嵌套 iframe 里 typeof $ === 'undefined'。
  const 区域 = document.createElement('textarea');
  区域.value = 内容;
  区域.setAttribute('readonly', '');
  区域.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
  document.body.appendChild(区域);
  try {
    区域.focus();
    区域.select();
    区域.setSelectionRange(0, 内容.length);
    if (!document.execCommand('copy')) throw Error('复制失败: 浏览器拒绝了剪贴板访问');
  } finally {
    区域.remove();
  }
}

// ── 落地二: 覆盖当前 user 人设 ─────────────────────────────────────────────

/**
 * 覆盖当前 user 人设的 description。
 * 当前没有 persona 时先 createPersona —— 名字取当前名或 `{{user}}`。
 */
export async function 覆盖当前人设(文本: string, 名字提示?: string): Promise<void> {
  const 内容 = String(文本 ?? '').trim();
  if (!内容) throw Error('内容为空, 未写入人设');
  const 现有 = getCurrentPersonaName();
  if (现有) {
    await updatePersonaWith('current', 人设 => {
      人设.description = 内容;
      return 人设;
    }, { render: 'immediate' });
    return;
  }
  const 名 = 取新人设名(名字提示);
  const 成功 = await createPersona(名, { description: 内容 }, { render: 'immediate' });
  if (!成功) throw Error(`新建 persona「${名}」失败(可能已存在同名或同头像)`);
}

/**
 * 新建 persona 的名字: 优先用户给的提示(如创作方向), 否则用日期时间。
 * 名字按**语义边界**收口(取短名), 不硬切字符 —— 用户能写很长的方向, 切在句子中间会很难看。
 * 绝不用字面 `{{user}}` —— 那会被酒馆当宏名, 建出一个名字诡异、以后找不到的 persona。
 */
function 取新人设名(提示?: string): string {
  const 净 = 取短名(String(提示 ?? ''), 24);
  if (净) return 净;
  const 日 = new Date();
  const 补 = (数: number) => String(数).padStart(2, '0');
  return `人设-${日.getFullYear()}${补(日.getMonth() + 1)}${补(日.getDate())}-${补(日.getHours())}${补(日.getMinutes())}`;
}

// ── 落地三: 写入世界书 ─────────────────────────────────────────────────────

/** 找目标世界书: 角色卡主世界书优先, 退回聊天世界书 */
export function 取目标世界书(): string | null {
  try {
    const 卡 = getCharWorldbookNames('current').primary;
    if (卡) return 卡;
  } catch (error) {
    console.warn('[人设工坊] 读取角色卡世界书绑定失败:', error);
  }
  try {
    return getChatWorldbookName('current');
  } catch (error) {
    console.warn('[人设工坊] 读取聊天世界书绑定失败:', error);
    return null;
  }
}

/**
 * 条目落点(人设与人物索引共用): 角色定义之前, order 100。
 *
 * ★ #246: **必须带类型标注** —— 字面量先赋给变量、再传给 API 时, TS 的 excess property check
 *   会因为「对象字面量的 freshness 丢了」而失效, 多写字段静默通过。
 *   标注之后字面量重新受检, 「写了但类型里没有」直接变编译错误。
 */
const 条目位置: WorldbookEntry['position'] = { type: 'before_character_definition', role: 'system', depth: 0, order: 100 };

/** 世界书激活策略: constant=蓝灯(常驻) / selective=绿灯(扫到 keys 才激活) */
export type 世界书策略 = 'constant' | 'selective';

/**
 * 造 strategy 三件套(子字段必须给全, 否则覆盖同名条目时会残留旧值)。
 *
 * ★ #246 返回类型标注: 同 条目位置 —— 以前 `return {...}` 没标注, 多写字段不报错
 *   (`excludeRecursion: true` 曾这样静默通过三道门, 只有真机 dump 才照出它是死的)。
 */
function 造策略(策略: 世界书策略, keys: string[]): WorldbookEntry['strategy'] {
  return {
    type: 策略,
    keys: 策略 === 'selective' ? keys : [],
    keys_secondary: { logic: 'and_any', keys: [] },
    scan_depth: 'same_as_global',
  };
}

/**
 * 条目顶层递归设置(#236 ①, #240 修正层级)。
 *
 * ⚠️ **递归字段在条目顶层, 不在 `strategy` 里** —— `@types/function/worldbook.d.ts:124-132`
 * 的 `WorldbookEntry.recursion` 是一个与 `strategy` / `position` 同级的对象;
 * 而 `strategy`(`:71-91`)只有 type / keys / keys_secondary / scan_depth。
 * 先前把它写进 `strategy` 里, **被静默丢弃**(真机 dump 八个格子全 false, 不报错)。
 *
 * 两条条目(🟢 人设 / 🔵 索引)都是**大块注入内容**, 参与递归会:
 *   · 上下文膨胀(自己的内容被反复扫描、又激活别的条目)
 *   · 误激活(索引里的角色名可能撞上别的条目的 keys)
 * 它们是**终点, 不是中转站** —— 所以两个方向都关掉:
 *   prevent_incoming = 禁止其他条目递归激活本条目
 *   prevent_outgoing = 禁止本条目递归激活其他条目
 *
 * 三个子字段都给全: `{...项, ...完整}` 会把整个 recursion 对象换掉, 缺字段会残留旧值。
 *
 * ★ #246 类型标注: 同 条目位置 / 造策略 —— 让多写字段在编译期就报错。
 */
const 条目递归: WorldbookEntry['recursion'] = {
  prevent_incoming: true,
  prevent_outgoing: true,
  delay_until: null,
};

/**
 * 写入/覆盖同名条目(绝不产生重复条目)。人设与人物索引共用。
 *
 * 匹配用 `取条目标题`(与读取端**同一个实现**, 免得读写两套规则再次分叉)。
 * ★★ 2026-10-16 实测(双生潮.json, 32 条): ST 把标题存在 **`comment`** 里, `name` **全为空**;
 *   酒馆助手会把我们传入的 `name` 映射成 `comment`, 落盘后 `name` 仍是空。
 *   以前这里用 `项.name === 名` —— 因为 `name` 恒空, **永远匹配不上**, 于是每次写入都走
 *   `createWorldbookEntries`, 酒馆助手给新条目分配**新的随机 uid**
 *   (实测: 45851 / 491332 / 604543 / 812542 / 908922), 而卡里的内嵌快照还留着老下标
 *   → 同一条内容在候选列表里出现两次。这就是用户报的「写入之后条目有重复」的真正来源。
 *
 * ★ #246: `完整` 也带类型标注 —— 它同样是「字面量 → 变量 → 传 API」,
 *   实测过: 给它多写一个字段, 不加标注时 `tsc` **不报错**(静默丢弃的同一条通路)。
 */
async function 落条目(书: string, 名: string, 内容: string, strategy: ReturnType<typeof 造策略>): Promise<void> {
  const 完整: TypeFest.PartialDeep<WorldbookEntry> = { name: 名, content: 内容, enabled: true, strategy, position: 条目位置, recursion: 条目递归 };
  const 现有 = await getWorldbook(书).catch(() => []);
  if (现有.some(项 => 取条目标题(项) === 名)) {
    await updateWorldbookWith(书, 全部 => 全部.map(项 => (取条目标题(项) === 名 ? { ...项, ...完整 } : 项)), { render: 'immediate' });
  } else {
    await createWorldbookEntries(书, [完整], { render: 'immediate' });
  }
}

/**
 * 写入「某个角色的人设」条目。同名条目已存在则覆盖, 不产生重复条目。
 * 位置: 角色定义之前, order 100。
 *
 * **策略 = selective(🟢 绿灯)**: 正文里提到这个角色才把它的人设注入上下文,
 * 没出场的角色不占 context(#78, 用户原话"不出场也发？")。
 * keys 默认取条目名 —— 条目名就是角色名(标题用角色名的原因见 取名.ts 取人设条目标题)。
 *
 * @param keys 触发关键词; 缺省 = [条目名](即角色名)
 */
/**
 * 写入世界书。
 *
 * - **user 模式**: 一个条目, 标题 = `条目名`(keys 走参数);
 * - **npc 模式**(#124 1.2): 文档里可能有 N 个角色(用只含 `---` 的一行分隔),
 *   内部拆成 N 个条目 —— 每个标题 = 该角色的名字, `keys = [该角色名]`(selective 绿灯)。
 *   以前 N 个角色挤进一个条目、keys 全是第一个人的名字, 那些角色永远不被触发。
 *
 * 拆分收到**函数内部**(而不是让调用方循环): 拆分规则属于落地, 不属于调用方。
 *
 * @param keys 触发关键词; 缺省 = [条目名](user 模式)
 * @param 模式 'user' 单角色 / 'npc' 多角色
 * @returns 实际写入的书名 + 写了哪些条目
 */
export async function 写入世界书(
  条目名: string,
  文本: string,
  keys: string[] = [条目名],
  模式: 'user' | 'npc' = 'user',
): Promise<{ 书: string; 写了: string[] }> {
  const 内容 = String(文本 ?? '').trim();
  if (!内容) throw Error('内容为空, 未写入世界书');
  const 书 = 取目标世界书();
  if (!书) throw Error('没有可用的世界书: 请先给角色卡绑定主世界书, 或创建聊天世界书');

  const 块们 = 拆分人设(内容, 模式);
  if (!块们.length) throw Error('内容为空, 未写入世界书');

  // #141 F2: 名字解析不出来 / 重名, 以前是**静默覆盖**(第二个把第一个吃掉)。
  // 与 写入人物索引 的严格度对齐: 空名抛错; 重名抛错(响亮失败优于静默丢内容)。
  const 名表 = 块们.map(块 => (模式 === 'npc' ? 块.名 || 条目名 : 条目名).trim());
  const 无名 = 名表.findIndex(名 => !名);
  if (无名 >= 0) {
    throw Error(`第 ${无名 + 1} 个角色没有解析出名字：既没有 \`# 角色：{名字}\` 也没有 \`姓名:\`，未写入世界书`);
  }
  const 重名 = 名表.filter((名, i) => 名表.indexOf(名) !== i);
  if (重名.length) {
    throw Error(`有多个角色同名「${重名[0]}」：同名条目会互相覆盖、丢内容，请改掉重名后重试`);
  }

  const 写了: string[] = [];
  for (let i = 0; i < 块们.length; i++) {
    const 块 = 块们[i];
    // user 模式标题固定用 条目名(保持旧行为); npc 模式用该角色自己的名字
    const 名 = 名表[i];
    const 该keys = 模式 === 'npc' ? [名] : keys.length ? keys : [名];
    await 落条目(书, 名, 块.正文, 造策略('selective', 该keys));
    写了.push(名);
  }
  return { 书, 写了 };
}

// ── 人物索引 ───────────────────────────────────────────────────────────────

/** 人物索引条目名: **固定**, 精确匹配, 绝不带后缀/时间戳(用户明确要求不重复建条目) */
export const 人物索引条目名 = '人物索引';
/** 索引行的分隔符(角色名 与 介绍 之间) */
export const 索引分隔 = ' — ';

/**
 * 写入/更新「人物索引」条目: 追加一行 `角色名 — 一句话介绍`。
 *
 * - **绝不重复建条目**: 同名条目已存在就更新它(落条目 里同名覆盖), 条目名固定为 人物索引;
 * - **同一角色不留旧行**: 先按 `名字 + 分隔符` 前缀剔掉该角色的旧行, 再追加新行;
 * - **策略 constant(🔵 蓝灯, 常驻)**: 索引条目存在的意义就是让模型随时知道有哪些人 ——
 *   它必须每轮都在, 所以是蓝灯(#78, 用户原话"索引才应该是蓝灯")。
 *   内容每条只有 `角色名 — 一句话介绍`, 很轻, 常驻不心疼。
 */
export async function 写入人物索引(
  角色名: string,
  介绍: string,
  模式: 'user' | 'npc' = 'user',
  文本 = '',
): Promise<{ 书: string; 写了: string[] }> {
  const 书 = 取目标世界书();
  if (!书) throw Error('没有可用的世界书: 请先给角色卡绑定主世界书, 或创建聊天世界书');

  // #141 F1: npc 模式下文档里有 N 个角色 —— 内部同样拆分, 每个角色一行。
  // 以前只写一行(调用方不知道文档里可能有 N 个角色), 那 N-1 个角色永远不进索引。
  const 待写: Array<{ 名: string; 介绍: string }> = [];
  if (模式 === 'npc' && String(文本 ?? '').trim()) {
    for (const 块 of 拆分人设(文本, 'npc')) {
      const 名 = 块.名 || String(角色名 ?? '').trim();
      if (名) 待写.push({ 名, 介绍: 块.介绍 || String(介绍 ?? '').trim() });
    }
  }
  if (!待写.length) {
    const 名 = String(角色名 ?? '').trim();
    if (!名) throw Error('角色名为空, 未写入人物索引');
    待写.push({ 名, 介绍: String(介绍 ?? '').trim() });
  }

  const 现有 = await getWorldbook(书).catch(() => []);
  const 命中 = 现有.find(项 => 取条目标题(项) === 人物索引条目名);
  let 行表 = String(命中?.content ?? '')
    .split('\n')
    .map(行 => 行.trim())
    .filter(Boolean);

  const 写了: string[] = [];
  for (const { 名, 介绍: 介 } of 待写) {
    // 同一角色只留一行: 剔掉它自己的旧行, 再追加新行
    行表 = 行表.filter(行 => !行.startsWith(`${名}${索引分隔}`));
    行表.push(`${名}${索引分隔}${介}`);
    写了.push(名);
  }

  // 蓝灯: 常驻, 不看关键词 —— keys 恒空
  await 落条目(书, 人物索引条目名, 行表.join('\n'), 造策略('constant', []));
  return { 书, 写了 };
}

// ── 落地四: 草稿箱 ─────────────────────────────────────────────────────────

type 草稿变量 = Record<string, unknown>;

function 读草稿(): Draft[] {
  try {
    const 变量 = getVariables({ type: 'script', script_id: getScriptId() }) as 草稿变量;
    const 原始 = 变量?.[草稿键];
    return Array.isArray(原始) ? 原始 : [];
  } catch (error) {
    console.warn('[人设工坊] 读取草稿失败:', error);
    return [];
  }
}

function 写草稿(草稿: Draft[]): void {
  const 变量 = getVariables({ type: 'script', script_id: getScriptId() }) as 草稿变量;
  变量[草稿键] = 草稿;
  replaceVariables(变量, { type: 'script', script_id: getScriptId() });
}

/** 列出草稿(新到旧) */
export function 列草稿(): Draft[] {
  return 读草稿();
}

/** 存一条草稿; 超过上限丢最旧 */
export function 存草稿(草稿: Omit<Draft, 'id' | 'created_at'>): Draft {
  const 新: Draft = {
    ...草稿,
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: Date.now(),
  };
  const 全部 = [新, ...读草稿()].slice(0, 草稿上限);
  写草稿(全部);
  return 新;
}

/** 删一条草稿 */
export function 删草稿(id: string): void {
  写草稿(读草稿().filter(草稿 => 草稿.id !== id));
}
