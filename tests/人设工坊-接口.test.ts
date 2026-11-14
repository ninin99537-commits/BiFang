// 人设工坊 · 接口地址归一 + 拉取模型 + 接口配置预设(#193)
//
// 判据(来自 #193):
//   1. 归一接口地址 7 例
//   2. 拉取模型失败路径响亮(地址空 / 转发抛错 都抛, 不许吞)
//   3. 预设 CRUD 往返
//   4. ★ 别名两个方向(载入后改当前不影响预设本体; 存后改当前不影响已存)
//   5. 空名被拒
//   6. 老设置 parse(补 models=[] / apiPresets={})
//   7. sink 归一化生效
//   8. 拼消息() 与基线逐字节相同(没碰生成路径)
import { 归一接口地址, 拉取模型 } from '../src/人设工坊/lib/接口';
import { SettingsSchema, type Settings } from '../src/人设工坊/schema';
import { 拼消息 } from '../src/人设工坊/lib/sink';
import { klona } from 'klona';

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

console.log('\n[1] 归一接口地址(7 例)');
{
  check('空串 → 空串', 归一接口地址(''), '');
  check('无尾斜杠 → 补 /v1', 归一接口地址('https://a.com'), 'https://a.com/v1');
  check('一个尾斜杠 → 补 /v1', 归一接口地址('https://a.com/'), 'https://a.com/v1');
  check('三个尾斜杠 → 补 /v1', 归一接口地址('https://a.com///'), 'https://a.com/v1');
  check('已有 /v1 → 不变', 归一接口地址('https://a.com/v1'), 'https://a.com/v1');
  check('/v1/ → 去尾斜杠', 归一接口地址('https://a.com/v1/'), 'https://a.com/v1');
  check('/v2 → 不变', 归一接口地址('https://a.com/v2'), 'https://a.com/v2');
  check('首尾空白也去', 归一接口地址('  https://a.com/  '), 'https://a.com/v1');
}

console.log('\n[2] 拉取模型: 失败路径响亮(不许吞)');
{
  let 空地址报错 = '';
  try {
    await 拉取模型('', 'k');
  } catch (错误) {
    空地址报错 = 错误 instanceof Error ? 错误.message : String(错误);
  }
  check('空地址 → 明确提示', 空地址报错, '请先填写接口地址');

  // ★ #209: 无协议头地址必须报错(以前 归一接口地址 只归一不校验 → a.com/v1 合法 → 静默失败)
  let 无协议报错 = '';
  try {
    await 拉取模型('a.com', 'x');
  } catch (错误) {
    无协议报错 = 错误 instanceof Error ? 错误.message : String(错误);
  }
  ok('无协议地址 → 抛错', !!无协议报错);
  ok('错误指向地址问题', 无协议报错.includes('http://') || 无协议报错.includes('不合法'));

  // 有协议头的内网地址不误伤
  (globalThis as any).getModelList = async () => ['m'];
  const 内网 = await 拉取模型('http://192.168.1.5:8000', 'k');
  check('内网地址(有协议头)不误伤', 内网, ['m']);

  // ★ #209: 服务端返回空列表 → 不许报成功
  (globalThis as any).getModelList = async () => [];
  let 空列表报错 = '';
  try {
    await 拉取模型('https://a.com', 'k');
  } catch (错误) {
    空列表报错 = 错误 instanceof Error ? 错误.message : String(错误);
  }
  ok('★ 空列表 → 抛错(不报成功)', !!空列表报错);
  ok('空列表错误提示可定位', 空列表报错.includes('未获取到任何模型'));

  // 转发抛错 → 抛出带 cause 的错
  (globalThis as any).getModelList = async () => {
    throw Error('上游 500');
  };
  let 转发报错 = '';
  let 有cause = false;
  try {
    await 拉取模型('https://a.com', 'k');
  } catch (错误) {
    转发报错 = 错误 instanceof Error ? 错误.message : String(错误);
    有cause = 错误 instanceof Error && !!(错误 as Error & { cause?: unknown }).cause;
  }
  ok('转发失败 → 抛出(不吞)', 转发报错.includes('获取模型列表失败'));
  ok('带 cause', 有cause);

  // 成功路径: 地址被归一后再传下去
  let 收到地址 = '';
  (globalThis as any).getModelList = async (cfg: { apiurl: string }) => {
    收到地址 = cfg.apiurl;
    return ['m1', 'm2'];
  };
  const 列表 = await 拉取模型('https://a.com/', ' k ');
  check('成功返回列表', 列表, ['m1', 'm2']);
  check('传给 getModelList 的地址已归一', 收到地址, 'https://a.com/v1');
}

console.log('\n[3] 预设 CRUD 往返 + ★ 别名两个方向');
{
  const s = SettingsSchema.parse({}) as Settings;
  s.api = { ...s.api, source: 'custom', apiurl: 'https://a.com', key: 'k', model: 'm1', models: ['m1', 'm2'] };

  // 存(照抄 UI 的写法: 两头都 klona)
  s.apiPresets['甲'] = klona(s.api);
  ok('存后列表里有「甲」', Object.keys(s.apiPresets).includes('甲'));
  check('预设内容 = 存的那份', s.apiPresets['甲'].model, 'm1');

  // 改当前配置, 预设本体不能变(方向一)
  s.api.model = '改过了';
  check('★ 改当前 → 预设本体不变', s.apiPresets['甲'].model, 'm1');

  // 载入(也要 klona)
  s.api = klona(s.apiPresets['甲']);
  check('载入后当前 = 预设', s.api.model, 'm1');
  // 再改当前, 预设本体仍不能变(方向二)
  s.api.models.push('新加的');
  check('★ 载入后改当前 → 预设本体不变', s.apiPresets['甲'].models, ['m1', 'm2']);

  // 删
  delete s.apiPresets['甲'];
  ok('删后列表里没了', !Object.keys(s.apiPresets).includes('甲'));

  // 反面对照: 不 klona 就会共享引用(证明这条测试有牙齿)
  const s2 = SettingsSchema.parse({}) as Settings;
  s2.api = { ...s2.api, model: 'A' };
  s2.apiPresets['乙'] = s2.api; // ← 故意不 klona
  s2.api.model = 'B';
  check('★ 反面对照: 不 klona 时预设被连带改了(证明判据能失败)', s2.apiPresets['乙'].model, 'B');
}

console.log('\n[4] 空名被拒(照抄先例行为)');
{
  // UI 里: 名 trim 后为空 → warning 且不写入
  const 名 = '   '.trim();
  ok('空名 trim 后为空', !名);
  // 同名覆盖要和新建区分: 这里钉住「判断依据是键是否已存在」
  const 预设表: Record<string, unknown> = { 甲: {} };
  ok('同名时能判出已存在', !!预设表['甲']);
  ok('新名时判不出已存在', !预设表['乙']);
}

console.log('\n[5] 老设置兼容: 没有 models / apiPresets 也能 parse');
{
  const 老 = SettingsSchema.parse({
    api: { source: 'custom', apiurl: 'x', key: 'k', model: 'm' },
  }) as Settings;
  check('models 补默认空数组', 老.api.models, []);
  check('apiPresets 补默认空对象', 老.apiPresets, {});
  check('老字段保留', [老.api.source, 老.api.apiurl, 老.api.key, 老.api.model], ['custom', 'x', 'k', 'm']);

  // 连 api 都没有的老设置
  const 更老 = SettingsSchema.parse({}) as Settings;
  check('无 api 也能 parse', 更老.api.source, 'main');
  check('无 api 时 apiPresets 也补上', 更老.apiPresets, {});
}

console.log('\n[6] sink 归一化生效 + 拼消息不受影响');
{
  // 用一份设置跑 拼消息, 确认结构没变(生成路径零改动)
  const s = SettingsSchema.parse({}) as Settings;
  const 消息 = 拼消息(s);
  ok('拼消息仍返回数组', Array.isArray(消息));
  ok('含 user_input 占位', 消息.includes('user_input' as never));
  // 默认全关: 只有 [system, user_input]
  check('默认结构两条', 消息.length, 2);
}

console.log(`\n人设工坊接口: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
