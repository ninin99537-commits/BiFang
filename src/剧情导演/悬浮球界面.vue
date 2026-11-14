<template>
  <div class="dj-root" ref="rootEl" :style="根变量">
    <!-- 悬浮球: 仅作唤起器(可拖动/位置记忆) -->
    <div
      class="dj-orb"
      :class="{ open: panelOpen }"
      :style="orbStyle"
      :data-态="球状态"
      :aria-label="球悬停"
      role="button"
      :aria-expanded="panelOpen"
      tabindex="0"
      @pointerenter="显示球气泡()"
      @pointerleave="藏起球气泡()"
      @focus="显示球气泡()"
      @blur="藏起球气泡()"
      @keydown.enter.prevent="onOrbClick"
      @keydown.space.prevent="onOrbClick"
      @pointerdown="onOrbPointerDown"
      @click="onOrbClick"
    >
      <span class="dj-orb-ring" aria-hidden="true"></span>
      <!-- 第二轮方案 5.3: 张力弧(环长 = 张力/10) —— 不打开面板也看得出节奏; 与球标/环同一 grid 叠层 -->
      <svg class="dj-orb-arc" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17.5" pathLength="100" :stroke-dasharray="`${张力弧} 100`" />
      </svg>
      <!-- 本幕有确定事件/兑现目标时亮一个朱红点(右上角, grid 对齐, 不新增 absolute) -->
      <span v-if="有必演" class="dj-orb-dot" aria-hidden="true"></span>
      <span class="dj-orb-glyph" aria-hidden="true">
        <!-- 球标 = 场次刻度（自绘 SVG：单色 currentColor + 描边 1.6px + 宽取球的 47%）。
             球标只承担身份、不承担状态 —— 五态里形态不变，变的只有环/色/动效；
             「编排中」三根刻度依次亮起，prefers-reduced-motion 下静止。 -->
        <svg class="dj-mark" viewBox="0 0 24 24">
          <path class="dj-tk dj-tk1" d="M7 9.4v9.2" />
          <path class="dj-tk dj-tk2" d="M12 5.4v13.2" />
          <path class="dj-tk dj-tk3" d="M17 11v7.6" />
          <path class="dj-tk-base" d="M4.6 19.2h14.8" opacity="0.38" />
        </svg>
      </span>
    </div>

    <!-- 面板(iframe 打开时扩到"球∪面板"联合矩形, clip-path 裁成并集) -->
    <div v-if="panelOpen" class="dj-panel" ref="panelRef" :style="panelStyleRef">
      <header class="dj-head" ref="headerEl" @pointerdown="onPanelPointerDown">
        <span class="dj-title">剧情导演</span>
        <span class="dj-sub">{{ 副标题 }}</span>
        <button class="dj-x" @click="closePanel" title="关闭" aria-label="关闭面板">
          <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <nav class="dj-tabs">
        <button v-for="页 in 页列表" :key="页" :class="{ on: 当前页 === 页 }" :aria-current="当前页 === 页 ? 'page' : undefined" @click="当前页 = 页">{{ 页 }}</button>
        <button class="dj-theme" @click="切主题" :title="theme === 'dark' ? '切到白天' : '切到深色'" :aria-label="theme === 'dark' ? '切到白天' : '切到深色'">
          <svg v-if="theme === 'dark'" class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
          <svg v-else class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
        </button>
      </nav>

      <main class="dj-body">
        <!-- 本幕 -->
        <section v-if="当前页 === '本幕'" class="dj-sec">
          <!-- I 引擎可观测状态条: 优先级高于冷启动提示(故障不得再被冷启动伪装 —— R0 的教训) -->
          <div class="dj-card dj-status" :class="`dj-status-${状态条.级别}`">
            <div class="dj-status-h">
              <b>{{ 状态条.标题 }}</b>
              <button v-if="离线.自动暂停" class="dj-mini" @click="恢复自动接管">恢复自动接管</button>
              <button v-else-if="离线.连败次数 > 0" class="dj-mini" @click="清空离线计数">清除离线计数</button>
            </div>
            <p class="dj-p">{{ 状态条.明细 }}</p>
            <!-- 可观测性: 编排中给一条不确定态细进度条(面板开着的人也知道在跑) -->
            <div v-if="更新中" class="dj-progress" role="progressbar" aria-label="正在编排本幕"></div>
            <div v-if="剧终 && 待确认危险 !== '清除剧终'" class="dj-actions">
              <button class="dj-btn" @click="待确认危险 = '清除剧终'">清除已剧终（继续游玩）</button>
            </div>
            <div v-else-if="剧终" class="dj-confirm">
              <p class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>继续游玩会清掉剧终状态和全书结算成绩单，不能恢复。</span></p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="确认危险操作">确认继续游玩</button>
                <button class="dj-btn" @click="待确认危险 = ''">取消</button>
              </div>
            </div>
          </div>

          <div v-if="死亡待决" class="dj-card dj-death">
            <div class="dj-card-h">主角死亡 · 当场抉择</div>
            <p class="dj-hint">未抉择前暂停注入新指令。</p>
            <div v-if="!待确认剧终" class="dj-actions">
              <button v-for="项 in 死亡选项" :key="项" class="dj-btn" :class="{ danger: 项 === '剧终结算' }" @click="做死亡抉择(项)">{{ 项 }}</button>
            </div>
            <!-- F 二次确认: 剧终会永久停引擎且不可逆, 误点不得即生效 -->
            <div v-else class="dj-confirm">
              <p class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>确认「剧终结算」？剧终后引擎永久停止（不调引擎、不注入），剧情就此完结。</span></p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="确认剧终">确认剧终结算</button>
                <button class="dj-btn" @click="待确认剧终 = false">取消</button>
              </div>
            </div>
          </div>

          <!-- 平静模式(2026-11-08): 台上没有"现在演到哪一幕", 因为这一段没有幕。
               用 状态条.级别 === 'calm' 而不是直接读开关: 剧终/停用/离线 压过它, 三处口径必须同一处判断。 -->
          <div v-if="状态条.级别 === 'calm'" class="dj-card dj-desk">
            <div class="dj-card-h">平静中<span class="k">· 只记账，不下令</span></div>
            <p class="dj-desk-h">
              <b>已平静 {{ 账本.平静场数 ?? 0 }} 场</b><template v-if="账本.章回"> · 仍停在第 {{ 账本.章回.章号 }} 章《{{ 账本.章回.主题 }}》</template>
            </p>
            <p class="dj-p">这一段由你写：正文 AI 拿不到节拍、剧情参考、「本幕已确定」，也不会被催着收线。它只从「编剧备忘」看到已经公开的后果（谁死了、谁走了、什么不能反悔）。</p>
            <p class="dj-hint">
              账本里 {{ 账本.伏笔.length }} 条伏笔照常记着。<template v-if="到期待办.length">其中 {{ 到期待办.length }} 条按窗口已经该处理了，但<b>平静期不催</b> —— 关掉开关后会一条条安排，不会一次全放。</template><template v-else>没有到期的，放心过。</template>
            </p>
            <p class="dj-hint">章号为什么不动：伏笔的「最迟章」按章算，章停住它们就不会因为你过日子而过期。</p>
          </div>

          <!-- 第二轮方案 5.2: 导演台 —— 打开面板第一眼就是"现在演到哪、这一幕确定要发生什么"。
               2026-11-11: 平静刚结束那一轮也收起 —— 那时手上那道指令已经作废(注入层只出红线),
               台上再摆"本幕已确定 …"就是假信号; 空态由下面「发给正文 AI 的内容」那张卡说明原因。 -->
          <div v-if="!冷启动中 && 状态条.级别 !== 'calm' && !平静刚结束" class="dj-card dj-desk">
            <div class="dj-card-h">导演台</div>
            <p v-if="账本.章回" class="dj-desk-h">
              <b>第 {{ 账本.章回.章号 }} 章</b>《{{ 账本.章回.主题 }}》
              <span v-if="(账本.章回.幕纲 || []).length" class="dj-pips" :title="`第 ${账本.章回.当前幕号 || 1} / ${(账本.章回.幕纲 || []).length} 幕`">
                <i v-for="n in (账本.章回.幕纲 || []).length" :key="n" :class="{ on: n <= (账本.章回.当前幕号 || 1) }"></i>
              </span>
              <span v-if="账本.当前指令" class="dj-tag">{{ 账本.当前指令.节拍 }}</span>
            </p>
            <p v-if="本章进度 || 账本.世界时间" class="dj-desk-sub">
              <span v-if="账本.世界时间">第 {{ 世界天数 }} 天<template v-if="账本.世界时间.文本"> · {{ 账本.世界时间.文本 }}</template></span>
              <span v-if="本章进度" class="dj-desk-sep">{{ 本章进度 }}</span>
            </p>
            <p v-if="账本.当前指令?.必演" class="dj-must">
              <span class="dj-must-k">本幕已确定</span>{{ 账本.当前指令.必演.内容 }}<template v-if="账本.当前指令.必演.镜头外">（镜头外）</template><template v-if="账本.当前指令.必演.既成事实">（按既成事实写）</template>
            </p>
            <!-- 反全知: 导演自己过关的三问(他知道吗/证据/怎么办)。代码不判断对错, 只把它摊开给你看 -->
            <div v-if="(账本.当前指令?.知情核对 ?? []).length" class="dj-know">
              <div class="dj-know-h">知情核对（导演自查：这件事他知道吗）</div>
              <p v-for="(条, i) in 账本.当前指令?.知情核对 ?? []" :key="i" class="dj-muted">
                <span class="dj-tag">{{ 条.知道吗 }}</span>{{ 条.角色 }}<template v-if="条.事">：{{ 条.事 }}</template><template v-if="条.证据">（凭{{ 条.证据 }}）</template><template v-if="条.处理"> → {{ 条.处理 }}</template>
              </p>
            </div>
            <!-- H.7(2026-11-13): 首行判据 = `硬约束[0] ?? 硬性要求 首行`。
                 P0.5 之后「硬约束」才是代码对演员下的裁定（硬性要求降级成演法建议），
                 面板只显示后者 = 可观测性回退：真正在管这一场的那句话看不见。 -->
            <p v-if="(账本.当前指令?.硬约束 ?? []).length || 账本.当前指令?.硬性要求" class="dj-p">{{ 首行((账本.当前指令?.硬约束 ?? [])[0] ?? 账本.当前指令?.硬性要求 ?? '') }}</p>
            <!-- 中点(2026-11-12): 这一章的转折锚点 —— 摆出来, 才看得出"半程有没有翻面" -->
            <p v-if="账本.章回?.中点?.内容" class="dj-muted">
              <span class="dj-tag">{{ 账本.章回.中点.过了 ? '中点·已兑现' : '中点·未兑现' }}</span>
              {{ 账本.章回.中点.类型 }}：{{ 账本.章回.中点.内容 }}
            </p>
            <!-- 终局五步(2026-11-12): 收官期间每轮只走一步, 台上要说清现在第几步 -->
            <p v-if="收官请求" class="dj-muted"><span class="dj-tag">终局</span>第 {{ 终局步 }}/5 步</p>
            <div class="dj-tension">
              <b class="dj-tension-v">{{ 账本.张力?.当前 ?? 0 }}</b><span>/10</span>
              <div class="dj-bar"><i :style="{ width: ((账本.张力?.当前 ?? 0) * 10) + '%' }"></i></div>
            </div>
            <div class="dj-beats">
              <span v-for="(b, i) in (账本.张力?.最近节拍 ?? [])" :key="i" class="dj-beat">{{ b }}</span>
            </div>
            <!-- 手改这一层(2026-11-08 用户要求): 台上这些字段全是引擎产物, 以前只能看。
                 只开三个**真正影响演出**的口子(节拍 / 本幕已确定 / 硬性要求), 改完立刻重注给正文 AI。 -->
            <template v-if="账本.当前指令">
              <div class="dj-desk-edit">
                <button class="dj-mini" :aria-expanded="展开集.includes('改这一层')" @click="切展开('改这一层')">
                  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="M13.5 6.5l4 4" /></svg>
                  {{ 展开集.includes('改这一层') ? '收起编辑' : '改这一层' }}
                </button>
              </div>
              <div v-if="展开集.includes('改这一层')" class="dj-desk-form">
                <div class="dj-field">
                  <span>节拍</span>
                  <div class="dj-ctl-dd">
                    <button class="dj-select dj-ctl-dd-btn" aria-haspopup="listbox" :aria-expanded="打开的下拉 === '节拍'" @click="切下拉('节拍')" @keydown.esc="打开的下拉 = ''">
                      <span class="dj-ctl-val">{{ 指令草稿.节拍 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                    </button>
                    <ul v-if="打开的下拉 === '节拍'" class="dj-ctl-list" role="listbox" aria-label="本幕节拍">
                      <li
                        v-for="b in 节拍列表"
                        :key="b"
                        role="option"
                        tabindex="0"
                        :aria-selected="b === 指令草稿.节拍"
                        @click="选下拉(() => { 指令草稿.节拍 = b })"
                        @keydown.enter.prevent="选下拉(() => { 指令草稿.节拍 = b })"
                        @keydown.space.prevent="选下拉(() => { 指令草稿.节拍 = b })"
                        @keydown.down.prevent="移到相邻项($event, 1)"
                        @keydown.up.prevent="移到相邻项($event, -1)"
                      >{{ b }}</li>
                    </ul>
                  </div>
                </div>
                <label class="dj-field">本幕已确定（留空 = 这一幕没有确定事件）
                  <textarea v-model="指令草稿.必演内容" class="dj-input" rows="2" placeholder="例如：Lim 当场翻脸，把信撕了扔在你脸上"></textarea>
                </label>
                <div class="dj-inline">
                  <label class="dj-check"><input type="checkbox" v-model="指令草稿.必演镜头外" :aria-checked="!!指令草稿.必演镜头外" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>镜头外（正文只演“得知”）</label>
                  <label class="dj-check"><input type="checkbox" v-model="指令草稿.必演既成事实" :aria-checked="!!指令草稿.必演既成事实" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>按既成事实写</label>
                </div>
                <label class="dj-field">硬性要求（这一段要写成什么样）
                  <textarea v-model="指令草稿.硬性要求" class="dj-input" rows="4"></textarea>
                </label>
                <div class="dj-inline">
                  <button class="dj-btn" @click="保存指令草稿">应用到这一层</button>
                  <button class="dj-mini" @click="重置指令草稿">还原</button>
                </div>
                <p class="dj-hint">改完立刻重新注入，下一段正文按改后的演。<b>只影响这一层</b>——下一轮编排会重新生成指令。</p>
              </div>
            </template>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">{{ 状态条.级别 === 'calm' ? '发给正文 AI 的内容' : '发给正文 AI 的指令' }}<span v-if="账本.当前指令 && 状态条.级别 !== 'calm' && !平静刚结束" class="k">· 第 {{ 账本.当前指令.编号 }} 道</span></div>
            <template v-if="指令预览">
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('指令全文')" @click="切展开('指令全文')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>指令全文<span class="dj-ctl-n">{{ 展开集.includes('指令全文') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('指令全文') }"><pre class="dj-pre">{{ 指令预览 }}</pre></div>
            </template>
            <p v-else class="dj-empty"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>{{ 冷启动提示 }}</p>
            <!-- 代码调整上面板(批次二): 只读 账本.当前指令.代码调整, 无触发时整块不渲染(不留噪音) -->
            <div v-if="代码调整.length" class="dj-adjust">
              <div class="dj-adjust-h">本轮代码规则触发（{{ 代码调整.length }}）</div>
              <ul class="dj-adjust-list">
                <li v-for="(项, i) in 代码调整" :key="i">{{ 项 }}</li>
              </ul>
            </div>
            <div v-if="待确认危险 !== '清空' && 待确认危险 !== '清理世界书'" class="dj-actions">
              <button class="dj-btn" :disabled="!账本.当前指令 || 状态条.级别 === 'calm'" :title="状态条.级别 === 'calm' ? '平静模式不下令，没有可跳过的指令（跳过会让那条命运必演被丢掉）' : '这一幕不按导演指令演（不调用接口）'" @click="跳过本幕"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>跳过本幕</button>
              <button v-if="更新中" class="dj-btn danger" title="中断本次编排, 不会写入任何数据" @click="updatingStore.cancel()">中断编排</button>
              <button v-else class="dj-btn" title="这一层已经推过就撤掉重排，没推过就直接编排（会调用一次接口）" @click="手动推进">重新推进</button>
              <button class="dj-btn danger" :disabled="更新中" :title="更新中 ? '编排中不能清空，先中断编排' : '删掉这个聊天的全部导演记录'" @click="待确认危险 = '清空'">清空账本</button>
              <!-- 手动清理: 历届版本在世界书里留下的导演条目(【导演】角色状态 / 【导演指令 …) 一键删干净 -->
              <button class="dj-btn danger" title="删除世界书里所有导演条目(含旧版本命名), 不影响你自己的条目" @click="待确认危险 = '清理世界书'">清理世界书条目</button>
            </div>
            <!-- 二次确认: 两个都不可撤销 -->
            <div v-else class="dj-confirm">
              <p class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>{{ 待确认危险 === '清空' ? '清空这个聊天的全部导演记录（章回、伏笔、人物、书纲进度）？不能撤销，之后从下一条消息重新开始记。' : '删除世界书里所有导演写的条目？不能撤销；你自己的条目不受影响，开着导演的话下一轮会重新写备忘。' }}</span></p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="确认危险操作">{{ 待确认危险 === '清空' ? '确认清空' : '确认删除' }}</button>
                <button class="dj-btn" @click="待确认危险 = ''">取消</button>
              </div>
            </div>
          </div>

          <div v-if="活跃冲突.length" class="dj-card">
            <div class="dj-card-h">活跃冲突</div>
            <div v-for="c in 活跃冲突" :key="c.名" class="dj-row">
              <b>{{ c.名 }}</b><span class="dj-tag">{{ c.阶段 }}</span><span class="dj-muted">强度 {{ c.强度 }}/10</span>
              <p class="dj-p">{{ c.下一步 }}</p>
            </div>
          </div>
        </section>

        <!-- 账本 -->
        <!-- 第二轮方案 2.1: 书纲 —— 默认整页折叠(点开才看), 可编辑 / 锁定 / 否决重写 / 整份重写 -->
        <section v-else-if="当前页 === '书纲'" class="dj-sec">
          <div class="dj-card">
            <div class="dj-card-h">书纲<span class="k">· 只有导演和你看得到，不会发给正文 AI</span></div>
            <template v-if="!书纲已揭开">
              <p class="dj-p">书纲里是这本书最后要揭开的真相。想自己玩出意外，就别点开。</p>
              <div class="dj-actions">
                <button class="dj-btn" @click="书纲已揭开 = true">
                  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>查看书纲
                </button>
              </div>
            </template>
            <template v-else-if="!账本.书纲">
              <p class="dj-empty">还没有书纲。{{ 书纲覆盖.请求重写 ? '已请求生成，下一轮推进时导演会写。' : `导演会在第 ${设置.导演.接管轮数} 轮推进时写（老聊天在下一轮推进时根据已有剧情反推）。` }}</p>
            </template>
            <template v-else>
              <div class="dj-field">
                <label>核心问题</label>
                <input class="dj-input" :value="书纲覆盖.核心问题 ?? 账本.书纲.核心问题" placeholder="这本书最终回答什么" @change="改核心问题(($event.target as HTMLInputElement).value)" />
              </div>
              <!-- 欲望 = 全剧脊梁(2026-11-12): 判据是"这一幕有没有推进或复杂化它", 所以必须能看见、能改 -->
              <div class="dj-field">
                <label>主角欲望<span class="dj-muted">（具体、可失败；这一幕推进或复杂化它了吗）</span></label>
                <input
                  class="dj-input"
                  :value="书纲覆盖.欲望 ?? 账本.书纲.欲望?.想要 ?? ''"
                  placeholder="例：把妹妹从北区带出来（不是「变强」）"
                  @change="改欲望(($event.target as HTMLInputElement).value)"
                />
                <p v-if="账本.书纲.欲望 && (账本.书纲.欲望.为什么是现在 || 账本.书纲.欲望.输了失去)" class="dj-hint">
                  <template v-if="账本.书纲.欲望.为什么是现在">为什么是现在：{{ 账本.书纲.欲望.为什么是现在 }}；</template>
                  <template v-if="账本.书纲.欲望.输了失去">输了会失去：{{ 账本.书纲.欲望.输了失去 }}</template>
                </p>
              </div>
              <!-- B 线(2026-11-12): 主题在它身上被讨论, 也是"不靠打架推进"的那条线 -->
              <div class="dj-field">
                <label>B 线<span class="dj-muted">（谁 · 在争什么；主题在这里讨论）</span></label>
                <input
                  class="dj-input"
                  :value="书纲覆盖.B线 ?? 账本.书纲.B线?.争什么 ?? ''"
                  placeholder="例：和 Joel 争「救人到底值不值」"
                  @change="改B线(($event.target as HTMLInputElement).value)"
                />
                <p v-if="账本.书纲.B线?.现在到哪" class="dj-hint">
                  现在到哪：{{ 账本.书纲.B线.现在到哪 }}<template v-if="账本.书纲.B线?.谁">（{{ 账本.书纲.B线.谁 }}）</template>
                </p>
              </div>
              <p v-if="!账本.书纲.深层真相.length" class="dj-empty">导演还没写深层真相。可以点下面「整份重写」让它下一轮补上。</p>
              <div v-for="t in 账本.书纲.深层真相" :key="t.ID" class="dj-row">
                <b>真相 {{ t.ID }}</b>
                <span class="dj-tag">{{ t.状态 }}</span>
                <span v-if="t.锁定" class="dj-tag">已锁定</span>
                <span v-if="t.来源 === '用户'" class="dj-tag">你改过</span>
                <span class="dj-muted">已挂伏笔：{{ (书纲挂靠[t.ID] || []).map(n => '#' + n).join('、') || '还没有' }}</span>
                <template v-if="t.状态 !== '已废弃'">
                  <textarea class="dj-input" rows="2" :value="t.真相" @change="改真相(t.ID, '真相', ($event.target as HTMLTextAreaElement).value)"></textarea>
                  <div class="dj-field">
                    <label>揭晓时机</label>
                    <input class="dj-input" :value="t.揭晓时机" @change="改真相(t.ID, '揭晓时机', ($event.target as HTMLInputElement).value)" />
                  </div>
                  <p v-if="t.线索计划.length" class="dj-muted">线索计划：{{ t.线索计划.join('；') }}</p>
                  <div class="dj-actions">
                    <button class="dj-btn" @click="切锁定(t.ID, !t.锁定)">{{ t.锁定 ? '解锁' : '锁定（导演不能改）' }}</button>
                    <button v-if="待否决 !== t.ID" class="dj-btn danger" @click="待否决 = t.ID; 否决原因 = ''">否决重写</button>
                  </div>
                  <div v-if="待否决 === t.ID" class="dj-field">
                    <label>为什么不要它（可空，导演重写时参考）</label>
                    <input v-model="否决原因" class="dj-input" placeholder="比如：太俗套 / 和人设冲突" />
                    <div class="dj-actions">
                      <button class="dj-btn danger" @click="否决真相(t.ID)">确认否决</button>
                      <button class="dj-btn" @click="待否决 = ''">取消</button>
                    </div>
                  </div>
                </template>
                <p v-else class="dj-muted">{{ t.真相 }}（{{ t.修订原因[t.修订原因.length - 1] || '已废弃' }}）</p>
              </div>
              <template v-if="账本.书纲.人物暗线.length">
                <div class="dj-card-h" style="margin-top: 10px">人物暗线</div>
                <div v-for="r in 账本.书纲.人物暗线" :key="r.角色ID" class="dj-row">
                  <b>{{ r.角色ID }}</b>
                  <p class="dj-p">{{ r.暗线 }}</p>
                </div>
              </template>
              <div class="dj-actions">
                <button v-if="!待确认重写书纲" class="dj-btn" :disabled="书纲覆盖.请求重写" @click="待确认重写书纲 = true">{{ 书纲覆盖.请求重写 ? '已请求重写（下一轮生效）' : '整份重写' }}</button>
                <template v-else>
                  <span class="dj-p">锁定和你改过的保留，其余由导演重写；已埋的伏笔不删。</span>
                  <button class="dj-btn danger" @click="请求重写书纲">确认重写</button>
                  <button class="dj-btn" @click="待确认重写书纲 = false">取消</button>
                </template>
                <button class="dj-btn" @click="书纲已揭开 = false">收起</button>
              </div>
            </template>
          </div>
        </section>

        <section v-else-if="当前页 === '账本'" class="dj-sec">
          <!-- 全书结算(规格 B3): 只在剧终后出现; 数字**只读 落幕那一刻的快照(指标.终值)**, 不在这里重算 -->
          <div v-if="剧终 && 终值" class="dj-card dj-final">
            <div class="dj-card-h">全书结算（定格在落幕那一刻）</div>
            <div class="dj-metrics">
              <span class="dj-metric"><b :class="{ 'dj-bad': 终值.伏笔回收率异常 }">{{ 回收率文本of(终值) }}</b>伏笔回收率<em>已了结 {{ 终值.明细.累计了结 }}/{{ 终值.明细.累计埋设 }}</em></span>
              <span class="dj-metric"><b>{{ 张力文本(终值.张力峰) }}/{{ 张力文本(终值.张力谷) }}</b>张力峰/谷<em>起伏 {{ 终值.起伏次数 }} 次</em></span>
              <span class="dj-metric"><b>{{ 终值.冲突推进数 }}</b>冲突推进<em>{{ 终值.明细.已结算章数 }} 章记账</em></span>
              <span class="dj-metric"><b>{{ 终值.受挫次数 }}</b>受挫次数</span>
              <span class="dj-metric"><b>{{ 百分比(终值.指令执行率) }}</b>指令执行率<em>{{ 终值.明细.核验总 }} 次核验</em></span>
            </div>
          </div>
          <p class="dj-hint">修笔：直接改下面的状态就会保存（删掉中间楼层后，用来手动纠正）。</p>
          <div class="dj-card">
            <div class="dj-card-h">章回</div>
            <template v-if="账本.章回">
              <p><b>第 {{ 账本.章回.章号 }} 章</b>《{{ 账本.章回.主题 }}》<span class="dj-tag">{{ 账本.章回.进度 }}</span></p>
              <p
                class="dj-muted dj-fold"
                :class="{ 'dj-folded': 章回可点() }"
                :role="章回可点() ? 'button' : undefined"
                :tabindex="章回可点() ? 0 : undefined"
                :title="章回可点() ? 揭开提示(章回折叠中()) : undefined"
                @click="章回可点() && 点开(章回键)"
                @keydown.enter.prevent="章回可点() && 点开(章回键)"
                @keydown.space.prevent="章回可点() && 点开(章回键)"
              >
                <svg v-if="章回可点()" class="i dj-fold-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <template v-if="章回折叠中()"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></template>
                  <template v-else><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" /><path d="M6.3 6.4A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4-.8" /></template>
                </svg>计划高潮：{{ 章回折叠中() ? 折叠文案('章回') : (账本.章回?.计划高潮 || '—') }}</p>
            </template>
            <p v-else class="dj-empty">还没有章回。导演从第 {{ 设置.导演.接管轮数 }} 轮开始分章。</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">伏笔账</div>
            <!-- 阶段 A: 证据链与后台真相只在面板可见(导演私密), 且默认折叠 —— 与"防剧透"同一口径 -->
            <p class="dj-hint">每条伏笔的证据（记忆插件里的条目编号）和幕后真相只在这里显示；发给正文 AI 的只有「公开线头」。「场」= 导演编排的第几次。</p>
            <div v-for="s in 账本.伏笔" :key="s.编号" class="dj-row">
              <b>#{{ s.编号 }}</b>
              <!-- 自绘下拉（规格 §1.1-3）：button + 就地展开的 listbox —— 不再有原生下拉外观、也不新增 absolute -->
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '伏' + s.编号"
                  @click="切下拉('伏' + s.编号)"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ s.状态 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '伏' + s.编号" class="dj-ctl-list" role="listbox" aria-label="伏笔状态">
                  <li
                    v-for="st in 伏笔状态列表"
                    :key="st"
                    role="option"
                    tabindex="0"
                    :aria-selected="st === s.状态"
                    @click="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.enter.prevent="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.space.prevent="选下拉(() => 改伏笔状态(s.编号, st))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ st }}</li>
                </ul>
              </div>
              <span class="dj-muted">{{ s.回收窗口 || '—' }}</span>
              <!-- 优化 6: 时间轴 —— 埋在第几场 → 最后露面 → 隔了多久(到回响线变金色) -->
              <div v-if="时间轴(s)" class="dj-tl" :class="{ warn: 时间轴(s)!.该回响 }">
                <span class="dj-tl-k">{{ 时间轴(s)!.跨度 }}线{{ s.书纲ID ? ' · 挂书纲 ' + s.书纲ID : '' }}</span>
                <span class="dj-tl-bar"><i :style="{ width: 时间轴(s)!.比例 + '%' }"></i></span>
                <span class="dj-tl-n">第 {{ 时间轴(s)!.埋设场 }} 场埋<template v-if="时间轴(s)!.最后回响场"> · 第 {{ 时间轴(s)!.最后回响场 }} 场回响</template> · 隔 {{ 时间轴(s)!.隔 }} 场<template v-if="时间轴(s)!.回响线">/{{ 时间轴(s)!.回响线 }}</template></span>
              </div>
              <p
                class="dj-p dj-fold"
                :class="{ 'dj-folded': 伏笔可点(s) }"
                :role="伏笔可点(s) ? 'button' : undefined"
                :tabindex="伏笔可点(s) ? 0 : undefined"
                :title="伏笔可点(s) ? 揭开提示(伏笔折叠中(s)) : undefined"
                @click="伏笔可点(s) && 点开(伏笔键(s.编号))"
                @keydown.enter.prevent="伏笔可点(s) && 点开(伏笔键(s.编号))"
                @keydown.space.prevent="伏笔可点(s) && 点开(伏笔键(s.编号))"
              >
                <svg v-if="伏笔可点(s)" class="i dj-fold-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <template v-if="伏笔折叠中(s)"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></template>
                  <template v-else><path d="M3 3l18 18" /><path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1" /><path d="M6.3 6.4A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4-.8" /></template>
                </svg>{{ 伏笔折叠中(s) ? 折叠文案('伏笔') : s.内容 }}</p>
              <!-- 阶段 A 证据链: 公开线头 / 幕后真相 / AM 证据 / 兑现条件 —— 导演私密, 只在这里 -->
              <p v-if="s.公开线头" class="dj-muted">公开线头：{{ s.公开线头 }}</p>
              <p v-if="s.幕后真相" class="dj-muted">幕后真相：{{ s.幕后真相 }}<template v-if="(s.真相修订原因 || []).length">（修订：{{ (s.真相修订原因 || []).join('；') }}）</template></p>
              <p v-if="(s.埋设证据 || []).length || (s.中间回响 || []).length || (s.兑现证据 || []).length" class="dj-muted">
                证据：
                <template v-if="(s.埋设证据 || []).length">
                  埋设 {{ 证据行(s.埋设证据, 证据展开中(s.编号, '埋设')) }}<button v-if="(s.埋设证据 || []).length > 3" class="dj-mini dj-ev-more" @click="切换证据展开(s.编号, '埋设')">{{ 证据展开中(s.编号, '埋设') ? '收起' : `展开 ${(s.埋设证据 || []).length} 条` }}</button>
                </template>
                <template v-if="(s.中间回响 || []).length">
                  ｜回响 {{ 证据行(s.中间回响, 证据展开中(s.编号, '回响')) }}<button v-if="(s.中间回响 || []).length > 3" class="dj-mini dj-ev-more" @click="切换证据展开(s.编号, '回响')">{{ 证据展开中(s.编号, '回响') ? '收起' : `展开 ${(s.中间回响 || []).length} 条` }}</button>
                </template>
                <template v-if="(s.兑现证据 || []).length">
                  ｜兑现 {{ 证据行(s.兑现证据, 证据展开中(s.编号, '兑现')) }}<button v-if="(s.兑现证据 || []).length > 3" class="dj-mini dj-ev-more" @click="切换证据展开(s.编号, '兑现')">{{ 证据展开中(s.编号, '兑现') ? '收起' : `展开 ${(s.兑现证据 || []).length} 条` }}</button>
                </template>
              </p>
              <p v-if="(s.兑现条件 || []).length" class="dj-muted">兑现条件：{{ (s.兑现条件 || []).join('；') }}</p>
              <p v-if="(s.候选兑现 || []).length" class="dj-muted">候选兑现：{{ (s.候选兑现 || []).join('；') }}</p>
            </div>
            <p v-if="!(账本.伏笔 || []).length" class="dj-empty">还没有伏笔。导演会在第 {{ 设置.导演.接管轮数 }} 轮开始埋。</p>
            <p v-if="(账本.历史档案?.伏笔 || []).length" class="dj-muted">已归档 {{ 账本.历史档案.伏笔.length }} 条（已引爆/已消亡，保留完整证据链；不占活跃工作集）</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">冲突账</div>
            <div v-for="c in 账本.冲突" :key="c.名" class="dj-row">
              <b>{{ c.名 }}</b>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '冲' + c.名"
                  @click="切下拉('冲' + c.名)"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ c.阶段 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '冲' + c.名" class="dj-ctl-list" role="listbox" aria-label="冲突阶段">
                  <li
                    v-for="st in 冲突阶段列表"
                    :key="st"
                    role="option"
                    tabindex="0"
                    :aria-selected="st === c.阶段"
                    @click="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.enter.prevent="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.space.prevent="选下拉(() => 改冲突阶段(c.名, st))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ st }}</li>
                </ul>
              </div>
              <p class="dj-p">赌注：{{ c.赌注 || '—' }}｜下一步：{{ c.下一步 || '—' }}</p>
            </div>
            <p v-if="!(账本.冲突 || []).length" class="dj-empty">还没有登记冲突。</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">角色弧线</div>
            <div v-for="a in 账本.弧线" :key="a.角色" class="dj-row">
              <b>{{ a.角色 }}</b>
              <input class="dj-input dj-input-sm" :value="a.阶段" @change="改弧线阶段(a.角色, ($event.target as HTMLInputElement).value)" />
              <p class="dj-p">缺口：{{ a.缺口 || '—' }}｜契机：{{ a.下一步契机 || '—' }}</p>
            </div>
            <p v-if="!(账本.弧线 || []).length" class="dj-empty">还没有角色弧线。</p>
          </div>

          <!-- 阶段 B: 角色命运册(只读展示) —— 不可逆状态是硬约束, 面板要能看见它, 否则"为什么这一幕不许死者出场"无从核对 -->
          <div class="dj-card">
            <div class="dj-card-h">角色命运册</div>
            <p class="dj-hint">死亡、离场、永久后果与未解矛盾会约束后续每一幕，不会因为弧线闭环而消失。点「保护」把这个人加进保护名单。</p>
            <div v-for="m in 账本.角色命运 || []" :key="m.角色ID" class="dj-row dj-fate" :class="命运状态类(m.状态)">
              <b>{{ m.角色ID }}</b>
              <span class="dj-tag dj-fate-st">{{ m.状态 }}</span>
              <span v-if="m.位置" class="dj-muted">{{ m.位置 }}</span>
              <button
                class="dj-mini dj-protect"
                :class="{ on: 受保护(m.角色ID) }"
                :aria-pressed="受保护(m.角色ID)"
                :title="受保护(m.角色ID) ? '在保护名单里：不会死、不会离开。点一下移出' : '加入保护名单：之后不会死、不会离开'"
                @click="切保护(m.角色ID)"
              >{{ 受保护(m.角色ID) ? '保护中' : '保护' }}</button>
              <p class="dj-p">
                独立目标：{{ (m.独立目标 || []).join('；') || '—' }}
                <!-- 持久后果以结构化字段为准(带状态); 老账本只有字符串「永久后果」时才退回显示它 -->
                <template v-if="生效后果(m).length">｜持久后果：{{ 生效后果(m).join('；') }}</template>
                <template v-else-if="(m.永久后果 || []).length">｜永久后果：{{ (m.永久后果 || []).join('；') }}</template>
                <template v-if="(m.承诺与债务 || []).length">｜债务：{{ (m.承诺与债务 || []).join('；') }}</template>
                <template v-if="(m.未竟计划 || []).length">｜未竟计划：{{ (m.未竟计划 || []).join('；') }}</template>
              </p>
              <p v-for="r in m.当前关系 || []" :key="r.对方ID" class="dj-muted">与 {{ r.对方ID }}：{{ r.关系 }}<template v-if="r.未解矛盾">（矛盾未解：{{ r.未解矛盾 }}）</template></p>
            </div>
            <p v-if="!(账本.角色命运 || []).length" class="dj-empty">还没有人物记录。有人受伤、离开或死亡时会记在这里。</p>
          </div>

          <!-- 阶段 A: 记忆审计(只读) —— 让"这一轮到底读了哪些 AM、有没有缺失"可回看 -->
          <div class="dj-card">
            <div class="dj-card-h">记忆审计（最近一轮）</div>
            <template v-if="账本.记忆审计">
              <p class="dj-p">
                请求 {{ 账本.记忆审计.请求条数 }} 条 · 完整读到 {{ 账本.记忆审计.读到条数 }} 条 · 索引 {{ 账本.记忆审计.索引条数 }} 条 ·
                纪要 {{ 账本.记忆审计.纪要字数 }} 字
              </p>
              <p class="dj-muted">主 AI 本轮召回：{{ (账本.记忆审计.主AI召回 || []).join('、') || '读不到（记忆插件未装或格式变了；前情会全部附原文）' }}</p>
              <p v-if="账本.记忆审计.缺失.length" class="dj-err-line">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>证据缺失：{{ 账本.记忆审计.缺失.join('、') }}（依赖它们的关键回收降级为待核，不冒充已兑现）</span>
              </p>
              <p v-if="账本.记忆审计.歧义.length" class="dj-err-line">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>引用歧义：{{ 账本.记忆审计.歧义.join('、') }}（同一条 AM 命中多条纪要，已把每一条完整正文都发给导演）</span>
              </p>
              <p v-if="账本.记忆审计.索引外.length" class="dj-muted">索引外申请：{{ 账本.记忆审计.索引外.join('、') }}（当前 250 条索引里没有，按账本登记直接调档）</p>
              <p v-if="账本.记忆审计.失败原因" class="dj-err-line">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>记忆读取失败：{{ 账本.记忆审计.失败原因 }}（账本与待读队列已保留，未删条目）</span>
              </p>
              <p v-if="(账本.待读队列 || []).length" class="dj-muted">待读队列 {{ 账本.待读队列.length }} 条：{{ 账本.待读队列.map(t => t.记忆引用).join('、') }}（下一轮完整读取）</p>
            </template>
            <p v-else class="dj-empty">还没有读取记录（下一轮编排后出现）</p>
          </div>

          <!-- 终局操作(规格 B1/B2 第二段): 与结算卡同页(语义自洽)。「清空账本」保持在原处不移动(DOM 契约优先) -->
          <div class="dj-card dj-final-ops">
            <div class="dj-card-h">终局操作</div>
            <p class="dj-hint">不依赖主角死亡也能走到结局：先编排一幕<b>收束幕</b>（回收剩余伏笔、收束主线），演完后由你确认落幕。</p>
            <div v-if="!剧终 && !账本.收官请求 && !待确认结算" class="dj-actions">
              <button class="dj-btn danger" @click="待确认结算 = true">做全书结算</button>
            </div>
            <div v-if="待确认结算 && !剧终 && !账本.收官请求" class="dj-confirm">
              <p class="dj-err-line">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>确认「做全书结算」？将编排一幕<b>收束幕</b>（回收剩余伏笔、收束主线），演完后由你确认落幕；剧终后自动路径停摆（可「清除已剧终」恢复）。</span>
              </p>
              <div class="dj-actions">
                <button class="dj-btn danger" @click="做全书结算">确认收官（编排收束幕）</button>
                <button class="dj-btn" @click="待确认结算 = false">取消</button>
              </div>
            </div>
            <div v-if="账本.收官请求 && !剧终" class="dj-adjust">
              <div class="dj-adjust-h">收官进行中：下一道指令已编排为收束幕，主 AI 演完这一幕后由你拍板。</div>
              <div v-if="!待确认落幕" class="dj-actions">
                <button class="dj-btn danger" @click="待确认落幕 = true">确认剧终</button>
              </div>
              <div v-else class="dj-confirm">
                <p class="dj-err-line">
                  <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                  <span>确认落幕？剧终后自动路径整体停摆（不调引擎、不注入），可到「本幕」页「清除已剧终」恢复游玩。</span>
                </p>
                <div class="dj-actions">
                  <button class="dj-btn danger" @click="确认剧终">确认剧终</button>
                  <button class="dj-btn" @click="待确认落幕 = false">取消</button>
                </div>
              </div>
            </div>
            <p v-if="剧终" class="dj-ok-line">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              <span>已剧终：自动路径停摆。想继续游玩请到「本幕」页点「清除已剧终」（会一并清掉收官请求与结算快照）。</span>
            </p>
          </div>
        </section>

        <!-- 日志 -->
        <section v-else-if="当前页 === '日志'" class="dj-sec">
          <!-- J 指标卡(只读指标账): 第二轮方案 5.2 从本幕页挪到这里(诊断) -->
          <div class="dj-card">
            <div class="dj-card-h">数据<span class="k">· 伏笔回收、张力起伏、指令执行</span></div>
            <div class="dj-metrics">
              <!-- 回收率 = **队列口径**(同一批伏笔的比), 不用章节统计求和(那会算出 >100%, 见 P1 111%)。
                   数字直接取 判据.明细(来自 账本.指标.累计了结/累计埋设), 面板不另算一套。 -->
              <span class="dj-metric">
                <b :class="{ 'dj-bad': 指标.伏笔回收率异常 }">{{ 回收率文本 }}</b>伏笔回收率
                <em v-if="指标.伏笔回收率异常">数据异常：累计了结 {{ 指标.明细.累计了结 }} &gt; 累计埋设 {{ 指标.明细.累计埋设 }}（见日志）</em>
                <em v-else>已了结 {{ 指标.明细.累计了结 }}/{{ 指标.明细.累计埋设 }}</em>
              </span>
              <span class="dj-metric"><b>{{ 张力文本(指标.张力峰) }}/{{ 张力文本(指标.张力谷) }}</b>张力峰/谷<em>本章起伏 {{ 章起伏 }}</em></span>
              <span class="dj-metric"><b>{{ 指标.冲突推进数 }}</b>冲突推进<em>已结算 {{ 指标.明细.已结算章数 }} 章</em></span>
              <span class="dj-metric"><b>{{ 指标.受挫次数 }}</b>受挫次数</span>
              <span class="dj-metric"><b>{{ 百分比(指标.指令执行率) }}</b>指令执行率<em>{{ 指标.明细.核验总 }} 次核验</em></span>
            </div>
            <div class="dj-spark">
              <i v-for="(v, i) in 指标.张力波形" :key="i" :style="{ height: Math.max(3, Math.round(v * 2.4)) + 'px' }" :title="`张力 ${v}/10`"></i>
              <span v-if="!指标.张力波形.length" class="dj-empty">
                <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>尚无张力历史（推进一轮后出现）
              </span>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">
              最近一次引擎调用
              <button class="dj-mini" @click="复制报错">复制报错发给助手</button>
            </div>
            <p v-if="!debug" class="dj-empty"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>暂无记录</p>
            <template v-else>
              <p class="dj-muted">模型：{{ debug.model || '—' }}｜楼层：#{{ (debug.replyIds || []).join(', #') }}</p>
              <p v-for="(n, i) in debug.备注" :key="i" class="dj-muted">· {{ n }}</p>
              <!-- 自绘披露（规格 §1.1-4）：自绘折角 caret + 高度动效 + aria-expanded, 不再有原生折叠三角 -->
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('请求内容')" @click="切展开('请求内容')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>请求内容<span class="dj-ctl-n">{{ 展开集.includes('请求内容') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('请求内容') }"><pre class="dj-pre">{{ debug.request }}</pre></div>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('AI 输出')" @click="切展开('AI 输出')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>AI 输出<span class="dj-ctl-n">{{ 展开集.includes('AI 输出') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('AI 输出') }"><pre class="dj-pre">{{ debug.response }}</pre></div>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('报错')" @click="切展开('报错')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>报错<span class="dj-ctl-n">{{ 展开集.includes('报错') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('报错') }"><pre class="dj-pre dj-err">{{ debug.error }}</pre></div>
              <!-- 每次尝试各留一份(v2.8.5 D1): 出过重试时, 失败那次的完整原文在这里 -->
              <template v-if="debug.尝试 && debug.尝试.length > 1">
                <button class="dj-ctl-disc" :aria-expanded="展开集.includes('每次尝试')" @click="切展开('每次尝试')">
                  <span class="dj-ctl-caret" aria-hidden="true"></span>每次尝试（{{ debug.尝试.length }} 次）<span class="dj-ctl-n">{{ 展开集.includes('每次尝试') ? '收起' : '展开' }}</span>
                </button>
                <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('每次尝试') }">
                  <template v-for="项 in debug.尝试" :key="项.次">
                    <p class="dj-muted">第 {{ 项.次 }} 次 · {{ 项.错误 ? '失败：' + 项.错误 : '通过' }}</p>
                    <pre class="dj-pre" :class="{ 'dj-err': !!项.错误 }">{{ 项.原文 || '（这次没拿到输出）' }}</pre>
                  </template>
                </div>
              </template>
            </template>
          </div>
          <div class="dj-card">
            <div class="dj-card-h">控制台
              <button class="dj-mini" @click="consoleStore.clear()">清空</button>
            </div>
            <pre class="dj-pre dj-console">{{ 控制台文本 }}</pre>
          </div>
        </section>

        <!-- 设置 -->
        <section v-else class="dj-sec">
          <!-- 第二轮方案 5.2: 决定剧情走向的设置放最上面(强度 + 红线 + 保护名单) -->
          <div class="dj-card">
            <div class="dj-card-h">剧情走向</div>
            <!-- 自绘滑块（规格 §1.1-1）：appearance:none + ::-webkit-slider-* / ::-moz-range-*，
                 已填充段按值联动、刻度 1–4 可读、键盘 ←→/Home/End 原生可用、:focus-visible 有统一光环 -->
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">强度档位<span class="dj-ctl-readout">{{ 设置.导演.强度档位 }} 档 · {{ 档位标准[设置.导演.强度档位] }}</span></span>
              <input
                class="dj-ctl-range"
                type="range"
                min="1"
                max="4"
                step="1"
                v-model.number="设置.导演.强度档位"
                :style="{ '--fill': ((设置.导演.强度档位 - 1) / 3 * 100).toFixed(1) + '%' }"
                aria-label="戏剧强度档位"
              />
              <span class="dj-ctl-ticks" aria-hidden="true"><i></i><b>1</b><i></i><b>2</b><i></i><b>3</b><i></i><b>4</b><i></i></span>
            </div>
            <!-- 第二轮方案 7.1: 原「真实命运模式」并进档位 —— 这一行写清这一档允许谁死/走 -->
            <p class="dj-hint">
              可以死或离开：<b>{{ 命运规则.谁可以死或离开 }}</b>；{{ 命运规则.取消保送 ? '不保送胜利（连败不会自动让你赢）' : '同一冲突连败两次后第三次让你赢' }}。保护名单里的人任何档位都不会死、不会走。
            </p>

            <!-- 故事类型(2026-11-12): 类型不是标签, 是**承诺** —— 决定该有什么、也就决定该省什么 -->
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">故事类型<span class="dj-ctl-readout">{{ 类型说明(设置.导演.类型) }}</span></span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '类型'"
                  @click="切下拉('类型')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.导演.类型 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '类型'" class="dj-ctl-list" role="listbox" aria-label="故事类型">
                  <li
                    v-for="项 in 类型列表"
                    :key="项"
                    role="option"
                    tabindex="0"
                    :aria-selected="项 === 设置.导演.类型"
                    @click="选下拉(() => { 设置.导演.类型 = 项 })"
                    @keydown.enter.prevent="选下拉(() => { 设置.导演.类型 = 项 })"
                    @keydown.space.prevent="选下拉(() => { 设置.导演.类型 = 项 })"
                  >
                    <b class="dj-ctl-dd-name">{{ 项 }}</b>
                    <span v-if="项 !== '不限'" class="dj-ctl-dd-sub">{{ 类型说明(项) }}</span>
                  </li>
                </ul>
              </div>
              <p class="dj-hint">
                选一个 = 告诉导演「这部剧是哪一类的」：他就知道每一幕该往哪个方向编，
                也才有理由<b>砍掉</b>不属于这类故事的戏（这才是对付"杂兵一堆"的那一刀）。
                默认「不限」什么都不告诉导演，和没这个设置一样 —— 看不清算哪类就别选。
              </p>
            </div>

            <div class="dj-sub-h">红线（优先于一切指令与档位）</div>
            <div v-for="(r, i) in 设置.导演.红线" :key="i" class="dj-row">
              <span class="dj-p">{{ r }}</span><button class="dj-mini" @click="设置.导演.红线.splice(i, 1)">删</button>
            </div>
            <div class="dj-inline">
              <input v-model="新红线" placeholder="如：不写性暴力" class="dj-input" @keyup.enter="加红线" />
              <button class="dj-btn" @click="加红线">添加</button>
            </div>
            <p v-if="!(设置.导演.红线 || []).length" class="dj-empty">没有红线，完全交给剧本。</p>

            <div class="dj-sub-h">保护名单（这些人不会死、不会离开）</div>
            <div v-for="(r, i) in 设置.导演.保护角色" :key="i" class="dj-row">
              <span class="dj-p">{{ r }}</span><button class="dj-mini" @click="设置.导演.保护角色.splice(i, 1)">删</button>
            </div>
            <div class="dj-inline">
              <input v-model="新保护角色" placeholder="写角色名，如：Lim" class="dj-input" @keyup.enter="加保护角色" />
              <button class="dj-btn" @click="加保护角色">添加</button>
            </div>
            <p v-if="!(设置.导演.保护角色 || []).length" class="dj-empty">名单为空：按上面的档位，谁都可能失败、死亡或离开。</p>
            <p class="dj-hint">红线是写给 AI 的文字约束；保护名单由代码把关，名单里的人不会被写成死亡、离开、失踪，也不会被加上永久后果。名字要和账本「角色命运册」里写的一致；单字名（如"岚"）只认完全一致的写法。也可以在账本页的人物卡上直接点「保护」。</p>
          </div>

          <!-- 总开关（放在设置页最顶部）：OFF = 一键停用，且**连带清掉世界书备忘**（否则模型照样看得见账本事实） -->
          <div class="dj-card" :class="{ 'dj-master-off': !设置.启用导演 }">
            <div class="dj-card-h">总开关<span class="k">· 一键停用导演</span></div>
            <label class="dj-check">
              <input type="checkbox" v-model="设置.启用导演" :aria-checked="!!设置.启用导演" role="switch" @change="切换总开关" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>
              {{ 设置.启用导演 ? '导演已启用' : '导演已停用（不调引擎、不注入）' }}
            </label>
            <p class="dj-hint">关掉 = 不调引擎、不注入指令，并清掉世界书里的「编剧备忘」。重新启用时按「注入编剧备忘」设置写回。</p>
            <button class="dj-ctl-disc" :aria-expanded="展开集.includes('三开关')" @click="切展开('三开关')">
              <span class="dj-ctl-caret" aria-hidden="true"></span>和另外两个开关的区别<span class="dj-ctl-n">{{ 展开集.includes('三开关') ? '收起' : '展开' }}</span>
            </button>
            <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('三开关') }">
              <p class="dj-hint">
                三个开关的关系：<b>总开关</b>（本项）管住插件的全部副作用；<b>自动接管</b>只停"自动推进"（你手点「重新推进」仍可跑）；<b>注入「编剧备忘」到世界书</b>只管那个常驻条目。
                想完全停用：<b>关总开关即可</b>（会自动清掉世界书备忘）。
              </p>
            </div>
            <p v-if="!设置.启用导演" class="dj-err-line">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
              <span>已停用：引擎不会被调用、本幕指令不会注入、世界书备忘已清理。已有账本保留，随时可再打开。</span>
            </p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">接口</div>
            <label class="dj-field">地址<input v-model="设置.接口.地址" placeholder="https://... (末尾自动补 /v1)" /></label>
            <label class="dj-field">密钥<input v-model="设置.接口.密钥" type="password" /></label>
            <!-- 模型选择也是自绘（原生建议列表的下拉层无法样式化, 属于"原生外观"）：列表就地展开, 也可手填 -->
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">模型</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '模型'"
                  @click="切下拉('模型')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.接口.模型 || '（未选）' }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '模型'" class="dj-ctl-list" role="listbox" aria-label="模型列表">
                  <li v-for="m in 设置.接口.模型列表" :key="m" role="option" tabindex="0" :aria-selected="m === 设置.接口.模型"
                    @click="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.enter.prevent="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.space.prevent="选下拉(() => (设置.接口.模型 = m))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ m }}</li>
                  <li v-if="!(设置.接口.模型列表 || []).length" class="dj-muted">还没有模型列表：点「拉取模型」</li>
                </ul>
              </div>
              <input v-model="设置.接口.模型" class="dj-input" placeholder="也可直接手填模型名" />
            </div>
            <div class="dj-inline">
              <button class="dj-btn" :disabled="拉取中" @click="拉取模型">{{ 拉取中 ? '拉取中…' : '获取模型列表' }}</button>
              <button class="dj-btn" :disabled="测试中" @click="点击测试连接">{{ 测试中 ? '测试中…' : '测试连接' }}</button>
              <label class="dj-field inline">最大token<input v-model.number="设置.接口.最大token" type="number" /></label>
              <label class="dj-field inline">温度<input v-model.number="设置.接口.温度" type="number" step="0.1" /></label>
              <label class="dj-check"><input type="checkbox" v-model="设置.接口.流式" :aria-checked="!!设置.接口.流式" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>流式</label>
              <!-- 直连(学彼方): 导演自己请求接口, 不经过酒馆的生成管线 -->
              <label class="dj-check"><input type="checkbox" v-model="设置.接口.直连" :aria-checked="!!设置.接口.直连" role="switch" @change="切直连" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>直连</label>
            </div>
            <p class="dj-muted">直连 = 导演自己向接口发请求，不经过酒馆转发：预设、世界书、别的扩展都改不到请求体，也能绕开酒馆自己的超时。<template v-if="设置.接口.直连">接口不允许浏览器跨域时会临时改走转发一次，并提示你。</template><template v-else>现在走酒馆转发。</template></p>
            <p v-if="设置.接口.直连 && 直连是否已降级()" class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>直连刚失败过，这一页里已改走酒馆转发。改好地址/跨域后，把「直连」关掉再打开即可重试。</span></p>
            <!-- H 三空校验: 缺哪一项就点出来 —— 空密钥不该变成每轮静默 401 -->
            <p v-if="!接口诊断.可用" class="dj-err-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg><span>{{ 接口诊断.提示 }}</span></p>
            <p v-else class="dj-ok-line"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>接口配置齐备（建议点「测试连接」实测一次）</span></p>
            <template v-if="测试结果">
              <p :class="测试结果.可用 ? 'dj-ok-line' : 'dj-err-line'">
                <svg v-if="测试结果.可用" class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                <svg v-else class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                <span>[{{ 测试结果.类别 }}] {{ 测试结果.提示 }}</span>
              </p>
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('探测明细')" @click="切展开('探测明细')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>探测明细<span class="dj-ctl-n">{{ (测试结果.探测 || []).length }} 步 · {{ 展开集.includes('探测明细') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('探测明细') }">
                <pre class="dj-pre">{{ (测试结果.探测 || []).join('\n') }}</pre>
              </div>
            </template>
            <p class="dj-hint">最大输出Token：推理模型需要较大值（回退值 ≥16384）。实测你的端点接受 60000，不要调到 4096 —— 思维链会把小预算吃光、正文返空。</p>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">基础</div>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.自动接管" :aria-checked="!!设置.导演.自动接管" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>自动接管(生成前注入本幕指令)</label>
            <!-- 平静模式(2026-11-08): 与"自动接管"是两件事 —— 那个是完全撒手, 这个是还在记账但不发话。
                 2026-11-11: 开关要**当场**同步世界书里的「编剧备忘」+ 重注指令 —— 备忘本来是"推进成功/切聊天"
                 才重写, 切开关不写的话, 关掉之后的正文还在读"当前是平静期…上一条指令也不必执行"。 -->
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.平静模式" :aria-checked="!!设置.导演.平静模式" role="switch" @change="切换平静模式" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>平静模式(只记账，不下令)</label>
            <p class="dj-hint">
              开着的时候：每轮照常读正文、记章回/伏笔/张力，但<b>不给正文 AI 下任何指令</b> —— 没有节拍、没有"本幕已确定"、不催伏笔，
              这一段想怎么演就怎么演。世界书里仍保留「编剧备忘」（谁死了、谁走了、什么不能反悔），防的是把死人说活。
              <b>章号会停住不推进</b>，所以伏笔的"最迟章"不会因为你过日子而过期。关掉之后从原处接着编排。
            </p>
            <p class="dj-hint dj-hint-warn">
              和「自动接管」不是一回事：关掉自动接管是<b>完全撒手</b>（不跑引擎、什么都不注）；平静模式是<b>还在记账，只是不发话</b>。
            </p>

            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">提示条</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '提示条'"
                  @click="切下拉('提示条')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.导演.提示条 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '提示条'" class="dj-ctl-list" role="listbox" aria-label="提示条档位">
                  <li
                    v-for="档 in 提示档列表"
                    :key="档"
                    role="option"
                    tabindex="0"
                    :aria-selected="档 === 设置.导演.提示条"
                    @click="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.enter.prevent="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.space.prevent="选下拉(() => { 设置.导演.提示条 = 档; 设提示档位(档); })"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ 档 }}</li>
                </ul>
              </div>
            </div>
            <p class="dj-hint">事件用提示条、状态用悬浮球：选「关闭」只是不出声，<b>球仍会显示 编排中/出错/离线/剧终</b>。「全部」才会每轮多一条"开始推进"。</p>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防剧透伏笔" :aria-checked="!!设置.导演.防剧透伏笔" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防剧透 · 折叠未引爆伏笔</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防剧透章回" :aria-checked="!!设置.导演.防剧透章回" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防剧透 · 折叠章回计划</label>
            <p class="dj-hint">两项各自独立；折叠只发生在面板显示层（账本与发给引擎的内容一条不少）。<b>点被折叠的那一行可临时揭示</b>，再点收回；切页签/刷新即全部收回，不写盘。</p>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.注入世界书条目" :aria-checked="!!设置.导演.注入世界书条目" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>注入「编剧备忘」到世界书</label>
            <p class="dj-hint">
              优先写角色卡主世界书；主世界书不可读（链接悬空/未安装）时自动回退聊天世界书（必要时新建专属聊天世界书），
              实际落点见日志页（那里会写明"已回退到 X"）。
            </p>
            <!-- 2026-11-13 P0-1: 原名「更新频率(每 N 条回复)」只说"多久跑一次", 用户读成性能项。
                 实际它是**节奏总旋钮**: 调大 = 引擎推进更慢、一章演更多层、幕更拖; 调小 = 推进更快更紧。 -->
            <label class="dj-field inline">推进间隔(每 N 条回复推进一次)<input v-model.number="设置.导演.更新频率" type="number" min="1" /></label>
            <p class="dj-hint">{{ '调大 = 剧情推进变慢(更省 token、一章演更多层); 调小 = 推进更快、节奏更紧。这是节奏总旋钮, 不只是性能项。' }}</p>
            <label class="dj-field inline">读取最近回复数<input v-model.number="设置.导演.读取最近回复数" type="number" min="1" /></label>
            <!-- E 配置化: 节奏与冷启动参数(高级区, 默认值对绝大多数剧本够用) -->
            <div class="dj-adv">
              <button class="dj-ctl-disc" :aria-expanded="展开集.includes('高级')" @click="切展开('高级')">
                <span class="dj-ctl-caret" aria-hidden="true"></span>高级（节奏、快照、同人偏离度）<span class="dj-ctl-n">{{ 展开集.includes('高级') ? '收起' : '展开' }}</span>
              </button>
              <div class="dj-ctl-disc-body" :class="{ open: 展开集.includes('高级') }">
              <label class="dj-field inline">快照保留份数<input v-model.number="设置.导演.快照保留份数" type="number" min="1" max="100" /></label>
              <p class="dj-hint">快照保留份数 = 删楼时账本可回退的楼层数（默认 30；每份约几 KB~十几 KB，调大聊天文件变大）。</p>
              <label class="dj-field inline">接管轮数（第 N 轮起编排）<input v-model.number="设置.导演.接管轮数" type="number" min="1" max="20" /></label>
              <label class="dj-field inline">连续高张力阈值<input v-model.number="设置.导演.连续高阈值" type="number" min="1" max="10" /></label>
              <label class="dj-field inline">连续低张力阈值<input v-model.number="设置.导演.连续低阈值" type="number" min="1" max="10" /></label>
              <!-- 2026-11-13: 反向豁免的开关。真机上「硬性要求」非空率 94.7% → 豁免恒真 → 四条结构规则
                   0 次生效（89.7% 的戏没有张力）；关掉它 = 全听导演，给用户真机 A/B 的退路。 -->
              <label class="dj-check"><input type="checkbox" v-model="设置.导演.结构规则优先" :aria-checked="!!设置.导演.结构规则优先" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>结构规则优先（关掉 = 全听导演的节拍）</label>
              <p class="dj-hint">结构规则优先：开着时，连续高/低张力、高潮后代价、契诃夫之枪、收束调度这四条<span class="dj-em">照常生效</span>；代码改节拍时会写明「导演原拟 X → 改成 Y，因为 Z」，你的原意不会消失。关掉它则完全按导演给的节拍走（老行为）。</p>
              <p class="dj-hint">接管轮数：前 N-1 轮只记账不出指令（默认 4）。张力阈值：连续 N 幕高张力强制喘息幕 / 连续 N 幕低张力安排「山雨欲来」（默认各 3）。</p>
              <div class="dj-ctl-field">
                <span class="dj-ctl-lab">同人偏离度<span class="dj-ctl-readout">{{ 设置.导演.偏离度 }}</span></span>
                <div class="dj-ctl-dd">
                  <button
                    class="dj-select dj-ctl-dd-btn"
                    aria-haspopup="listbox"
                    :aria-expanded="打开的下拉 === '偏离度'"
                    @click="切下拉('偏离度')"
                    @keydown.esc="打开的下拉 = ''"
                  >
                    <span class="dj-ctl-val">{{ 设置.导演.偏离度 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                  </button>
                  <ul v-if="打开的下拉 === '偏离度'" class="dj-ctl-list" role="listbox" aria-label="同人偏离度">
                    <li
                      v-for="档 in 偏离度列表"
                      :key="档"
                      role="option"
                      tabindex="0"
                      :aria-selected="档 === 设置.导演.偏离度"
                      @click="选下拉(() => { 设置.导演.偏离度 = 档; })"
                      @keydown.enter.prevent="选下拉(() => { 设置.导演.偏离度 = 档; })"
                      @keydown.space.prevent="选下拉(() => { 设置.导演.偏离度 = 档; })"
                      @keydown.down.prevent="移到相邻项($event, 1)"
                      @keydown.up.prevent="移到相邻项($event, -1)"
                    >{{ 档 }}</li>
                  </ul>
                </div>
              </div>
              <p class="dj-hint">
                仅对同人卡生效：引擎会读世界书里的剧情索引（<code>[编码] 时间｜概括</code>）当原著时间线。
                <b>关闭</b>不注入任何原著约束（原创卡用）；<b>严格贴合</b>节点按序发生、主角只能改过程；
                <b>允许偏离</b>主线按序、支线随主角行动改写；<b>自由演绎</b>索引只作背景。
              </p>
              </div>
            </div>
          </div>

          <div class="dj-card">
            <div class="dj-card-h">提示词</div>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.破限" :aria-checked="!!设置.导演.破限" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>破限</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.头部填充" :aria-checked="!!设置.导演.头部填充" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>头部填充</label>
            <input v-if="设置.导演.头部填充" v-model="设置.导演.头部填充文本" class="dj-input" placeholder="留空使用内置小说原文" />
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.防截断" :aria-checked="!!设置.导演.防截断" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>防截断</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.预填充" :aria-checked="!!设置.导演.预填充" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>预填充</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.读取世界书" :aria-checked="!!设置.导演.读取世界书" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>引擎读世界书</label>
            <label class="dj-check"><input type="checkbox" v-model="设置.导演.读取全局世界书" :aria-checked="!!设置.导演.读取全局世界书" role="switch" /><span class="dj-ctl-sw" aria-hidden="true"><span class="dj-ctl-knob"></span></span>包含全局世界书</label>
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">世界书排除</span>
              <textarea v-model="世界书排除文本" class="dj-input" rows="3" placeholder="标题里含这些字就排除，一行一条，如&#10;[mvu_update]"></textarea>
            </div>
            <p class="dj-hint">条目<b>标题或备注里含这些字就排除</b>（不分大小写），不用写全名——填一条 [mvu_update] 就能排掉 [mvu_update]1、[mvu_update]2…；导演自己写的条目本来就自动排除。</p>
            <div class="dj-ctl-field">
              <span class="dj-ctl-lab">标签过滤模式</span>
              <div class="dj-ctl-dd">
                <button
                  class="dj-select dj-ctl-dd-btn"
                  aria-haspopup="listbox"
                  :aria-expanded="打开的下拉 === '标签模式'"
                  @click="切下拉('标签模式')"
                  @keydown.esc="打开的下拉 = ''"
                >
                  <span class="dj-ctl-val">{{ 设置.标签.模式 }}</span><span class="dj-ctl-caret" aria-hidden="true"></span>
                </button>
                <ul v-if="打开的下拉 === '标签模式'" class="dj-ctl-list" role="listbox" aria-label="标签过滤模式">
                  <li v-for="模 in ['排除', '只读']" :key="模" role="option" tabindex="0" :aria-selected="模 === 设置.标签.模式"
                    @click="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.enter.prevent="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.space.prevent="选下拉(() => (设置.标签.模式 = 模 as '排除' | '只读'))"
                    @keydown.down.prevent="移到相邻项($event, 1)"
                    @keydown.up.prevent="移到相邻项($event, -1)"
                  >{{ 模 }}</li>
                </ul>
              </div>
            </div>
            <textarea v-model="标签列表文本" class="dj-input" rows="3" placeholder="一行一条，如&#10;thinking&#10;aftertalk"></textarea>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { 应显示更新弹条 } from '../共用/更新弹条判定';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { 本章进度文本, 世界时间天数 } from './提醒';
import { 取根变量, 层序, 悬浮球直径, 弹窗变量, 弹窗兜底配色, 取弹窗配色 } from './主题';
import { useSettingsStore, 立即保存设置 } from './settings';
import { useHost } from './host';
import {
  UI_KEY, useConsoleStore, useDeathStore, useDebugStore, useStateStore, useUpdatingStore,
  clearAllData, 读离线状态, 清推进失败, 设自动暂停, 写已剧终, 熔断阈值,
} from './state';

import { 档位标准, 类型标准, 取命运规则, 跳过本幕 as 跳过本幕规则 } from './引擎规则';
import { 伏笔时间轴 } from './取料';
import { 取到期伏笔 } from './证据链';
import { fetchModelList, 诊断接口配置, 测试连接, 直连是否已降级, 重置直连降级, type 测试连接结果 } from './api';
import { 计算判据, 终值日志行 } from './指标';
import { 章回受管, 章回键, 伏笔受管, 伏笔键, 切换揭开, 折叠中, 折叠文案, 揭开提示 } from './防剧透';
import { 落定剧终, 解除剧终, 请求收官 } from './快照';
import { 读书纲覆盖, 写书纲覆盖 } from './运行状态';
import { 挂靠伏笔, 规范化书纲覆盖, type 书纲覆盖 as 书纲覆盖类型 } from './书纲';
import { 是终态 } from './字段表';
import { 提交账本变更 } from './账本变更';
import { 计算运行状态, 球悬停文案 } from './球状态';
import { 显示气泡, 藏气泡 } from './球气泡';
import { setToastAnchor, setToastColors, setToastSuppressed, 设提示档位, 提示档列表, toastError, toastSuccess, toastWarning } from './toast';
import { 重新推进 } from './update';
import { remove本幕指令, renew本幕指令, sync编剧备忘, 平静前指令作废, 台上文本 } from './注入';
import { 列出导演条目, 清空导演条目 } from './世界书落点';
import { 使用面板机制 } from '../共用/面板机制';
// 列表类设置的文本 → 名单: 三家统一按换行切(逗号/顿号不再当分隔符)
import { 解析名单 } from '../共用/世界书排除';
import { 伏笔状态列表, 冲突阶段列表, 偏离度列表, 节拍列表, 类型列表, type 伏笔状态, type 冲突阶段, type 死亡抉择, type 判据, type 伏笔, type 证据引用 } from './schema';

/**
 * 故事类型的一句话说明(2026-11-12)。
 *
 * 名字自己就该看得懂(「远行寻物」而不是「金羊毛」), 这句只是补充 ——
 * 表头读数与下拉列表共用它, **只留一份说明**, 改名时不会漏掉某一处。
 */
function 类型说明(类型: string): string {
  if (!类型 || 类型 === '不限') return '不限';
  return (类型标准 as Record<string, { 一句话: string } | undefined>)[类型]?.一句话 ?? 类型;
}

const stateStore = useStateStore();
const settingsStore = useSettingsStore();
const debugStore = useDebugStore();
const consoleStore = useConsoleStore();
const updatingStore = useUpdatingStore();
const deathStore = useDeathStore();

// 窗口机制是共用的(几何/拖动/阴影/偏好), 这里只交"剧情导演长什么样"+ 存储接缝
const 面板 = 使用面板机制({
  面板类名: 'dj-panel',
  阴影变量: '--dj-shadow',
  球直径: 悬浮球直径,
  阴影层序: 层序.面板阴影,
  面板宽: 460,
  面板高: 620,
  提示条: { 取配色: 取弹窗配色, 设配色: setToastColors, 设锚点: setToastAnchor, 设抑制: setToastSuppressed },
  存储: {
    读全局: () => useHost().vars.get({ type: 'global' })?.[UI_KEY],
    写全局: 值 => useHost().vars.insertOrAssign({ [UI_KEY]: 值 }, { type: 'global' }),
    读本地: () => localStorage.getItem('剧情导演_界面'),
    写本地: 文本 => localStorage.setItem('剧情导演_界面', 文本),
  },
});

const { rootEl, panelRef, headerEl, parentWin, theme, panelOpen, orbStyle, panelStyleRef, onOrbPointerDown, onOrbClick, onPanelPointerDown, closePanel, 球心坐标, 贴球锚点 } = 面板;

const 账本 = computed(() => stateStore.data);
const 设置 = computed(() => settingsStore.settings);
const debug = computed(() => debugStore.log);
const 更新中 = computed(() => updatingStore.active);

const 死亡待决 = computed(() => deathStore.pending || (!!账本.value.待决死亡 && !账本.value.死亡抉择));

import { 建导演命令 } from './导演命令';

// 面板命令: 每条 = 一组不变量(实现见 导演命令.ts); 视图只提供平台动作, UI 开关留在这里
const 命令 = 建导演命令({
  账本: () => 账本.value,
  设置: () => 设置.value,
  提交: 副作用 => 提交账本变更(账本.value, 设置.value, 副作用),
  写已剧终,
  同步备忘: 要写 => sync编剧备忘(账本.value, 要写, 设置.value),
  清世界书条目: () => {
    void 清空导演条目()
      .then(({ 删掉, 疑似 }) => {
        if (删掉.length > 0) toastSuccess('已删除世界书条目 ' + 删掉.length + ' 条', '剧情导演');
        // 2026-11-13 A 案: 旧版命名的条目**不再自动删**（宽松判定会误删用户自建条目）→ 只提示手动清理
        if (疑似.length > 0) {
          const 前几条 = 疑似.filter((_, i) => i < 3).map(项 => 项.书 + '#' + 项.条目);
          toastWarning('还有 ' + 疑似.length + ' 条疑似旧版命名（' + 前几条.join('、') + '…）—— 插件不再自动删除，请手动清理', '剧情导演');
        }
      })
      .catch(error => console.warn('[剧情导演] 删除世界书条目失败:', error));
  },
  撤本幕指令: remove本幕指令,
  重注本幕: 暂停 => renew本幕指令(账本.value, 设置.value, 暂停),
  清空并重载: () => {
    clearAllData();
    stateStore.reload();
    return stateStore.data;
  },
  结算死亡: () => deathStore.settle(),
  设自动暂停,
  清推进失败,
  提示: 消息 => toastSuccess(消息, '剧情导演'),
  日志: 消息 => console.info(`[剧情导演] ${消息}`),
});
const 死亡选项: 死亡抉择[] = ['视角转移', '世界观内复活', '剧终结算'];

/**
 * 更新弹条: 贴球常驻, **中断按钮就长在里面**(与彼方/烟火同款)。
 * 为什么不用 toast: toast 是「短暂事件」, 而编排可能跑十几秒; 且用户要能在**面板没开**时中断。
 * 中断只 abort 请求, 不写任何数据 —— updateDirector 的 finally 负责收尾(球与面板状态照常复位)。
 */
const 更新弹条ID = '剧情导演_更新弹条';
let 更新弹条El: HTMLElement | null = null;

const 更新弹条CSS =
  `position:fixed;top:0;left:0;z-index:${层序.更新弹条};display:none;align-items:center;gap:9px;padding:7px 9px 7px 15px;border-radius:999px;` +
  `background:var(${弹窗变量.bg},${弹窗兜底配色.bg});border:1px solid var(${弹窗变量.border},${弹窗兜底配色.border});color:var(${弹窗变量.text},${弹窗兜底配色.text});` +
  `font:12px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);user-select:none;white-space:nowrap;` +
  `transform-origin:left center;animation:djPillIn .32s cubic-bezier(.34,1.56,.64,1);`;

/**
 * 贴球左方弹出(左边放不下就弹到右边), 垂直居中对齐球。
 *
 * 取点统一交给 面板机制 的 贴球锚点: **被收纳坞收走时贴坞里的代理图标**, 否则贴球 iframe 的真实矩形。
 * 收纳后坞把球藏了却没搬走 iframe, 只贴 iframe 会落在"球原来的位置"; 图标 28×28 比球小,
 * 半径也随它走, 所以贴球间距会跟着缩(用户要的"大小也匹配")。
 */
function 定位更新弹条() {
  const el = 更新弹条El;
  const pw = parentWin.value;
  if (!el || !el.isConnected || !pw) return;
  const vw = pw.innerWidth;
  const vh = pw.innerHeight;
  const w = el.offsetWidth || 200;
  const h = el.offsetHeight || 36;
  const { x: 心x, y: 心y, r: 半径 } = 贴球锚点.value;
  let left = 心x - 半径 - w - 10;
  if (left < 8) left = 心x + 半径 + 10;
  left = Math.min(Math.max(left, 8), Math.max(8, vw - w - 8));
  const top = Math.min(Math.max(心y - h / 2, 8), Math.max(8, vh - h - 8));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/** 整块重建而非复用改样式: 否则 el 自身的 click 监听会每次 ensure 叠一层 */
function 确保更新弹条(doc: Document): HTMLElement {
  doc.getElementById(更新弹条ID)?.remove();
  if (!doc.getElementById('dj-pill-style')) {
    const style = doc.createElement('style');
    style.id = 'dj-pill-style';
    style.textContent =
      '@keyframes dj-pill-breath{0%,100%{opacity:.35}50%{opacity:1}}' +
      '@keyframes djPillIn{from{opacity:0;transform:translateX(14px) scale(.9)}to{opacity:1;transform:none}}';
    doc.head.appendChild(style);
  }
  const el = doc.createElement('div');
  el.id = 更新弹条ID;
  el.style.cssText = 更新弹条CSS;
  // 弹条不在弹窗容器里, 单独把主题变量写上去
  const 配色 = 取弹窗配色(theme.value) as unknown as Record<string, string>;
  for (const [键, 变量] of Object.entries(弹窗变量) as [string, string][]) {
    if (配色[键]) el.style.setProperty(变量, 配色[键]);
  }
  el.innerHTML =
    `<span style="width:7px;height:7px;border-radius:50%;background:var(${弹窗变量.accent},${弹窗兜底配色.accent});display:inline-block;animation:dj-pill-breath 1.4s ease-in-out infinite;flex:none;"></span>` +
    `<span class="dj-pill-msg"></span>` +
    `<button type="button" class="dj-pill-cancel" style="margin-left:2px;padding:3px 11px;border-radius:999px;border:1px solid var(${弹窗变量.accent},${弹窗兜底配色.accent});background:transparent;color:var(${弹窗变量.accent},${弹窗兜底配色.accent});font:inherit;cursor:pointer;">中断</button>`;
  const 中断钮 = el.querySelector('.dj-pill-cancel');
  if (中断钮) {
    中断钮.addEventListener('click', ev => {
      ev.stopPropagation();
      updatingStore.cancel();
    });
  }
  el.addEventListener('click', () => {
    panelOpen.value = true;
  });
  doc.body.appendChild(el);
  return el;
}

// 2026-11-13: 依赖里必须带 panelOpen —— 面板开着时这条弹条要**移除**（不是 display:none）。
// 面板内已有「中断编排」按钮，所以隐藏弹条不会丢掉中断能力。
watch([更新中, () => updatingStore.message, panelOpen], ([active, message, open]) => {
  const doc = parentWin.value?.document;
  if (!doc) return;
  if (应显示更新弹条(!!active, !!open)) {
    更新弹条El = 确保更新弹条(doc);
    const msg = 更新弹条El.querySelector('.dj-pill-msg');
    if (msg) msg.textContent = message || '导演编排中…';
    更新弹条El.style.display = 'flex';
    // display 切换不会重放 CSS animation, 强制回流一次
    更新弹条El.style.animation = 'none';
    void 更新弹条El.offsetWidth;
    更新弹条El.style.animation = '';
    定位更新弹条();
  } else if (更新弹条El) {
    // 面板开着 / 已结束 → **真的移除**（跟烟火一致）。display:none 会留下"面板开关一次后
    // 与 更新中 不同步"的组合态；移除+置 null，下次应显示为真时重建，天然自愈。
    更新弹条El.remove();
    更新弹条El = null;
  }
});

// 拖球、被收纳、或坞自己挪窝时, 弹条都跟随(锚点由 面板机制 的"盯球 + 盯坞"双通道驱动)
watch(贴球锚点, () => {
  if (更新弹条El && 更新弹条El.isConnected && 更新弹条El.style.display !== 'none') 定位更新弹条();
});

onUnmounted(() => {
  更新弹条El?.remove();
  更新弹条El = null;
});

/**
 * 2026-11-13 P0-2/P0-3: 面板上的**两个钟**同一行显示 ——
 * 「第 N 天 · 文本」是故事时间，「本章已演 X 场」是代码的计量单位。
 * 两者会背离（40 场可能只过半天，也可能过 40 天），并排才看得出来。
 * ⚠️ 算式**不在**这里：走 提醒.本章进度文本（与 章长度提醒 同源，含那个 +1）。
 * ⚠️ **实参不 +1**：面板读的是 stateStore.data，那是 update 落盘时**已经 +1 过**的账本
 *    （账本数据.ts:364「已分析轮数在本轮结束时 +1, 所以这里提前 +1」—— 那个"提前"是给
 *    update 之前的调用点用的，比如 取料.ts:247。面板跑在落盘之后，再 +1 就多算一场）。
 */
const 本章进度 = computed(() => 本章进度文本(账本.value, Number(账本.value?.已分析轮数) || 0));

/**
 * 2026-11-14 P0-2: 面板上的「第 N 天」必须走 提醒.世界时间天数（四舍五入 + 夹 0）。
 *
 * 为什么不在模板里写 `账本.世界时间.天数`：写入层是**浮点累加**（`(旧天数||0) + 推进天数`，
 * 而推进天数来自模型「本幕过了几天，可小数」）。实测 673 轮 × 0.1 → `67.30000000000045`，
 * 面板上屏就是这一串。函数早就写对了，缺的是**调用点** —— 纪律 32 的形态（测了函数，没测调用点）。
 * ⚠️ 算式不在这里：别在组件里做第二份取整实现。
 */
const 世界天数 = computed(() => (账本.value ? 世界时间天数(账本.value) : 0));

const 页列表 = ['本幕', '书纲', '账本', '日志', '设置'] as const;
const 当前页 = ref<(typeof 页列表)[number]>('本幕');
const 新红线 = ref('');
const 新保护角色 = ref('');
const 拉取中 = ref(false);
const 命运规则 = computed(() => 取命运规则(设置.value.导演.强度档位));
/** 优化 6: 账本页伏笔时间轴(与回响提醒同一口径; 本场 = 已分析轮数) */
const 时间轴 = (s: (typeof 账本.value.伏笔)[number]) => 伏笔时间轴(s, Number(账本.value.已分析轮数) || 0);
/** 人物卡: 保护名单就地切换 */
const 受保护 = (id: string) => (设置.value.导演.保护角色 ?? []).includes(id);
function 切保护(id: string) {
  const 名单 = 设置.value.导演.保护角色 ?? (设置.value.导演.保护角色 = []);
  const i = 名单.indexOf(id);
  if (i >= 0) 名单.splice(i, 1);
  else 名单.push(id);
}
/** 人物卡状态色: 死亡 = seal, 离开/失踪 = 淡, 受伤 = gold */
const 命运状态类 = (状态: string) =>
  状态 === '死亡' ? 'dead' : 状态 === '离开' || 状态 === '失踪' ? 'gone' : 状态 === '受伤' ? 'warn' : '';

const 根变量 = computed(() => 取根变量(theme.value));
const 副标题 = computed(() => {
  const t = 账本.value.张力?.当前 ?? 0;
  const 节拍 = 账本.value.当前指令?.节拍;
  return `${节拍 ? '本幕 ' + 节拍 : '待命'} · 张力 ${t}/10`;
});
const 活跃冲突 = computed(() => (账本.value.冲突 ?? []).filter(c => !是终态.冲突(c)));
/**
 * 防剧透(规格 A): **两个独立开关** + **整行点击临时揭开**。
 * 折叠只发生在"渲染哪段文案"这一层 —— 账本里 `伏笔[].内容`、`章回.计划高潮` 一个字都不少,
 * 发往引擎的内容也不经过这里(零截断红线)。
 */
const 防剧透开关 = computed(() => ({ 防剧透伏笔: 设置.value.导演.防剧透伏笔, 防剧透章回: 设置.value.导演.防剧透章回 }));
/** 被点开的条目(内存态, **不写盘**): 切页签/刷新/换聊天即回到折叠 */
const 已揭开 = ref<Set<string>>(new Set());
function 点开(键: string) {
  已揭开.value = 切换揭开(已揭开.value, 键);
}
/** 这条伏笔是否受防剧透管(受管才给可点样式与图标) */
function 伏笔可点(条: 伏笔): boolean {
  return 伏笔受管(防剧透开关.value, 条.状态);
}
function 伏笔折叠中(条: 伏笔): boolean {
  return 折叠中(伏笔可点(条), 已揭开.value, 伏笔键(条.编号));
}
function 章回可点(): boolean {
  return 章回受管(防剧透开关.value, 账本.value.章回?.计划高潮);
}
function 章回折叠中(): boolean {
  return 折叠中(章回可点(), 已揭开.value, 章回键);
}
/** 规格 A2: 展开态不持久化 —— 换页签就全部收回(刷新与换聊天由组件重建天然收回) */
watch(当前页, () => {
  已揭开.value = new Set();
});

/**
 * 阶段 A: 证据链的显示文本。**只决定渲染哪段文案** —— 账本里的 `公开摘要` 是内容字段,
 * 这里一个字都不裁(零截断); 待核的引用显式标出来, 免得把"没核过的证据"看成已确认。
 */
/**
 * 证据展开状态(2026-11-12): 一条伏笔的证据链可能几十条(真机有一条 53 条回响),
 * 全部铺开就是一屏幕的墙 —— 用户看到的正是那面墙。默认收成"条数 + 首尾各一条",
 * 要看全量点「展开」。**不删任何一条**, 只是默认不一次铺开。
 */
const 展开的证据 = ref<Set<string>>(new Set());
function 证据展开中(编号: number | string, 类: string): boolean {
  return 展开的证据.value.has(`${编号}:${类}`);
}
function 切换证据展开(编号: number | string, 类: string) {
  const 键 = `${编号}:${类}`;
  const 下一份 = new Set(展开的证据.value);
  if (下一份.has(键)) 下一份.delete(键);
  else 下一份.add(键);
  展开的证据.value = 下一份;
}
/** 证据行: 收起态只给条数与首尾, 展开态给全量 */
function 证据行(列表: 证据引用[], 展开: boolean): string {
  if (展开 || 列表.length <= 3) return 证据摘要(列表);
  const 一点 = (证: 证据引用) => {
    const 出处 = 证.记忆引用 || (Number(证.楼层) > 0 ? `第 ${证.楼层} 楼` : '无出处');
    return `${出处}${证.定位 === '待核' ? '·待核' : ''}${证.公开摘要 ? `「${证.公开摘要}」` : ''}`;
  };
  return `共 ${列表.length} 条（第一条 ${一点(列表[0])}；最后一条 ${一点(列表[列表.length - 1])}）`;
}

function 证据摘要(列表: 证据引用[]): string {
  return 列表
    .map(证 => {
      // 没有记忆条目编号的是"本轮正文里刚发生"的证据: 说楼层, 不说"(无引用)"
      const 出处 = 证.记忆引用 || (Number(证.楼层) > 0 ? `第 ${证.楼层} 楼` : '无出处');
      return `${出处}${证.定位 === '待核' ? '·待核' : ''}${证.公开摘要 ? `「${证.公开摘要}」` : ''}`;
    })
    .join('、');
}
/** 人物卡上显示的持久后果: 只列还在生效的(持续 / 已缓解), 已解除和误记撤销的不再挂着 */
function 生效后果(命: { 持久后果?: { 内容: string; 状态: string }[] }): string[] {
  return (命.持久后果 ?? [])
    .filter(后 => (后.状态 === '持续' || 后.状态 === '已缓解') && String(后.内容 ?? '').trim())
    .map(后 => (后.状态 === '已缓解' ? `${后.内容}（已缓解）` : 后.内容));
}

// ---------------------------------------------------------------------------
// 自绘控件层(规格 §1.1)的界面状态: 下拉就地展开 + 披露展开 + 球的气泡
// ---------------------------------------------------------------------------
/** 同时只开一个自绘下拉(键 = '伏3' / '冲夺嫡' / '提示条' / '标签模式' / '模型') */
const 打开的下拉 = ref('');
function 切下拉(键: string) {
  打开的下拉.value = 打开的下拉.value === 键 ? '' : 键;
}
/** 选中一项: 先应用, 再收起(自绘 listbox 的就地展开不留残影) */
function 选下拉(应用: () => void) {
  应用();
  打开的下拉.value = '';
}
/** 自绘下拉的键盘支持（规格 §1.1-3）：↑↓ 在选项间移动焦点 */
function 移到相邻项(e: KeyboardEvent, 方向: number) {
  const 项 = e.currentTarget as HTMLElement | null;
  const 兄弟 = 方向 > 0 ? 项?.nextElementSibling : 项?.previousElementSibling;
  if (兄弟 instanceof HTMLElement) 兄弟.focus();
}
/** 点面板空白处关掉自绘下拉（规格 §1.1-3）；点在 .dj-ctl-dd 内不动它 */
function 点外关下拉(e: MouseEvent) {
  const 目标 = e.target as HTMLElement | null;
  if (!目标 || !目标.closest || 目标.closest('.dj-ctl-dd')) return;
  打开的下拉.value = '';
}
onMounted(() => document.addEventListener('click', 点外关下拉));
onUnmounted(() => document.removeEventListener('click', 点外关下拉));

/** 自绘披露的展开集合(默认把「报错」摊开 —— 原来那个默认展开的报错块就是这个语义) */
const 展开集 = ref<string[]>(['报错']);
function 切展开(键: string) {
  展开集.value = 展开集.value.includes(键) ? 展开集.value.filter(k => k !== 键) : [...展开集.value, 键];
}
/** 球的信息气泡: 挂在**父页面 DOM**(球自己的 iframe 只有 40×40 且被 clip-path 裁成并集, 气泡必被裁掉) */
function 显示球气泡() {
  // 面板一开就不再挂气泡(2026-11-07): 它和面板并排显示, 看着就像"面板开着还在弹窗"
  if (panelOpen.value) return;
  // 传**实时球心**（面板机制从 anchorX/anchorY 给）：拖动后立刻跟手, 不再依赖 toast 锚点
  显示气泡(球悬停.value, 球心坐标.value);
}
function 藏起球气泡() {
  藏气泡();
}
// 面板开了: 立刻收掉可能已经挂着的气泡(点球会先触发 focus → 气泡冒出来, 面板随后才开)
watch(panelOpen, 开 => {
  if (开) 藏起球气泡();
});
/**
 * 台上判定(2026-11-12 架构深化 ④): 面板**不再自己数闸**。
 *
 * 旧写法只查了「平静 / 平静刚结束」两道 —— 于是熔断、已剧终、自动接管关闭、待决死亡、群聊
 * 这几种情况下, 面板照样摊开一整段本幕指令, 而正文一个字节都拿不到: 你在面板上看到的
 * "这一场要演什么"是一条**不会发生的命令**。现在权威只有一处(注入层同款), 面板只读它。
 */
const 台上 = computed(() => 台上文本(账本.value, 设置.value, 死亡待决.value));
/**
 * 「旧编排作废」= 平静场数 > 0（`平静前指令作废`，与注入层同一个函数）。
 *
 * 刻意**不是** `台上.结论.原因 === '平静刚结束'`：它回答的是"手上那道指令还能不能用"，
 * 而台上结论回答的是"这一刻注什么"。熔断时两道判断会给出不同答案，而导演台收起卡片这个
 * 显示行为沿用的是前者 —— 别用一次重构顺手改掉一个没人要求改的显示语义。
 */
const 平静刚结束 = computed(() => 平静前指令作废(账本.value));
const 指令预览 = computed(() => 台上.value.文本);
/** 代码调整上面板(批次二): 本轮代码规则触发记录 —— 只读 指令.代码调整, 不新增任何行为 */
const 代码调整 = computed(() => 账本.value.当前指令?.代码调整 ?? []);
// E 配置化: 接管轮数来自设置(默认 4, 见 schema.ts 的 SettingsSchema)
const 接管轮数 = computed(() => 设置.value.导演.接管轮数);

// ---------------------------------------------------------------------------
// 批次一(H/I/F/J): 接口诊断 · 离线可观测三态 · 已剧终 · 指标卡
// ---------------------------------------------------------------------------
const 离线 = ref(读离线状态());
/**
 * 熔断状态的可见性(2026-11-11 自查): 这个 ref 以前**只在点按钮时**刷新, 于是面板与球会一直显示旧状态——
 * 推进连败熔断后, 球还写着"运行中", 用户看不到"已自动暂停", 也就不会去点「恢复自动接管」。
 * 而"熔断要让人知道"正是它存在的理由(否则只是静默地不再调引擎 = 看起来像导演坏了)。
 * 两个刷新点就够: 一次推进结束(成功/失败都会写 chat meta), 以及面板打开。
 */
watch(更新中, (active, 旧) => {
  if (旧 && !active) 离线.value = 读离线状态();
});
watch(panelOpen, 开 => {
  if (开) 离线.value = 读离线状态();
});
const 待确认剧终 = ref(false);
const 剧终 = computed(() => !!账本.value.已剧终);
/** 收官请求 / 终局五步(2026-11-12): 收官期间台上要显示"现在第几步" */
const 收官请求 = computed(() => !!账本.value.收官请求);
const 终局步 = computed(() => Math.max(1, Math.min(5, Number(账本.value.终局步) || 1)));
const 接口诊断 = computed(() => 诊断接口配置(设置.value.接口));
const 测试中 = ref(false);
const 测试结果 = ref<测试连接结果 | null>(null);
const 指标 = computed(() => 计算判据(账本.value));
const 章起伏 = computed(() => 账本.value.指标?.本章累计?.起伏次数 ?? 0);
/**
 * 伏笔回收率显示: 数据异常(累计了结 > 累计埋设)时显示**显式异常态**, 不夹断也不显示 >100%
 * (数字与明细都来自 计算判据 ← 账本.指标 的累计计数器, 面板不另算一套)。
 */
/** 判据 → 显示文本(活指标与"落幕快照"共用一条口径, 不各写一套) */
function 回收率文本of(判: 判据): string {
  return 判.伏笔回收率异常 ? '>100%?' : 百分比(判.伏笔回收率);
}
const 回收率文本 = computed(() => 回收率文本of(指标.value));

function 时间文本(t: number): string {
  return t > 0 ? new Date(t).toLocaleTimeString() : '时间未知';
}
function 百分比(v: number): string {
  return v < 0 ? '样本不足' : `${Math.round(v * 100)}%`;
}
/** 张力峰/谷: -1 = 本章还没观测到(不用 0 冒充) */
function 张力文本(v: number): string {
  return v < 0 ? '—' : String(v);
}
/**
 * 运行状态: 状态条与悬浮球**同一条阶梯**(纯函数见 球状态.ts 的 计算运行状态)。
 * 以前状态条的五个分支写在这里(只能靠字符串断言验)、球的五态在模块里(有用例),
 * 输入几乎相同却各算一遍 —— README v1.2 D 记的正是这两处曾经互相矛盾。
 * 现在一个结果, 两个消费者: 状态条读 级别/标题/明细, 悬浮球读 球态。
 */
const 运行状态 = computed(() =>
  计算运行状态({
    已停用: !设置.value.启用导演,
    已剧终: 剧终.value,
    自动暂停: 离线.value.自动暂停,
    连败次数: 离线.value.连败次数,
    最后失败原因: 离线.value.最后失败原因,
    最后失败时间: 离线.value.最后失败时间,
    平静: !!设置.value.导演.平静模式,
    平静场数: 账本.value.平静场数 ?? 0,
    自动接管: !!设置.value.导演.自动接管,
    已分析轮数: 账本.value.已分析轮数 ?? 0,
    接管轮数: 接管轮数.value,
    锚点楼层: 账本.value.锚点楼层 ?? -1,
    引擎调用次数: 账本.value.统计?.引擎调用次数 ?? 0,
    编排中: 更新中.value,
  }),
);
const 状态条 = computed(() => 运行状态.value);
/** 悬浮球五态: 与状态条同一个结果, 不再各自算一遍 */
const 球状态 = computed(() => 运行状态.value.球态);
const 球悬停 = computed(() => {
  if (运行状态.value.级别 === 'stop') return '剧情导演：已停用（不调引擎、不注入）——在面板「设置」最上面打开';
  const 最后调用 = 账本.value.统计?.最后调用 ?? 0;
  return 球悬停文案(球状态.value, {
    最后失败原因: 离线.value.最后失败原因,
    连败次数: 离线.value.连败次数,
    熔断阈值,
    上次节拍: 账本.value.当前指令?.节拍,
    上次成功分钟前: 最后调用 > 0 ? (Date.now() - 最后调用) / 60000 : -1,
    接管轮数: 接管轮数.value,
    已分析轮数: 账本.value.已分析轮数 ?? 0,
    章号: 账本.value.章回?.章号,
    幕号: 账本.value.章回?.当前幕号,
    有必演: 有必演.value,
    平静: !!设置.value.导演.平静模式,
    平静场数: 账本.value.平静场数 ?? 0,
  });
});
/** 导演台只放硬性要求的第一行(全文在下面「指令全文」里) */
function 首行(文本: string): string {
  return String(文本 ?? '').split('\n').map(行 => 行.trim()).find(行 => 行 && !行.startsWith('（代码规则）')) ?? '';
}
/** 第二轮方案 5.3: 球上的张力弧(0~10 → 环长百分比)与"本幕有确定事件/兑现目标"的提示点 */
const 张力弧 = computed(() => Math.max(0, Math.min(10, Number(账本.value.张力?.当前) || 0)) * 10);
const 有必演 = computed(() => {
  // 2026-11-12(深化 ④): 一句就够 —— 台上不是「下令」时, 球上那个点必须熄掉(平静 / 熔断 / 剧终 /
  // 暂停注入 / 已跳过 全在这一句里)。以前这里自己列了三条, 漏掉熔断与剧终, 于是熔断期还在亮。
  if (台上.value.结论.种类 !== '下令') return false;
  const 指令 = 账本.value.当前指令;
  return !!指令 && (!!指令.必演 || (指令.前情 ?? []).length > 0);
});
/** 平静模式: 按窗口已经该处理的伏笔(只是给个数, 不催也不改) */
const 到期待办 = computed(() => (设置.value.导演.平静模式 ? 取到期伏笔(账本.value) : []));

/**
 * D 冷启动提示: **直接取状态条的冷启动文案** —— 同一处状态判断, 不许各写一套,
 * 免得出现"状态条说离线、指令预览说冷启动"这种自相矛盾(R0 教训)。
 * 定义必须放在 状态条 之后: 它只是状态条的派生视图。
 */
const 冷启动提示 = computed(() => {
  // 熔断(2026-11-12): 先按台上结论说实话 —— 熔断不是"上次编排没成功",
  // 它是"引擎连败自动停了", 而面板以前会把它归到 warn 那一支去说错原因。
  if (台上.value.结论.原因 === '熔断') return 台上.value.结论.说明;
  // 每个级别各给一句确定的话(不再"可能…或…"让人猜); 原因由上面的状态条说清
  switch (状态条.value.级别) {
    case 'stop':
      return '导演已停用，不会生成指令。';
    case 'over':
      return '已剧终，不再生成指令。';
    case 'cold':
      return `冷启动中：${状态条.value.明细}。`;
    case 'calm':
      return `平静中（已 ${账本.value.平静场数 ?? 0} 场）：只记账，不下令 —— 这一段由你写。`;
    case 'off':
    case 'warn':
      return '上次编排没成功，还没有新指令，原因见上方状态条。';
    // 2026-11-12(深化 ④): 其余一律读**台上结论**那句说明 ——
    // 平静刚结束 / 已跳过 / 待决死亡 / 群聊 / 撒手, 文案只在一个地方写。
    // 以前这里自带一份 switch, 于是"面板说的原因"与"注入层的实际决定"是两条独立的事实。
    default:
      return 台上.value.结论.说明 || '这一幕没有要下达的编排。点「重新推进」可以重新编排。';
  }
});
/** 第二轮方案 5.2: 冷启动期间导演台不摆空卡(状态条已经说了"再演 N 轮") */
const 冷启动中 = computed(() => 状态条.value.级别 === 'cold' || (状态条.value.级别 === 'stop' && !账本.value.章回 && !账本.value.当前指令));
const 控制台文本 = computed(() => consoleStore.lines.map(l => `[${new Date(l.time).toLocaleTimeString()}] ${l.type} ${l.text}`).join('\n'));
const 标签列表文本 = computed({
  get: () => (设置.value.标签.列表 ?? []).join('\n'),
  set: v => {
    设置.value.标签.列表 = 解析名单(String(v ?? ''));
  },
});
/** 世界书排除名单: 一行一条, 标题里含这些字就排除(判定在 共用/世界书排除.ts) */
const 世界书排除文本 = computed({
  get: () => (设置.value.导演.世界书排除 ?? []).join('\n'),
  set: v => {
    设置.value.导演.世界书排除 = 解析名单(String(v ?? ''));
  },
});

// 死亡待决时自动弹开面板, 让用户看到三选一
watch(死亡待决, v => {
  if (v) panelOpen.value = true;
});

function 切主题() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}
/** 直连开关: 每次切换都给直连一次重新尝试的机会(否则降级标记会一直挂着) */
function 切直连() {
  重置直连降级();
  拉取中.value = false;
}
async function 拉取模型() {
  拉取中.value = true;
  try {
    const list = await fetchModelList();
    设置.value.接口.模型列表 = list;
    if (!设置.value.接口.模型 && list.length > 0) 设置.value.接口.模型 = list[0];
  } catch (error) {
    console.warn('[剧情导演] 获取模型列表失败:', error);
    toastError(`拉取模型列表失败：${error instanceof Error ? error.message : String(error)}（也可以直接手填模型名）`, '剧情导演');
  } finally {
    拉取中.value = false;
  }
}
function 加红线() {
  const v = 新红线.value.trim();
  if (v) 设置.value.导演.红线.push(v);
  新红线.value = '';
}
/** 结构化红线: 写进代码闸门的保护角色(去重) */
function 加保护角色() {
  const v = 新保护角色.value.trim();
  if (v && !(设置.value.导演.保护角色 ?? []).includes(v)) 设置.value.导演.保护角色.push(v);
  新保护角色.value = '';
}
function 跳过本幕() {
  命令.跳过本幕();
}
async function 手动推进() {
  await 重新推进();
}
/**
 * 平静模式开关(2026-11-11): 切它同时改**两样**东西 —— 注入内容, 和世界书里那条常驻「编剧备忘」。
 *
 * 备忘是按当时的开关状态**一次性写进世界书**的, 而重写只发生在: 推进成功 / 切聊天 / 删楼swipe / 总开关。
 * 所以以前切完开关, 正文还会继续读到"当前是平静期…上一条指令提到的东西也不必执行"(而注入层已经开始下令),
 * 一路读到下一次推进成功为止 —— 推进被短回复/更新频率/熔断跳过时, 能挂很久。
 *
 * 什么时候写, 要跟**注入层这一轮注什么**对齐(同一个事实不能有两个版本):
 *   - 打开平静            → 写"平静版"(这一轮确实没有本幕剧本);
 *   - 关掉 且 平静场数 = 0 → 写"正常版"(平静一场都没跑过, 手上那道指令仍然有效, 备忘该指向「本幕剧本」);
 *   - 关掉 且 平静场数 > 0 → **不写**。这一轮注入层只出红线(旧编排作废, 见 注入.ts 的 平静前指令作废),
 *     所以"平静版"备忘才是这一轮的说实话; 正常版会说"本幕要推进什么, 见「本幕剧本」", 而那时并没有剧本。
 *     下一次推进成功时 update.ts 会用正常版重写它。
 */
function 切换平静模式() {
  const 当前 = 设置.value;
  if (!当前.启用导演) return; // 总开关关着 = 零影响, 一个字节都不写世界书
  if (当前.导演.平静模式 || !平静前指令作废(账本.value)) {
    sync编剧备忘(账本.value, 当前.导演.注入世界书条目, 当前).catch(error =>
      console.warn('[剧情导演] 切换平静模式后重写编剧备忘失败:', error),
    );
  }
  renew本幕指令(账本.value, 当前, !!死亡待决.value);
}
/**
 * 总开关（用户点名要的"关掉就完全不调用那种"）。OFF 必须**真零影响**：
 *   ① 撤本幕指令（生成前不再注入）② 清世界书备忘（`sync编剧备忘(..., false, ...)` 会让"要写=false"，
 *   走到 注入.ts 的 `清理别处的副本('')` —— 所有候选书里的旧副本一并撤掉）。
 * 重新启用：按 `注入世界书条目` 的当前值写回，并把已就绪的指令重新注入。
 */
function 切换总开关() {
  命令.切换总开关();
}
function 清空() {
  命令.清空();
}
/** 不可撤销操作的二次确认(清空账本 / 清理世界书条目 / 清除已剧终): 先点 → 这里记下是哪一个 → 再点确认才执行 */
const 待确认危险 = ref<'' | '清空' | '清理世界书' | '清除剧终'>('');
async function 确认危险操作() {
  const 做 = 待确认危险.value;
  待确认危险.value = '';
  if (做 === '清空') {
    if (更新中.value) return; // 确认期间开始了编排: 不清(会和正在写入的结果打架)
    清空();
  } else if (做 === '清理世界书') await 清理世界书();
  else if (做 === '清除剧终') 清除剧终();
}
/**
 * 手动清理世界书里的导演条目。
 *
 * 为什么需要按钮: 历届版本用过不同条目名(`【导演】角色状态` / `【导演】伏笔账本` /
 * `【导演】剧情总纲` / `【导演指令 …`), 只靠"关开关时自动清"要等下一次触发;
 * 给一个当场可点、能看清**扫到几条、叫什么、删了几条**的入口最省事。
 */
async function 清理世界书() {
  try {
    const 扫描 = await 列出导演条目();
    if (扫描.length === 0) {
      toastSuccess('世界书里没有导演条目了', '剧情导演');
      return;
    }
    const { 删掉, 疑似 } = await 清空导演条目();
    toastSuccess('找到 ' + 扫描.length + ' 条, 已删除 ' + 删掉.length + ' 条: ' + 删掉.join('、'), '剧情导演');
    // 2026-11-13 A 案: 旧版命名的一条都不删，只列前 3 条让用户手动清理
    if (疑似.length > 0) {
      const 前几条 = 疑似.filter((_, i) => i < 3).map(项 => 项.书 + '#' + 项.条目);
      toastWarning(
        '另有 ' + 疑似.length + ' 条疑似旧版命名（' + 前几条.join('、') + (疑似.length > 3 ? ' 等' : '') + '）—— 旧版命名，插件不再自动删，请手动清理',
        '剧情导演',
      );
    }
  } catch (error) {
    toastError('清理世界书条目失败: ' + String(error), '剧情导演');
  }
}
function 做死亡抉择(项: 死亡抉择) {
  // F 二次确认: 剧终结算不可逆(会永久停引擎), 误点不得即生效
  if (命令.做死亡抉择(项) === '需二次确认') 待确认剧终.value = true;
}
/**
 * 手动全书结算(规格 B)的状态: 两段都要二次确认 —— 结算会改下一道指令, 落幕会停引擎, 都不能误点生效。
 */
const 待确认结算 = ref(false);
const 待确认落幕 = ref(false);
/** 结算卡的数据源: **只读 落幕那一刻的快照**, 不在这里重算(账本会随删楼回退变化, 成绩单不能跟着变) */
const 终值 = computed(() => 账本.value.指标?.终值 ?? null);
/**
 * 第一段(规格 B2): 请求收官 → 下一道指令由 `构造本幕指令` 编排为收束幕。
 * **幂等**由 `请求收官` 保证(已有请求或已剧终就返回 false 且什么都不改) —— 重复点击攒不出多道收官指令。
 */
function 做全书结算() {
  待确认结算.value = false;
  命令.做全书结算();
}
/** F 二次确认后落定剧终: **双写**(账本 + chat 变量 meta)并立即停引擎停注入 */
function 确认剧终() {
  待确认剧终.value = false;
  待确认落幕.value = false;
  命令.确认剧终();
}
/** F 面板出口: 清除已剧终(两边都清), 自动路径恢复。规格 B4: **连 收官请求 与 终值 一起清**, 否则会一直出收束幕 */
function 清除剧终() {
  命令.清除剧终();
}
/** I 手动恢复自动接管(连败计数清零、解除暂停) */
function 恢复自动接管() {
  离线.value = 命令.恢复自动接管();
}
function 清空离线计数() {
  离线.value = 命令.清空离线计数();
}
/** H 测试连接: 两步探测, 把配置缺失/接口真错/推理模型吃满预算分类报出 */
async function 点击测试连接() {
  测试中.value = true;
  try {
    // 刚在输入框里改的配置还没过 300ms 防抖, 这里先立即落盘再测
    立即保存设置(设置.value);
    测试结果.value = await 测试连接();
  } catch (error) {
    测试结果.value = { 可用: false, 类别: '未知', 提示: error instanceof Error ? error.message : String(error), 探测: [] };
  } finally {
    测试中.value = false;
  }
}
/** 账本修笔: 手动改状态并立即写回快照(删中段楼后纠正用) */
function 改伏笔状态(编号: number, 值: string) {
  命令.改伏笔状态(编号, 值);
}
function 改冲突阶段(名: string, 值: string) {
  命令.改冲突阶段(名, 值);
}
function 改弧线阶段(角色: string, 值: string) {
  命令.改弧线阶段(角色, 值);
}

// ---------------------------------------------------------------------------
// 导演台「改这一层」(2026-11-08 用户要求: "导演台不能编辑, 我想改一点东西都不行")
// 只开三个字段: 节拍 / 本幕已确定 / 硬性要求 —— 它们真的进注入, 改完下一段正文就变;
// 其余字段(编号、代码调整、核验升级次数、知情核对)归代码所有, 手改只会让核验和日志对不上。
// 草稿与账本分离: 边打字边重注入没有意义, 点「应用到这一层」才走 命令.改当前指令。
// ---------------------------------------------------------------------------
const 指令草稿 = ref({ 节拍: '', 必演内容: '', 必演镜头外: false, 必演既成事实: false, 硬性要求: '' });
function 重置指令草稿() {
  const 指令 = 账本.value.当前指令;
  指令草稿.value = {
    节拍: 指令?.节拍 ?? 节拍列表[0],
    必演内容: 指令?.必演?.内容 ?? '',
    必演镜头外: !!指令?.必演?.镜头外,
    必演既成事实: !!指令?.必演?.既成事实,
    硬性要求: 指令?.硬性要求 ?? '',
  };
}
/** 每次展开都填成"当前真实值", 不残留上次没应用的草稿 */
watch(
  () => 展开集.value.includes('改这一层'),
  开 => {
    if (开) 重置指令草稿();
  },
);
function 保存指令草稿() {
  const 改了 = 命令.改当前指令({
    节拍: 指令草稿.value.节拍,
    硬性要求: 指令草稿.value.硬性要求,
    必演内容: 指令草稿.value.必演内容,
    必演镜头外: 指令草稿.value.必演镜头外,
    必演既成事实: 指令草稿.value.必演既成事实,
  });
  if (!改了) {
    toastSuccess('没有改动', '剧情导演');
    return;
  }
  切展开('改这一层');
}

// ---------------------------------------------------------------------------
// 第二轮方案 2.1: 书纲页 —— 用户覆盖存聊天变量(不随删楼回滚), 改完 reload 让账本叠上覆盖
// ---------------------------------------------------------------------------
/** 默认折叠(内存态, 不写盘): 切页签/刷新即收回, 与防剧透同一口径 */
const 书纲已揭开 = ref(false);
watch(当前页, () => {
  书纲已揭开.value = false;
});
const 书纲覆盖 = ref<书纲覆盖类型>(读书纲覆盖());
// 账本重载(切聊天/推进完/删楼)时一并重读覆盖: 导演消费了「请求重写」后按钮要恢复
watch(
  () => stateStore.data,
  () => {
    书纲覆盖.value = 读书纲覆盖();
  },
);
const 书纲挂靠 = computed(() => 挂靠伏笔(账本.value.书纲 ?? null, [...(账本.value.伏笔 ?? []), ...(账本.value.历史档案?.伏笔 ?? [])]));
const 待否决 = ref('');
const 否决原因 = ref('');
const 待确认重写书纲 = ref(false);
function 存书纲覆盖(改: (覆盖: 书纲覆盖类型) => void) {
  const 新 = 规范化书纲覆盖(JSON.parse(JSON.stringify(读书纲覆盖())));
  改(新);
  if (写书纲覆盖(新)) {
    书纲覆盖.value = 新;
    stateStore.reload();
  }
}
function 改核心问题(值: string) {
  存书纲覆盖(覆盖 => {
    覆盖.核心问题 = 值.trim() || undefined;
  });
}
/** 手改「主角欲望」主句(2026-11-12): 只覆盖"想要", 为什么/失去 两项仍用导演写的 */
function 改欲望(值: string) {
  存书纲覆盖(覆盖 => {
    覆盖.欲望 = 值.trim() || undefined;
  });
}
/** 手改 B 线"在争什么"(2026-11-12): 人和进度仍用导演写的 */
function 改B线(值: string) {
  存书纲覆盖(覆盖 => {
    覆盖.B线 = 值.trim() || undefined;
  });
}
function 改真相(ID: string, 键: '真相' | '揭晓时机', 值: string) {
  const 文本 = 值.trim();
  if (键 === '真相' && !文本) return; // 真相不能改成空(要删就用否决)
  存书纲覆盖(覆盖 => {
    覆盖.真相[ID] = { ...(覆盖.真相[ID] ?? {}), [键]: 文本 };
  });
}
function 切锁定(ID: string, 锁: boolean) {
  存书纲覆盖(覆盖 => {
    const 项 = { ...(覆盖.真相[ID] ?? {}) };
    // 解锁要显式写 false: 锁定已经随快照存进了账本, 删掉覆盖里的键盖不掉它
    项.锁定 = 锁;
    覆盖.真相[ID] = 项;
  });
}
function 否决真相(ID: string) {
  存书纲覆盖(覆盖 => {
    覆盖.否决[ID] = 否决原因.value.trim();
    delete 覆盖.真相[ID];
  });
  待否决.value = '';
}
function 请求重写书纲() {
  存书纲覆盖(覆盖 => {
    覆盖.请求重写 = true;
  });
  待确认重写书纲.value = false;
}
async function 复制报错() {
  // 每次尝试各留一份(v2.8.5 D1): 失败那次的完整原文也要复制出去, 否则线上失败没法回放
  const 尝试段 = (debug.value?.尝试 ?? [])
    .filter((_, i, arr) => arr.length > 1)
    .map(项 => `── 第 ${项.次} 次尝试${项.错误 ? `（失败: ${项.错误}）` : '（通过）'} ──\n${项.原文 || '(这次没拿到输出)'}`);
  const text = [debug.value?.error, ...(debug.value?.备注 ?? []), debug.value?.request, debug.value?.response, ...尝试段]
    .filter(Boolean)
    .join('\n\n────────\n\n');
  const 内容 = text || '(无报错)';
  try {
    await navigator.clipboard.writeText(内容);
    toastSuccess('已复制，可以直接粘贴给助手', '剧情导演');
  } catch {
    // iframe / 非 https 下剪贴板 API 可能被拒: 退回老办法
    try {
      const 区 = document.createElement('textarea');
      区.value = 内容;
      document.body.appendChild(区);
      区.select();
      const 成 = document.execCommand('copy');
      区.remove();
      if (成) toastSuccess('已复制，可以直接粘贴给助手', '剧情导演');
      else throw new Error('execCommand 返回 false');
    } catch {
      console.warn('[剧情导演] 复制失败');
      toastError('复制失败：浏览器不允许访问剪贴板。可以在「日志」页手动选中复制。', '剧情导演');
    }
  }
}
</script>

<!-- 2026-11-12 P5 第二批：scoped 样式搬到 悬浮球样式.scss（逐行 diff 为 0，只搬不改）。
     契约 §二B：只搬 style，不动 template、不拆 script —— 那是行为重构，不是搬家。 -->
<style lang="scss" scoped src="./悬浮球样式.scss"></style>
