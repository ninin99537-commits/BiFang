// 烟火 · 世界书读取的「来源清楚 + 失败关闭 + 每轮新鲜」 —— 2026-11-01 审查 P0 的验收用例
//
// 要钉住的四件事:
//   ① **来源清楚**: `getActiveWorldbookBundle()` 逐条交代 书名 / 世界书内 uid / AM 激活关键词 /
//      **完整**正文; 设定(facts)与记忆(memory)分开; `mode:'独立重扫'`、`sameRequest:false` 明说
//      "这不是主请求那一次激活集合"。主 AI 选中的 AM(20 或 40 条)被完整核对, 缺就显式报缺。
//   ② **不猜**: 缺 AM 不补扫旧记忆、不按标题猜映射、不硬凑条数; 同内容不同 AM 不合并;
//      同一本书同一个 uid 同一片 AM 同一份原文才去重。
//   ③ **失败关闭**: 未知/缺表/不支持的 ACU 条件、EJS 不可用或渲染失败 —— 严格模式下**整条跳过**,
//      绝不"删掉模板代码留下正文"(那正是把条件藏住的内容当公开设定); 日志里留**整条原文**。
//   ④ **每轮新鲜**: 禁用缓存时不复用上一轮的 ACU 表 / EJS 环境(同名表 A/B 不同值互不污染);
//      而旧包装 `getActiveWorldbookText()` 的行为(宽松 + 缓存)一个字节都不变。
//
// 全部用真实模块 + 假宿主(不碰真实酒馆、不调 AI)。
import lodash from 'lodash';
import { injectHostForTest } from '../src/烟火_世界运转/host';
import { getActiveWorldbookBundle, getActiveWorldbookText } from '../src/烟火_世界运转/worldbook-read';
import { 重置求值缓存 } from '../src/共用/条目求值';

// 共用求值器用酒馆页面的全局 `_`(webpack externals 把 lodash 映射成 `_`), 这里补上同一个东西
(globalThis as any)._ = lodash;

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
const 含 = (文本: string, 片段: string) => String(文本 ?? '').includes(片段);
const 有警告含 = (包: { warnings: string[] }, 片段: string) => 包.warnings.some(行 => 行.includes(片段));

interface 假宿主选项 {
  主书?: string | null;
  附加书?: string[];
  聊天书?: string | null;
  全局书?: string[];
  /** 各世界书"被主 AI 激活"的返回(激活数据形状: { uid?, comment?, key?, content }) */
  激活?: Record<string, any[]>;
  /** 各世界书的全部条目(uid 回查用, getWorldbook 形状: { uid, name, content }) */
  全部条目?: Record<string, any[]>;
  /** ACU 表格导出数据 */
  表格?: any;
  /** EJS 行为: 正常(默认原样返回) / 缺失(返回 null) / 抛错 / 环境不可用 */
  EJS?: '正常' | '缺失' | '抛错' | '环境不可用';
  EJS渲染?: (text: string) => string;
  宏?: (text: string) => string;
  /** 激活查询是否抛错(按书名) */
  激活抛错?: string[];
}

/** 假宿主 + "平台被怎么用了"的记录 */
function 造宿主(选项: 假宿主选项 = {}) {
  const 记录 = { 激活查询: [] as string[], 读取条目: [] as string[], 准备EJS: 0, EJS求值: [] as string[], 宏: [] as string[] };
  const 模板环境: any = {
    getWorldInfoActivatedData: async (name: string) => {
      记录.激活查询.push(name);
      if ((选项.激活抛错 ?? []).includes(name))
        throw new Error('激活数据读不到');
      return 选项.激活?.[name] ?? [];
    },
  };
  const host: any = {
    worldbook: {
      boundNames: () => ({ primary: 选项.主书 ?? null, additional: 选项.附加书 ?? [] }),
      chatName: () => 选项.聊天书 ?? null,
      globalNames: () => 选项.全局书 ?? [],
      entries: async (name: string) => {
        记录.读取条目.push(name);
        return 选项.全部条目?.[name] ?? [];
      },
    },
    persona: { name: () => null, description: () => '', lorebook: () => '' },
    ejs: {
      prepareContext: async () => {
        记录.准备EJS++;
        if (选项.EJS === '环境不可用')
          throw new Error('插件未安装');
        return 模板环境;
      },
      evaluate: async (text: string) => {
        记录.EJS求值.push(text);
        if (选项.EJS === '缺失')
          return null;
        if (选项.EJS === '抛错')
          throw new Error('模板语法错误');
        return 选项.EJS渲染 ? 选项.EJS渲染(text) : text;
      },
      syntaxError: async () => '第 1 行: 意外的 token',
    },
    macros: {
      expand: (text: string) => {
        记录.宏.push(text);
        return 选项.宏 ? 选项.宏(text) : text;
      },
    },
    vars: { get: () => ({}), update: () => ({}), del: () => ({}), insertOrAssign: () => ({}), scriptId: () => 'test' },
    acu: { tables: () => 选项.表格 },
  };
  injectHostForTest(host);
  return { 记录 };
}

/** 每条用例从干净状态开始: 换宿主 + 清共用求值器的模块级缓存 */
function 装(选项: 假宿主选项 = {}) {
  重置求值缓存();
  return 造宿主(选项);
}

/** 造一条"记忆条目"(激活数据形状: 绿灯关键词在 key 里) */
function 记忆条(index: number, 选项: { uid?: number; 正文?: string; AM?: string[] } = {}) {
  const AM = 选项.AM ?? [`AM${String(index).padStart(4, '0')}`];
  return {
    uid: 选项.uid ?? index,
    comment: `纪要-${index}`,
    key: AM,
    content: 选项.正文 ?? `记忆正文-${index}：${'细节'.repeat(60)}`,
  };
}

async function 主流程() {
  // ---------------------------------------------------------------------------
  console.log('\n[1] 空世界书 / 模板环境不可用 → 明确空结果 + 诚实降级');
  {
    装({});
    const 包 = await getActiveWorldbookBundle('正文');
    check('mode 恒为独立重扫', 包.mode, '独立重扫');
    check('sameRequest 恒为 false(不宣称与主请求同批)', 包.sameRequest, false);
    check('没有任何世界书 → 三个空串', [包.facts, 包.memory, 包.entries.length], ['', '', 0]);
    check('也没有扫描书', 包.扫描书, []);

    装({ 主书: '主书', EJS: '环境不可用' });
    const 无环境 = await getActiveWorldbookBundle('正文');
    check('模板环境不可用 → 空结果', [无环境.facts, 无环境.memory], ['', '']);
    ok('降级原因写进 warnings', 有警告含(无环境, '模板环境不可用'));
    check('扫描书仍是本轮范围', 无环境.扫描书, ['主书']);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[2] 主 AI 选中的 AM 被**完整**核对: 20 条与 40 条都不截断、不凑数、不丢码');
  for (const 条数 of [20, 40]) {
    const 激活 = { 主书: Array.from({ length: 条数 }, (_, i) => 记忆条(i + 1)) };
    装({ 主书: '主书', 激活 });
    const expectedAM = Array.from({ length: 条数 }, (_, i) => `AM${String(i + 1).padStart(4, '0')}`);
    const 包 = await getActiveWorldbookBundle('正文', { expectedAM });
    check(`${条数} 条 AM 全部读到`, 包.entries.length, 条数);
    check(`${条数} 条全部判为记忆`, 包.entries.filter(e => e.分类 === '记忆').length, 条数);
    check(`${条数} 条没有一条缺失`, 包.缺失AM, []);
    check(`${条数} 条时 facts 为空`, 包.facts, '');
    check(`${条数} 条正文都在 memory 里`, expectedAM.every((ref, i) => 含(包.memory, `记忆正文-${i + 1}`)), true);
    check(`${条数} 条 AM 关键词逐条对上`, 包.entries.map(e => e.AM关键词), expectedAM.map(ref => [ref]));
    ok('每条都带书名', 包.entries.every(e => e.书名 === '主书'));
    ok('每条都带 uid', 包.entries.every(e => typeof e.uid === 'number'));
  }
  {
    // 零截断: 一条超长正文必须原样进 memory, 一位都不少
    const 长文 = `开头${'很长的设定内容'.repeat(800)}结尾`;
    装({ 主书: '主书', 激活: { 主书: [记忆条(1, { 正文: 长文 })] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('正文长度与原文一致(没有被裁)', 包.entries[0].text.length, 长文.length);
    ok('结尾那句还在', 含(包.memory, '结尾'));
  }

  // ---------------------------------------------------------------------------
  console.log('\n[3] 来源: uid 自带就用; 没带时按"内容+标题"唯一回查; 不唯一就记 null 并说明(不猜)');
  {
    const 条 = { comment: '纪要-甲', key: ['AM0001'], content: '唯一正文' };
    装({
      主书: '主书',
      激活: { 主书: [条] },
      全部条目: { 主书: [{ uid: 77, name: '纪要-甲', content: '唯一正文' }, { uid: 78, name: '别的', content: '别的正文' }] },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('回查拿到真实 uid', 包.entries[0].uid, 77);
  }
  {
    const 条 = { comment: '重名', key: ['AM0002'], content: '同一条正文' };
    装({
      主书: '主书',
      激活: { 主书: [条] },
      全部条目: { 主书: [{ uid: 1, name: '重名', content: '同一条正文' }, { uid: 2, name: '重名', content: '同一条正文' }] },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('匹配不唯一 → uid 记 null(不用猜的值)', 包.entries[0].uid, null);
    ok('并写清原因', 有警告含(包, '无法确认 uid'));
  }
  {
    // 宽松模式(旧包装)不做这次回查 —— 旧路径的读取次数一个字节都不变
    const 记录 = 装({ 主书: '主书', 激活: { 主书: [{ comment: '条目', key: ['AM0003'], content: '正文甲' }] } });
    await getActiveWorldbookText('正文');
    check('旧包装不去读全部条目', 记录.记录.读取条目, []);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[4] 去重与不合并: 同一本书重复返回 → 合并; 同内容不同 AM → 两条都要');
  {
    const 同一条 = { uid: 5, comment: '纪要-1', key: ['AM0001'], content: '同一份正文' };
    const 记录 = 装({ 主书: '主书', 附加书: ['主书', '附书'], 激活: { 主书: [同一条, 同一条], 附书: [] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('同一本书只问一次(重复绑定被折叠)', 记录.记录.激活查询, ['主书', '附书']);
    check('同一条目重复返回只留一条', 包.entries.length, 1);
    ok('合并写进 warnings', 有警告含(包, '重复来源已合并'));
    check('扫描书去重', 包.扫描书, ['主书', '附书']);
  }
  {
    // 同内容、不同 AM: 是两条不同的记忆 —— 合并就等于凭正文猜引用
    装({
      主书: '主书',
      激活: {
        主书: [
          { uid: 1, comment: '纪要-A', key: ['AM0001'], content: '一模一样的正文' },
          { uid: 2, comment: '纪要-B', key: ['AM0002'], content: '一模一样的正文' },
        ],
      },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('同内容不同 AM 不合并', 包.entries.length, 2);
    check('两条各自的 AM 都对', 包.entries.map(e => e.AM关键词), [['AM0001'], ['AM0002']]);
    check('正文都完整保留', 包.memory.split('一模一样的正文').length - 1, 2);
  }
  {
    // 同一内容落在两本书里: book 不同 → 是两条来源(不去重成一条, 面板/诊断要看得出两边都有)
    装({
      主书: '主书',
      附加书: ['附书'],
      激活: {
        主书: [{ uid: 1, comment: '纪要', key: ['AM0001'], content: '跨书正文' }],
        附书: [{ uid: 1, comment: '纪要', key: ['AM0001'], content: '跨书正文' }],
      },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('不同书算不同来源', 包.entries.map(e => e.书名), ['主书', '附书']);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[5] 缺失: 主 AI 选中的 AM 没被重扫激活 → 显式报缺(不补扫、不猜、不凑数)');
  {
    装({ 主书: '主书', 激活: { 主书: [记忆条(1)] } });
    const 包 = await getActiveWorldbookBundle('正文', { expectedAM: ['AM0001', 'AM0009', 'am0009'] });
    check('只读到了 AM0001', 包.entries.length, 1);
    check('AM0009 记进缺失(大小写归一, 不重复)', 包.缺失AM, ['AM0009']);
    ok('warnings 说清"不补扫旧记忆/不猜映射/不硬凑条数"', 有警告含(包, '不补扫旧记忆'));
    ok('warnings 指出是 AM0009', 有警告含(包, 'AM0009'));
    check('没有因为缺失而多读别的条目', 包.entries.map(e => e.AM关键词), [['AM0001']]);
  }
  {
    // 激活到了但整条求值失败: 与"没激活"是两件事, 要分开说
    装({
      主书: '主书',
      激活: { 主书: [{ uid: 1, comment: '坏条目', key: ['AM0007'], content: '<if cond="cell:没有这张表/甲/乙 = 1">秘密</if>' }] },
    });
    const 包 = await getActiveWorldbookBundle('正文', { expectedAM: ['AM0007'] });
    check('求值失败 → 不进 memory', 包.memory, '');
    check('但仍记成缺失', 包.缺失AM, ['AM0007']);
    ok('warnings 说明"激活到了但整条跳过"(不是没激活)', 有警告含(包, '激活到了'));
  }

  // ---------------------------------------------------------------------------
  console.log('\n[6] 失败关闭: 条件不可判定 / EJS 失败 → 整条跳过, 秘密一个字都不进 facts/memory');
  {
    const 秘密正文 = '<if cond="cell:保密表/甲/身份 = 真">秘密：他其实是卧底</if>普通结尾';
    装({ 主书: '主书', 激活: { 主书: [{ uid: 1, comment: '保密条目', content: 秘密正文 }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('缺表 → 整条不注入(主分支也不选)', [包.facts, 包.memory], ['', '']);
    ok('秘密没有进 facts', !含(包.facts, '卧底'));
    ok('秘密没有进 memory', !含(包.memory, '卧底'));
    ok('warnings 交代跳过整条', 有警告含(包, '已跳过整条'));
    ok('warnings 指出缺表', 有警告含(包, '缺表'));
    ok('日志里保留**整条原文**(不切)', 包.warnings.some(行 => 行.includes(秘密正文)));
  }
  {
    // 同一份条目在**宽松**模式(旧包装)下仍按现行行为保留主分支 —— 默认行为不变
    装({ 主书: '主书', 激活: { 主书: [{ uid: 1, comment: '保密条目', content: '甲<if cond="cell:没有这张表/甲/乙 = 1">秘密主分支</if>' }] } });
    const 文本 = await getActiveWorldbookText('正文');
    ok('宽松模式保留主分支(现行行为)', 含(文本, '秘密主分支'));
  }
  {
    // EJS 渲染失败: 旧行为是删掉模板块、正文照旧注入; 严格模式整条跳过
    const 带EJS = '前台说明<% 这里会炸 %>后台秘密：钥匙在井里';
    装({ 主书: '主书', EJS: '抛错', 激活: { 主书: [{ uid: 1, comment: 'EJS条目', content: 带EJS }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('EJS 渲染失败 → 整条不注入', [包.facts, 包.memory], ['', '']);
    ok('秘密没泄漏', !含(包.facts, '钥匙在井里') && !含(包.memory, '钥匙在井里'));
    ok('warnings 说明是 EJS 渲染失败', 有警告含(包, 'EJS 渲染失败'));
    ok('日志里保留整条原文(含模板块)', 包.warnings.some(行 => 行.includes(带EJS)));
  }
  {
    // EJS 方法不可用(插件版本不符, 返回 null): 同样整条跳过
    const 带EJS = '<% 插件不在 %>秘密正文';
    装({ 主书: '主书', EJS: '缺失', 激活: { 主书: [{ uid: 1, comment: 'EJS条目', content: 带EJS }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('EJS 不可用 → 整条不注入', [包.facts, 包.memory], ['', '']);
    ok('warnings 指出 evalTemplate 不可用', 有警告含(包, 'evalTemplate 不可用'));
  }
  {
    // <if> 未闭合: 严格模式不选任何分支(否则后面的正文会被原样当公开内容留下)
    装({ 主书: '主书', 激活: { 主书: [{ uid: 1, comment: '残缺', content: '开头<if cond="seed:甲">秘密尾巴' }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('未闭合 → 整条不注入', [包.facts, 包.memory], ['', '']);
    ok('warnings 指出没有闭合标签', 有警告含(包, '没有闭合标签'));
  }
  {
    // <if> 标签本身写坏了: 旧行为会把 '<if' 原样留在正文里(后面的内容就成公开设定), 严格模式整条跳过
    装({ 主书: '主书', 激活: { 主书: [{ uid: 1, comment: '写坏的标签', content: '开头<if cond="seed:甲"秘密尾巴' }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('写法坏 → 整条不注入', [包.facts, 包.memory], ['', '']);
    ok('warnings 指出标签写法无法解析', 有警告含(包, '标签写法无法解析'));
  }

  {
    // 不支持的 ACU 条件类型(db/sql/v 依赖 SQLite 运行时): 严格模式同样不选分支
    装({ 主书: '主书', 激活: { 主书: [{ uid: 1, comment: 'SQL 条目', content: '<if db="select 1">秘密结论</if>尾巴' }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('不支持的条件 → 整条不注入', [包.facts, 包.memory], ['', '']);
    ok('warnings 指出该条件类型不被模拟', 有警告含(包, '不模拟'));
  }
  {
    // 严格 ≠ 一律跳过: 能算出来的 seed 条件照常取命中/不命中分支
    装({
      主书: '主书',
      激活: {
        主书: [
          { uid: 1, comment: '命中', content: '<if cond="seed:码头">码头有人<else>码头没人</if>' },
          { uid: 2, comment: '不命中', content: '<if cond="seed:沙漠">沙漠有人<else>沙漠没人</if>' },
        ],
      },
    });
    const 包 = await getActiveWorldbookBundle('码头今天很挤');
    check('可判定的条件照常求值(命中主分支)', 包.facts.split('\n\n')[0], '码头有人');
    check('不命中取 else', 包.facts.split('\n\n')[1], '沙漠没人');
    check('没有警告', 包.warnings, []);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[7] 严格模式认 <if cell="表/行/列 …"> 的表名(与 cond 里的 cell: 是两种写法, 别混)');
  {
    const 表格 = { 等级表: { name: '等级表', content: [['名字', '等级'], ['甲', 19], ['乙', 8]] } };
    装({ 主书: '主书', 表格, 激活: { 主书: [{ uid: 1, comment: '条件条目', content: '<if cell="等级表/甲/等级 >= 18">成年甲<else>未成年甲</if>' }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('属性写法也能求值(表被收集到了)', 包.facts, '成年甲');
    check('没有缺表警告', 包.warnings.filter(行 => 行.includes('不存在的表')), []);
  }
  {
    // cond 里的 cell: 仍照旧
    const 表格 = { 等级表: { name: '等级表', content: [['名字', '等级'], ['甲', 19]] } };
    装({ 主书: '主书', 表格, 激活: { 主书: [{ uid: 1, comment: '条件条目', content: '<if cond="cell:等级表/甲/等级 >= 18">成年<else>未成年</if>' }] } });
    const 包 = await getActiveWorldbookBundle('正文');
    check('cond 写法照旧求值', 包.facts, '成年');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[8] 每轮新鲜: 同名表 A/B 不同值互不污染; EJS 环境每轮重新准备');
  {
    const 甲表 = { 等级表: { name: '等级表', content: [['名字', '等级'], ['甲', 19]] } };
    const 乙表 = { 等级表: { name: '等级表', content: [['名字', '等级'], ['甲', 8]] } };
    const 条目 = { uid: 1, comment: '条件条目', content: '<if cell="等级表/甲/等级 >= 18">成年<else>未成年</if>' };
    const 记录 = 装({ 主书: '主书', 表格: 甲表, 激活: { 主书: [条目] } });
    const 第一次 = await getActiveWorldbookBundle('正文');
    check('A 轮的表格 → 成年', 第一次.facts, '成年');
    // 同一张表名、另一份数据(切聊天/改表), 仍在 30 秒缓存窗口内
    injectHostForTest({ acu: { tables: () => 乙表 } } as any);
    const 第二次 = await getActiveWorldbookBundle('正文');
    check('B 轮立刻读到新表格 → 未成年(没有复用上轮缓存)', 第二次.facts, '未成年');
    injectHostForTest({ acu: { tables: () => 甲表 } } as any);
    const 第三次 = await getActiveWorldbookBundle('正文');
    check('再换回来又对了(缓存没有互相污染)', 第三次.facts, '成年');
    check('每轮都重新准备了 EJS 环境', 记录.记录.准备EJS, 3);
  }
  {
    // 宽松模式(旧包装)仍用 30 秒缓存: 上一轮的表数据会被复用 —— 现行行为, 不改
    const 甲表 = { 缓存表: { name: '缓存表', content: [['名字', '等级'], ['甲', 19]] } };
    const 乙表 = { 缓存表: { name: '缓存表', content: [['名字', '等级'], ['甲', 8]] } };
    const 条目 = { uid: 1, comment: '条件条目', content: '<if cell="缓存表/甲/等级 >= 18">成年<else>未成年</if>' };
    装({ 主书: '主书', 表格: 甲表, 激活: { 主书: [条目] } });
    const 一次 = await getActiveWorldbookText('正文');
    injectHostForTest({ acu: { tables: () => 乙表 } } as any);
    const 二次 = await getActiveWorldbookText('正文');
    check('旧包装仍在用缓存(行为不变)', [一次, 二次], ['成年', '成年']);
  }

  // ---------------------------------------------------------------------------
  console.log('\n[9] 旧包装不回归: 宽松求值 / 自写条目排除 / 全局书范围 / 宏完整展开');
  {
    const 表格 = { 等级表: { name: '等级表', content: [['名字', '等级'], ['乙', 8]] } };
    装({
      主书: '主书',
      表格,
      激活: {
        主书: [
          { uid: 1, comment: '条件条目', content: '<if cond="cell:等级表/乙/等级 >= 18">主分支<else>备分支</if>' },
          { uid: 2, comment: '宏条目', content: '你好 {{char}}' },
          { uid: 3, comment: '自写条目', content: '[烟火 · 世界动向]\n不该出现' },
          { uid: 4, comment: '被额外排除', content: '也不该出现' },
        ],
      },
      宏: text => text.replace('{{char}}', '爱丽丝'),
    });
    const 文本 = await getActiveWorldbookText('正文', { excludeNames: ['被额外排除'] });
    check('不命中的条件取 else, 宏完整展开, 自写/排除条目都不在', 文本, '备分支\n\n你好 爱丽丝');
  }
  {
    const 记录 = 装({
      主书: '主书',
      聊天书: '聊天书',
      全局书: ['全局书'],
      激活: { 主书: [], 聊天书: [], 全局书: [{ uid: 9, comment: '全局条目', content: '全局设定' }] },
    });
    const 默认 = await getActiveWorldbookBundle('正文');
    check('默认不读全局书', [默认.facts, 默认.扫描书], ['', ['主书', '聊天书']]);
    const 带全局 = await getActiveWorldbookBundle('正文', { includeGlobal: true });
    check('开关打开才读全局书', 带全局.facts, '全局设定');
    check('扫描书按 主→聊天→全局 的顺序', 带全局.扫描书, ['主书', '聊天书', '全局书']);
    ok('激活查询只问这些书', 记录.记录.激活查询.every(名 => ['主书', '聊天书', '全局书'].includes(名)));
  }

  // ---------------------------------------------------------------------------
  console.log('\n[10] 设定与记忆分开: 没有 AM 关键词的是设定, 正文里提到 AM 也不算记忆');
  {
    装({
      主书: '主书',
      激活: {
        主书: [
          { uid: 1, comment: '世界观', content: '这个世界有两条大河。' },
          { uid: 2, comment: '引用随口一提', content: '他想起那段旧事(AM0042), 但这不是记忆条目。' },
          { uid: 3, comment: '纪要-3', key: ['AM0042'], content: '真正的记忆条目正文' },
        ],
      },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('两条设定(正文提到 AM 的那条仍算设定)', 包.entries.filter(e => e.分类 === '设定').map(e => e.条目名), ['世界观', '引用随口一提']);
    check('一条记忆(只认激活关键词)', 包.entries.filter(e => e.分类 === '记忆').map(e => e.条目名), ['纪要-3']);
    ok('facts 里有那条设定', 含(包.facts, '两条大河'));
    check('正文提到 AM 不会被降级成记忆', 包.entries.find(e => e.条目名 === '引用随口一提')?.AM关键词, []);
    check('memory 只有记忆条目', 包.memory, '真正的记忆条目正文');
  }

  // ---------------------------------------------------------------------------
  console.log('\n[11] 激活查询失败只影响那一本书, 其它书照读, 并记诊断');
  {
    装({
      主书: '主书',
      聊天书: '聊天书',
      激活抛错: ['主书'],
      激活: { 聊天书: [{ uid: 1, comment: '聊天设定', content: '聊天书内容' }] },
    });
    const 包 = await getActiveWorldbookBundle('正文');
    check('另一本书照读', 包.facts, '聊天书内容');
    ok('失败的那本记进 warnings', 有警告含(包, '激活查询失败'));
    check('扫描书仍然列出两本', 包.扫描书, ['主书', '聊天书']);
  }

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0)
    process.exitCode = 1;
}

await 主流程();
