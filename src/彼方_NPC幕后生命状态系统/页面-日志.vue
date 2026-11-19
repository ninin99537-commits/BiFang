<template>
  <section class="bf-page bf-page-logs">
    <header class="bf-page-head">
      <div>
        <h2 class="bf-page-title">日志</h2>
        <p class="bf-page-sub">这一轮发送、输出与写入的内容。</p>
      </div>
      <div class="bf-actions">
        <button class="bf-btn bf-btn-sm" :disabled="!可复制" @click="copyErrorReport">复制报错信息</button>
      </div>
    </header>

    <!-- 顶部失败横幅(§4.4 第 1 条): 只有本轮失败才出现, 两个独立复制按钮 + 清空调试记录 -->
    <div v-if="本轮失败" class="bf-log-alert" role="alert">
      <div class="bf-log-alert-main">
        <strong>上次更新失败</strong>
        <span class="bf-log-alert-when">
          {{ debugLog?.replyIds?.length ? `第 ${debugLog.replyIds[debugLog.replyIds.length - 1]} 楼` : '' }}
          {{ fmtTime(debugLog?.time) }}
        </span>
        <p class="bf-log-alert-reason">{{ (debugLog?.error ?? '').split('\n')[0] }}</p>
      </div>
      <div class="bf-log-alert-actions">
        <button class="bf-btn bf-btn-sm" @click="复制排障头">复制排障头</button>
        <button class="bf-btn bf-btn-sm" :disabled="!debugLog?.response" @click="复制返回开头">复制返回开头</button>
        <button class="bf-text-btn" @click="debugStore.clear()">清空调试记录</button>
      </div>
    </div>

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

    <template v-if="debugLog">
      <!-- 最近一次请求的元数据网格(§4.4 第 2 条) -->
      <dl class="bf-log-meta">
        <div>
          <dt>时间与耗时</dt>
          <dd>{{ fmtTime(debugLog.time) }}</dd>
        </div>
        <div>
          <dt>发送 / 返回</dt>
          <dd>{{ debugLog.request.length }} / {{ debugLog.response.length }} 字</dd>
        </div>
        <div>
          <dt>更新人物 / 移除</dt>
          <dd>
            {{ debugLog.updatedNpcs.join('、') || '—' }}
            <template v-if="debugLog.removedNpcs.length"> / {{ debugLog.removedNpcs.join('、') }}</template>
          </dd>
        </div>
        <div>
          <dt>回复开头</dt>
          <dd class="bf-log-meta-preview">{{ debugLog.replyPreview || '—' }}</dd>
        </div>
      </dl>

      <!-- 四标签合一代码检视窗(§4.4 第 3 条) -->
      <div class="bf-code-box">
        <div class="bf-code-head">
          <div class="bf-seg" role="group" aria-label="代码内容">
            <button
              v-for="标签 in 代码标签表"
              :key="标签.key"
              class="bf-seg-btn"
              :class="{ active: 代码标签 === 标签.key }"
              :aria-pressed="代码标签 === 标签.key"
              @click="代码标签 = 标签.key"
            >
              {{ 标签.标签 }}
            </button>
          </div>
          <button class="bf-btn bf-btn-sm" :disabled="!当前代码" @click="复制当前代码">
            {{ 已复制 ? '已复制 ✓' : '复制当前内容' }}
          </button>
        </div>
        <!-- 世界书快照: 右上角补一行写入时间与次数 -->
        <p v-if="代码标签 === 'worldbook' && mainPrompt" class="bf-code-note">
          上次写入 {{ fmtTime(mainPromptTime) }} · 累计 {{ mainPromptCount }} 次
        </p>
        <pre v-if="当前代码" class="bf-code bf-code-view">{{ 当前代码 }}</pre>
        <p v-else class="bf-code-empty">{{ 代码标签 === 'error' ? '本次请求无异常' : '（暂无内容）' }}</p>
      </div>

      <div class="bf-actions bf-log-actions">
        <button class="bf-btn bf-btn-primary bf-btn-sm" :disabled="!可复制" @click="copyErrorReport">复制报错内容发给助手</button>
        <button class="bf-btn bf-btn-sm" @click="debugStore.clear()">清空更新记录</button>
      </div>
    </template>
    <div v-else class="bf-empty">
      <span class="bf-empty-glyph" aria-hidden="true"></span>
      <p class="bf-empty-text">还没有更新日志</p>
      <p class="bf-empty-hint">手动或自动更新后，会记录本轮发送与输出的内容。</p>
    </div>

    <!-- 运行记录控制台流(§4.4 第 4 条): 等级过滤 + 时间/等级/正文三列 + 最新在上 -->
    <div class="bf-block-head bf-console-head">
      <h3 class="bf-block-title">运行记录</h3>
      <div class="bf-console-tools">
        <div class="bf-seg" role="group" aria-label="控制台等级过滤">
          <button
            v-for="等级 in 控制台等级表"
            :key="等级.key"
            class="bf-seg-btn"
            :class="{ active: 控制台等级 === 等级.key }"
            :aria-pressed="控制台等级 === 等级.key"
            @click="控制台等级 = 等级.key"
          >
            {{ 等级.标签 }}
          </button>
        </div>
        <button class="bf-text-btn" @click="consoleStore.clear()">清空记录</button>
      </div>
    </div>
    <div v-if="控制台显示.length === 0" class="bf-empty bf-console-empty">
      <p class="bf-empty-text">{{ consoleLines.length === 0 ? '暂无控制台输出' : '这个等级下没有记录' }}</p>
    </div>
    <ol v-else class="bf-console" aria-label="彼方脚本控制台输出">
      <li
        v-for="(line, index) in 控制台显示"
        :key="index"
        class="bf-console-line"
        :class="'bf-console-' + line.type"
      >
        <span class="bf-console-time">{{ fmtTime(line.time) }}</span>
        <span class="bf-console-level">{{ String(line.type).toUpperCase() }}</span>
        <span class="bf-console-text">{{ line.text }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { use日志面板, 规模警示属性 } from './日志面板';

const {
  debugLog, fmtTime, copyErrorReport, debugStore,
  mainPrompt, mainPromptTime, mainPromptCount,
  consoleLines, consoleStore,
  规模超线, token口径, 可复制,
  代码标签, 代码标签表, 当前代码, 已复制, 复制当前代码,
  控制台等级, 控制台等级表, 控制台显示,
  复制排障头, 复制返回开头, 本轮失败,
} = use日志面板();
</script>
