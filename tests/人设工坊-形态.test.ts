// 人设工坊 · 形态回归: 它必须是「脚本」，不是「前端界面」
//
// 项目规则(项目基本概念.mdc): 有 index.ts + index.html = 前端界面; 只有 index.ts = 脚本。
// webpack.config.ts 用 index.html 的有无切形态。人设工坊要的是「插件」形态, 所以必须没有 index.html。
//
// 2026-10-14 #50 界面重做后, 形态有两条变化, 都钉在这里:
//   1. 入口从「悬浮球」改成「酒馆输入框的魔法棒菜单」—— 外层 iframe 初始 0×0, 不再有球;
//   2. 壳组件从 悬浮球界面.vue 改名 面板.vue(名字已名不副实)。
//
// 另有两条踩过坑的正解也在这里钉住:
//   · iframe 定位必须从挂载根元素的 ownerDocument.defaultView 反推, 不得用脚本 realm 的裸 window;
//   · 拖动必须挂父窗监听(只在 iframe 内监听, 鼠标一出界就断)。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// 用例由 tests/run.mjs 以项目根为 cwd 启动(node ... , { cwd: ROOT }),
// 所以这里直接用 process.cwd()。不要用 import.meta.url 上溯:
// 打包产物在 tests/.build/ 下, 上溯一级只到 tests/, 不是项目根。
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'src', '人设工坊');

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  PASS  ${label}`);
  }
  else {
    fail++;
    console.log(`  FAIL  ${label}\n        期望 ${JSON.stringify(expected)}\n        实际 ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, condition: boolean) {
  check(label, condition, true);
}

/**
 * 去掉注释, 只留代码。
 * 为什么需要: 组件注释里会**解释这个坑**(写"不能用裸 window.frameElement"), 那段说明文字
 * 不该被当成"代码里出现了裸调用"。测试必须能区分"解释坑"与"踩坑"。
 */
function 去注释(源码: string): string {
  return 源码
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/<!--[\s\S]*?-->/g, '') // 模板注释
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 行注释(避开 http:// 里的 //)
}

console.log('\n[1] 目录里没有 index.html(否则会被认成前端界面)');
{
  check('index.html 不存在', existsSync(path.join(DIR, 'index.html')), false);
  check('无 .html 文件', readdirSync(DIR).filter(名 => 名.endsWith('.html')), []);
}

console.log('\n[2] 入口是脚本挂法 + 魔法棒入口(不再是悬浮球)');
{
  const 入口 = readFileSync(path.join(DIR, 'index.ts'), 'utf8');
  ok('不含 mount("#app") / mount(\'#app\')', !/mount\(\s*['"]#app['"]\s*\)/.test(入口));
  ok('含 createPinia(脚本自己建 pinia)', 入口.includes('createPinia'));
  ok('含 srcdoc(嵌套 iframe 透明底)', 入口.includes('srcdoc') || 入口.includes('SRCDOC'));
  ok('含 pointerEvents 守护', 入口.includes('pointerEvents'));
  ok('含 pagehide 卸载', 入口.includes('pagehide'));

  // #50: 入口改魔法棒
  ok('注册脚本按钮 appendInexistentScriptButtons', 入口.includes('appendInexistentScriptButtons'));
  ok('按钮名是「人设工坊」', 入口.includes("'人设工坊'"));
  ok('监听按钮事件 getButtonEvent', 入口.includes('getButtonEvent'));
  // 外层 iframe 初始 0×0(没开面板时完全不占位置)
  ok('iframe 初始宽 0px', /width:\s*'0px'/.test(入口));
  ok('iframe 初始高 0px', /height:\s*'0px'/.test(入口));
  // 只查"是否还 import 本目录的悬浮球界面"; 注释里提到参考文件 剧情导演/悬浮球界面.ts 是正常的
  ok('不再 import 本目录的悬浮球界面', !/from\s+['"]\.\/悬浮球界面(\.vue)?['"]/.test(入口));
}

console.log('\n[3] 壳组件已改名 面板.vue, 悬浮球界面.vue 已删除');
{
  ok('面板.vue 存在', existsSync(path.join(DIR, '面板.vue')));
  ok('悬浮球界面.vue 已删除', !existsSync(path.join(DIR, '悬浮球界面.vue')));
}

console.log('\n[4] iframe 定位必须反推自己挂载的那个 $app, 不得用裸 window(真机缺陷回归)');
{
  // 只查代码, 不查注释 —— 注释里解释这个坑是应该的, 不能被判成踩坑
  const 壳 = 去注释(readFileSync(path.join(DIR, '面板.vue'), 'utf8'));
  ok('代码里不含裸 window.frameElement', !/window\.frameElement/.test(壳));
  ok('代码里不含裸 window.parent', !/window\.parent/.test(壳));
  ok('含 ownerDocument.defaultView 派生', 壳.includes('ownerDocument') && 壳.includes('defaultView'));
  ok('含 frameElement(从派生 window 取)', 壳.includes('frameElement'));
  ok('根元素带 ref 绑定', /ref="根元素"/.test(壳) || /ref='根元素'/.test(壳));
}

console.log('\n[5] 拖动必须挂父窗监听(鼠标出界不断)');
{
  const 壳 = 去注释(readFileSync(path.join(DIR, '面板.vue'), 'utf8'));
  ok('有拖动开始(mousedown 处理)', 壳.includes('mousedown') || 壳.includes('开始拖动'));
  ok('父窗上挂 mousemove', /父窗[\s\S]{0,200}addEventListener\(\s*'mousemove'/.test(壳) || 壳.includes("addEventListener('mousemove'"));
  ok('父窗上挂 mouseup', 壳.includes("addEventListener('mouseup'"));
  ok('拖动结束会摘监听', 壳.includes('removeEventListener'));
  ok('记住位置(localStorage)', 壳.includes('localStorage'));
}

console.log('\n[6] 底栏「创作方向」是多行 textarea 且钉住');
{
  const app = readFileSync(path.join(DIR, 'App.vue'), 'utf8');
  ok('标签是「创作方向」', app.includes('创作方向'));
  ok('用 textarea(不是 input)', /<textarea[\s\S]{0,200}fg-brief/.test(app) || app.includes('fg-brief'));
  ok('不再叫「一句话需求」', !app.includes('一句话需求'));
  ok('底栏 flex:none(钉住不滚动)', /\.fg-foot\s*\{[^}]*flex:\s*none/.test(app));
  ok('有字数显示', app.includes('fg-foot-count'));
  ok('三栏独立滚动(每栏 overflow-y)', app.includes('fg-col') && app.includes('overflow-y: auto'));
}

console.log('\n[7] #84 拖动: 屏幕坐标 + 双窗监听 + 丢 mouseup 兜底');
{
  const 壳 = 去注释(readFileSync(path.join(DIR, '面板.vue'), 'utf8'));
  // 修法 1: 位移必须用屏幕坐标(screenX/screenY) —— 两个窗口里完全一致, 从根上排除坐标系混用
  ok('位移用 screenX', 壳.includes('screenX'));
  ok('位移用 screenY', 壳.includes('screenY'));
  ok('不再用 clientX 算位移(旧抽搐根因)', !/ev\.clientX/.test(壳));
  // 修法 2: 两个窗都挂(隐式捕获投给谁不确定), 且两个都摘
  ok('双窗挂监听(遍历 [内窗, 外窗])', /\[内窗,\s*外窗\]/.test(壳));
  ok('遍历里同时加 mousemove', 壳.includes("addEventListener('mousemove'"));
  ok('遍历里同时加 mouseup', 壳.includes("addEventListener('mouseup'"));
  ok('遍历里同时摘 mousemove', 壳.includes("removeEventListener('mousemove'"));
  // 修法 3: buttons === 0 兜底 —— 治"一直跟着鼠标"
  ok('mousemove 里检查 buttons === 0', /ev\.buttons\s*===\s*0/.test(壳));
  // 修法 4: blur 结束拖动; mouseleave 只挂父窗(挂 iframe 会提前掐断正常拖动)
  ok('监听 blur', 壳.includes("addEventListener('blur'"));
  ok('mouseleave 只挂外窗', /外窗\.addEventListener\('mouseleave'/.test(壳));
  // 修法 5: 旧 pointer-events:none 不再用于拖动。
  //   注意只看**拖动函数体内** —— 定位() 在面板关闭时仍会设 pointerEvents='none'(那是尺寸 0×0 的正当收尾, 不是拖动修法)。
  const 拖动体 = 壳.slice(壳.indexOf('function 开始拖动'));
  ok('拖动函数体里不再设 pointerEvents', !拖动体.includes('pointerEvents'));
  ok('拖动里有防重入(已结束只收一次)', 壳.includes('已结束'));
}

console.log('\n[8] #84 抽屉互斥: 结构上只渲染一个 + 状态层同步切换');
{
  const app = 去注释(readFileSync(path.join(DIR, 'App.vue'), 'utf8'));
  // 结构性保证: 两个抽屉用 v-if / v-else-if, 就算两个信号同时为真 DOM 里也只有一个
  ok('设置抽屉 v-if', /v-if="显示设置"[\s\S]{0,80}fg-drawer/.test(app));
  ok('草稿抽屉 v-else-if(互斥的结构保证)', /v-else-if="显示草稿"[\s\S]{0,80}fg-drawer/.test(app));

  const 状态 = 去注释(readFileSync(path.join(DIR, '界面状态.ts'), 'utf8'));
  ok('有同步切换函数 切换设置', 状态.includes('function 切换设置'));
  ok('有同步切换函数 切换草稿', 状态.includes('function 切换草稿'));
  ok('开设置时关草稿(同步, 当场置 false)', /显示设置\.value[\s\S]{0,60}显示草稿\.value\s*=\s*false/.test(状态));
  ok('开草稿时关设置(同步)', /显示草稿\.value[\s\S]{0,60}显示设置\.value\s*=\s*false/.test(状态));
  ok('不再用异步 watch 做互斥(同 tick 双切会双双关掉)', !状态.includes('watch('));

  const 壳 = 去注释(readFileSync(path.join(DIR, '面板.vue'), 'utf8'));
  ok('面板按钮调切换函数(不直接改 ref)', 壳.includes('@click="切换设置"') && 壳.includes('@click="切换草稿"'));
}

console.log('\n[9] #94 抽屉被压扁: 自动增高护栏 + 抽屉禁 shrink');
{
  const app = 去注释(readFileSync(path.join(DIR, 'App.vue'), 'utf8'));

  // Bug B: max-height 只封顶, 封不住 flex-shrink —— 抽屉必须关掉 shrink
  ok('抽屉 flex: 0 0 auto(关掉 shrink)', /\.fg-drawer\s*\{[^}]*flex:\s*0\s+0\s+auto/.test(app));
  ok('抽屉不再 flex: 0 1 auto(会被压扁)', !/\.fg-drawer\s*\{[^}]*flex:\s*0\s+1\s+auto/.test(app));
  ok('抽屉仍保留 max-height 55%', /\.fg-drawer\s*\{[^}]*max-height:\s*55%/.test(app));
  ok('不用 min-height(项目规矩: overflow 归零自动最小尺寸)', !/min-height\s*:/.test(app));
  ok('.fg-main 仍 overflow: hidden(承担压缩量)', /\.fg-main\s*\{[^}]*overflow:\s*hidden/.test(app));

  // Bug A: 自适应高度两道护栏(量错 + 冻结)
  ok('宽度为 0 时不写(布局未定型不固化错值)', app.includes('if (!可用宽) return;'));
  ok('用 ResizeObserver 在宽度变化时重量', app.includes('ResizeObserver'));
  ok('比对上次宽度(只宽度真变了才跑, 防自激)', app.includes('上次宽度'));
  ok('保留 8 行上限', app.includes('高度上限'));
  ok('brief 变化仍重算', /watch\(\(\) => 设置\.settings\.brief/.test(app));
  ok('卸载时断开观察(不留悬挂观察器)', app.includes('尺寸观察?.disconnect()'));
}

console.log('\n[10] #124 批次3 卡顿: textarea 的 value 必须真的变短(不是 CSS 裁切)');
{
  const pp = 去注释(readFileSync(path.join(DIR, 'components', 'PromptPreview.vue'), 'utf8'));

  // 核心判据: textarea 绑的是「预览文本」这个真截短的串, 不是全文
  ok('textarea 绑 预览文本(不是直接绑 提示词)', /:value="预览文本"/.test(pp));
  ok('textarea 不再直接绑全文 提示词', !/:value="提示词"/.test(pp));
  // ★ dsh #162: 不变量是**字符数**不是行数 —— 逻辑抽到 lib/折叠.ts(有独立对抗用例)
  ok('组件从 lib/折叠 引入', /from '\.\.\/lib\/折叠'/.test(pp));
  ok('可折叠走 需要折叠()', /需要折叠\(props\.提示词/.test(pp));
  ok('折叠走 折叠预览()', /折叠预览\(props\.提示词/.test(pp));
  ok('不再用「预览行数」按行切片', !pp.includes('预览行数') && !/slice\(0,\s*预览行数/.test(pp));
  // ★ dsh #168 茬: 只检查「有个数字」不够 —— 把上限改成 999999999 这条也会过, 而那样折叠等于不生效。
  //   加**数值约束**: 上限必须是个"真能省布局"的小数字。逻辑在 lib/折叠.ts。
  const 折叠源 = 去注释(readFileSync(path.join(DIR, 'lib', '折叠.ts'), 'utf8'));
  const m = 折叠源.match(/const 预览上限 = (\d+)/);
  const 上限值 = m ? Number(m[1]) : 0;
  ok('上限有数值', !!m);
  ok('上限是个小数字(否则折叠等于不生效)', !!m && 上限值 <= 20000);
  ok('上限不是零(否则一切都被折叠)', 上限值 > 0);
  // 展开态只存组件内部, 不进 store
  ok('展开状态是组件内 ref', /const 展开 = ref\(/.test(pp));
  ok('展开状态没写进 store', !/设置\.settings\.展开/.test(pp) && !/store[\s\S]{0,40}展开/.test(pp));
  // 真实总量永远可见 + 标签说清是"预览"
  ok('标题写明是预览', pp.includes('提示词预览'));
  ok('全文总字数始终显示', pp.includes('全文 {{ 千分位(提示词.length) }} 字'));
  ok('折叠提示写明"发送与复制仍是全文"', pp.includes('发送与复制仍是全文'));
  ok('折叠提示按字符说(不提行数)', pp.includes('只显示开头约'));
  // 复制走的是全文(不能因为折叠就把复制也截了)
  ok('复制按钮说"复制全文"', pp.includes('复制全文'));
}

console.log('\n[11] #236 ③ 模型候选: 自绘面板, 不受当前值过滤');
{
  const sp = 去注释(readFileSync(path.join(DIR, 'components', 'SettingsPanel.vue'), 'utf8'));

  // 核心: 不用 datalist(它按输入框当前值过滤)
  ok('不再用 <datalist>', !sp.includes('<datalist'));
  ok('不再用 list="..." 绑定', !/list="fg-model-list"/.test(sp));
  // 自绘候选面板: 直接遍历 models, 与当前值无关
  ok('自绘候选面板(v-for over models)', /v-for="模型 in 设置\.settings\.api\.models"/.test(sp));
  ok('候选面板有滚动上限(候选多时内部滚)', /\.sp-cand\s*\{[^}]*max-height/.test(sp));
  ok('候选面板有 overflow-y', /\.sp-cand\s*\{[^}]*overflow-y:\s*auto/.test(sp));
  // 开/关列表不写 model —— 只有 选模型 写
  ok('点候选才写 model(选模型 函数)', /function 选模型\(模型: string\)/.test(sp) && /设置\.settings\.api\.model\s*=\s*模型/.test(sp));
  ok('开关列表是独立 ref', /const 候选开 = ref\(false\)/.test(sp));
  // 手打能力保留: 仍是 input + v-model
  ok('仍是 input 且 v-model 绑 model', /v-model="设置\.settings\.api\.model"/.test(sp));
  // models 为空时: **按钮不许禁用** —— #240 指出 `:disabled` 会让空态提示成为死代码
  // (本项目已被「写了但跑不到的代码」咬过两次, 死代码在这里是缺陷类)
  ok('models 为空时下拉按钮**不禁用**(空态提示才可达)', !/:disabled="!设置\.settings\.api\.models\.length"/.test(sp));
  ok('候选面板有空态提示', sp.includes('还没有候选'));
  // 点面板外关闭
  ok('有遮罩层用于点外关闭', /\.sp-cand-mask/.test(sp) && /@click="候选开 = false"/.test(sp));
}

console.log(`\n人设工坊形态: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
