// 彼方 · 模型选择器 —— 手填 + 候选面板(两版同源)
//
// 背景(真机反馈):
//   ① 有的接口没有 `GET /models` 端点(只实现 /chat/completions 的自建网关), 拉不到列表;
//      设置页原来是纯 `<select>`, 列表空时只有「（请选择模型）」, **没有任何手填入口**。
//   ② 第一版补丁用 `<input list>` + `<datalist>`, 结果真机反馈: 已经填了 `gemini-3.7-flash`,
//      再展开下拉**只看到匹配项(甚至一项都没有)**, 必须先把输入框删空才看得到别的模型 ——
//      因为原生 datalist 按输入框当前值过滤候选。人设工坊 #236 ③ 早就踩过同一个坑。
//
// 所以判据钉两件事:
//   A. 模型控件是「输入框 + 自绘候选面板」: 能手填, 且候选列表**与当前值无关**(每次列全部);
//   B. 拉取模型**不许**静默覆盖已填的模型名(手填的名字本来就不在列表里, 这是正常情况)。
//
// 判据只钉一份实现(社区版已删除)。
import 原版设置 from '../src/彼方_NPC幕后生命状态系统/页面-设置.vue?raw';
import 设置面板源码 from '../src/彼方_NPC幕后生命状态系统/设置面板.ts?raw';
import 原版壳 from '../src/彼方_NPC幕后生命状态系统/悬浮球界面.vue?raw';

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
function ok(label: string, cond: boolean) {
  check(label, !!cond, true);
}

/** 取模板段(不含 script/style), 免得注释里的反例被当正例 */
function 取模板(text: string): string {
  const m = text.match(/<template>([\s\S]*)<\/template>/);
  return m ? m[1] : '';
}
/**
 * 去掉 HTML 注释。**必须去掉**: 模板里那些"为什么不用 datalist / select"的注释
 * 本身就会命中下面 [2] 的正则, 不去掉就会把"解释为什么不用"误判成"用了"。
 */
function 去注释(template: string): string {
  return template.replace(/<!--[\s\S]*?-->/g, '');
}
/** 取壳里 loadModels 的函数体 */
function 取函数体(shell: string, 名: string): string {
  const 起 = shell.indexOf(`function ${名}(`);
  if (起 < 0)
    return '';
  // 从 `function 名(` 之后开始数花括号, 数平了就收工
  let i = shell.indexOf('{', 起);
  const 头 = i;
  let 深 = 0;
  for (; i < shell.length; i++) {
    if (shell[i] === '{')
      深++;
    else if (shell[i] === '}') {
      深--;
      if (深 === 0)
        return shell.slice(头, i + 1);
    }
  }
  return '';
}

const 两版 = [
  { 名: '自用版', 设置: 原版设置, 壳: 原版壳 },
];

console.log('\n[1] 模型控件: 输入框 + 自绘候选面板(能手填, 候选与当前值无关)');
for (const { 名, 设置 } of 两版) {
  const t = 取模板(设置);
  ok(`${名}: 模型是 input(v-model 绑到 接口.模型)`, /<input[\s\S]*?v-model="settings\.接口\.模型"/.test(t));
  ok(`${名}: 有下拉按钮`, /bf-model-toggle/.test(t));
  ok(`${名}: 有自绘候选面板`, /class="bf-model-cand"/.test(t));
  ok(`${名}: 候选列表直接遍历 modelList`, /v-for="model in modelList"/.test(t));
  ok(`${名}: 空候选有说明(并告诉可以手填)`, /bf-model-cand-empty/.test(t) && /手填/.test(t));

  // ★ 反面判据: 候选列表**不许**带任何过滤条件。`v-for="model in modelList"` 之外
  //   再来个 computed 过滤(filter/includes/slice)就会重演"删空才看得到别的模型"。
  const 遍历行 = t.split('\n').find(line => line.includes('v-for="model in modelList"')) ?? '';
  ok(`${名}: ★ 候选遍历没有过滤器`, 遍历行.includes('v-for="model in modelList"') && !/filter|\.slice|\.includes\(/.test(遍历行));
}

console.log('\n[2] ★ 不许再退回 datalist / select(两条都踩过坑)');
for (const { 名, 设置 } of 两版) {
  const t = 去注释(取模板(设置));
  ok(`${名}: 没有 <datalist>(它按当前值过滤候选)`, !/<datalist/i.test(t));
  ok(`${名}: 模型控件不是 <select>(列表空时没有手填入口)`, !/<select[^>]*bf-api-model/.test(t));
  ok(`${名}: 输入框上没有 list= 属性(那会把 datalist 接回来)`, !/<input[^>]*\blist=/.test(t));
}
// 反面对照: 把第一版补丁(带 datalist 的 input)塞回去, 判据必须报出来
{
  const 旧版 = '<input id="bf-api-model" v-model="settings.接口.模型" class="bf-input" list="bf-api-model-list" /><datalist id="bf-api-model-list"></datalist>';
  ok('反面对照: 带 datalist 的写法会被判出来', /<datalist/i.test(旧版) && /<input[^>]*\blist=/.test(旧版));
}

console.log('\n[3] ★ 拉取模型不许静默覆盖已填的模型名(手填的名字本来就不在列表里)');
for (const { 名, 壳 } of 两版) {
  const 体 = 取函数体(壳, 'loadModels');
  ok(`${名}: 取到了 loadModels 函数体`, 体.length > 0);
  // 旧写法(有罪的): if (!list.includes(模型)) 模型 = list[0]
  ok(`${名}: ★ 没有 "不在列表里就换成 list[0]" 的覆盖逻辑`, !/!\s*list\.includes\(/.test(体));
  // 新写法: 只在"还没选模型"时才自动填第一个
  ok(`${名}: 只在模型为空时才自动填第一个`, /if\s*\(\s*!settings\.value\.接口\.模型\s*\)/.test(体));
  ok(`${名}: 空列表有专门提示(不报成功)`, /没返回模型列表/.test(体));
  ok(`${名}: 拉取失败也告诉可以手填`, /手填/.test(体));
}
// 反面对照: 把旧的覆盖写法塞回去, 判据必须报出来
{
  const 旧体 = 'function loadModels() { settings.value.接口.模型列表 = list; if (!list.includes(settings.value.接口.模型)) { settings.value.接口.模型 = list[0] ?? ""; } }';
  ok('反面对照: 旧的覆盖写法会被判出来', /!\s*list\.includes\(/.test(旧体));
}

console.log('\n[4] 候选面板的开关/选择动作由壳 provide 给设置页(面板契约)');
for (const { 名, 壳 } of 两版) {
  ok(`${名}: 壳里声明了 模型候选开`, /const\s+模型候选开\s*=/.test(壳));
  ok(`${名}: 壳里声明了 选模型`, /function\s+选模型\s*\(/.test(壳));
  // 设置页改走自己的窄接口后: 开关与动作在壳的 provide 里, modelList 由 设置面板.ts 从 settings 派生
  ok(`${名}: 设置面板 provide 里带上了开关与动作`, /模型候选开,\s*选模型,/.test(壳));
  ok(`${名}: modelList 由 设置面板.ts 派生`, 设置面板源码.includes('modelList') && 设置面板源码.includes('模型列表'));
  // 选模型只写 模型 + 关面板, 不许顺带清空列表
  const 体 = 取函数体(壳, '选模型');
  ok(`${名}: 选模型只写模型名并关面板`, /settings\.value\.接口\.模型\s*=/.test(体) && /模型候选开\.value\s*=\s*false/.test(体));
}

console.log(`\n${fail === 0 ? '全部通过' : `${fail} 项失败`} (${pass} 项通过)`);
process.exit(fail === 0 ? 0 : 1);

