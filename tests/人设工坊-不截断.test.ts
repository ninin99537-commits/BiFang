// 人设工坊 · 不截断回归(用户报的严重问题, 2026-10-14)
//
// 用户原话: "截断...不要截断，任何截断都不要，截断之后一句话就不完整了，意思可能会完全不一样"
// 理由成立且严重: slice(0,n) 从句子中间切、切完补 `…`, 一句话被切一半意思可能直接反过来
// ("她不会拒绝" → "她不会…") —— 不是"少一点信息", 是注入了错误的语义。
//
// 两条腿:
//   [1] 动态: mock 平台全局, 真跑 取素材, 断言超长输入逐字完整、不含省略号
//   [2] 静态: 扫 sink.ts 源码, 钉住 `素材上限`/`聊天上限`/截断 helper 不再出现
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { 取素材 } from '../src/人设工坊/lib/sink';
import type { Settings } from '../src/人设工坊/schema';

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

/** 超长探针: 远超任何可能被写死的上限(旧的 2000/4000) */
const 长 = 5000;
const 长文本 = (前缀: string) => 前缀 + '字'.repeat(长 - 前缀.length);

function 全开设置(): Settings {
  return {
    mode: 'user',
    enabled: [],
    fieldValues: {},
    brief: '',
    onMissing: 'mark',
    strictWhitelist: true,
    selfCheck: true,
    api: { source: 'main', apiurl: '', key: '', model: '' },
    material: { charCard: true, userPersona: true, chatHistory: true, chatDepth: 20 },
    promptOverrides: {},
    globalPrefix: '',
    globalSuffix: '',
  } as Settings;
}

console.log('\n[1] 素材注入不截断: 超长输入逐字完整');
{
  // mock 酒馆平台全局(打包后的源码以自由全局引用它们, 运行时从 globalThis 取)
  const 卡描述 = 长文本('描述开头');
  (globalThis as any).getCharData = () => ({
    name: '测试角色',
    description: 卡描述,
    personality: 长文本('性格开头'),
    scenario: 长文本('场景开头'),
    mes_example: 长文本('示例开头'),
  });
  const 人设描述 = 长文本('人设开头');
  (globalThis as any).getPersona = () => ({ description: 人设描述 });
  (globalThis as any).getLastMessageId = () => 0;
  const 楼层文本 = 长文本('楼层开头');
  (globalThis as any).getChatMessages = () => [{ name: '甲', message: 楼层文本 }];

  const 素材 = 取素材(全开设置());

  ok('角色卡描述逐字完整', 素材.charInfo.includes(卡描述));
  ok('角色卡无省略号', !素材.charInfo.includes('…'));
  ok('user 人设逐字完整', 素材.userPersona.includes(人设描述));
  ok('user 人设无省略号', !素材.userPersona.includes('…'));
  ok('聊天记录逐字完整', 素材.chatHistory.includes(楼层文本));
  ok('聊天记录无省略号', !素材.chatHistory.includes('…'));

  check('角色卡长度 = 四段原长 + 标题开销(不再被切到 2000)', 素材.charInfo.length > 长, true);
  check('user 人设长度 = 原长', 素材.userPersona.length, 人设描述.length);
}

console.log('\n[2] 源码里不再有字符截断的符号');
{
  const 源 = readFileSync(path.join(process.cwd(), 'src', '人设工坊', 'lib', 'sink.ts'), 'utf8');
  ok('无 素材上限', !源.includes('素材上限'));
  ok('无 聊天上限', !源.includes('聊天上限'));
  ok('无 截断( 调用', !/截断\s*\(/.test(源));
  ok('无 slice(0, 2000) 之类素材切法', !/slice\(\s*0\s*,\s*(2000|4000)\s*\)/.test(源));
  ok('取文本 存在', 源.includes('取文本'));
  // 三处调用点: 角色卡字段 / user 人设 / 聊天记录
  const 调用数 = (源.match(/取文本\s*\(/g) ?? []).length;
  check('取文本 至少 4 次(定义 1 + 调用 3)', 调用数 >= 4, true);
}

console.log('\n[3] 三处调用点各自点名(防漏改)');
{
  const 源 = readFileSync(path.join(process.cwd(), 'src', '人设工坊', 'lib', 'sink.ts'), 'utf8');
  ok('角色卡字段走 取文本', /const 净 = 取文本\(值\)/.test(源));
  ok('user 人设走 取文本', /userPersona = 取文本\(getPersona\('current'\)\.description\)/.test(源));
  ok('聊天记录走 取文本', /chatHistory = 取文本\(记录\)/.test(源));
}

console.log(`\n人设工坊不截断: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
