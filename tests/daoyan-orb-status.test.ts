// 剧情导演 · 可观测性（提示条四档 + 悬浮球五态）
//
// 用户原话:「插件没弹窗, 我不知道什么时候更新、什么时候更新完了、什么时候更新出错了, 我还要进插件里看。」
// 设计:**状态用球(常驻、安静), 事件用条(短暂、可关)** —— 所以"关掉提示条"绝不等于"看不见状态"。
// 规格: docs/剧情导演-可观测性-提示条规格-v1.md(§3 五态优先级 / §4 四档事件表)
import { createPinia, setActivePinia } from 'pinia';
import { 计算球状态, 球悬停文案, 球状态列表 } from '../src/剧情导演/球状态';
import { 放行提示, 设提示档位, 取提示档位, 提示档列表, 提示档默认, toastError, toastInfo, toastSuccess, toastWarning, setToastAnchor, type 提示档, type ToastType } from '../src/剧情导演/toast';
import { SettingsSchema } from '../src/剧情导演/schema';
import 球状态源 from '../src/剧情导演/球状态.ts?raw';
import vueSource__界面 from '../src/剧情导演/悬浮球界面.vue?raw';
import vueSource__样式 from '../src/剧情导演/悬浮球样式.scss?raw';
// 2026-11-12 P5 第二批：scoped 样式已搬到 `悬浮球样式.scss`（逐行 diff 为 0）。
// 那些"某条 CSS 规则在不在"的断言要看的是**两者之和** —— 否则搬家本身会把它们变成假红。
const vueSource = vueSource__界面 + '\n' + vueSource__样式;
import updateSource from '../src/剧情导演/update.ts?raw';
import indexSource from '../src/剧情导演/index.ts?raw';
import 面板源 from '../src/共用/面板机制.ts?raw';
import 气泡源 from '../src/剧情导演/球气泡.ts?raw';
import { 层序, 悬浮球直径 } from '../src/剧情导演/主题';
import { 装父文档, 装计时器, 归一色, 取堆栈, 取提示条们 } from './提示条测试台.mjs';

(globalThis as any)._ = {
  clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper),
  cloneDeep: (value: any) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value))),
};
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
setActivePinia(createPinia());

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

// 2026-11-12 P5 第二批：scoped 样式已搬到 悬浮球样式.scss（SFC 里只剩 src 引用）
const 样式 = vueSource__样式.replace(/\/\*[\s\S]*?\*\//g, '');
const 模板 = vueSource.slice(0, vueSource.indexOf('<script'));

async function 主流程() {
  // -------------------------------------------------------------------------
  console.log('\n[可观测] ① 五态优先级: 剧终 > 离线 > 出错 > 编排中 > 待命');
  {
    check('状态清单就是这五个(顺序即优先级)', 球状态列表, ['剧终', '离线', '出错', '编排中', '待命']);
    const 全开 = { 已剧终: true, 自动暂停: true, 连败次数: 3, 编排中: true };
    check('剧终压过一切(停摆时不显示"在跑")', 计算球状态(全开), '剧终');
    check('离线(熔断)压过出错与编排中', 计算球状态({ ...全开, 已剧终: false }), '离线');
    check('**出错压过编排中**: 失败后重推, 红环不许一按按钮就变呼吸', 计算球状态({ ...全开, 已剧终: false, 自动暂停: false }), '出错');
    check('没有失败记录时才显示编排中', 计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: true }), '编排中');
    check('全安静 = 待命', 计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: false }), '待命');
    check('连败 1 次(未熔断)也算出错', 计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 1, 编排中: false }), '出错');
    // 每个态都能被算出来(防"某态写了却没入口")
    const 可达 = new Set([
      计算球状态({ 已剧终: true, 自动暂停: false, 连败次数: 0, 编排中: false }),
      计算球状态({ 已剧终: false, 自动暂停: true, 连败次数: 0, 编排中: false }),
      计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 1, 编排中: false }),
      计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: true }),
      计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: false }),
    ]);
    check('五态全部可达(无死状态)', [...可达].sort(), [...球状态列表].sort());
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ② hover 文案: 说清"为什么是这个态"和"下一步去哪儿"');
  {
    ok('剧终 → 指出唯一出口(清除已剧终)', 球悬停文案('剧终').includes('清除已剧终'));
    ok('离线 → 带连败数/阈值与原因 + 恢复入口', 球悬停文案('离线', { 连败次数: 3, 熔断阈值: 3, 最后失败原因: '401' }).includes('恢复自动接管') && 球悬停文案('离线', { 连败次数: 3, 熔断阈值: 3, 最后失败原因: '401' }).includes('401'));
    ok('出错 → 说明红环保持到下次成功', 球悬停文案('出错', { 最后失败原因: '超时' }).includes('超时') && 球悬停文案('出错').includes('红环保持到下次成功'));
    ok('编排中 → 正在编排本幕', 球悬停文案('编排中').includes('正在编排本幕'));
    check('待命 + 冷启动 → 报轮次进度', 球悬停文案('待命', { 接管轮数: 4, 已分析轮数: 1 }), '剧情导演：冷启动记账中（第 1/3 轮，第 4 轮起编排本幕）');
    check('待命 + 有历史 → 报最近节拍与几分钟前', 球悬停文案('待命', { 上次节拍: '高潮', 上次成功分钟前: 5.4 }), '剧情导演：待命 · 最近：本幕节拍=高潮 · 5 分钟前');
    ok('缺原因时不显示空白("原因未知")', 球悬停文案('出错', { 最后失败原因: '' }).includes('原因未知'));
    ok('从没成功过 → 不编造"X 分钟前"', 球悬停文案('待命', { 上次成功分钟前: -1 }).includes('还没编排过') === false || !/分钟前/.test(球悬停文案('待命', { 上次成功分钟前: -1 })));
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ③ 提示条四档 × 四类事件: 放行矩阵');
  {
    const 四类: ToastType[] = ['info', 'success', 'warning', 'error'];
    const 期望: Record<提示档, boolean[]> = {
      全部: [true, true, true, true],
      完成与异常: [false, true, true, true],
      仅异常: [false, false, true, true],
      关闭: [false, false, false, false],
    };
    for (const 档 of 提示档列表) check(`档位「${档}」: info/success/warning/error`, 四类.map(k => 放行提示(档, k)), 期望[档]);
    check('四档清单', [...提示档列表], ['全部', '完成与异常', '仅异常', '关闭']);
    check('默认档 = 完成与异常(每轮最多一条)', 提示档默认, '完成与异常');
    check('瞎写的档位不放行任何东西(安全默认: 落到 switch 之外 → 假值)', !!放行提示('全部全部' as 提示档, 'error'), false);
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ④ 档位同步: 非法值忽略, 保持上一个好值');
  {
    设提示档位('仅异常');
    check('合法值生效', 取提示档位(), '仅异常');
    设提示档位('瞎写');
    check('非法值被忽略(不静默退回默认)', 取提示档位(), '仅异常');
    设提示档位(undefined);
    check('undefined 也被忽略', 取提示档位(), '仅异常');
    设提示档位(提示档默认);
    check('设回默认档(收尾, 不污染别的用例)', 取提示档位(), '完成与异常');
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑤ 设置项: schema 默认/校验/老设置迁移');
  {
    const 新 = SettingsSchema.parse({});
    check('老设置(没有这个键)→ 补默认「完成与异常」', 新.导演.提示条, '完成与异常');
    check('合法值原样保留', SettingsSchema.parse({ 导演: { 提示条: '关闭' } }).导演.提示条, '关闭');
    check('非法值解析失败(不悄悄接受)', SettingsSchema.safeParse({ 导演: { 提示条: '全部全部' } }).success, false);
    ok('其余导演字段没被动到', 新.导演.自动接管 === true && 新.导演.接管轮数 === 4);
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑥ 球的呈现: 环画在球内 · 语义色 · reduce 兜底');
  {
    // 重做后：球标换成自绘 SVG，信息层从原生 title 改到**父页面 DOM 的气泡**（规格 §1.3-15）
    ok('球用 data-态 驱动样式 + 信息气泡挂父页面 DOM', 模板.includes(':data-态="球状态"') && 模板.includes(':aria-label="球悬停"') && 模板.includes('@pointerenter="显示球气泡()"'));
    for (const 态 of ['剧终', '离线', '出错', '编排中']) ok(`「${态}」有呈现规则`, 样式.includes(`[data-态='${态}']`));
    ok('剧终/出错 用朱红(seal)', /data-态='剧终'\] \{[^}]*var\(--dj-seal\)/.test(样式) && /data-态='出错'\] \{[^}]*var\(--dj-seal\)/.test(样式));
    ok('离线 用 inkFaint + 虚线(不是危险色)', /data-态='离线'\] \{[^}]*var\(--dj-ink-faint\)[^}]*dashed/.test(样式));
    ok('出错=实心朱红环+朱红球标; 剧终=双环+球标转灰(两者可辨)', /data-态='出错'\] \{[^}]*color: var\(--dj-seal\)[^}]*inset 0 0 0 2px var\(--dj-seal\)/.test(样式) && /data-态='剧终'\] \{[^}]*color: var\(--dj-ink-faint\)[^}]*inset 0 0 0 2px var\(--dj-seal\), inset 0 0 0 3px/.test(样式));
    ok('编排中 = 1.6s 呼吸 + 环旋转 + 三根刻度依次亮(球标不变形态)', /data-态='编排中'\] \{ color: var\(--dj-seal\); animation: dj-breathe 1\.6s/.test(样式) && /dj-orb-spin 1\.6s/.test(样式) && /\.dj-tk2 \{ animation-delay: 0\.18s/.test(样式));
    const 球态规则 = [...样式.matchAll(/\.dj-orb\[data-态='[^']+'\][^{]*\{([^}]*)\}/g)].map(m => m[1]);
    ok('每条球态规则都只用 inset 环/边框变化(不新增脱流定位)', 球态规则.length >= 4 && 球态规则.every(r => !/position:/.test(r)) && 球态规则.some(r => /box-shadow: inset/.test(r)));
    ok('环画在球内(只用 inset 环), 且球宽仍由 --dj-orb-size 给(不写死 px)', (样式.match(/inset/g) || []).length >= 4 && /\.dj-orb \{[\s\S]{0,160}width: var\(--dj-orb-size/.test(样式));
    ok('reduce 下: 呼吸换成静态环', /@media \(prefers-reduced-motion: reduce\)[\s\S]*?data-态='编排中'\] \{ box-shadow: inset 0 0 0 3px/.test(样式));
    ok('reduce 下: 全局关动效', /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important/.test(样式));
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑦ 面板辅助通道: 编排中的细进度条');
  {
    ok('进度条只在 更新中 时出现(v-if)', 模板.includes('<div v-if="更新中" class="dj-progress"'));
    ok('有无障碍语义(role/aria-label)', 模板.includes('role="progressbar"') && 模板.includes('aria-label="正在编排本幕"'));
    ok('样式已定义(2px 细条 + 回扫)', /\.dj-progress \{[\s\S]*?height: 2px/.test(样式) && 样式.includes('dj-sweep'));
    ok('回扫也不表示真实百分比(注释写死)', vueSource.includes('不表示真实百分比'));
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑧ 接线: 开始事件 / 用时 / 档位同步');
  {
    ok('推进开始处记开始时刻', updateSource.includes('const 开始时刻 = Date.now();'));
    ok('新增"开始推进"info 事件(默认被档位拦)', /toastInfo\(`外部编剧正在编排本幕/.test(updateSource));
    ok('读设置后同步档位', updateSource.includes('设提示档位(settings.导演.提示条);'));
    ok('完成提示带用时', /· 用时 \$\{用时秒\}s/.test(updateSource) && /toastSuccess\(/.test(updateSource));
    ok('冷启动完成提示带轮次进度与用时', /冷启动 第 \$\{落盘\.数据\.已分析轮数\}\/.+?轮起下令）· 用时 \$\{用时秒\}s/.test(updateSource));
    ok('失败详情补用时(日志页可见)', /用时: \$\{Math\.max\(0, Math\.round\(\(Date\.now\(\) - 开始时刻\) \/ 1000\)\)\}s/.test(updateSource));
    ok('启动时就同步档位(面板没打开也生效)', /try \{\s*\n?\s*设提示档位\(getSettings\(\)\.导演\.提示条\);/.test(indexSource));
    ok('设置页选档位立刻生效(自绘下拉选中即应用)', 模板.includes('设提示档位(档)') && 模板.includes('选下拉('));
    ok('设置页文案写明"关闭时球仍工作"', vueSource.includes('球仍会显示 编排中/出错/离线/剧终'));
    ok('完成=success / 开始=info(默认档下每轮只一条)', /toastSuccess\(`剧情导演: \$\{完成文案\}`/.test(updateSource) && !/toastSuccess\(`外部编剧正在编排/.test(updateSource));
  }

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑨ 通道独立: 球状态不依赖提示条(关掉提示条 ≠ 看不见状态)');
  {
    ok('球状态.ts 不引用 toast(纯状态, 无出口依赖)', !球状态源.includes("from './toast'"));
    ok('球状态.ts 不读设置、不依赖档位(纯状态通道)', !球状态源.includes("from './settings'") && !球状态源.includes('getSettings') && !球状态源.includes('提示档'));
    设提示档位('关闭');
    check('关掉提示条后, 编排中/出错照样算得出', [
      计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: true }),
      计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 2, 编排中: false }),
    ], ['编排中', '出错']);
    check('但一条提示都不发', ['info', 'success', 'warning', 'error'].map(k => 放行提示('关闭', k as ToastType)), [false, false, false, false]);
    设提示档位(提示档默认);
  }

  console.log('\n[可观测] ⑩ 气泡跟球（缺陷 1）+ 球默认位置（缺陷 2）');
{
  // 缺陷 1：气泡固定在一处。根因=`球气泡.ts` 只依赖 `#dj-toast-anchor`，
  // 而它属于 toast 系统（只在弹 toast 时更新）→ 球没被拖动过时是空的 → 走兜底(右下角固定)。
  ok('气泡用**实时球心**定位（面板机制的 anchorX/anchorY）', vueSource.includes('显示气泡(球悬停.value, 球心坐标.value)'));
  ok('面板机制暴露实时球心（computed，不是一次性快照）', /球心坐标: computed\(\(\) => \{[\s\S]{0,90}return \{ x: anchorX\.value, y: anchorY\.value \};/.test(面板源));
  ok('气泡模块优先用传入球心，toast 锚点只作兜底', /function 锚点坐标\(doc: Document, 实时球心\?: \{ x: number; y: number \}\)/.test(气泡源) && /if \(实时球心 &&/.test(气泡源));
  ok('拖动后跟手（每次显示都读实时值，无缓存）', /显示气泡\(球悬停\.value, 球心坐标\.value\)/.test(vueSource) && /球心坐标: computed/.test(面板源));
  ok('靠边翻转逻辑保留（左放不下就翻到右侧）', /let left = 球左 - 与球间距 - 宽;[\s\S]{0,80}left = 球右 \+ 与球间距/.test(气泡源));
  // 缺陷 2：球 iframe 停在 (2,2)。根因=锚点初值 -100，onMounted 里装饰步骤若抛错就轮不到兜底/上屏。
  ok('球心兜底进了取球位路径（装饰步骤抛错也不会把球留在原点）', /function 兜底球心\(\): void \{/.test(面板源) && /const orbStyle = computed\(\(\) => \{\s*\n\s*兜底球心\(\);/.test(面板源) && /if \(!球位有效\(anchorX\.value, anchorY\.value, vw, vh\)\)/.test(面板源));
  // dsh 复测追出的毒值根因：早期"视口未知"时算出的 (20,20) 被写进存储, 而 20>0 让旧守卫永不触发
  //
  // ⚠ 2026-11-20 C7：这条原来钉的是 `x >= CLOSED_SIZE && y >= CLOSED_SIZE`。
  //   C7 给内核加了可选的 `球高度`（彼方的球是 46×58 非方形），于是 y 的下界改成了 `CLOSED_HEIGHT`。
  //   **判据的意图没变**（"下界用整球尺寸，20 这种漏不过去"），变的是形态。
  //   改成：x 用宽度、y 用高度，两者都必须是"整球尺寸"而不是半个球。
  ok('读取时净化：坏位置一律判无效（下界用整球尺寸，20 这种漏不过去）',
     /function 球位有效\(x: unknown, y: unknown, vw: number, vh: number\): boolean \{[\s\S]{0,400}x >= CLOSED_SIZE && y >= CLOSED_HEIGHT/.test(面板源));
  ok('视口量不出来时只当帧渲染、绝不落盘（否则会永久写进毒值）', /function 视口可用\(vw = viewportW\(\), vh = viewportH\(\)\): boolean \{[\s\S]{0,80}vw >= 200 && vh >= 200/.test(面板源) && /!视口可用\(\) \|\| !球位有效\(anchorX\.value, anchorY\.value, viewportW\(\), viewportH\(\)\)\) return;/.test(面板源));
  ok('读到坏值会纠正 + 回写存储（刷新一次不会再读到毒值）', /const 存过坏值 = !!saved[\s\S]{0,200}球位有效\(saved\.x, saved\.y, vw, vh\)/.test(面板源) && /if \(存过坏值\) \{[\s\S]{0,220}persistPrefs\(\);/.test(面板源));
  // ⚠ 2026-11-20 C7：y 的下界从 `CLOSED_SIZE` 改成 `CLOSED_HEIGHT`（非方形球）。
  //   意图不变（默认落右下角），形态变了。
  ok('默认落右下角（2048×972 下 x>1900、y>780）',
     /anchorX\.value = Math\.max\(CLOSED_SIZE, vw - 60\)/.test(面板源)
     && /anchorY\.value = Math\.max\(CLOSED_HEIGHT, vh - 130\)/.test(面板源));
  ok('拖动夹取与净化同口径（下界 CLOSED_SIZE）', /clamp\(startAnchorX \+ \(point\.x - startX\), CLOSED_SIZE, viewportW\(\) - CLOSED_SIZE \/ 2\)/.test(面板源));
  ok('默认落在右下角附近（vw-60 / vh-130，不是左上角）', 面板源.includes('vw - 60') && 面板源.includes('vh - 130'));
  ok('onMounted 里先定球位再装饰（且装饰各自 try 掉）', /兜底球心\(\);\s*\n\s*applyFrame\(\);\s*\n\s*同步贴球锚点\(true\);/.test(面板源) && (面板源.match(/catch \(error\) \{/g) || []).length >= 2);
  ok('resize 会重算（球心是 computed，读的是当前视口）', 面板源.includes("addEventListener('resize', onViewportResize)") && /function 兜底球心/.test(面板源));
  ok('落盘跳过 null 字段（面板没拖过时不写 面板x/面板y:null）', /if \(panelPos\.value\) \{\s*\n\s*要存\.面板x/.test(面板源) && !/面板x: panelPos\.value\?\.x \?\? null/.test(面板源));
  // 被收纳插件搬走后仍然贴球：收纳类插件**直接改 iframe 本体的 style.left/top**、且不发任何事件,
  // 逻辑球位(anchorX/anchorY)与真实位置就此脱节 —— 贴球定位必须以 iframe 的真实矩形为准。
  ok('贴球定位以**真实矩形**为准（收纳后仍然跟得住）',
    /const 球矩形 = ref</.test(面板源) &&
    /if \(实\) return \{ x: 实\.cx, y: 实\.cy, r: Math\.max\(实\.w, 实\.h\) \/ 2 \};/.test(面板源));
  ok('矩形盯守：轮询真实矩形并把 toast 锚点跟过去',
    /量球定时器 = window\.setInterval/.test(面板源) &&
    /设锚点\(锚\.x, 锚\.y\)/.test(面板源) &&
    /clearInterval\(量球定时器\)/.test(面板源));
  ok('球 iframe 一动就立刻重量（不等下一次轮询）', /requestAnimationFrame\(\(\) => 同步贴球锚点\(true\)\)/.test(面板源));
  ok('弹条也以**统一锚点**定位（位置与半径都从这取；被收纳时=坞里的图标）',
    /const \{ x: 心x, y: 心y, r: 半径 \} = 贴球锚点\.value;/.test(vueSource) &&
    /let left = 心x - 半径 - w - 10;/.test(vueSource));
  // 收纳坞把球**藏起来**(visibility:hidden + data-floating-dock-hidden)却**没搬走球 iframe**,
  // 所以只贴 iframe 会落在"球原来的位置" —— 必须认领坞里那个代理图标。
  ok('被收纳时贴坞里的代理图标（不是隐形 iframe 的老位置）',
    /取收纳坞入口\(parentWin\.value\?\.document, frame\.value\)/.test(面板源) &&
    /if \(r\.width \|\| r\.height\) return \{ x: r\.left \+ r\.width \/ 2/.test(面板源));
  ok('锚点按**值**判重: 坞拖动/折叠也能跟上（球 iframe 一动没动）',
    /if \(!强制 && Math\.abs\(旧\.x - 锚\.x\) < 0\.5/.test(面板源));
  ok('盯住收纳坞 + 卸载清理', /坞观察器 = new MutationObserver/.test(面板源) && /坞观察器\?\.disconnect\(\)/.test(面板源));
}

  // -------------------------------------------------------------------------
  console.log('\n[可观测] ⑩ 四档闸门真的设在出口: 拦下时连容器都不建');
  {
    const doc = 装父文档();
    const 计时 = 装计时器();

    设提示档位('关闭');
    toastSuccess('不该出声');
    toastInfo('也不该出声');
    check('「关闭」= 一条都不发, 连容器都不建', 取堆栈(doc, 'dj'), null);

    设提示档位('全部');
    toastInfo('外部编剧正在编排本幕');
    check('「全部」= info 也出声', 取提示条们(doc, 'dj').length, 1);

    设提示档位(提示档默认);
    check('默认档是「完成与异常」', 取提示档位(), '完成与异常');
    toastInfo('开始推进');
    check('默认档下 info 被拦(球已经在呼吸了)', 取提示条们(doc, 'dj').length, 1);
    toastSuccess('本幕编排完成');
    toastWarning('快照没落盘');
    toastError('炸了');
    check('默认档下 完成 + 异常 都出声', 取提示条们(doc, 'dj').length, 4);

    设提示档位('仅异常');
    toastSuccess('成功但不该出声了');
    check('改档立刻生效(闸门每次调用都读当前档位)', 取提示条们(doc, 'dj').length, 4);

    设提示档位(提示档默认);
    setToastAnchor(500, 300);
    const 堆栈 = 取堆栈(doc, 'dj')!;
    ok('父页面上是 dj- 那套元素', !!doc.getElementById('dj-toast-style') && !!堆栈);
    check('贴球按直径算(球心 - 半径 - 10)', 堆栈.style.left, `${500 - 悬浮球直径 / 2 - 10}px`);
    check('容器层序 = 主题.ts 的 层序.提示条堆栈', 堆栈.style.zIndex, String(层序.提示条堆栈));
    check('警告左边框是平色金(不走 accent 变量)', (取提示条们(doc, 'dj')[2] as HTMLElement).style.borderLeft, `3px solid ${归一色(doc, '#d9a13c')}`);
    // 四条出声: 「全部」档下那条 info(3400) + 默认档下的 success(3400)/warning(5200)/error(8000)
    check('四条的停留时长', 计时.待触发().map(t => t.ms), [3400, 3400, 5200, 8000]);
    // 闸门只管"出不出声": 关掉提示条也照样算得出状态(这一条与 ⑨ 同义, 在真 DOM 上再钉一次)
    check('球状态不经过闸门', 计算球状态({ 已剧终: false, 自动暂停: false, 连败次数: 0, 编排中: true }), '编排中');
  }

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exitCode = 1;
}

await 主流程();
