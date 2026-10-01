// 彼方 · 世界书读取路径(候选4 最后搬的一块) —— 用假宿主跑真实源码
//
// 覆盖: 四个来源(角色主/附加/聊天/persona)的世界书都参与激活查询并去重、
// 自写条目不当作设定、关掉的条目跳过、排除名单生效、EJS 走宿主渲染(失败时移除模板块)、
// 酒馆宏走宿主展开、常驻名单绕过关键词激活并与激活条目去重、多条内容用空行连接、模板环境不可用时安全返回。
import { injectHostForTest } from '../src/彼方_NPC幕后生命状态系统/host';
import { BIFANG_WORLDBOOK_ENTRY_NAME } from '../src/彼方_NPC幕后生命状态系统/快照';
import { getActiveWorldbookText, resetWorldbookCaches } from '../src/彼方_NPC幕后生命状态系统/worldbook';

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

interface 假宿主选项 {
  主世界书?: string | null;
  附加世界书?: string[];
  聊天世界书?: string | null;
  persona世界书?: string;
  /** 各世界书里"被主 AI 激活"的条目(相当于 getWorldInfoActivatedData 的返回) */
  激活条目?: Record<string, any[]>;
  /** 各世界书的完整条目(相当于 getWorldbook 的返回) */
  全部条目?: Record<string, any[]>;
  /** 模板环境是否可用; 默认可用 */
  模板环境可用?: boolean;
  /** EJS 渲染: 传函数即按它渲染, 传 'throw' 即渲染时报错, 不传即"插件的方法不存在" */
  ejs渲染?: ((text: string) => string) | 'throw';
  宏展开?: (text: string) => string;
}

/** 假宿主: 只实现世界书读取路径用到的能力, 并记录"平台被怎么用了" */
function makeFake(选项: 假宿主选项) {
  const 记录 = { 激活查询: [] as string[], 读取条目: [] as string[], ejs: [] as string[], 宏: [] as string[] };
  const host: any = {
    worldbook: {
      boundNames: () => ({ primary: 选项.主世界书 ?? null, additional: 选项.附加世界书 ?? [] }),
      chatName: () => 选项.聊天世界书 ?? null,
      entries: async (name: string) => {
        记录.读取条目.push(name);
        return 选项.全部条目?.[name] ?? [];
      },
    },
    persona: { lorebook: () => 选项.persona世界书 ?? '' },
    ejs: {
      prepareContext: async () => {
        if (选项.模板环境可用 === false)
          throw new Error('提示词模板语法插件未安装');
        return {
          getWorldInfoActivatedData: async (name: string) => {
            记录.激活查询.push(name);
            return 选项.激活条目?.[name] ?? [];
          },
        };
      },
      evaluate: async (text: string) => {
        记录.ejs.push(text);
        if (选项.ejs渲染 === 'throw')
          throw new Error('模板语法错误');
        return 选项.ejs渲染 ? 选项.ejs渲染(text) : null;
      },
      syntaxError: async () => '第 1 行: 意外的 token',
    },
    macros: {
      expand: (text: string) => {
        记录.宏.push(text);
        return 选项.宏展开 ? 选项.宏展开(text) : text;
      },
    },
    vars: { get: () => ({}), update: () => ({}), del: () => ({}), insertOrAssign: () => ({}), scriptId: () => 'test' },
  };
  return { host, 记录 };
}

/** 每个用例都从干净的缓存开始(EJS 环境/表数据有 30 秒缓存) */
function 装(选项: 假宿主选项) {
  const 假 = makeFake(选项);
  injectHostForTest(假.host);
  resetWorldbookCaches();
  return 假;
}

console.log('\n[1] 没有绑定任何世界书 → 空串, 且不去问激活数据');
{
  const { 记录 } = 装({});
  check('返回空串', await getActiveWorldbookText('正文'), '');
  check('没查激活数据', 记录.激活查询, []);
}

console.log('\n[2] 四个来源都参与: 角色主 + 附加 + 聊天 + persona 绑定(去重)');
{
  const { 记录 } = 装({
    主世界书: '主书',
    附加世界书: ['附书1', '附书2', '主书'],
    聊天世界书: '聊天书',
    persona世界书: '人设书',
    激活条目: { 主书: [{ name: '甲设定', content: '甲是铁匠' }] },
  });
  const 结果 = await getActiveWorldbookText('正文');
  check('问过的世界书(按主→附加→聊天→persona, 重复的只问一次)', 记录.激活查询, ['主书', '附书1', '附书2', '聊天书', '人设书']);
  check('激活到的内容被返回', 结果, '甲是铁匠');
}

console.log('\n[3] 彼方自己写进去的条目不当设定(三种特征都认)');
{
  装({
    主世界书: '主书',
    激活条目: {
      主书: [
        { name: '别的东西', content: '[彼方 · 幕后NPC状态]\n幕后状态…' },
        { name: BIFANG_WORLDBOOK_ENTRY_NAME, content: '内容不一样的自身条目' },
        { name: '改过名的自身条目', content: '随便', extra: { bifang: true } },
        { name: '真设定', content: '真设定内容' },
      ],
    },
  });
  check('只注入真设定', await getActiveWorldbookText('正文'), '真设定内容');
}

console.log('\n[4] 关掉的条目 / 空内容条目 → 跳过');
{
  装({
    主世界书: '主书',
    激活条目: {
      主书: [
        { name: '关掉的', content: '不该出现', disable: true },
        { name: '另一个关掉的', content: '不该出现', enabled: false },
        { name: '空的', content: '' },
        { name: '留下的', content: '留下' },
      ],
    },
  });
  check('只注入还开着的非空条目', await getActiveWorldbookText('正文'), '留下');
}

console.log('\n[5] 排除名单: 条目名 / 备注 / 内容开头命中都不注入');
{
  装({
    主世界书: '主书',
    激活条目: {
      主书: [
        { name: '甲条目', content: '甲内容' },
        { name: '乙条目', comment: '乙备注', content: '乙内容' },
      ],
    },
  });
  check('按条目名排除', await getActiveWorldbookText('正文', ['甲条目']), '乙内容');
  check('按备注关键词排除', await getActiveWorldbookText('正文', ['乙备']), '甲内容');
  check('两个都排除 → 空串', await getActiveWorldbookText('正文', ['甲条目', '乙条目']), '');
}

console.log('\n[6] EJS 模板: 走宿主渲染; 插件缺失或渲染失败时移除模板块');
{
  const 假 = 装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '带模板', content: '前<% 甲 %>后' }] },
    ejs渲染: text => text.replace('<% 甲 %>', '渲染结果'),
  });
  check('渲染结果进入正文', await getActiveWorldbookText('正文'), '前渲染结果后');
  check('确实经过宿主求值', 假.记录.ejs.length, 1);

  装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '带模板', content: '前<% 甲 %>后' }] },
  });
  const 无插件 = await getActiveWorldbookText('正文');
  ok('插件方法不存在时不抛错', true);
  ok('残留的模板块被移除', !无插件.includes('<%'));

  装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '带模板', content: '前<% 甲 %>后' }] },
    ejs渲染: 'throw',
  });
  const 渲染失败 = await getActiveWorldbookText('正文');
  ok('渲染抛错不冒泡, 模板块被移除', !渲染失败.includes('<%'));
}

console.log('\n[7] 酒馆宏 {{char}} 走宿主展开');
{
  const 假 = 装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '带宏', content: '你好 {{char}}' }] },
    宏展开: text => text.replace('{{char}}', '爱丽丝'),
  });
  check('宏被展开', await getActiveWorldbookText('正文'), '你好 爱丽丝');
  ok('确实经过宿主展开', 假.记录.宏.length >= 1);
}

console.log('\n[8] 常驻名单: 绕过关键词激活, 排在前面, 与激活条目去重');
{
  const 假 = 装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '路人设定', content: '路人内容' }] },
    全部条目: {
      主书: [
        { name: '人设甲', content: '人设内容', enabled: true },
        { name: '别的人设', content: '别的人设内容', enabled: true },
      ],
    },
  });
  const 结果 = await getActiveWorldbookText('正文', [], ['人设甲']);
  ok('常驻条目被注入', 结果.includes('人设内容'));
  ok('没点名的人设条目不会被抓', !结果.includes('别的人设内容'));
  ok('激活条目仍在', 结果.includes('路人内容'));
  ok('常驻条目排在激活条目之前', 结果.indexOf('人设内容') < 结果.indexOf('路人内容'));
  check('按世界书名抓取', 假.记录.读取条目, ['主书']);
}

console.log('\n[9] 常驻条目与激活条目同内容时只注入一次');
{
  装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: '人设甲', content: '人设内容' }] },
    全部条目: { 主书: [{ name: '人设甲', content: '人设内容', enabled: true }] },
  });
  const 结果 = await getActiveWorldbookText('正文', [], ['人设甲']);
  check('同样内容只出现一次', 结果.split('人设内容').length - 1, 1);
}

console.log('\n[10] 多条内容用空行连接');
{
  装({
    主世界书: '主书',
    激活条目: { 主书: [{ name: 'a', content: 'A' }, { name: 'b', content: 'B' }] },
  });
  check('用空行连接', await getActiveWorldbookText('正文'), 'A\n\nB');
}

console.log('\n[11] 模板环境初始化失败(插件没装) → 安全返回空串');
{
  const { 记录 } = 装({ 主世界书: '主书', 模板环境可用: false });
  check('返回空串', await getActiveWorldbookText('正文'), '');
  check('没查激活数据', 记录.激活查询, []);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
