// ---------------------------------------------------------------------------
// 人设工坊 · 输出模块白名单校验
//
// 「不勾就不让 AI 写」的第二道保险(第一道是提示词本身)。
// 把 AI 输出按 `## 标题` 切成段, 与勾选的模块名比对:
//   - 勾了但没写 → missing(警告, 提供"重新生成")
//   - 没勾却写了, 且在注册表里 → extra, 从正文里删掉(可在警告条点"保留")
//   - 标题不在注册表里(自由发挥) → 也记 extra, 但**不删**, 只警告
// ---------------------------------------------------------------------------

export type 清洗结果 = {
  cleaned: string;
  /** AI 多写的模块名(含未知标题) */
  extra: string[];
  /** 勾了但没写的模块名 */
  missing: string[];
};

/**
 * 归一化模块名: 去 `#`、空白、全角/半角冒号, 以及括号、斜杠、顿号、间隔号、破折号,
 * 再把连接词「与/和/及」也抹掉。
 * 目的是挡住 AI 改写标题的两种常见方式:
 *   - 换标点: 「基础信息与外貌」→「基础信息（外貌）」「基础信息/外貌」「基础信息、外貌」;
 *   - 换连接词: 「家庭与社交关系」→「家庭和社交关系」。
 * 这些归一后都应命中同一个模块, 否则勾了的模块会被误判成 missing + extra。
 */
function 归一(名: string): string {
  return 名.replace(/[#\s:：（）()/、·—-]/g, '').replace(/[与和及]/g, '');
}

/**
 * 尝试在 `位置` 处解析一个 disclaimer 家族标签。
 * 不是这类标签返回 null; 是则返回 {闭, 自闭合, 结束}(结束 = 标签最后一个字符的下一位)。
 *
 * 为什么不用正则(2026-10-15 #195): `<disclaimer\b` 里的 `\b` 在 `r` 与 `/` 之间**成立**,
 * 于是自闭合的 `<disclaimer/>` 被当成"漏闭合"、从标签一路剥到结尾 —— **吃掉后面全部正文**。
 * 扫描器里「名字后面必须是标签分隔符」把这条从根上堵掉。
 */
function 试解析标签(源: string, 位置: number): { 闭: boolean; 自闭合: boolean; 结束: number } | null {
  if (源[位置] !== '<') return null;
  let i = 位置 + 1;
  let 闭 = false;
  if (源[i] === '/') {
    闭 = true;
    i++;
  }
  // 名字先长后短 —— 否则 disclaimer_format 会被当成 disclaimer + 尾随 "_format"
  const 小写 = 源.toLowerCase();
  let 名长 = 0;
  if (小写.startsWith('disclaimer_format', i)) 名长 = 'disclaimer_format'.length;
  else if (小写.startsWith('disclaimer', i)) 名长 = 'disclaimer'.length;
  if (!名长) return null;
  i += 名长;
  // ★ 名字后面必须是标签分隔符(空白 / `>` / `/`), 否则是别的词(如 `<disclaimerXYZ>`)
  const 后 = 源[i];
  if (后 !== undefined && !/[\s/>]/.test(后)) return null;
  const 尖 = 源.indexOf('>', i);
  if (尖 < 0) {
    // 连 `>` 都没有 —— 当成未闭合的开标签(块一直延伸到结尾)
    return { 闭, 自闭合: false, 结束: 源.length };
  }
  return { 闭, 自闭合: 源[尖 - 1] === '/', 结束: 尖 + 1 };
}

/**
 * 剥掉注入的免责声明块(2026-10-15 #186 A′; #195 改成扫描器)。
 *
 * 「防截断」开着时, 注入的声明里有一条**指令**: 让模型每次输出末尾追加一段
 * `<disclaimer></disclaimer>` 包裹的免责声明。模型照做 → 生成结果尾巴上挂着一整块英文垃圾,
 * 用户把它写进世界书/人设后就**永久留在卡里**。这里把它剥掉, 让所有出口拿到干净正文。
 *
 * **不变量(判据, 不是形状清单)**:
 *   正文里非标签的部分, **一个字都不许少**; 标签块**整体必须消失**。
 *
 * 四条行为:
 *   · 成对块 → 块整体删掉, 前后正文都在;
 *   · 自闭合 `<disclaimer/>` / `<disclaimer />` → **只删标签本身, 不吃后面**;
 *   · 漏闭合 `<disclaimer>junk`(无配对闭标签) → 从开标签剥到结尾;
 *   · 嵌套块 → 按嵌套深度找配对, 内层残留不留在正文里。
 *
 * 另: 判据是「标签」不是「disclaimer 这个词」—— 正文里无尖括号的该词一律不动;
 * 无条件剥(不看 antiTruncation / strictWhitelist); 静默剥(不弹提示)。
 */
export function 剥免责声明(文本: string): string {
  const 源 = String(文本 ?? '');
  let 出 = '';
  let i = 0;
  while (i < 源.length) {
    const 尖 = 源.indexOf('<', i);
    if (尖 < 0) {
      出 += 源.slice(i);
      break;
    }
    const 标 = 试解析标签(源, 尖);
    if (!标) {
      // 不是 disclaimer 家族标签: `<` 本身当普通字符收下, 从下一位继续
      出 += 源.slice(i, 尖 + 1);
      i = 尖 + 1;
      continue;
    }
    // 是这类标签 —— 先收下它**之前**的正文(一个字不少)
    出 += 源.slice(i, 尖);
    if (标.闭 || 标.自闭合) {
      // 单独的闭标签 / 自闭合标签: 只删标签本身, 后面正文照留
      i = 标.结束;
      continue;
    }
    // 开标签: 找配对的闭标签(计嵌套深度)
    let 深 = 1;
    let k = 标.结束;
    while (k < 源.length && 深 > 0) {
      const 尖2 = 源.indexOf('<', k);
      if (尖2 < 0) break;
      const 标2 = 试解析标签(源, 尖2);
      if (!标2) {
        k = 尖2 + 1;
        continue;
      }
      if (标2.闭) 深--;
      else if (!标2.自闭合) 深++;
      k = 标2.结束;
    }
    // 深 === 0 → 块整体删掉, 正文从 k 继续; 深 > 0 → 漏闭合, 剥到结尾
    i = 深 === 0 ? k : 源.length;
  }
  // 收干净: 块被剥掉后常留下一串空行, 压回最多一个空行并去掉尾空白。
  return 出.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

type 段 = { 标题: string | null; 行: string[] };

/** 取一行里的模块标题, 不是 `## 标题` 行则返回 null */
function 取标题(行: string): string | null {
  const 净 = 行.trimStart();
  if (!净.startsWith('##') || 净.startsWith('###')) return null;
  const 余 = 净.slice(2).trim();
  return 余 || null;
}

function 切段(文本: string): 段[] {
  const 段们: 段[] = [];
  let 当前: 段 = { 标题: null, 行: [] };
  for (const 行 of String(文本 ?? '').split('\n')) {
    const 标题 = 取标题(行);
    if (标题 !== null) {
      段们.push(当前);
      当前 = { 标题, 行: [行] };
    } else {
      当前.行.push(行);
    }
  }
  段们.push(当前);
  return 段们;
}

/**
 * @param 文本   AI 输出
 * @param 启用名  勾选的模块名
 * @param 全部名  注册表里所有模块名(用于区分"已知但没勾"与"完全不认识"); 缺省时按 启用名 处理
 */
export function sanitizeOutput(文本: string, 启用名: string[], 全部名?: string[]): 清洗结果 {
  // #186 A′: **先无条件剥掉注入的免责声明块** —— 与开关/白名单都无关。
  // 放在最前面, 于是下游所有出口(结果面板/复制/写世界书/写索引/存草稿)自动干净。
  const 干净源 = 剥免责声明(文本);
  const 启用 = new Set(启用名.map(归一));
  const 已知 = new Set((全部名 ?? 启用名).map(归一));
  const extra: string[] = [];
  const 出现 = new Set<string>();
  const 保留段: 段[] = [];

  for (const 段 of 切段(干净源)) {
    if (段.标题 === null) {
      保留段.push(段);
      continue;
    }
    const 键 = 归一(段.标题);
    出现.add(键);
    if (启用.has(键)) {
      保留段.push(段);
      continue;
    }
    extra.push(段.标题);
    // 完全不认识的标题: 不删, 只警告
    if (!已知.has(键)) 保留段.push(段);
  }

  const missing = 启用名.filter(名 => !出现.has(归一(名)));
  const cleaned = 保留段
    .map(段 => 段.行.join('\n'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleaned, extra, missing };
}
