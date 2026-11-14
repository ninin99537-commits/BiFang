<template>
  <section class="bf-page bf-page-logs">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">日志</h2>
        <p class="bf-page-sub">这一轮发送、输出与写入的内容。</p>
      </div>
      <button class="bf-btn bf-btn-sm" :disabled="!可复制" @click="copyErrorReport">复制报错信息</button>
    </header>

    <!-- 规模行: 固定一行, 文案是需求钉死的契约; 超建议线只变黄 + 一句精简提示, 不阻止发送、不截断 -->
    <p
      v-if="debugLog && debugLog.规模行"
      class="bf-scale-line"
      :class="{ 'bf-scale-warn': 规模超线 }"
      v-bind="规模超线 ? 规模警示属性 : {}"
    >
      <span class="bf-scale-text">{{ debugLog.规模行 }}</span>
      <span v-if="规模超线" class="bf-scale-hint">可在仪表盘精简名单</span>
      <span class="bf-scale-rule">token 口径：{{ token口径 }}</span>
    </p>

    <div class="bf-logs">
      <section class="bf-log-col" aria-labelledby="bf-log-update-title">
        <h3 id="bf-log-update-title" class="bf-block-title">本轮更新</h3>
        <template v-if="debugLog">
          <dl class="bf-meta">
            <div><dt>更新楼层</dt><dd>#{{ debugLog.replyIds.length > 0 ? debugLog.replyIds.join('、#') : '—' }}</dd></div>
            <div><dt>模型</dt><dd>{{ debugLog.model || '—' }}</dd></div>
            <div><dt>更新时间</dt><dd>{{ fmtTime(debugLog.time) }}</dd></div>
            <div><dt>更新人物</dt><dd>{{ debugLog.updatedNpcs.join('、') || '—' }}</dd></div>
            <div v-if="debugLog.removedNpcs.length > 0"><dt>移除人物</dt><dd>{{ debugLog.removedNpcs.join('、') }}</dd></div>
            <div v-if="debugLog.replyPreview"><dt>回复开头</dt><dd class="bf-meta-preview">{{ debugLog.replyPreview }}</dd></div>
          </dl>

          <div class="bf-fold-block">
            <div class="bf-fold-head">
              <h4>发送给 AI 的内容</h4>
              <button class="bf-text-btn" @click="copyText(debugLog.request)">复制</button>
            </div>
            <details class="bf-fold">
              <summary>展开查看 · {{ debugLog.request.length }} 字</summary>
              <pre class="bf-code">{{ debugLog.request }}</pre>
            </details>
          </div>

          <div class="bf-fold-block">
            <div class="bf-fold-head">
              <h4>AI 输出内容</h4>
              <button class="bf-text-btn" @click="copyText(debugLog.response)">复制</button>
            </div>
            <details class="bf-fold">
              <summary>展开查看 · {{ debugLog.response.length }} 字</summary>
              <pre class="bf-code">{{ debugLog.response }}</pre>
            </details>
          </div>

          <div v-if="debugLog.error" class="bf-fold-block bf-fold-error">
            <div class="bf-fold-head">
              <h4>报错内容</h4>
              <button class="bf-text-btn" @click="copyText(debugLog.error)">复制</button>
            </div>
            <pre class="bf-code">{{ debugLog.error }}</pre>
          </div>

          <div class="bf-actions bf-log-actions">
            <button class="bf-btn bf-btn-primary bf-btn-sm" :disabled="!可复制" @click="copyErrorReport">复制报错内容发给助手</button>
            <button class="bf-btn bf-btn-sm" @click="debugStore.clear()">清空更新记录</button>
          </div>
        </template>
        <div v-else class="bf-empty">
          <p class="bf-empty-text">还没有更新日志</p>
          <p class="bf-empty-hint">手动或自动更新后，会记录本轮发送与输出的内容。</p>
        </div>
      </section>

      <section class="bf-log-col" aria-labelledby="bf-log-world-title">
        <h3 id="bf-log-world-title" class="bf-block-title">世界书写入</h3>
        <template v-if="mainPrompt">
          <p class="bf-note">
            记录于 {{ fmtTime(mainPromptTime) }} · 已记录 {{ mainPromptCount }} 次。写入角色卡主世界书的常驻条目，主 AI 与任何读取该世界书的环节读到的就是这一段。
          </p>
          <div class="bf-fold-block">
            <div class="bf-fold-head">
              <h4>幕后状态条目</h4>
              <button class="bf-text-btn" @click="copyText(mainPrompt)">复制</button>
            </div>
            <details class="bf-fold">
              <summary>展开查看 · {{ mainPrompt.length }} 字</summary>
              <pre class="bf-code">{{ mainPrompt }}</pre>
            </details>
          </div>
        </template>
        <div v-else class="bf-empty">
          <p class="bf-empty-text">还没有写入世界书的内容</p>
          <p class="bf-empty-hint">开启「写入世界书条目」并在更新后，这里会显示彼方写入的幕后状态。</p>
        </div>

        <div class="bf-block-head bf-console-head">
          <h3 class="bf-block-title">控制台</h3>
          <button class="bf-text-btn" @click="consoleStore.clear()">清空</button>
        </div>
        <div v-if="consoleLines.length === 0" class="bf-empty bf-console-empty">
          <p class="bf-empty-text">暂无控制台输出</p>
        </div>
        <ol v-else class="bf-console" aria-label="彼方脚本控制台输出">
          <li
            v-for="(line, index) in consoleLinesReversed"
            :key="index"
            class="bf-console-line"
            :class="'bf-console-' + line.type"
          >
            <span class="bf-console-time">{{ fmtTime(line.time) }}</span>
            <span class="bf-console-text">{{ line.text }}</span>
          </li>
        </ol>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { use日志面板, 规模警示属性 } from './日志面板';

const {
  debugLog, fmtTime, copyText, copyErrorReport, debugStore,
  mainPrompt, mainPromptTime, mainPromptCount,
  consoleLines, consoleLinesReversed, consoleStore,
  规模超线, token口径, 可复制,
} = use日志面板();
</script>
