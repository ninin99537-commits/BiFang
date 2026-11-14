// 人设工坊 · 请求技巧(破限/头部填充/防截断/预填充) + brief 升格为创作方向
//
// 对标烟火的六段消息结构, 四开关默认全关。本用例钉住:
//   [1] 四开关全关: 只有 [system 工坊身份, user_input] 两条
//   [2] 破限开: 追加 system(JB_SYSTEM) + assistant(JB_ASSISTANT); 关则不含 SPECIAL NOTE
//   [3] 头部填充开: 第一条是 user 且为填充文本
//   [4] 防截断开: 系统提示词末尾缝上用户指定的声明(disclaimer_format); 关则不含
//   [5] 预填充开: 尾部是 assistant 且为第一个勾选模块的标题(不是 `{`)
//   [6] 破限开+预填充关: 承诺后补一条收尾 user
//   [7] brief 升格: 为空不出现; 非空完整出现且位于 `# 素材` 之前
//   [8] 名字收口: 按语义边界(句末标点/空白), 不硬切
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';
import { 模块注册表, 模块索引 } from '../src/人设工坊/lib/modules';
import { 拼装提示词, 取预填充标题 } from '../src/人设工坊/lib/prompt';
import { 拼消息 } from '../src/人设工坊/lib/sink';
import { 取短名 } from '../src/人设工坊/lib/取名';
import { sanitizeOutput } from '../src/人设工坊/lib/sanitize';

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

function 设置(部分: Record<string, unknown> = {}): Settings {
  const 基 = SettingsSchema.parse({});
  Object.assign(基, 部分);
  return 基;
}

function 设置请求(请求: Record<string, unknown>, 其余: Record<string, unknown> = {}): Settings {
  const 基 = 设置(其余);
  基.request = { ...基.request, ...请求 } as Settings['request'];
  return 基;
}

/** 取消息的角色序列 */
function 角色序(消息: (PlaceholderPrompt | RolePrompt)[]): string[] {
  return 消息.map(条 => (typeof 条 === 'string' ? 条 : 条.role));
}
/** 取消息的内容(占位符原样返回其名) */
function 内容(消息: (PlaceholderPrompt | RolePrompt)[], 位: number): string {
  const 条 = 消息[位];
  return typeof 条 === 'string' ? 条 : 条.content;
}

const 空素材 = { charInfo: '', userPersona: '', chatHistory: '', worldbook: '', brief: '' };

console.log('\n[1] 四开关全关: 只有 system + user_input');
{
  const 消息 = 拼消息(设置());
  check('角色序', 角色序(消息), ['system', 'user_input']);
  ok('系统是工坊身份', 内容(消息, 0).includes('人设工坊') || 内容(消息, 0).includes('工坊'));
}

console.log('\n[2] 破限: 开则追加 system+assistant; 关则不含 SPECIAL NOTE');
{
  const 关 = 拼消息(设置请求({ jailbreak: false }));
  ok('关时无 SPECIAL NOTE', !关.some(条 => typeof 条 !== 'string' && 条.content.includes('SPECIAL NOTE')));
  check('关时两条', 角色序(关).length, 2);

  const 开 = 拼消息(设置请求({ jailbreak: true }));
  check('开时角色序', 角色序(开), ['system', 'user_input', 'system', 'assistant', 'user']);
  ok('含 SPECIAL NOTE', 内容(开, 2).includes('SPECIAL NOTE'));
  ok('承诺段是工坊口吻', 内容(开, 3).includes('工坊'));
  ok('收尾 user 把话语权交回', 内容(开, 4).includes('开始执行任务'));
}

console.log('\n[3] 头部填充: 第一条是 user 且为填充文本');
{
  const 消息 = 拼消息(设置请求({ headFiller: true, headFillerText: '填充专用文本ABC' }));
  check('第一条是 user', 角色序(消息)[0], 'user');
  check('第一条内容 = 自定义文本', 内容(消息, 0), '填充专用文本ABC');

  const 内置 = 拼消息(设置请求({ headFiller: true, headFillerText: '' }));
  ok('留空时用内置长文本', 内容(内置, 0).length > 10000);
}

console.log('\n[4] 防截断: 开则系统提示词末尾缝用户指定声明; 关则不含');
{
  const 关 = 拼消息(设置请求({ antiTruncation: false }));
  ok('关时无 disclaimer_format', !内容(关, 0).includes('disclaimer_format'));

  const 开 = 拼消息(设置请求({ antiTruncation: true }));
  ok('开时含 disclaimer_format', 内容(开, 0).includes('disclaimer_format'));
  ok('开时含 </disclaimer>', 内容(开, 0).includes('</disclaimer>'));
  ok('开时仍含工坊身份', 内容(开, 0).includes('工坊'));
  ok('不含烟火的 Reference_Example_format', !内容(开, 0).includes('Reference_Example_format'));
}

console.log('\n[5] 预填充: 尾部是 assistant 且为第一个勾选模块标题');
{
  const s = 设置({ enabled: ['palette', 'anchor'] });
  // 注册表顺序 anchor 在 palette 之前, 取预填充标题应按注册表顺序取 anchor
  const 预填充 = 取预填充标题(s, 模块注册表);
  ok('预填充 = 第一个勾选模块的标题', 预填充.startsWith('## '));
  ok('是 anchor 而不是 palette', 预填充.includes('性格锚定'));

  const 消息 = 拼消息(设置请求({ prefill: true }, { enabled: ['anchor'] }));
  check('角色序', 角色序(消息), ['system', 'user_input', 'assistant']);
  check('尾条内容 = 预填充', 内容(消息, 2), 取预填充标题(设置({ enabled: ['anchor'] }), 模块注册表));
  ok('不是 JSON 的 {', !内容(消息, 2).trim().startsWith('{'));

  const 没勾 = 拼消息(设置请求({ prefill: true }, { enabled: [] }));
  check('没勾模块时不塞预填充', 角色序(没勾), ['system', 'user_input']);
}

console.log('\n[6] 破限开 + 预填充关: 承诺后补收尾 user');
{
  const 消息 = 拼消息(设置请求({ jailbreak: true, prefill: false }, { enabled: ['anchor'] }));
  check('角色序', 角色序(消息), ['system', 'user_input', 'system', 'assistant', 'user']);
  ok('倒数第二条是承诺 assistant', 内容(消息, 3).includes('工坊'));
  check('最后一条是收尾 user', 角色序(消息).pop(), 'user');
}

console.log('\n[7] brief 升格为「创作方向」顶层节');
{
  // brief 走 素材.brief 传入(线上链路: Settings.brief → 取素材 → 素材.brief → 拼装提示词)
  const 无 = 拼装提示词(设置({ enabled: ['anchor'] }), 模块注册表, 空素材);
  ok('空 brief 不出现该节', !无.includes('# 用户指定的方向'));

  // 顺序断言要拿"素材节确实存在"的输入比: 素材全空时 # 素材 根本不会 push(indexOf 返回 -1)
  const 有素材内容 = { ...空素材, charInfo: '角色卡内容', brief: '要一个嘴硬心软的姐姐' };
  const 有 = 拼装提示词(设置({ enabled: ['anchor'] }), 模块注册表, 有素材内容);
  ok('含顶层节标题', 有.includes('# 用户指定的方向（优先于素材与推断）'));
  ok('含 brief 全文', 有.includes('要一个嘴硬心软的姐姐'));
  ok('在 # 素材 之前', 有.indexOf('# 用户指定的方向') < 有.indexOf('# 素材'));
  ok('在 # 铁律 之后', 有.indexOf('# 铁律') < 有.indexOf('# 用户指定的方向'));
  ok('不再出现在 # 素材 里', !有.includes('## 用户的一句话需求'));
  ok('铁律含第 6 条', 有.includes('用户指定的方向优先'));
}

console.log('\n[8] 名字收口: 按语义边界, 不硬切句子');
{
  check('短文本原样', 取短名('短名字', 24), '短名字');
  check('取第一行', 取短名('第一行名字\n第二行不要', 24), '第一行名字');
  // 上限 10 时, 首句「这是一个很长的句子。」(10 字, 含句号)正好整句收回
  check('句末标点处收', 取短名('这是一个很长的句子。后面还有内容', 10), '这是一个很长的句子。');
  // 上限 8 时首句(10 字)装不下 → 范围内无句末标点 → 退到空白/硬切, 但不超上限
  check('首句超上限时不越界', 取短名('这是一个很长的句子。后面还有内容', 8), '这是一个很长的句');
  check('无标点退到空白', 取短名('aaa bbb ccc ddd', 8), 'aaa bbb');
  const 长 = 取短名('一二三四五六七八九十', 5);
  ok('实在没边界才硬切且不超上限', 长.length <= 5);
  ok('多行时只取第一行', !取短名('甲\n乙\n丙', 24).includes('乙'));
}

console.log('\n[9] 文风铁律 + 杀八股(#86)');
{
  const 有 = 拼装提示词(设置({ enabled: ['anchor'] }), 模块注册表, 空素材);
  // 文风铁律: 顶层节, 位置在 # 铁律 之后、# 用户指定的方向 之前
  ok('含文风铁律顶层节', 有.includes('# 文风铁律'));
  ok('在 # 铁律 之后', 有.indexOf('# 铁律') < 有.indexOf('# 文风铁律'));
  ok('含「参数化判定禁令」原文', 有.includes('参数化判定禁令'));
  ok('含「报告一个结论」判定口诀', 有.includes('报告一个结论'));
  ok('不再带 <文风铁律> XML 包裹', !有.includes('<文风铁律>'));

  // 八股禁令里那条负例里的「共犯」是**八股禁令自己的对照例**(允许),
  // 但模块 prompt 里不得再有把八股当范例/反面例子的写法。
  const 模块全文 = 模块注册表.map(m => m.prompt).join('\n');
  ok('模块 prompt 不含「作者的判定」', !模块全文.includes('作者的判定'));
  ok('模块 prompt 不含「作者的判定」变体', !模块全文.includes('作者判定'));
  ok('模块 prompt 不含「必须出现「因为」」', !模块全文.includes('必须出现「因为」'));
  ok('模块 prompt 不含语义倒置整句', !模块全文.includes('这是唯一允许解释「为什么」的地方'));
  ok('模块 prompt 不含「AI 会默认」讲解语', !模块全文.includes('AI 会默认'));
  ok('模块 prompt 不含「这一块的作用是」讲解语', !模块全文.includes('这一块的作用是'));

  // 二次解释: #132 纠正 3 —— 这个模块的职责是「替作者说话」(允许写本质/为什么),
  // 但每条必须落到具体行为上, 不许只给标签。
  const 二次 = 模块索引.reinterpret.prompt;
  ok('二次解释含「你替作者说话」', 二次.includes('你替作者说话'));
  ok('二次解释要求落到具体行为上', 二次.includes('每条都要落到具体行为上'));
  ok('二次解释给了 ✗/√ 对照', 二次.includes('✗') && 二次.includes('√'));
  ok('二次解释不再自称「拦住 AI 的默认理解」', !二次.includes('拦住 AI 的默认理解'));

  // 提示词里也不该泄漏「需作者补充」
  ok('缺失策略不再写「需作者补充」', !有.includes('需作者补充'));
}

console.log('\n[10] palette 固定句式【保留】+ facets 收尾句清理');
{
  const 调色盘 = 模块索引.palette.prompt;
  // ★ 用户裁决(2026-10-14): 这句比喻要【出现在生成结果里】, 位置在调色盘开头。
  // 注意方向 —— #112 曾把它降级成「只给模型看的框架、不写进输出」, 那是理解错了,
  // 已回滚。这组断言就是防止再被"顺手优化"掉的哨兵。
  ok('palette 含「原样写出」要求', 调色盘.includes('原样写出'));
  ok('palette 含那句固定比喻', 调色盘.includes('人的性格就像调色盘'));
  ok('palette 不含「理解框架」', !调色盘.includes('理解框架'));
  ok('palette 不含「不要写进输出」', !调色盘.includes('不要写进输出'));
  // 位置本身就是判据: 用户原话「可以出现，就在调色盘开头」
  ok('那句比喻位于调色盘开头(标题后紧接)',
    /^## 性格调色盘\n第一句必须是[\s\S]{0,120}人的性格就像调色盘/.test(调色盘));
  // 其余要求(回归): 主色调 / 底色 / 点缀 / 衍生 / 对冲
  ok('palette 仍含主色调字段', 调色盘.includes('主色调：{{main_tone}}'));
  ok('palette 仍含底色字段', 调色盘.includes('底色：{{base}}'));
  // #132 2: 「去中心化」这个自造术语被删, 换成可执行的「信息散开写，不要先归纳再分条」
  ok('palette 用可执行说法替代「去中心化」', 调色盘.includes('信息散开写，不要先归纳再分条'));
  ok('palette 不再用自造术语「去中心化」', !调色盘.includes('去中心化'));
  ok('palette 仍含对冲性格分支', 调色盘.includes('对冲性格'));
  ok('palette 仍含衍生写法要求', 调色盘.includes('衍生的写法'));

  const 三面性 = 模块索引.facets.prompt;
  // facets 两处收尾句清理【保留】(这半边用户批准过, 与 palette 回滚无关)
  ok('facets 不含「同一盘颜料」', !三面性.includes('同一盘颜料'));
  ok('facets 不含「这一块只写」', !三面性.includes('这一块只写'));
  // 保留: 词检测法 + 材料来自调色盘这条约束
  ok('facets 保留词检测法', 三面性.includes('出现「因为」「本质上」「其实」「内心」这些词'));
  ok('facets 保留材料来源约束', 三面性.includes('所有面的材料都必须来自调色盘'));
}

console.log('\n[11] #186 必答项: 旧设置兼容 + 剥离开关无关(负对照)');
{
  // ① 旧设置兼容: 用户那边 antiTruncation/headFiller 现在就是 true, 字段保留 → parse 不抛错
  const 旧 = SettingsSchema.parse({ request: { antiTruncation: true, headFiller: true, headFillerText: 'x' } });
  ok('旧设置(开关为 true)能 parse', 旧.request.antiTruncation === true && 旧.request.headFiller === true);
  ok('三个字段仍保留在 schema', 'antiTruncation' in 旧.request && 'headFiller' in 旧.request && 'headFillerText' in 旧.request);

  // ② 剥离开关无关: antiTruncation 关着也剥 —— 它是注入物, 不是开关控制的显示选项
  const 关 = 设置({ enabled: ['basic'], request: { ...旧.request, antiTruncation: false, headFiller: false, headFillerText: '' } });
  const 带块 = '## 基础信息与外貌\n姓名: 阿栀\n\n<disclaimer>\n垃圾\n</disclaimer>';
  const 结果关 = sanitizeOutput(带块, ['基础信息与外貌'], ['基础信息与外貌']);
  ok('开关关着也剥(负对照)', !结果关.cleaned.includes('disclaimer') && !结果关.cleaned.includes('垃圾'));
  ok('正文保留', 结果关.cleaned.includes('姓名: 阿栀'));

  // ③ 误伤对照: 正文里含 disclaimer 这个词(无尖括号)必须原样保留
  const 带词 = '## 基础信息与外貌\n姓名: 阿栀\n\n她说话带 disclaimer 式的腔调。';
  const 结果词 = sanitizeOutput(带词, ['基础信息与外貌'], ['基础信息与外貌']);
  ok('单词不被误伤', 结果词.cleaned.includes('disclaimer 式的腔调'));

  // ④ 防截断功能本身仍在(没被误删): 开关开着时系统提示词会缝上声明段
  const 开 = 拼消息(设置({ enabled: ['basic'], request: { ...旧.request, antiTruncation: true } }));
  const 系统条 = 开.find(条 => typeof 条 === 'object' && 条.role === 'system') as { content: string } | undefined;
  ok('防截断开着时 system 段更长(功能保留)', !!系统条 && 系统条.content.length > 100);
}

console.log('\n[12] #185 B: 角色独立性常开节(仅 NPC 模式)');
{
  const 用户模式 = 拼装提示词(设置({ enabled: ['basic'], mode: 'user' }), 模块注册表, 空素材);
  ok('user 模式不出现角色独立性', !用户模式.includes('# 角色独立性'));

  const npc = 拼装提示词(设置({ enabled: ['basic'], mode: 'npc' }), 模块注册表, 空素材);
  ok('npc 模式出现角色独立性', npc.includes('# 角色独立性'));
  ok('在 # 铁律 之后', npc.indexOf('# 铁律') < npc.indexOf('# 角色独立性'));
  ok('在 # 文风铁律 之前', npc.indexOf('# 角色独立性') < npc.indexOf('# 文风铁律'));
  ok('含可执行自查(拿掉 user 还立得住吗)', npc.includes('把 {{user}} 从这张卡里拿掉，他还立得住吗'));
  ok('含不许刻意讨好', npc.includes('不许刻意讨好、迎合、迁就'));
  ok('用 {{user}} 宏(不是硬编码)', npc.includes('{{user}}'));
}

console.log('\n[13] #212 阈值下带: modules.ts 那条 19 字台词已换掉');
{
  const basic = 模块索引.basic.prompt;
  // 旧台词(19 字, 出自教程)必须清零 —— 判据 B 的 20 字线是代理指标, 代理会脱钩
  ok('旧台词「我是觉得这些赘肉…」已清零', !basic.includes('我是觉得这些赘肉反而是少一点更方便了'));
  ok('旧示例的「罩杯」也不再出现', !basic.includes('对自己的身材很骄傲'));
  // 新文案在位
  ok('新示例用了自造台词', basic.includes('校服下摆永远比别人短一截'));
  ok('新解读句在位', basic.includes('她不在意别人怎么看'));
  // ★ dsh #212 第6条: 解读句末尾「但这句话盖住的东西比说出来的多」不许省 —— 它对应规则 7
  ok('★ 解读句末尾那句不许省', basic.includes('但这句话盖住的东西比说出来的多'));
  // 教学句(:244)逐字不动
  ok('教学句逐字不动', basic.includes('一句话可以同时给三样东西：信息、性格、以及「聊到这里时角色会怎么说」'));
  // 规则 7 仍在(打引号 = 不一定是真心话)
  ok('规则 7 仍在', basic.includes('不一定是真心话'));
}

console.log('\n[14] #236 ② 美型化描写: 常开规则块(user/npc 都出现)');
{
  const 素材带方向 = { ...空素材, brief: '随便写点方向' };
  const user提示 = 拼装提示词(设置({ enabled: ['basic'], mode: 'user' }), 模块注册表, 素材带方向);
  const npc提示 = 拼装提示词(设置({ enabled: ['basic'], mode: 'npc' }), 模块注册表, 素材带方向);

  ok('user 模式出现美型化描写', user提示.includes('# 美型化描写'));
  ok('npc 模式出现美型化描写', npc提示.includes('# 美型化描写'));
  ok('在 # 文风铁律 之后', npc提示.indexOf('# 文风铁律') < npc提示.indexOf('# 美型化描写'));
  ok('在 # 用户指定的方向 之前', npc提示.indexOf('# 美型化描写') < npc提示.indexOf('# 用户指定的方向'));

  const 段 = npc提示.slice(npc提示.indexOf('# 美型化描写'), npc提示.indexOf('# 用户指定的方向'));
  // 准则① 瑕疵屏蔽: 绝对规避粗糙生理细节 + 基准态干净平滑
  ok('① 规避粗糙生理细节', 段.includes('规避粗糙的生理细节'));
  ok('① 列出具体项(老茧/皱纹/毛孔/肤色)', 段.includes('老茧') && 段.includes('皱纹') && 段.includes('毛孔') && 段.includes('肤色暗沉'));
  ok('① 基准态干净平滑', 段.includes('干净、平滑'));
  // 准则② 拒绝浮夸: 严禁失真辞藻 + 点到为止 + 不让外表盖住性格张力
  ok('② 反例「宛如凝脂」在', 段.includes('宛如凝脂'));
  ok('② 反例「散发异香」在', 段.includes('散发异香'));
  ok('② 反例紧跟正确写法(铁律 4)', 段.includes('不写「她的肌肤宛如凝脂」') && 段.includes('写「她皮肤干净'));
  ok('② 点到为止保留活人感', 段.includes('点到为止') && 段.includes('活人感'));
  ok('② 不让外表盖住性格张力', 段.includes('不让外表盖住角色本身的性格张力'));
  // 准则③ 差异化处理
  ok('③ 丑陋角色取消屏蔽', 段.includes('取消屏蔽'));
  ok('③ 如实写粗糙/油腻/瑕疵', 段.includes('粗糙、油腻或瑕疵'));
  ok('③ 群像反衬', 段.includes('反衬'));
  // 不含八股禁词
  ok('不含「欲望」', !段.includes('欲望'));
  ok('不含「神秘」', !段.includes('神秘'));
  ok('不含「灼热」', !段.includes('灼热'));
  // 它是规则块不是模块 —— 不产出 ## 小节(否则 sanitizeOutput 会报 missing)
  ok('不产出 ## 小节', !段.includes('\n## '));
}

console.log(`\n人设工坊请求技巧: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
