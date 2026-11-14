// 彼方 · 批次 3-5 求值缓存隔离 —— 断言先行(接口由需求位 #133 钉死: 求值环境 禁用缓存: true, worldbook.ts:65)。
//
// 契约: 彼方每一轮求值都不读也不写共用层 30 秒缓存 → 改表后**同一轮**读到新表(烟火 reader 同口径)。
// 观察点变更(#138, 非断言放宽): 禁用缓存挂在 彼方求值环境() 的返回对象上, 不经过 prepareContext ——
// 原观察点作废, 改为**行为观察**(改表 → 立刻再读 → 输出随表变), 两轮互为备份。
// fixture 按 #138 指正重建: 真实 HostAcu.tables() 是**无参同步**返回全量对象({表名: {name, content}}),
// content 首行为表头; 条目正文带 `cell:表/行/列` 真引用, 且用**数值比较条件**(真值条件不随值翻转变红)。
// 当前必须红(30 秒 TTL 命中旧表)；实现落地后绿。变异(禁用缓存改 false)在落地后做: 全红, 零等待。
import lodash from 'lodash';
import { resetWorldbookCaches } from '../src/彼方_NPC幕后生命状态系统/worldbook';
import { getActiveWorldbookText } from '../src/彼方_NPC幕后生命状态系统/worldbook';
import { 彼方假宿主 } from './helpers/彼方假宿主';

(globalThis as any)._ = lodash;

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

/** 假世界书 + 无参同步的全量表 + 带 cell: 数值比较条件的条目。改 表格[1][1] 即改表。 */
function 求值假宿主() {
  const { host } = 彼方假宿主({});
  const 表格 = [['角色', '阶段'], ['甲', 1]];
  const acu调用: string[] = [];
  (host as any).acu = {
    tables: () => {
      acu调用.push(`第${acu调用.length + 1}次`);
      // 保真: 真平台每次读表返回**新对象**(编辑产生新数据); 缓存存的是当时的旧克隆 ——
      // 若这里返回活引用, 原地改表会连缓存一起"变新", 缓存命中与否都测不出来
      return { 状态表: { name: '状态表', content: JSON.parse(JSON.stringify(表格)) } };
    },
  };
  (host as any).worldbook.boundNames = () => ({ primary: '主书', additional: [] });
  (host as any).worldbook.entries = async () => [
    { name: '带表条目', content: '阶段标记:[<if cond="cell:状态表/甲/阶段 >= 2">阶段二以上</if>]', strategy: { type: 'constant', keys: [] }, disable: false },
  ];
  // ejs 最小替身(边界: 只透传, 不解析模板 —— cell: 条件块由共用层原生渲染, 不经 evaluate 加工)
  (host as any).ejs = { prepareContext: async () => ({}), evaluate: async (t: string) => t, syntaxError: async () => '' };
  return { host, 表格, acu调用 };
}

console.log('\n[1] 同轮改表可见: 阶段 1 → 2, 第二次调用立刻出现"阶段二以上"(现状: TTL 命中旧表 → 红)');
{
  resetWorldbookCaches();
  const { host, 表格, acu调用 } = 求值假宿主();
  const 第一次 = await getActiveWorldbookText(host as any, '扫描文本', [], []);
  ok('第一次: 阶段 1 → 无标记', !String(第一次).includes('阶段二以上'));
  表格[1][1] = 2;
  const 第二次 = await getActiveWorldbookText(host as any, '扫描文本', [], []);
  ok('第二次: 阶段 2 → 出现标记(现状: 旧缓存 → 红)', String(第二次).includes('阶段二以上'));
  console.log(`        acu.tables 调用: ${acu调用.join('、') || '(零次)'}`);
}

console.log('\n[2] 连续第三轮: 阶段 2 → 3, 每一轮都反映当时表(变异时两轮一起红)');
{
  resetWorldbookCaches();
  const { host, 表格 } = 求值假宿主();
  const 读本 = async () => getActiveWorldbookText(host as any, '扫描文本', [], []);
  const 一 = await 读本();
  表格[1][1] = 2;
  const 二 = await 读本();
  表格[1][1] = 3;
  const 三 = await 读本();
  ok('第一轮(阶段1): 无标记', !String(一).includes('阶段二以上'));
  ok('第二轮(阶段2): 有标记', String(二).includes('阶段二以上'));
  ok('第三轮(阶段3): 有标记', String(三).includes('阶段二以上'));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
