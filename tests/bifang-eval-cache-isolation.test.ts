// 彼方 · 批次 3-5 求值缓存隔离 —— 断言先行(接口由需求位 #133 钉死: worldbook.ts 求值环境加 禁用缓存: true)。
//
// 契约: 求值环境带 禁用缓存: true → 改表后**同一轮**就能读到新表(不等 30 秒 TTL)。
// 时钟处理: 不靠真等 30 秒 —— 隔离断言走"改表 → 立刻再读"; 变异(去掉 禁用缓存)在落地后做, 那时
// 30 秒 TTL 会在第二次调用命中旧缓存 → 红, 全程零等待。
// 当前必须红(实现还没落)；落地后绿。
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

console.log('\n[1] 求值环境带 禁用缓存: true(钉死的接口形态)');
{
  // 假宿主的世界书给一条条目; getActiveWorldbookText 走真实求值链, 模板环境把收到的上下文原样回显
  const { host } = 彼方假宿主({});
  const 收到的: any[] = [];
  (host as any).ejs = {
    prepareContext: async (...args: any[]) => {
      收到的.push(args);
      return { getWorldInfoActivatedData: async () => [] };
    },
    evaluate: async (t: string) => t,
    syntaxError: async () => '',
  };
  const 世界书 = { 主书: [{ name: '计数条目', content: '数值：{{getvar::计数}}', key: [], disable: false }] };
  (host as any).worldbook.entries = async () => 世界书.主书;
  (host as any).worldbook.boundNames = () => ({ primary: '主书', additional: [] });
  await getActiveWorldbookText(host as any, '扫描文本', [], []);
  const 全部上下文 = JSON.stringify(收到的);
  ok('求值链路把 禁用缓存: true 传进了求值环境(现状: 没有 → 红)', 全部上下文.includes('禁用缓存') && 全部上下文.includes('true'));
}

console.log('\n[2] 改表后同一轮读到新表(不等 30 秒 TTL)');
{
  resetWorldbookCaches();
  const { host } = 彼方假宿主({});
  (host as any).worldbook.boundNames = () => ({ primary: '主书', additional: [] });
  const 表数据 = { 版本: 1 };
  (host as any).acu = { tables: async (name: string) => (name === '状态表' ? [表数据] : []) };
  const 世界书 = { 主书: [{ name: '带表条目', content: '表内容引用', key: [], disable: false }] };
  (host as any).worldbook.entries = async () => 世界书.主书;
  const 第一次 = await getActiveWorldbookText(host as any, '扫描文本', [], []);
  // 同一轮内改表(时间远不到 30 秒)
  表数据.版本 = 2;
  表数据.标记 = '新表内容标记';
  const 第二次 = await getActiveWorldbookText(host as any, '扫描文本', [], []);
  ok('第二次调用读到改后的表(现状: 30 秒 TTL 命中旧缓存 → 红)', JSON.stringify(第二次) !== JSON.stringify(第一次) || String(第二次).includes('新表内容标记') || 第二次 !== 第一次);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0)
  process.exit(1);
