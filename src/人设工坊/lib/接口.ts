// ---------------------------------------------------------------------------
// 人设工坊 · 接口地址与模型列表
//
// 接口调用只走一条路: 请求交给**酒馆服务器转发**(getModelList / generateRaw /
// stopGenerationById)。**不许自己 fetch** —— 浏览器直连会被 CORS 挡掉, 而且和主路径
// 行为不一致(照抄 剧情导演/api.ts:1-3 的铁律)。
// ---------------------------------------------------------------------------

/**
 * 归一接口地址: 去空白、去尾斜杠, 末尾没有 `/vN` 就补 `/v1`。
 *
 * 为什么必须有: `SettingsPanel` 的 placeholder 写着「末尾自动补 /v1」, 但以前 `sink.ts`
 * 只做了 `.trim()` —— **那是个假承诺**。而且 `getModelList` 拿到的必须是规范地址,
 * 否则用户填 `https://x.com` 拉模型必然失败。
 *
 * 判据(见 #193):
 *   ''                    → ''
 *   'https://a.com'       → 'https://a.com/v1'
 *   'https://a.com/'      → 'https://a.com/v1'
 *   'https://a.com///'    → 'https://a.com/v1'
 *   'https://a.com/v1'    → 不变
 *   'https://a.com/v1/'   → 'https://a.com/v1'
 *   'https://a.com/v2'    → 不变
 */
export function 归一接口地址(地址: string): string {
  const 净 = String(地址 ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!净) return '';
  return /\/v\d+$/.test(净) ? 净 : `${净}/v1`;
}

/**
 * 拉取模型列表(经酒馆服务器转发)。
 *
 * 失败**响亮报错**, 不吞。四个分支:
 *   ① 地址空 → 「请先填写接口地址」;
 *   ② **地址没有协议头**(如 `a.com`) → 抛「需要以 http:// 或 https:// 开头」;
 *   ③ 转发抛错 → 带 cause 抛出;
 *   ④ **返回空列表** → 抛「未获取到任何模型」(见下)。
 *
 * ★ 协议头校验与空列表检查**都放在这里, 不放 `归一接口地址`** ——
 *   那个函数生成路径(`sink.ts`)也在用, 加抛错会改动生成路径的行为。
 *   这两条只影响交互式的拉取。
 *
 * ★ 为什么空列表必须当错(kimicode #205 / dsh #209): 这是 OpenAI 兼容端点,
 *   `/v1/models` 返回空只有一种解释 —— 地址或密钥不对。以前拿到 `[]` 当成功,
 *   弹「已获取 0 个模型」, 用户地址写错却看到"成功", **是静默失败**。
 */
export async function 拉取模型(apiurl: string, key: string): Promise<string[]> {
  const base = 归一接口地址(apiurl);
  if (!base) throw Error('请先填写接口地址');
  if (!/^https?:\/\//i.test(base)) {
    throw Error('接口地址不合法: 需要以 http:// 或 https:// 开头');
  }
  let 列表: string[];
  try {
    列表 = await getModelList({ apiurl: base, key: String(key ?? '').trim() });
  } catch (error) {
    throw Error('通过酒馆服务器获取模型列表失败，请检查地址与密钥', { cause: error });
  }
  if (!列表.length) {
    throw Error('未获取到任何模型，请检查接口地址与密钥是否正确');
  }
  return 列表;
}
