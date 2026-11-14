import type { ModuleDef, Settings } from '../schema';
import 文风铁律原文 from '../八股禁令.txt?raw';

/**
 * 文风铁律(2026-10-14 #86): 用户原文见 `docs/人设工坊-八股禁令.txt`。
 *
 * 剥掉文件自带的 `<文风铁律>` 包裹, 换成与其它顶层节一致的 `# 文风铁律` 标题 ——
 * 提示词里所有顶层节都是 `# 任务` / `# 铁律` / `# 素材` 这种写法, 保持同构。
 * **默认常开, 不做开关**: 这是文风底线, 不是可选技巧。
 */
const 文风铁律 = 文风铁律原文.replace(/^<文风铁律>\s*/, '').replace(/<\/文风铁律>\s*$/, '').trim();

// ---------------------------------------------------------------------------
// 人设工坊 · 提示词拼装器
//
// 两件事:
//   1. 一个小模板引擎({{字段}} / {{#if}} / {{#each}}), 自己实现, 不引新依赖;
//   2. 按注册表顺序把勾选的模块拼成一份提示词, 并套用 overrides 与用户手改。
//
// 顺序按 modules.ts 的注册顺序, 不按勾选顺序 —— 保证调色盘在三面性之前。
// 解析全部走字符串 indexOf, 不依赖正则回溯, 模板再深也不会卡。
// ---------------------------------------------------------------------------

/** 注入给模型的素材(角色卡 / user 人设 / 聊天记录 / 世界书 / 一句话需求) */
export type 素材 = {
  charInfo: string;
  userPersona: string;
  chatHistory: string;
  worldbook: string;
  brief: string;
};

// ── 小模板引擎 ─────────────────────────────────────────────────────────────

type 节点 =
  | { 类型: '文本'; 值: string }
  | { 类型: '变量'; 名: string }
  | { 类型: '如果'; 条件: string; 真: 节点[]; 假: 节点[] }
  | { 类型: '循环'; 名: string; 体: 节点[] };

/** 把模板切成「纯文本」与「{{...}}」两类片段 */
function 切片(模板: string): string[] {
  const 片段: string[] = [];
  let 剩余 = 模板;
  for (;;) {
    const 开 = 剩余.indexOf('{{');
    if (开 < 0) {
      if (剩余) 片段.push(剩余);
      return 片段;
    }
    const 闭 = 剩余.indexOf('}}', 开 + 2);
    if (闭 < 0) {
      片段.push(剩余);
      return 片段;
    }
    if (开 > 0) 片段.push(剩余.slice(0, 开));
    片段.push(剩余.slice(开, 闭 + 2));
    剩余 = 剩余.slice(闭 + 2);
  }
}

/** 片段是 `{{xxx}}` 时返回内部的 xxx(已 trim), 否则 null */
function 取标记(片段: string): string | null {
  if (片段.length >= 4 && 片段.startsWith('{{') && 片段.endsWith('}}')) {
    return 片段.slice(2, -2).trim();
  }
  return null;
}

/**
 * 递归下降建树。`终止` 里的标记(else / /if / /each)不消耗, 留给调用者处理,
 * 这样嵌套的 if/each 才能正确闭合。
 */
function 建树(片段: string[], 游标: { i: number }, 终止: string[]): 节点[] {
  const 结果: 节点[] = [];
  while (游标.i < 片段.length) {
    const 当前 = 片段[游标.i];
    const 标记 = 取标记(当前);
    if (标记 === null) {
      游标.i++;
      结果.push({ 类型: '文本', 值: 当前 });
      continue;
    }
    if (终止.includes(标记)) return 结果;
    if (标记.startsWith('#if ')) {
      游标.i++;
      const 真 = 建树(片段, 游标, ['else', '/if']);
      let 假: 节点[] = [];
      if (取标记(片段[游标.i] ?? '') === 'else') {
        游标.i++;
        假 = 建树(片段, 游标, ['/if']);
      }
      游标.i++; // 吃掉 {{/if}}
      结果.push({ 类型: '如果', 条件: 标记.slice(4).trim(), 真, 假 });
      continue;
    }
    if (标记.startsWith('#each ')) {
      游标.i++;
      const 体 = 建树(片段, 游标, ['/each']);
      游标.i++; // 吃掉 {{/each}}
      结果.push({ 类型: '循环', 名: 标记.slice(6).trim(), 体 });
      continue;
    }
    // 裸露的 else / /if / /each: 交回上层
    if (标记 === 'else' || 标记 === '/if' || 标记 === '/each') return 结果;
    游标.i++;
    结果.push({ 类型: '变量', 名: 标记 });
  }
  return 结果;
}

/** 值 → 文本: 数组用顿号连接, 其余走 String */
function 转文本(值: unknown): string {
  if (值 === null || 值 === undefined) return '';
  if (Array.isArray(值)) return 值.map(转文本).filter(Boolean).join('、');
  if (typeof 值 === 'object') return JSON.stringify(值);
  return String(值);
}

function 取值(名: string, 上下文: Record<string, unknown>): unknown {
  return 上下文[名];
}

/** 条件求值: 支持 `x` 真值判断与 `x == 'y'` 比较 */
function 求条件(条件: string, 上下文: Record<string, unknown>): boolean {
  const 位置 = 条件.indexOf('==');
  if (位置 >= 0) {
    const 左 = 取值(条件.slice(0, 位置).trim(), 上下文);
    const 右字面 = 条件.slice(位置 + 2).trim();
    const 去引号 = (文本: string): unknown => {
      if (文本.length >= 2) {
        const 头 = 文本[0];
        const 尾 = 文本[文本.length - 1];
        if ((头 === "'" && 尾 === "'") || (头 === '"' && 尾 === '"')) return 文本.slice(1, -1);
      }
      return 取值(文本, 上下文);
    };
    return 转文本(左) === 转文本(去引号(右字面));
  }
  return !!取值(条件, 上下文);
}

function 渲染(节点们: 节点[], 上下文: Record<string, unknown>): string {
  let 输出 = '';
  for (const 节点 of 节点们) {
    switch (节点.类型) {
      case '文本':
        输出 += 节点.值;
        break;
      case '变量':
        输出 += 转文本(取值(节点.名, 上下文));
        break;
      case '如果':
        输出 += 渲染(求条件(节点.条件, 上下文) ? 节点.真 : 节点.假, 上下文);
        break;
      case '循环': {
        const 列表 = 取值(节点.名, 上下文);
        if (Array.isArray(列表)) {
          for (const 项 of 列表) 输出 += 渲染(节点.体, { ...上下文, this: 项 });
        }
        break;
      }
    }
  }
  return 输出;
}

/** 渲染一段模板: 供组件预览单模块片段时复用 */
export function 渲染模板(模板: string, 上下文: Record<string, unknown>): string {
  return 渲染(建树(切片(模板), { i: 0 }, []), 上下文);
}

// ── 拼装 ───────────────────────────────────────────────────────────────────

/** 由模块的 fieldValues 建渲染上下文: 用户没填的细项回落到 FieldDef.default */
export function 建上下文(模块: ModuleDef, 设置: Settings): Record<string, unknown> {
  const 上下文: Record<string, unknown> = {};
  for (const 字段 of 模块.fields) {
    const 填过 = 设置.fieldValues[字段.id];
    上下文[字段.id] = 填过 !== undefined && 填过 !== '' ? 填过 : 字段.default;
  }
  return 上下文;
}

/**
 * 取某模块最终要渲染的片段, 优先级:
 *   1. 其它已勾选模块声明的 overrides(如 facets 顶掉 corpus);
 *   2. 用户在预览里手改的 promptOverrides;
 *   3. 注册表默认 prompt。
 */
export function 取片段(模块: ModuleDef, 启用集合: Set<string>, 全部: ModuleDef[], 设置: Settings): string {
  for (const 其它 of 全部) {
    if (其它.id !== 模块.id && 启用集合.has(其它.id)) {
      const 覆盖 = 其它.overrides?.[模块.id];
      if (覆盖) return 覆盖;
    }
  }
  const 手改 = 设置.promptOverrides[模块.id];
  return 手改 !== undefined && 手改 !== '' ? 手改 : 模块.prompt;
}

/** 信息不足策略 → 铁律第 2 条的文字 */
function 缺失策略文字(策略: Settings['onMissing']): string {
  switch (策略) {
    case 'mark':
      return 'mark:  某个模块信息不足以写出内容时，写「（此项信息不足）」，不要编。';
    case 'infer':
      return 'infer: 信息不足时可以做与世界观一致的合理推断，但不得与已给信息矛盾。';
    case 'skip':
      return 'skip:  信息不足时整个模块跳过不写，并在末尾用一行列出跳过的模块名。';
  }
}

/**
 * 剥掉片段开头的第一行 `## ...`。
 *
 * 模块标题**统一由 `## ${模块.name}` 生成** —— 若沿用片段自带的标题, 一旦改片段标题就会与
 * name 漂移: 提示词里 AI 看到的是片段标题, 输出格式段和白名单比对的却是 name, 于是
 * 勾了的模块被误判成 missing + extra, strictWhitelist 默认开就把**正确内容删掉**。
 * 这是「不勾就不写」在反方向破功(2026-10-14 kimicode 否决)。标题由构造保证一致, 不再靠人工同步。
 */
function 去标题(片段: string): string {
  const 行 = 片段.split('\n');
  if (行.length > 0 && 行[0].trimStart().startsWith('##')) {
    return 行.slice(1).join('\n').trim();
  }
  return 片段;
}

/**
 * 预填充文本 = 第一个勾选模块的标题。
 *
 * **不能照抄烟火的 `{`** —— 烟火输出 JSON 所以塞 `{`; 人设工坊输出的是 `## 模块名` 标题,
 * 所以塞第一个勾选模块的标题(连格式一起锁死, 模型直接从标题起手)。
 * 没勾任何模块时返回空串(调用方据此不塞预填充)。
 */
export function 取预填充标题(设置: Settings, 模块表: ModuleDef[]): string {
  const 启用集合 = new Set(设置.enabled);
  const 首 = 模块表.find(模块 => 启用集合.has(模块.id));
  return 首 ? `## ${首.name}\n` : '';
}

/**
 * 拼装完整提示词。
 * `模块表` 传注册表全量(顺序即拼装顺序), 内部再按 `enabled` 过滤。
 */
export function 拼装提示词(设置: Settings, 模块表: ModuleDef[], 素材: 素材): string {
  const 启用集合 = new Set(设置.enabled);
  const 选中 = 模块表.filter(模块 => 启用集合.has(模块.id));
  const 模块清单 = 选中
    .map(模块 => {
      const 体 = 去标题(渲染模板(取片段(模块, 启用集合, 模块表, 设置), 建上下文(模块, 设置)).trim());
      return `## ${模块.name}${体 ? `\n${体}` : ''}`;
    })
    .join('\n\n');

  const 任务 =
    设置.mode === 'user'
      ? '写一份 user（{{user}}）的角色设定。'
      : '写 NPC 的角色设定。每个角色一节，节与节之间用只含 --- 的一行分隔；每节第一行必须是 `# 角色：{角色名}`，其后才是各模块。\nNPC 模式：每个角色都要能被单独摘出来用，所以自述含量要压低，多用客观解析。多个角色的语气混在一起会串台。';

  const 输出格式 = 选中.map(模块 => `## ${模块.name}`).join('\n');

  const 段落: string[] = [];
  if (设置.globalPrefix.trim()) 段落.push(设置.globalPrefix.trim());

  段落.push(`# 任务\n${任务}`);

  段落.push(
    [
      '# 铁律',
      '1. **只写下面列出的模块。** 没列出的模块一律不写、不补、不暗示、不用一句话带过。',
      `2. ${缺失策略文字(设置.onMissing)}`,
      '3. 不要输出小剧场、状态栏、思维链、前言、后语、解释。',
      '4. 限制可以用「不要」写，但必须紧跟正确写法和示例。',
      '   只给一条「不要怎样」而不给替代写法，AI 会先激活那个语义再试图否定它，',
      '   结果反而越写越容易犯。禁止「不要让角色太傲娇」这种孤立禁令。',
      '   例：不要写「她其实很温柔」，要写「温柔？那种东西早喂狗了。我见过太多人拿它当刀子使——',
      '   所以我只认规矩，不认眼泪。」',
      '5. 不要用「未知」「N/A」「待定」「暂无」这类占位符。',
      '6. **用户指定的方向优先。** 与之冲突的素材推断一律让位；用户没提到的地方，才按素材与模块要求推。',
      '7. 用 **加粗** 标出角色的核心矛盾点或萌点。不要全篇滥用，也绝对不能不用——',
      '   它的作用是让 AI 优先读到，不是排他。',
    ].join('\n'),
  );

  // 角色独立性(2026-10-15 #185 B): 只在 NPC 模式出现 —— user 模式写的是 user 自己的人设,
  // "独立于 user" 讲不通。常开, 不做开关(底线, 不是可选技巧)。
  // 根因: 注入的素材是「当前 user 人设 + 最近聊天记录」, 全是围着 user 转的内容, 模型照抄这个形状,
  // 生成出来的角色就变成了"围着主角转、很舔"。这里明确要求角色有自己的生活重心。
  // 注: {{user}} 是留给酒馆替换的宏(与任务段的 {{user}} 同源), 不经渲染模板。
  if (设置.mode === 'npc') {
    段落.push(`# 角色独立性（优先于其它写作原则）

这个角色有自己的生活重心：自己的目标、自己的麻烦、自己的人际关系。
- 不要把每条性格都写成「对 {{user}} 的态度」。他先得是个人，然后才和 {{user}} 有关系。
- 不许刻意讨好、迎合、迁就 {{user}}。可以有依赖、有深情，但那要从性格推出来，不是默认设置。
- 关系再近，也只是「生活里包含 {{user}}」，不是「生活里只剩 {{user}}」。
- 自查：把 {{user}} 从这张卡里拿掉，他还立得住吗？立不住就是写废了。`);
  }

  // 文风铁律(2026-10-14 #86): 规则类, 与 # 铁律 同处头部(头尾注意力最高)。
  // 默认常开, 不做开关 —— 这是文风底线, 不是可选技巧。
  段落.push(`# 文风铁律\n\n${文风铁律}`);

  // 美型化描写(2026-10-15 #236 ②): 规则块, 不是模块 —— 模块必须产出 `## 模块名` 小节,
  // 否则 sanitizeOutput 会报 missing; 这条管的是**别的模块怎么写外貌**, 不该单独成节。
  // 与 # 文风铁律 同类: 常开、不做开关, user / npc 两种模式都出现。
  段落.push(`# 美型化描写

剔除会引起视觉或感官不适的真实生理细节，为角色保持一种干净、自然的理想化外观，
让外貌描写服务于角色的内在与剧情，而不是抢戏。

1. **瑕疵屏蔽**：设定上的角色，行文里规避粗糙的生理细节（手脚老茧、皱纹、粗大毛孔、
   肤色暗沉等），基准状态处理成「干净、平滑」。
2. **拒绝浮夸**：不要用「宛如凝脂」「散发异香」这类过度失真的辞藻。
   例：不写「她的肌肤宛如凝脂」，写「她皮肤干净，离近了才看得出一点晒痕」——
   点到为止，保留活人感，**不让外表盖住角色本身的性格张力**。
3. **差异化处理**：遇到丑陋的角色时**取消屏蔽**，如实写其粗糙、油腻或瑕疵 ——
   用群像的真实感自然反衬主要角色的整洁与美感。`);

  // 用户指定的方向: **顶层节**, 与 # 任务 / # 铁律 同级 —— 语义是"指令", 不是"背景"。
  // 以前它混在 # 素材 里(与角色卡/世界书并列), 模型会当可参考的背景读, 一堆硬要求被稀释成"参考资料"。
  // 空则整节不出现。
  if (素材.brief.trim()) 段落.push(`# 用户指定的方向（优先于素材与推断）\n${素材.brief.trim()}`);

  const 素材段: string[] = ['# 素材'];
  if (素材.charInfo.trim()) 素材段.push(`## 当前角色卡\n${素材.charInfo.trim()}`);
  if (素材.userPersona.trim()) 素材段.push(`## 当前 user 人设\n${素材.userPersona.trim()}`);
  if (素材.chatHistory.trim()) 素材段.push(`## 最近聊天记录\n${素材.chatHistory.trim()}`);
  // worldbook 可能缺省(旧调用方/未接世界书源): 缺了就当空, 不炸
  if ((素材.worldbook ?? '').trim()) 素材段.push(`## 世界书设定\n${素材.worldbook.trim()}`);
  if (素材段.length > 1) 段落.push(素材段.join('\n\n'));

  段落.push(`# 模块清单（只写这些）\n${模块清单 || '（未勾选任何模块）'}`);

  const NPC格式行 =
    设置.mode === 'npc'
      ? '- NPC 模式下，每个角色先用 `# 角色：{角色名}` 起头，角色之间用只含 --- 的一行分隔。\n- 每个角色内部，每个模块用 `## {模块名}` 作标题。\n'
      : '';
  段落.push(
    `# 输出格式\n- 每个模块用 \`## {模块名}\` 作标题。\n- 模块内用什么格式由该模块的写作要求决定（伪 YAML / 自述 / 块）。\n- 只输出设定本身。\n${NPC格式行}\n只允许出现这些标题：\n${输出格式 || '（无）'}`,
  );

  if (设置.globalSuffix.trim()) 段落.push(设置.globalSuffix.trim());

  return 段落.join('\n\n');
}
