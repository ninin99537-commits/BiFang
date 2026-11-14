// 彼方 · 打开面板这道关(2026-10-26 真机事故后重写)。
//
// 事故链(报障者用 Firefox):
//   ① 点球/点「打开彼方」→ 面板**没画出来**;
//   ② 但那一下把 iframe 放大成了整屏, 于是"除悬浮球外整间酒馆都点不动";
//   ③ 控制台里连一行"面板已展开"都没有 —— 因为那行当时写在 `requestAnimationFrame` 里,
//      面板没上屏的那条路径根本走不到它, 谁也说不清"点击到底有没有到彼方";
//   ④ 上一版给 iframe 加的 `clip-path: path()` 在他那儿既没裁渲染也没裁命中测试,
//      等于白加了一个"面板画不出来"的变量。
//
// 现在钉住四条不许退回去的性质(两份实现各查一遍):
//   ① **不动 iframe 的渲染路径**: 不再给 iframe 写 `clip-path: path()`;
//   ② **遮罩盖在 iframe 之上并给面板留洞**(四块矩形, 不用 path()):
//      面板画不出来时, 屏幕上的点击先落到遮罩 = 收起, 而不是被空 iframe 吃掉;
//   ③ **日志同步打**: 点开必有一行, `nextTick` 再报一次尺寸 —— 不依赖渲染帧;
//   ④ **失败必须说出来**: 看门狗 / 渲染错误捕获 → 屏幕中央一行字 + 收起 + 控制台诊断;
//      构建标识写进日志, 下次一眼分清新旧包。
import 原版壳 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';
import 原版挂载 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.ts?raw';
import 原版入口 from '../src/彼方_NPC幕后生命状态系统/index.ts?raw';
import 原版提示条 from '../src/彼方_NPC幕后生命状态系统/toast.ts?raw';
import 原版样式 from '../src/彼方_NPC幕后生命状态系统/面板样式.css?raw';
import { 构建标识 } from '../src/彼方_NPC幕后生命状态系统/构建';

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        实际 ${JSON.stringify(actual)}\n        期望 ${JSON.stringify(expected)}`);
  }
}
function ok(label: string, 条件: unknown) {
  check(label, !!条件, true);
}

for (const [名, 壳, 挂载, 入口, 提示条, 样式] of [
  ['自用版', 原版壳, 原版挂载, 原版入口, 原版提示条, 原版样式],
] as const) {
  console.log(`\n[${名}] ① 不碰 iframe 的渲染路径`);
  ok('不再有 应用命中裁剪 这个函数', !/function 应用命中裁剪/.test(壳));
  ok('打开分支把 clipPath 明确清成 none', /if \(panelOpen\.value\) \{[\s\S]{0,900}target\.style\.clipPath = 'none'/.test(壳));
  ok('整份壳里没有 path(\'M…A…) 那种 iframe 裁剪', !/style\.clipPath =\s*\n?\s*`path\(/.test(壳) && !/target\.style\.clipPath = `path/.test(壳));

  console.log(`\n[${名}] ② 遮罩盖在 iframe 之上, 中间给面板留洞`);
  ok('遮罩层级 2147483001(iframe 是 2147483000)', /const DIM_Z = 2147483001;/.test(壳));
  ok('四块遮罩收在一个容器里(拆散成四个 id 会漏清)', /遮罩容器 = doc\.createElement\('div'\);[\s\S]{0,80}遮罩容器\.id = DIM_ID/.test(壳));
  ok('容器本身不吃点击(pointer-events:none), 四块才吃', /pointer-events:none;`/.test(壳) && /position:fixed;pointer-events:auto;background:/.test(壳));
  ok('遮罩是四块边带(不用 clip-path 挖洞)', /遮罩块 = \[0, 1, 2, 3\]\.map/.test(壳));
  ok('四块按上/下/左/右 摆位, 洞 = 面板矩形', /上[\s\S]{0,400}下[\s\S]{0,400}左[\s\S]{0,400}右/.test(壳) && /const p = 面板矩形\(\);/.test(壳));
  ok('四角补圆角补丁(否则四角各留一块直角阴影)', /圆角块 = \[0, 1, 2, 3\]\.map/.test(壳) && /radial-gradient\(circle \$\{r\}px at/.test(壳));
  ok('补丁用径向渐变(圆内透明), 不能用 border-radius:100%(那是补集, 会压在面板角上)', !/圆角边\}:100%/.test(壳) && /rgba\(0,0,0,0\) 0, rgba\(0,0,0,0\) \$\{r - 1\}px, \$\{色\} \$\{r\}px/.test(壳));
  ok('四个补丁的圆心分别对准面板四角的圆弧圆心', /100% 100%' \}[\s\S]{0,200}0% 100%' \}[\s\S]{0,200}100% 0%' \}[\s\S]{0,200}0% 0%' \}/.test(壳));
  ok('补丁只负责涂色, 不抢面板角上的点击(pointer-events:none)', /position:fixed;pointer-events:none;left:\$\{c\.left\}px/.test(壳));
  ok('圆角从面板本体量, 窄屏(0)时不补角', /function 面板圆角\(\): number \{/.test(壳) && /if \(r <= 0\) \{[\s\S]{0,200}圆角块\.forEach\(el => \(el\.style\.display = 'none'\)\)/.test(壳));
  ok('收起时边带与角补丁一起藏', /\[\.\.\.遮罩块, \.\.\.圆角块\]\.forEach\(el => \(el\.style\.display = 'none'\)\)/.test(壳));
  ok('洞外点击 = 收起(并挡住冒泡)', /e\.stopPropagation\(\);[\s\S]{0,40}closePanel\(\);/.test(壳));
  ok('收起时清掉状态字', /置状态\(''\);/.test(壳));
  ok('卸载时按容器一次清掉', /function 移除遮罩\(\): void \{[\s\S]{0,200}遮罩容器\?\.remove\(\);/.test(壳));
  ok('视口变化时重摆遮罩(否则面板边上会多压一条)', /if \(panelOpen\.value\) 置遮罩\(true\);/.test(壳));
  ok('脚本卸载时清掉 bf-panel-dim 与 bf-panel-status', /'bf-panel-dim', 'bf-panel-status'/.test(挂载));
  ok('遮罩层级之外, 提示条要更高(否则报错被遮罩盖住)', /堆栈层序: 2147483003/.test(提示条));
  ok('更新弹条也在遮罩之上', /z-index:2147483003;display:none;align-items:center/.test(壳));

  console.log(`\n[${名}] ③ 日志同步打, 不依赖渲染帧`);
  ok('点开就同步打一行', /function 展开面板\(来源: string\): void \{[\s\S]{0,260}console\.info\(`\[彼方\] 点开面板/.test(壳));
  ok('DOM 更新后在 nextTick 里报尺寸', /void nextTick\(\(\) => \{[\s\S]{0,400}面板已展开/.test(壳));
  ok('不再用 requestAnimationFrame 打日志', !/requestAnimationFrame\(\(\) => \{[\s\S]{0,300}面板已展开/.test(壳));
  ok('日志里带构建标识', /构建 \$\{构建标识\}/.test(壳));
  ok('加载日志也带构建标识', /已加载 \(构建 \$\{构建标识\}\)/.test(入口));
  ok('构建标识是个非空常量', typeof 构建标识 === 'string' && 构建标识.length > 0);

  console.log(`\n[${名}] ④ 失败必须说出来`);
  ok('有看门狗', /function 开始看门狗\(\)/.test(壳) && /function 关闭看门狗\(\)/.test(壳));
  ok('面板没尺寸就判失败', /r\.w > 0 && r\.h > 0\) return;/.test(壳));
  ok('失败时收回去', /panelOpen\.value = false;\s*\n\s*applyFrame\(\);/.test(壳));
  ok('失败时屏幕中央留一行诊断字', /置状态\(`彼方的面板没能显示出来/.test(壳));
  ok('诊断串含 构建/样式/面板元素/面板尺寸/iframe/视口', ['构建 ', '样式 ', '面板元素 ', '面板尺寸 ', 'iframe ', '视口 '].every(k => 诊断串覆盖(壳, k)));
  ok('渲染期抛错也被收住(onErrorCaptured)', /onErrorCaptured\(\(error, _instance, info\) =>/.test(壳));
  ok('渲染抛错: 打完整错误 + 收起 + 屏幕留字', /console\.error\(`\[彼方\] 界面渲染出错/.test(壳) && /置状态\(`彼方的界面渲染出错/.test(壳));
  ok('渲染抛错后把 tab 退回仪表盘(否则重开面板又炸在同一页)', /onErrorCaptured\(\(error, _instance, info\) => \{[\s\S]{0,900}tab\.value = 'dashboard'/.test(壳));
  ok('状态字只在失败时显示(初始空)', /function 置状态\(text: string\): void \{[\s\S]{0,220}if \(!text\)/.test(壳));

  console.log(`\n[${名}] ⑤ 所有过渡都不依赖 JS(真机上 rAF 不跑也不许卡住画面)`)
  ok('模板里没有 <Transition> 包裹(注释除外)', !/^\s*<Transition\b/m.test(壳) && !/^\s*<\/Transition>/m.test(壳));
  ok('页面切换不再用 out-in 过渡', !/mode="out-in"/.test(壳));
  ok('面板入场改成纯 CSS 关键帧', /animation: bfPanelIn/.test(样式));
  ok('关键帧自己写完居中位移(否则动画期间面板跳到左上)', /@keyframes bfPanelIn \{[\s\S]{0,300}translate\(-50%, -50%\) scale\(0\.97\)[\s\S]{0,200}translate\(-50%, -50%\) scale\(1\)/.test(样式));
  ok('页面切换改由 .bf-page 的关键帧负责', /\.bf-page \{[\s\S]{0,200}animation: bfPageIn/.test(样式) && /@keyframes bfPageIn/.test(样式));
  ok('添加NPC 模态也改关键帧', /\.bf-modal-backdrop \{[\s\S]{0,120}animation: bfFadeIn/.test(样式) && /\.bf-modal \{[\s\S]{0,200}animation: bfModalIn/.test(样式));
  ok('旧的 Vue 过渡类已清掉', !/\.bf-fade-enter-from/.test(样式) && !/\.bf-pop-enter-from/.test(样式) && !/\.bf-pagefade/.test(样式));
  ok('面板本体仍是 v-if + ref="panelEl"', /<div v-if="panelOpen" ref="panelEl" class="bf-panel"/.test(壳));
  ok('页面仍是 tab 驱动的 v-if 链(切换不经过任何过渡)', /<main class="bf-main">[\s\S]{0,120}v-if="tab === 'dashboard'"[\s\S]{0,600}<SettingsPage v-else/.test(壳));

  console.log(`\n[${名}] ⑥ 面板打开时提示条不会被甩到屏幕正中`);
  ok('面板打开时球锚点不看 iframe 矩形(展开后它就是整屏)', /if \(!panelOpen\.value\) \{[\s\S]{0,500}球矩形\.value/.test(壳));
  ok('面板开/关后立刻重算贴球锚点', /watch\(\[panelOpen, anchorX, anchorY\], \(\) => \{[\s\S]{0,220}同步贴球锚点\(true\)/.test(壳));
}

/** 诊断串里是否包含某一段(写成函数是为了让断言读起来还是一行) */
function 诊断串覆盖(源: string, 片段: string): boolean {
  const m = 源.match(/function 诊断串\(\): string \{[\s\S]*?\n\}/);
  return !!m && m[0].includes(`\`${片段}`);
}

console.log('\n[两版一致] 脚本按钮两边都有(2026-10-26 起不再分叉)');
{
  const 按钮入口 = /function 打开面板入口\(\) \{\s*\n\s*展开面板\('脚本按钮'\);/;
  ok('自用版挂 __bfOpenPanel', 原版壳.includes('__bfOpenPanel = 打开面板入口'));
  ok('自用版按钮入口转给 展开面板', 按钮入口.test(原版壳));
}

console.log(fail === 0 ? `\n彼方面板打开这道关: 全部通过 (${pass} 断言)` : `\n彼方面板打开这道关: ${fail} 失败, ${pass} 通过`);
process.exit(fail === 0 ? 0 : 1);


