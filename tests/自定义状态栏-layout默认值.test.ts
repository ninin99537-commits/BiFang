// 自定义状态栏 · 「恢复默认」后编辑器必炸的 bug 钉子 —— 批次 1 插队配套(派活: #68, 需求位裁定 A+B)。
//
// bug 链: defaultConfig().layout 没有 fonts / images 两键 → store.reset() 直接 `config.value = defaultConfig()`
// (绕过 schema, LayoutSchema 的 z.array(...).prefault([]) 不生效) → layout.images === undefined
// → components/EditorPanel.vue:870 读 layout.images.length 抛 TypeError(打开编辑器就炸)。
// 裁定: A = defaultConfig 补两个空数组(修 bug); B = normalizeLayout 补 ?? [](让函数名不说谎);
// 禁止在 EditorPanel.vue 加 ?. —— 边界规范化了, 视图就该信任边界, 三层防御没人知道哪层是真防线。
// 修复落地前本文件必须红; 落地后绿。反向验收: 把 A 改回去(删两个空数组) → [1]/[2] 必须红。
import { defaultConfig } from '../src/自定义状态栏/lib/preset';
import { normalizeLayout } from '../src/自定义状态栏/lib/layout';

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}`);
  }
}

console.log('\n[1] A 的靶心: defaultConfig().layout 的 fonts / images 是数组(不是 undefined)');
{
  const config = defaultConfig();
  ok('layout.fonts 是数组', Array.isArray(config.layout.fonts));
  ok('layout.images 是数组', Array.isArray(config.layout.images));
}

console.log('\n[2] 模拟 reset()(config.value = defaultConfig(), 绕过 schema)后, 视图读 .length 不抛');
{
  const config = defaultConfig();
  let images炸: string | null = null;
  let fonts炸: string | null = null;
  try {
    config.layout.images!.length;
  }
  catch (e) {
    images炸 = String(e);
  }
  try {
    config.layout.fonts!.length;
  }
  catch (e) {
    fonts炸 = String(e);
  }
  ok('读 layout.images.length 不抛(EditorPanel.vue:870 的读法)', images炸 === null);
  ok('读 layout.fonts.length 不抛', fonts炸 === null);
  if (images炸)
    console.log(`      现场重现: ${images炸}`);
}

console.log('\n[3] B 的靶心: normalizeLayout 对缺两键的 layout 也补齐成数组(函数名不说谎)');
{
  const config: any = defaultConfig();
  config.layout.fonts = undefined;
  config.layout.images = undefined;
  let layout: any = null;
  let 炸: string | null = null;
  try {
    layout = normalizeLayout(config);
  }
  catch (e) {
    炸 = String(e);
  }
  ok('normalizeLayout 不抛', 炸 === null);
  ok('规范化后 fonts 是数组', Array.isArray(layout?.fonts));
  ok('规范化后 images 是数组', Array.isArray(layout?.images));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
