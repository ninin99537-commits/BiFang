// 一次性探针（只读）: 生成一个**真实的日志页渲染样本**，用来在浏览器里看排版。
//
// ── 为什么必须渲染 ──
//  行为断言（"请求体里有 14513 字"）已经绿了，但**"它在 `<pre>` 里滚起来是什么样"**
//  只有眼睛能判断：会不会撑破面板、会不会把 260px 的框撑长、`请求形态` 那行会不会溢出。
//
// ── 数据从哪来 ──
//  **用真实源码的拼法**（从 `更新输入.ts` 取那段逻辑），不手写一份假的 ——
//  手写就会测到"我以为的格式"，而不是产品实际产出的格式。
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const 此处 = path.dirname(fileURLToPath(import.meta.url));
const 根 = path.join(此处, '..', '..');
const 输出 = path.join(根, 'tests', 'fixtures', 'log-page-sample.html');

// ── 取真实 CSS ──
const css = readFileSync(path.join(根, 'src/彼方_NPC幕后生命状态系统/面板样式.css'), 'utf8');
const theme源 = readFileSync(path.join(根, 'src/彼方_NPC幕后生命状态系统/theme.ts'), 'utf8');

// ── 从 theme.ts 里取出深色 token，生成 CSS 变量 ──
// 只取 `深色` 那个对象里的 `键: '#xxxxxx'` —— 不 eval 整个模块（它有导出与类型）
const 深色段 = theme源.slice(theme源.indexOf('export const 深色'), theme源.indexOf('export const 浅色') > 0 ? theme源.indexOf('export const 浅色') : undefined);
const 变量们 = [...深色段.matchAll(/^\s{2}(\w+):\s*'([^']+)'/gm)].map(m => {
  // 驼峰转短横线：bf 的规则是 `--bf-` + 驼峰转 kebab
  const 名 = m[1].replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  return `  --bf-${名}: ${m[2]};`;
});
console.log('生成 CSS 变量', 变量们.length, '个');

// ── 用真实拼法造一份请求体（复刻 更新输入.ts 那段）──
const messages = [
  { role: 'system', content: '你是「彼方 / Elsewhere」——维护角色扮演世界幕后状态的系统。' },
  { role: 'user', content: '现在, 按上述全部规则开始执行任务。' },
];
// 工具说明：真实长度的长文本（14513 字，用带换行的段落，更接近真实）
const 段落 = Array.from({ length: 60 }, (_, i) =>
  `第 ${i + 1} 段规则：这里是一段相当长的规则说明文字，用来模拟真实的工具说明内容长度。NPC 的状态字段需要按正文结尾时刻推进，不得停留在开头或中间的状态上。`);
const 工具说明 = 段落.join('\n\n').slice(0, 14513);

const 请求体 = [
  ...messages.map(m => `【${m.role === 'system' ? '系统指令' : m.role === 'user' ? '用户' : '助手'}】\n${m.content}`),
  ...(工具说明 ? [`【工具说明】\n${工具说明}`] : []),
].join('\n\n────────\n\n');

// ── 复刻 `请求形态` 的数法（与 日志面板.ts 一致）──
const 段数 = (请求体.match(/【(系统指令|用户|助手)】/g) ?? []).length;
const 工具段 = 请求体.match(/【工具说明】\n([\s\S]*)$/);
const 请求形态 = 工具段
  ? `${段数} 条消息 + 工具说明 ${工具段[1].trim().length} 字`
  : `${段数} 条消息`;

const 转义 = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8">
<title>彼方 · 日志页渲染样本</title>
<style>
${变量们.join('\n')}
${css}
/* 样本容器：把面板放进一个固定尺寸的框里，模拟消息楼层里的实际宽度 */
html, body { margin: 0; padding: 0; background: #05070c; }
.样本壳 {
  width: 640px;              /* 消息楼层常见宽度 */
  height: 900px;
  margin: 24px auto;
  overflow: auto;
  border: 1px solid #2a3346;
  border-radius: 8px;
  background: var(--bf-canvas);
}
.bf-root { position: static; width: 100%; height: auto; overflow: visible; }
</style>
</head>
<body>
<div class="样本壳">
  <div class="bf-root bf-page-logs" data-theme="dark">
    <section class="bf-page bf-page-logs">
      <header class="bf-page-head">
        <div>
          <h2 class="bf-page-title">日志</h2>
          <p class="bf-page-sub">这一轮发送、输出与写入的内容。</p>
        </div>
      </header>

      <dl class="bf-log-meta">
        <div><dt>时间与耗时</dt><dd>22:05:31</dd></div>
        <div>
          <dt>发送 / 返回</dt>
          <dd>
            ${请求体.length} / 812 字
            <span class="bf-log-shape">${请求形态}</span>
          </dd>
        </div>
        <div><dt>更新人物 / 移除</dt><dd>泰丝、乔尔</dd></div>
        <div><dt>回复开头</dt><dd class="bf-log-meta-preview">她把信递过来，指尖在封口上按了按。</dd></div>
      </dl>

      <div class="bf-code-box">
        <div class="bf-code-head">
          <div class="bf-seg" role="group">
            <button class="bf-seg-btn active">发送的内容</button>
            <button class="bf-seg-btn">AI 返回</button>
            <button class="bf-seg-btn">世界书</button>
            <button class="bf-seg-btn">错误</button>
          </div>
          <button class="bf-btn bf-btn-sm">复制当前内容</button>
        </div>
        <pre class="bf-code bf-code-view">${转义(请求体)}</pre>
      </div>
    </section>
  </div>
</div>
</body>
</html>
`;

writeFileSync(输出, html, 'utf8');
console.log('已写入', 输出);
console.log('请求体长度:', 请求体.length);
console.log('请求形态:', 请求形态);
