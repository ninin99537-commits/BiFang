// 彼方 · 设置页 01 接口那一节不许有说明段落 —— 批次 2026-11-19（用户第二次提）。
//
// ── 为什么这条判据要写成"整节 0 条"而不是"删掉这三句" ──
//  用户原话：**「这几句话删掉，他妈的服了你们了，之前都说了删掉了，结果还留下」**
//
//  **这是第二次说。** 第一次我们只删了一部分（工具通道那句里的「预填充」删了，整句没删）。
//
//  所以判据不能是"这三句没了" —— 那只能防住这一轮。
//  要防复发，判据必须是：**这一节里不该再有这种段落**。
//  下次有人加一条说明，它会红。
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const 源 = readFileSync(path.join(ROOT, 'src/彼方_NPC幕后生命状态系统/页面-设置.vue'), 'utf8');
const 行们 = 源.split('\n');

let pass = 0;
let fail = 0;
function ok(名: string, 条件: boolean, 附注?: string) {
  if (条件) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}${附注 ? `  (${附注})` : ''}`);
  }
}
function eq(名: string, 实际: any, 期望: any) {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a === b) {
    pass++;
  }
  else {
    fail++;
    console.log(`  ✗ ${名}\n      期望 ${b}\n      实际 ${a}`);
  }
}

/** 按 `aria-labelledby="bf-set-xxx"` 切出各节（返回 行号区间 + 文本） */
function 切节() {
  const 界: Array<{ 名: string; 起: number }> = [];
  行们.forEach((l, i) => {
    const m = l.match(/aria-labelledby="bf-set-([\w-]+)"/);
    if (m)
      界.push({ 名: m[1], 起: i });
  });
  return 界.map((x, k) => {
    const 止 = k + 1 < 界.length ? 界[k + 1].起 : 行们.length;
    return { 名: x.名, 文本: 行们.slice(x.起, 止).join('\n'), 起行: x.起 + 1, 止行: 止 };
  });
}

const 节们 = 切节();
const 接口节 = 节们.find(s => s.名 === 'api');

// ─────────────────────────────────────────────────────────────
console.log('\n[结构] 找得到 01 接口那一节');
{
  ok('切出了 01 接口节（aria-labelledby="bf-set-api"）', !!接口节,
     节们.map(s => s.名).join(' / '));
  ok('它不是一个空节', (接口节?.文本.length ?? 0) > 500, `${接口节?.文本.length} 字符`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[核心] 01 接口那一节里不许有 bf-hint 段落');
{
  // ── 这条是本批的核心判据 ──
  const 条数 = (接口节?.文本.match(/class="bf-hint"/g) ?? []).length;
  eq('01 接口节里 bf-hint 条数为 0', 条数, 0);

  // 同时查一句都不许留（防止有人把 bf-hint 改成别的类名继续写说明）
  ok('也没有别的"说明段落"类名（bf-note / bf-aside / bf-tip）',
     !/class="[^"]*\b(bf-note|bf-aside|bf-tip)\b/.test(接口节?.文本 ?? ''),
     接口节?.文本.match(/class="[^"]*(bf-note|bf-aside|bf-tip)[^"]*"/g)?.join(', '));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[核心] 用户点名的三处原文必须一句不剩');
{
  // ── 这三处是用户具体指出的，逐个钉住（防"删了类名但文字还在"）──
  const 该没了 = [
    ['工具通道的说明', '连剧情内容也一起放进表里'],
    ['工具通道的说明（第二句）', '打开期间「流式输出」不起作用'],
    ['请求打散的说明', '让每次请求都不一样'],
    ['请求打散的说明（代价句）', '代价：变慢、更费 token'],
    ['配置预设的说明', '换接口时一键切回'],
  ];
  for (const [名, 片段] of 该没了)
    ok(`「${名}」不在了`, !源.includes(片段), `还找得到「${片段}」`);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[保留] 开关行的内嵌说明（bf-switch-copy span）不算 bf-hint');
{
  // ── 为什么要区分 ──
  //  `<b>工具通道</b><span>让 AI 填一张表</span>` 是**标题的副标题**，不是段落说明。
  //  用户要删的是"标题 + 控件 + 一整段说明"里的**那一段**，不是副标题。
  //  如果连副标题也删，界面上就只剩一个开关和四个字 —— 那是另一个决定。
  ok('工具通道的副标题还在', /<b>工具通道<\/b>\s*<span>[^<]+<\/span>/.test(源));
  ok('请求打散的副标题还在', /<b>请求打散<\/b>\s*<span>[^<]+<\/span>/.test(源));
  ok('直连接口的副标题还在', /<b>直连接口<\/b>\s*<span>[^<]+<\/span>/.test(源));

  // **自证**：这条判据能区分"副标题"与"bf-hint 段落"
  const 假源码 = '<label class="bf-switch-row"><b>工具通道</b><span>让 AI 填一张表</span></label>';
  ok('[自证] 副标题不会被当成 bf-hint', !/class="bf-hint"/.test(假源码));
}

// ─────────────────────────────────────────────────────────────
console.log('\n[自证] 加一条 bf-hint 回去 → 核心判据必须红');
{
  // ── 这条证明"整节 0 条"不是恒真 ──
  const 加回 = (接口节?.文本 ?? '') + '\n<p class="bf-hint">随便一句说明</p>\n';
  const 条数 = (加回.match(/class="bf-hint"/g) ?? []).length;
  eq('[自证] 加一条后条数变成 1（所以上面那条会红）', 条数, 1);
  ok('[自证] 而真实源码里是 0', (接口节?.文本.match(/class="bf-hint"/g) ?? []).length === 0);
}

// ─────────────────────────────────────────────────────────────
console.log('\n[记录] 其他节还剩多少条（用户只点了 01，这里只报告不改）');
{
  // ── 为什么"只报告不改" ──
  //  用户这次只点了三处。把整页说明都删掉是**另一个决定**
  //  （"要不要给每个设置配说明"），不该由我们替他做。
  const 其他 = 节们.filter(s => s.名 !== 'api');
  const 明细 = 其他.map(s => `${s.名}: ${(s.文本.match(/class="bf-hint"/g) ?? []).length}`);
  const 总数 = 其他.reduce((n, s) => n + (s.文本.match(/class="bf-hint"/g) ?? []).length, 0);

  console.log(`    其他节剩余 ${总数} 条 —— ${明细.join(' / ')}`);
  ok('其他节**确实还有**说明段落（证明我们没顺手全删）', 总数 > 0, `总数 ${总数}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
