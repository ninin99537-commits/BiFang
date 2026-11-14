// 剧情导演 · P5 拆分（第一批：`取料.ts` → 4 个模块）—— 2026-11-12
//
// 契约：`reviews/裁定-P5-拆巨石.md` §二A / §三。只拆"搬得动且搬完能单独验"的部分：
//   · `提醒.ts`      判据 + 22 条规则表（原文件 59% 的体量，**零宿主依赖**）
//   · `选证入口.ts`   申请清单 + 理由（**零宿主依赖**）
//   · `记忆读取.ts`   两级记忆读取（允许依赖 记忆检索）
//   · `取料.ts`      保留宿主侧编排 + **再导出**搬走的符号（P6 再决定要不要删这层）
//
// 本用例钉契约里两条**能失败**的判据（第三、四条是行为零变化 + 视觉，由全量用例与人眼负责）：
//   ② 依赖方向：`提醒.ts` / `选证入口.ts` 里不许出现 `from './host'` 一类宿主 import
//          （图省事把宿主调用搬进去就红 —— 那正是这次拆分要防的"搬歪"）
//   ③ re-export 完整：拆前 dump 的 39 个导出，拆后必须仍然从 `取料.ts` 取得到
import { readFileSync } from 'node:fs';

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

const 读 = (名: string) => readFileSync(`src/剧情导演/${名}`, 'utf8');

console.log('\n[1] 依赖方向：纯逻辑模块不许碰宿主');
{
  // 这几样是"宿主侧"的门牌：host/api/读书/prompts/共用 · 楼层标签过滤
  const 宿主 = [/from '\.\/host'/, /from '\.\/api'/, /from '\.\/读书'/, /from '\.\/prompts'/, /楼层标签过滤/];
  for (const 文件 of ['提醒.ts', '选证入口.ts']) {
    const 源 = 读(文件);
    for (const 规则 of 宿主) {
      ok(`${文件} 不含 ${规则}`, !规则.test(源));
    }
  }
  // 反向（判据能失败）：取料.ts 自己**必须**含宿主 import，否则说明它被搬空了
  ok('对照: 取料.ts 仍然含宿主 import（它才是编排层）', /from '\.\/host'/.test(读('取料.ts')));
}

console.log('\n[2] re-export 完整：拆前 39 个导出，拆后仍从 取料.ts 取得到');
{
  const 取料源 = 读('取料.ts');
  const 三条 = ['./提醒', './选证入口', './记忆读取'].filter(m => !取料源.includes(`export * from '${m}'`));
  check('三条 export * 都在', 三条, []);

  const 基线 = [
    '本轮输入', '读最近召回', '读最近召回原文', '解析信息边界', '补读上限', '取料结果', '最新AI回复楼层',
    '提醒上下文', '提醒规则', '收章判据', '判收章', '收章发言者', '收束已用场数', '选收章发言者', '判中点到期',
    '是生活幕', '日常拖太久判据', '判日常拖太久', '提醒规则表', '结构提醒', '矛盾久悬阈值', '矛盾久悬提醒',
    '反转重复提醒', '回响间隔', '章长度阈值', '回响提醒', '回响条数告警', '回响配额提醒', '兑现条件提醒',
    '伏笔时间轴', '章长度提醒', '节奏提醒', '节拍拖太久阈值', '尾部同节拍', '选证上下文', '收集必需引用',
    '记忆读取结果', '读取记忆', '采集本轮输入',
  ];
  // 2026-11-13: 补 re-export 分支 —— 原文只认直接声明，于是 `export { X };` 一律漏掉。
  // 为什么必须补：这条用例的**本意**是"拆后仍从 取料.ts 取得到"，而 re-export 正是"取得到"的机制；
  // 漏掉它 = 任何符号改写成 re-export 都假红（这次 是生活幕 就撞上了）。修它是补洞，不是放宽判据。
  const 声明 = (源: string): string[] => {
    const 直接 = [...源.matchAll(/^export (?:interface|type|const|function|async function|class)\s+([A-Za-z0-9_\u4e00-\u9fa5]+)/gm)].map(m => m[1]);
    const 转出 = [...源.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap(m =>
      m[1].split(',').map(项 => (项.includes(' as ') ? 项.split(' as ')[1] : 项).trim()),
    );
    return [...直接, ...转出].filter(Boolean);
  };
  const 全部声明 = new Set([...声明(读('取料.ts')), ...声明(读('提醒.ts')), ...声明(读('选证入口.ts')), ...声明(读('记忆读取.ts'))]);
  // 2026-11-13: 是生活幕 的实现上提到 字段表.ts（引擎要用，引擎不能 import 提醒）。
// 原文: check('基线 39 个符号全部仍有声明', …, [])
// 新文: 同上，但 全部声明 的取法要把 re-export 也算进去（见上）
// 为什么: 该符号仍然"从 取料.ts 取得到"（re-export），性质没变；变的是它的**住址**。
check('基线 39 个符号全部仍有声明（含 re-export）', 基线.filter(名 => !全部声明.has(名)), []);
  // 判据能失败：抹掉一条 export *，`提醒.ts` 里的符号就不再可达
  ok('对照: 去掉 export * 就会失联（判据可失败）', 基线.some(名 => 声明(读('提醒.ts')).includes(名)));
}

console.log('\n[3] 搬动的量：取料.ts 体量显著下降，且四个文件都在');
{
  const 行数 = (名: string) => 读(名).split('\n').length;
  const 明细 = { '取料.ts': 行数('取料.ts'), '提醒.ts': 行数('提醒.ts'), '选证入口.ts': 行数('选证入口.ts'), '记忆读取.ts': 行数('记忆读取.ts') };
  console.log('        行数:', JSON.stringify(明细));
  ok('取料.ts 已从 1265 行降到 400 行以内', 明细['取料.ts'] < 400);
  ok('提醒.ts 承接了最大的一块（> 600 行）', 明细['提醒.ts'] > 600);
}

// ---------------------------------------------------------------------------
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
