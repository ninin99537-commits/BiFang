import type { Settings } from '../schema';

// ---------------------------------------------------------------------------
// 人设工坊 · 世界书素材源
//
// 用户报的 bug: "素材来源是角色卡，不是世界书？" —— 一张卡的世界观/人物/机制往往全在
// 世界书条目里(实测某卡: 卡字段 1,789 字, 而世界书 273,779 字), 只读卡字段等于没读设定。
//
// 候选条目有三个来源:
//   ① 角色卡**内嵌**世界书(getCharData('current').data.character_book) —— 用户那张卡就是内嵌形态;
//   ② 角色卡**绑定**世界书(getCharWorldbookNames('current') 的 primary + additional);
//   ③ 聊天**绑定**世界书(getChatWorldbookName('current'))。
// ① 必须**直接读 data**: 内嵌书存在角色卡自己的 data 里, 不能假定 getCharWorldbookNames 会返回它。
// (真机上是否返回由 ST 版本决定; 直接读 data 与它无关, 两条路都覆盖, 不赌 API 行为。)
//
// 选择模型: `worldbookTouched=false` 时**默认勾选常驻(constant)条目**; 用户动过之后按他勾的算。
// 只存"稳定键"(书名#uid): 换角色/换书后当前范围里不存在的键直接被过滤掉, 不报错。
//
// 注入**不做任何截断**(与素材源同一纪律, 用户明确要求)。
// ---------------------------------------------------------------------------

export type 世界书条目 = {
  /** 稳定键: 书名#uid(跨会话稳定, 用于存选择) */
  键: string;
  /** 来源世界书名 */
  书: string;
  /** 条目标题(comment / name) */
  名: string;
  字数: number;
  /** 常驻(蓝灯 constant)条目 */
  常驻: boolean;
  内容: string;
};

/** 稳定键: 书名 + uid */
export function 条目键(书: string, uid: number | string): string {
  return `${书}#${uid}`;
}

/**
 * 取条目标题。
 *
 * ★★ 2026-10-16 实测: ST 把条目标题存在 **`comment`** 里, `name` **通常是空的**。
 *   证据(双生潮.json, 32 条): `name` 全部为空字符串, 标题全在 `comment`;
 *   我们插件自己写进去的 5 条也一样 —— 酒馆助手会把传入的 `name` 映射成 `comment`,
 *   落盘后 `name` 仍是空。
 *   以前这里读 `条.name` → 全部回退成 `条目{uid}` → 用户看到「条目45851」这种标题,
 *   而且和卡里内嵌快照的同一条**看起来像两条不同的条目**。
 */
export function 取条目标题(条: { comment?: unknown; name?: unknown }, uid?: number | string): string {
  const 标题 = String(条.comment ?? '').trim() || String(条.name ?? '').trim();
  if (标题) return 标题;
  // 无标题条目: 读取端给个可见占位(条目{uid}); 匹配端(写入)不传 uid, 返回空串 → 不匹配任何名字
  return uid === undefined ? '' : `条目${uid}`;
}

function 造条(书: string, uid: number | string, 名: string, 内容: string, 常驻: boolean): 世界书条目 {
  return {
    键: 条目键(书, uid),
    书,
    名: String(名 ?? '').trim() || `条目${uid}`,
    字数: 内容.length,
    常驻,
    内容,
  };
}

/** 读角色卡**内嵌**世界书(不依赖 getCharWorldbookNames) */
function 取内嵌条目(): 世界书条目[] {
  const 结果: 世界书条目[] = [];
  try {
    const 卡 = getCharData('current');
    const 书 = 卡?.data?.character_book;
    const 条目表 = 书?.entries;
    if (条目表) {
      const 书名 = String(书?.name ?? '').trim() || `${卡?.name ?? '角色'}·内嵌世界书`;
      for (const [uid, 条] of Object.entries(条目表)) {
        if (!条 || 条.enabled === false) continue;
        const 内容 = String(条.content ?? '');
        if (!内容.trim()) continue;
        结果.push(造条(书名, uid, 取条目标题(条, uid), 内容, !!条.constant));
      }
    }
  } catch (error) {
    console.warn('[人设工坊] 读取内嵌世界书失败:', error);
  }
  return 结果;
}

/** 读角色卡/聊天**绑定**的世界书 */
async function 取绑定条目(): Promise<世界书条目[]> {
  const 名表 = new Set<string>();
  try {
    const 卡书 = getCharWorldbookNames('current');
    if (卡书?.primary) 名表.add(卡书.primary);
    for (const 名 of 卡书?.additional ?? []) 名表.add(名);
  } catch (error) {
    console.warn('[人设工坊] 读取角色卡世界书绑定失败:', error);
  }
  try {
    const 聊天书 = getChatWorldbookName('current');
    if (聊天书) 名表.add(聊天书);
  } catch (error) {
    console.warn('[人设工坊] 读取聊天世界书绑定失败:', error);
  }

  const 结果: 世界书条目[] = [];
  for (const 书 of 名表) {
    try {
      const 条目表 = await getWorldbook(书);
      for (const 条 of 条目表) {
        if (条.enabled === false) continue;
        const 内容 = String(条.content ?? '');
        if (!内容.trim()) continue;
        结果.push(造条(书, 条.uid, 取条目标题(条, 条.uid), 内容, 条.strategy?.type === 'constant'));
      }
    } catch (error) {
      console.warn(`[人设工坊] 读取世界书「${书}」失败:`, error);
    }
  }
  return 结果;
}

/**
 * 当前范围的全部候选条目: 绑定 + 内嵌, 按 `书名#uid` 去重、再按**内容**去重, **按字数降序**。
 * 降序是刻意的: 独占十几万字的基建条目(如别的扩展的表格模板)会排在最前, 一眼可见, 用户不会误勾。
 *
 * ★★ 2026-10-16 两处修正(都有实测证据):
 *
 * ① **绑定书排在内嵌书前面** —— 键冲突时保留绑定那条。
 *   原因: 卡里的内嵌书是**导出时的快照**, 它的 uid 是**数组下标**; 而绑定书里的 uid 是
 *   ST 真正分配的。快照导出之后书里增删过条目, 下标就不再指向同一条了 ——
 *   实测双生潮: 卡里 `下标27/28/29` 三条, 在书里分别对应 uid `604543/812542/908922`。
 *   所以绑定书的 uid 才是"活的", 选择状态存它才稳定。
 *
 * ② **再按内容、再按「书名+标题」去重一次** —— 只按键去重消不掉重复。
 *   实测双生潮: 32 条的书被读成 **35 行**, 其中 3 组内容完全相同 ——
 *   同一个角色在卡的内嵌快照里(老下标)和绑定书里(新 uid)各有一份。
 *   表现就是用户报的「插件里的世界书条目有重复, 但酒馆里正常」——
 *   酒馆里确实只有一份, 多出来的那份只在卡里。
 *   还有第 4 组**内容不同但标题相同**的(人物索引: 绑定书 170 字 / 卡里旧版 129 字),
 *   内容去重抓不到, 所以标题也要去重(键用「书名+标题」, 不同书同名条目不合并)。
 */
export async function 取世界书条目(): Promise<世界书条目[]> {
  const 全部 = [...(await 取绑定条目()), ...取内嵌条目()];
  const 见键 = new Set<string>();
  const 见文 = new Set<string>();
  const 见名 = new Set<string>();
  const 去重: 世界书条目[] = [];
  for (const 条 of 全部) {
    if (见键.has(条.键)) continue;
    if (条.内容 && 见文.has(条.内容)) continue;
    const 名键 = `${条.书}#${条.名}`;
    if (见名.has(名键)) continue;
    见键.add(条.键);
    见名.add(名键);
    if (条.内容) 见文.add(条.内容);
    去重.push(条);
  }
  去重.sort((左, 右) => 右.字数 - 左.字数);
  return 去重;
}

/**
 * 当前应注入的条目。
 * - 世界书源关闭 → 空
 * - 用户没动过选择 → 全部常驻条目
 * - 用户动过 → 他勾的那些(当前范围里不存在的键自然被过滤, 不报错)
 */
export function 已选世界书条目(设置: Settings, 全部: 世界书条目[]): 世界书条目[] {
  const 素材 = 设置?.material;
  if (!素材?.worldbook) return [];
  if (!素材.worldbookTouched) return 全部.filter(条 => 条.常驻);
  const 选 = new Set(素材.worldbookSelected ?? []);
  return 全部.filter(条 => 选.has(条.键));
}

/** 拼成注入文本: 逐条给标题与全文, **不做任何截断** */
export function 拼世界书素材(条目们: 世界书条目[]): string {
  return 条目们.map(条 => `### ${条.名}（${条.书}）\n${条.内容}`).join('\n\n');
}
