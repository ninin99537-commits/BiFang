<template>
  <!--
    布局纪律(2026-11-10 重构):
      ① **单列铺满正文区**(不设量宽上限, 与仪表盘/人物/日志同宽): 原来那套 `auto-fit minmax(400px)`
         两列看着省地方, 实际是"列高由内容决定"的伪瀑布流: 五组高度差 2~4 倍, 两列各自到底,
         中间留下大片空白(实测空掉约 35% 的栅格面积), 读的时候还得左右横跳。
         行宽由控件自己管: 说明文字 74ch、数字框 200px, 输入框才拉满。
      ② **五组按"改得勤 → 改得少"排**: 接口 / 幕后更新 / 世界书 / 标签过滤 / 数据备份。
         原来「幕后更新」一组 1154px 里塞了更新节奏 + 世界书写入两件事, 现在拆成 02 / 03。
         ⚠ 2026-11-19: 原来是**六组**, 删掉了第四节（功能已并入「拼装」页）。
      ③ **只有三种行**: 开关行(标题+说明+右侧开关) / 字段行(120px 标签槽+控件+行内动作) /
         分段行(标签+分段控件)。同一页里出现第四种排法就算破规矩。
      ④ **说明文字一行封顶**(.bf-page-settings .bf-hint 限 74ch, 12px): 原理与长表格塞进
         <details>, 不再用 12.5px 的灰色正文铺满整页(原来 19 段说明占 885px, 将近四成页高)。
      ⑤ 分组之间用 1px 分隔线 + 编号, 不新造卡片皮 —— 面板其余几页就是"分隔线"这套语言。
      ⑥ 04–06 默认收起(改得少的三组先站成一行目录): 收起态也留着编号、标题与状态摘要,
         点标题展开; 用的原生 <details>, 与壳里报错详情是同一套。
  -->
  <section ref="根节点" class="bf-page bf-page-settings">
    <aside class="bf-set-nav" aria-label="设置分节">
      <div class="bf-set-nav-head">设置分节</div>
      <button
        v-for="节 in 章节表"
        :key="节.key"
        class="bf-set-link"
        :class="{ active: 当前章节 === 节.key }"
        :aria-current="当前章节 === 节.key ? 'true' : undefined"
        :data-节="节.key"
      >
        <b>{{ 节.编号 }} {{ 节.标题 }}</b>
        <span>{{ 节.摘要() }}</span>
      </button>
    </aside>

    <div class="bf-settings">
      <header class="bf-page-head">
        <div>
          <h2 class="bf-page-title">设置</h2>
          <p class="bf-page-sub">接口、更新、世界书、标签与备份。改动后自动保存（停止输入约 0.3 秒落盘；「写入世界书」立即生效）。</p>
        </div>
      </header>
      <!-- 01 接口 -->
      <section class="bf-setting-group" aria-labelledby="bf-set-api">
        <header class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">01</span>
          <h3 id="bf-set-api">接口</h3>
          <span class="bf-set-aside">{{ settings.接口.模型 || '未选模型' }}</span>
        </header>

        <!-- ── 配置预设：放在**最上面**（2026-11-19 需求方 #310 ①）──
             用户要求「先选预设，再改字段」。
             原来它在所有接口字段**之后** —— 那意味着要切预设得先滚到底。 -->
        <h4 class="bf-subgroup-title">配置预设</h4>
        <div class="bf-set-row bf-set-row-inline">
          <label class="bf-form-label" for="bf-preset-name">预设名</label>
          <input
            id="bf-preset-name"
            v-model="presetName"
            class="bf-input"
            placeholder="如 DeepSeek"
            @keyup.enter="saveApiPreset"
          />
          <button class="bf-btn bf-btn-sm" @click="saveApiPreset">保存当前</button>
        </div>
        <div v-if="presetNames.length > 0" class="bf-set-row bf-set-row-inline">
          <label class="bf-form-label" for="bf-preset-select">已保存</label>
          <select id="bf-preset-select" v-model="selectedPreset" class="bf-select">
            <option value="">（选择预设加载）</option>
            <option v-for="name in presetNames" :key="name" :value="name">{{ name }}</option>
          </select>
          <button class="bf-btn bf-btn-sm" @click="loadApiPreset">加载</button>
          <button class="bf-btn bf-btn-sm" @click="deleteApiPreset">删除</button>
        </div>
        <p class="bf-hint">把当前接口配置存成一套，换接口时一键切回。</p>

        <div class="bf-set-row">
          <label class="bf-form-label" for="bf-api-url">地址</label>
          <input id="bf-api-url" v-model="settings.接口.地址" class="bf-input" placeholder="https://api.example.com/v1" />
        </div>

        <div class="bf-set-row bf-set-row-inline">
          <label class="bf-form-label" for="bf-api-key">API 密钥</label>
          <input
            id="bf-api-key"
            v-model="settings.接口.密钥"
            class="bf-input"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
          />
          <button type="button" class="bf-btn bf-btn-sm" @click="showKey = !showKey">
            {{ showKey ? '隐藏' : '显示' }}
          </button>
        </div>

        <div class="bf-set-row">
          <label class="bf-form-label" for="bf-api-model">模型</label>
          <!-- 输入框 + 下拉按钮 + 自绘候选面板(照 人设工坊 #236 ③ 的教训)。
               为什么不用原生 <datalist>: 它按输入框当前值过滤候选 —— 已经填了
               `gemini-3.7-flash` 再展开下拉, 就只剩匹配项(甚至一项都不剩), 必须先把
               输入框删空才看得到别的模型。自绘面板每次打开都列全部, 与当前值无关;
               只有点候选项才写 模型, 开/关列表不会弄丢已配好的值。
               为什么要能手填: `/models` 不是 OpenAI 兼容协议强制要求的端点, 有的接口
               (自建网关/只实现 /chat/completions 的服务)根本拉不到列表。 -->
          <div class="bf-model-field">
            <input
              id="bf-api-model"
              v-model="settings.接口.模型"
              class="bf-input"
              autocomplete="off"
              placeholder="选择或直接手填模型名"
            />
            <button
              type="button"
              class="bf-btn bf-btn-sm bf-model-toggle"
              title="选择模型"
              :aria-expanded="模型候选开"
              aria-haspopup="listbox"
              @click="模型候选开 = !模型候选开"
            >
              ▾
            </button>
            <!-- 点面板外关闭用的透明遮罩: 不吃布局, 只吃点击 -->
            <div v-if="模型候选开" class="bf-model-mask" @click="模型候选开 = false"></div>
            <ul v-if="模型候选开" class="bf-model-cand" role="listbox" aria-label="模型列表">
              <li
                v-for="model in modelList"
                :key="model"
                role="option"
                tabindex="0"
                :aria-selected="model === settings.接口.模型"
                @click="选模型(model)"
                @keydown.enter.prevent="选模型(model)"
                @keydown.space.prevent="选模型(model)"
              >
                {{ model }}
              </li>
              <li v-if="!modelList.length" class="bf-model-cand-empty">还没有候选，先点「获取模型列表」，或直接手填模型名</li>
            </ul>
          </div>
        </div>

        <div class="bf-set-actions">
          <button class="bf-btn bf-btn-sm" :disabled="fetchingModels" @click="loadModels">
            {{ fetchingModels ? '获取中…' : '获取模型列表' }}
          </button>
          <button class="bf-btn bf-btn-sm" :disabled="testing" @click="testConnection">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
        </div>
        <p class="bf-hint">拉不到列表不代表接口不能用 —— 没有 /models 端点的接口直接手填模型名，再测一次连接。</p>

        <div class="bf-set-pairs">
          <div class="bf-set-row">
            <label class="bf-form-label" for="bf-api-temp">温度</label>
            <input
              id="bf-api-temp"
              v-model.number="settings.接口.温度"
              class="bf-input bf-set-num"
              type="number"
              min="0"
              max="2"
              step="0.1"
            />
          </div>
          <div class="bf-set-row">
            <label class="bf-form-label" for="bf-api-token">最大输出 Token</label>
            <input
              id="bf-api-token"
              v-model.number="settings.接口.最大token"
              class="bf-input bf-set-num"
              type="number"
              min="1"
              max="131072"
            />
          </div>
        </div>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>流式输出</b>
            <span>逐段接收模型返回的内容</span>
          </span>
          <input v-model="settings.接口.流式" type="checkbox" class="bf-switch" />
        </label>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>直连接口</b>
            <span>由彼方在浏览器里直接请求，需要接口允许跨域</span>
          </span>
          <input v-model="settings.接口.直连" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">关：酒馆服务器转发，无跨域问题。开：浏览器直连，预设、世界书与其他扩展都碰不到请求体。</p>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>工具通道</b>
            <span>让 AI 填一张表</span>
          </span>
          <input v-model="settings.接口.工具通道" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">
          让 AI 填一张表：连剧情内容也一起放进表里，对话只留一句指令。
          <br />打开期间「流式输出」和「预填充」不起作用。
        </p>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>请求打散</b>
            <span>每次请求开头加一小段随机字符</span>
          </span>
          <input v-model="settings.接口.请求打散" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">
          每次请求开头加一小段随机字符，让每次请求都不一样。
          <br />代价：变慢、更费 token。
        </p>

        <p class="bf-hint">把当前接口配置存成一套，换接口时一键切回。</p>
      </section>

      <!-- 02 幕后更新 -->
      <section class="bf-setting-group" aria-labelledby="bf-set-update">
        <header class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">02</span>
          <h3 id="bf-set-update">幕后更新</h3>
          <span class="bf-set-aside">每 {{ settings.更新.更新频率 }} 条回复</span>
        </header>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>启用幕后系统</b>
            <span>关闭后不再调用 AI 更新或注入，已有状态数据保留</span>
          </span>
          <input v-model="settings.启用幕后" type="checkbox" class="bf-switch" />
        </label>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>AI 回复后自动更新</b>
            <span>按照设定的频率读取最近剧情</span>
          </span>
          <input v-model="settings.更新.自动更新" type="checkbox" class="bf-switch" />
        </label>

        <!-- 从属组(A31): 自动更新关掉时置灰半透明, 但保留可见 —— 让玩家看得见"关掉后还有什么" -->
        <div class="bf-setting-sub" :class="{ 'is-off': !settings.更新.自动更新 }">

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>慢一步（不分析最新一层）</b>
            <span>开启后，彼方只分析到倒数第二层——状态永远比正文晚一步，但刚生成、可能被重roll的回复不会影响状态。</span>
          </span>
          <input v-model="settings.更新.慢一步" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">只影响自动更新；点「立即更新」时仍然分析到最新一层。</p>

        <div class="bf-set-pairs">
          <div class="bf-set-row">
            <label class="bf-form-label" for="bf-update-freq">更新频率</label>
            <input id="bf-update-freq" v-model.number="settings.更新.更新频率" class="bf-input bf-set-num" type="number" min="1" />
          </div>
          <div class="bf-set-row">
            <label class="bf-form-label" for="bf-update-read">读取回复数</label>
            <input
              id="bf-update-read"
              v-model.number="settings.更新.读取最近回复数"
              class="bf-input bf-set-num"
              type="number"
              min="1"
              max="20"
            />
          </div>
        </div>
        <p class="bf-hint">每 N 条回复更新一次；更新时读取最近 N 条 AI 回复。</p>
        </div>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>正文新角色自动建档</b>
            <span>只追踪剧情中有持续作用的人物</span>
          </span>
          <input v-model="settings.更新.自动建档" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">关闭后只更新已追踪的人物；手动加到名单里的名字仍会建档。</p>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>追踪当前角色卡角色</b>
            <span>仅群聊时角色卡名才是角色</span>
          </span>
          <input v-model="settings.更新.追踪当前角色" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">角色写在世界书里时保持关闭。</p>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>女性 NPC 生理监测</b>
            <span>维护周期、受孕与结算字段，随状态卡一同注入</span>
          </span>
          <input v-model="settings.更新.生理监测" type="checkbox" class="bf-switch" />
        </label>
        <div class="bf-set-note">
          <p class="bf-hint">关掉只是暂停，数据留在卡上；要彻底清掉这些字段才点右边。</p>
          <button class="bf-text-btn bf-text-btn-danger" type="button" @click="确认清空生理数据">清空生理数据</button>
        </div>

        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>预填充（prefill）</b>
            <span>追加 assistant 消息，引导直接从 JSON 输出</span>
          </span>
          <input v-model="settings.更新.预填充" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">报错时先关掉它。</p>
      </section>

      <!-- 03 世界书 -->
      <section class="bf-setting-group" aria-labelledby="bf-set-worldbook">
        <header class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">03</span>
          <h3 id="bf-set-worldbook">世界书</h3>
          <span class="bf-set-aside">{{ settings.更新.世界书写入 }}</span>
        </header>

        <h4 class="bf-subgroup-title">写入 · 把状态存成条目</h4>
        <div class="bf-set-row">
          <span class="bf-form-label" id="bf-set-worldbook-label">目标</span>
          <div class="bf-seg" role="group" aria-labelledby="bf-set-worldbook-label">
            <button
              v-for="目标 in 世界书写入目标表"
              :key="目标"
              class="bf-seg-btn"
              :class="{ active: settings.更新.世界书写入 === 目标 }"
              :aria-pressed="settings.更新.世界书写入 === 目标"
              @click="settings.更新.世界书写入 = 目标"
            >
              {{ 目标 }}
            </button>
          </div>
        </div>
        <p class="bf-hint">角色卡主世界书随当前发言者变（群聊里每个成员一本）；聊天世界书一场聊天一本。换目标不会删掉另一本里的旧条目。</p>

        <h4 class="bf-subgroup-title">读取 · 给彼方接口注入世界书</h4>
        <label class="bf-switch-row">
          <span class="bf-switch-copy">
            <b>注入世界书内容</b>
            <span>按酒馆 AI 的方式激活世界书条目</span>
          </span>
          <input v-model="settings.更新.注入世界书" type="checkbox" class="bf-switch" />
        </label>
        <p class="bf-hint">不读全局世界书，只读当前角色卡与聊天绑定的世界书。</p>

        <div class="bf-set-pairs">
          <label class="bf-field-block">
            <span class="bf-form-label">常驻注入条目</span>
            <textarea
              v-model="worldbookAlwaysDraft"
              class="bf-textarea bf-textarea-sm"
              rows="3"
              placeholder="角色名 / 人设条目名，如「苏禾」或「人设」"
            ></textarea>
            <span class="bf-hint">每行一个条目名或关键词，每次都强制注入；匹配不到会静默跳过。</span>
          </label>
          <label class="bf-field-block">
            <span class="bf-form-label">排除条目</span>
            <textarea
              v-model="worldbookExcludeDraft"
              class="bf-textarea bf-textarea-sm"
              rows="3"
              placeholder="[mvu_update]"
            ></textarea>
            <span class="bf-hint">每行一条，条目<b>标题或备注里含这些字就排除</b>（不分大小写），不用写全名——填一条 [mvu_update] 就能一次排掉 [mvu_update]1、[mvu_update]2…</span>
          </label>
        </div>
      </section>

      <!-- 05 标签过滤: 默认收起 -->
      <details class="bf-setting-group bf-set-group">
        <summary class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">04</span>
          <h3 id="bf-set-tags">标签过滤</h3>
          <span class="bf-set-aside">{{ settings.标签.模式 }}</span>
        </summary>

        <div class="bf-set-row">
          <span class="bf-form-label" id="bf-tag-mode-label">模式</span>
          <div class="bf-seg" role="group" aria-labelledby="bf-tag-mode-label">
            <button
              class="bf-seg-btn"
              :class="{ active: settings.标签.模式 === '排除' }"
              :aria-pressed="settings.标签.模式 === '排除'"
              @click="settings.标签.模式 = '排除'"
            >
              排除
            </button>
            <button
              class="bf-seg-btn"
              :class="{ active: settings.标签.模式 === '只读' }"
              :aria-pressed="settings.标签.模式 === '只读'"
              @click="settings.标签.模式 = '只读'"
            >
              只读
            </button>
          </div>
        </div>

        <label class="bf-field-block">
          <span class="bf-form-label">标签列表</span>
          <textarea
            v-model="tagDraft"
            class="bf-textarea bf-textarea-sm"
            rows="4"
            placeholder="aftertalk&#10;thinking&#10;branches"
          ></textarea>
        </label>
        <p class="bf-hint">
          <template v-if="settings.标签.模式 === '排除'"
            >排除这些标签里的内容，一行一条，直接写标签名（如 thinking，不用尖括号）；残留的孤立
            &lt;/标签&gt; 只删标签本身，不会连正文一起删。</template
          >
          <template v-else>只读取这些标签内的内容，一行一条；没有这些标签的楼层保留原文。</template>
        </p>
      </details>

      <!-- 05 数据备份: 默认收起(救急时才用) -->
      <details class="bf-setting-group bf-set-group">
        <summary class="bf-set-head">
          <span class="bf-set-index" aria-hidden="true">05</span>
          <h3 id="bf-set-backup">数据备份</h3>
          <span class="bf-set-aside">状态只存楼层里，删楼就没</span>
        </summary>

        <div class="bf-set-note">
          <p class="bf-hint">导出复制成一段文本；导入走同一条保存通道（写快照 + 重同步世界书）。大段删楼（/cut）之后靠它恢复。</p>
          <button class="bf-btn bf-btn-sm" type="button" @click="导出数据">导出并复制</button>
        </div>

        <details class="bf-fold bf-set-fold">
          <summary>从文本导入</summary>
          <div class="bf-set-fold-body">
            <textarea
              v-model="导入文本"
              class="bf-textarea bf-textarea-sm"
              rows="4"
              placeholder='{"备份版本":1,"数据":{…}}'
            ></textarea>
            <div class="bf-actions">
              <button class="bf-btn bf-btn-sm" type="button" :disabled="!导入文本.trim()" @click="导入数据">导入</button>
            </div>
          </div>
        </details>
      </details>
    </div>
  </section>
</template>

<script setup lang="ts">
import { use设置面板 } from './设置面板';

const {
  settings, showKey, modelList, 模型候选开, 选模型, fetchingModels, testing, loadModels, testConnection,
  presetName, presetNames, selectedPreset, saveApiPreset, loadApiPreset, deleteApiPreset,
  worldbookAlwaysDraft, worldbookExcludeDraft, tagDraft, 世界书写入目标表,
  导出数据, 导入数据, 导入文本, 清空生理数据,
} = use设置面板();

// ---- 左侧章节目录(§4.5): 5 节 + 实时摘要; 点击平滑滚动, 滚动时反查高亮 ----
// **2026-11-19：从 6 节变 5 节** —— 第四节删了（功能已并入「拼装」页，
//  而用户在导航里能直接看到它，不需要设置里再放一个指路牌）。
//  留一个指向别处的空壳，那个壳本身就是障碍。
const 章节表 = computed(() => [
  { key: 'bf-set-api', 编号: '01', 标题: '接口与模型', 摘要: () => settings.value.接口?.模型 || '未填模型' },
  {
    key: 'bf-set-update',
    编号: '02',
    标题: '幕后更新',
    摘要: () =>
      `${settings.value.更新?.自动更新 ? '自动' : '手动'} · 每 ${settings.value.更新?.更新频率 ?? 1} 层 · 读 ${settings.value.更新?.读取最近回复数 ?? 3} 条`,
  },
  { key: 'bf-set-worldbook', 编号: '03', 标题: '世界书', 摘要: () => settings.value.更新?.世界书写入 || '关闭' },
  { key: 'bf-set-tags', 编号: '04', 标题: '标签过滤', 摘要: () => settings.value.标签?.模式 || '排除' },
  { key: 'bf-set-backup', 编号: '05', 标题: '数据备份', 摘要: () => 'JSON' },
]);

const 根节点 = ref<HTMLElement | null>(null);
const 当前章节 = ref('bf-set-api');

/** 本页真正所在的那个 document。
 *  **跨文档是结构性前提**: 面板 UI 渲染在「球 iframe」的文档里, 而本模块的代码跑在
 *  「脚本 iframe」的 JS 上下文里 —— 两者是不同的 document。任何 DOM 级操作(监听/查询/
 *  创建节点)只要用裸 `document`, 拿到的都是脚本 iframe 那份, 而 UI 节点根本不在那里,
 *  于是**静默失效、不报错**。取节点一律走这里。 */
function 界面文档(): Document | null {
  return 根节点.value?.ownerDocument ?? null;
}

/** 点目录: 展开折叠组(04–06 是 details) + 平滑滚到该节 */
function 跳到章节(id: string) {
  const 文档 = 界面文档();
  if (!文档) {
    诊断('跳到章节', { 结果: '没有 UI 文档' });
    return;
  }
  const 目标 = 文档.getElementById(id);
  if (!目标) {
    诊断('跳到章节', { 结果: '找不到节点', id });
    return;
  }
  const 折叠 = 目标.closest('details');
  if (折叠) 折叠.open = true;
  当前章节.value = id;
  目标.scrollIntoView({ behavior: 'smooth', block: 'start' });
  诊断('跳到章节', { id, 文档: 文档 === (window as any).document ? '脚本 iframe 文档' : 'UI 文档' });
}

/** 滚动时反查: 取「已越过顶部 80px」的最后一节作为当前章节(与设计稿同一口径) */
function 同步当前章节() {
  const 文档 = 界面文档();
  if (!文档) return;
  // 不依赖 ref: 容器可能已重建, 直接按选择器取当前真实节点
  const 容器 = 文档.querySelector('.bf-page-settings .bf-settings') as HTMLElement | null;
  if (!容器) return;
  const 基准 = 容器.getBoundingClientRect().top + 80;
  let 命中 = 章节表.value[0].key;
  for (const 节 of 章节表.value) {
    const 元素 = 文档.getElementById(节.key);
    if (元素 && 元素.getBoundingClientRect().top <= 基准) 命中 = 节.key;
  }
  当前章节.value = 命中;
  诊断('同步当前章节', { 命中, scrollTop: Math.round(容器.scrollTop), 基准: Math.round(基准) });
}

// ---- 目录交互: 挂到「本页所在的那个 document」上（容器重建免疫）, 不走模板绑定 ----
// TD-3: 本页两处模板绑定静默失效（`@click="跳到章节(节.key)"` / `@scroll="同步当前章节"`）——
// 编译产物正常、handler 从未执行、同页其它 @click 全正常，根因未定位。
//
// 三轮踩出来的挂载纪律（每一轮都因上一条错法而失败, 别再退回去）:
//   ① **挂 UI 文档, 不挂 `document`**: 面板 UI 在「球 iframe」的文档里, 本模块代码在
//      「脚本 iframe」的上下文里 —— 两个 document。v3 用裸 `document` 挂, 监听确实挂上了
//      (诊断写在脚本 iframe 的 window 上), 但 UI 的点击/滚动永远到不了它(验收实证)。
//      目标文档一律由 `根节点.ownerDocument` 求, 与 `悬浮球界面.vue` 的 `frameWin` 同源。
//   ② **不等 ref 填充就提前 return**: v1/v2 挂在 onMounted→nextTick 里取模板 ref, 真包上
//      取到 null 就在 `if (!导航 || !滚动容器) return;` 返回, 两行 addEventListener 从未执行。
//      这里改成 `watch(根节点, …, { immediate: true })` + 非空才挂, 并保持幂等(先摘后挂)。
//   ③ click / scroll 都必须 **capture: true**: `.bf-panel` 上有 `@click.stop`, 冒泡阶段的
//      document 委托收不到面板内的 click; scroll 本身不冒泡。
let 目录监听: (() => void) | null = null;

/** 诊断: 只在 `调试.暴露状态 === true` 时记录（复用 TD-1 那个后门开关，不新增裸挂）。 */
function 诊断(阶段: string, 附加?: Record<string, unknown>) {
  if (settings.value.调试?.暴露状态 !== true) return;
  const 文档 = 界面文档();
  const w = (文档?.defaultView ?? null) as any;
  if (!w) return;
  w.__bfNavDiag = { ...(w.__bfNavDiag || {}), [阶段]: { at: Date.now(), ...附加 } };
}

function 摘目录监听() {
  目录监听?.();
  目录监听 = null;
}

function 挂目录监听() {
  摘目录监听();
  const 文档 = 界面文档();
  if (!文档) return;
  const onClick = (事件: Event) => {
    const 目标 = 事件.target as HTMLElement | null;
    // 只认设置页内的点击, 不干扰其它页
    if (!目标 || typeof 目标.closest !== 'function' || !目标.closest('.bf-page-settings')) return;
    const 按钮 = 目标.closest('.bf-set-link') as HTMLElement | null;
    const id = 按钮?.dataset.节;
    if (id) 跳到章节(id);
  };
  // scroll 不冒泡, 必须在捕获阶段接; 只认设置页那个滚动容器
  const onScroll = (事件: Event) => {
    const 目标 = 事件.target as HTMLElement | null;
    if (目标 && typeof 目标.classList?.contains === 'function'
      && 目标.classList.contains('bf-settings') && 目标.closest('.bf-page-settings'))
      同步当前章节();
  };
  文档.addEventListener('click', onClick, true);
  文档.addEventListener('scroll', onScroll, true);
  目录监听 = () => {
    文档.removeEventListener('click', onClick, true);
    文档.removeEventListener('scroll', onScroll, true);
  };
  诊断('已挂载', {
    文档: 文档 === (window as any).document ? '脚本 iframe 文档' : 'UI 文档',
    根节点: !!根节点.value,
  });
}

// 根节点一就位就挂(immediate: 若 setup 时已有则当场挂), 之后组件重建也重挂。
// 摘挂用的是同一个 `目录监听` 闭包 —— 里面捕获的就是挂载时那个 document, 不会摘到另一个。
watch(根节点, 元素 => {
  if (元素) 挂目录监听();
  else 摘目录监听();
}, { immediate: true });
onUnmounted(() => {
  摘目录监听();
  const w = (界面文档()?.defaultView ?? null) as any;
  if (w) delete w.__bfNavDiag;
});

// 开关关掉时把诊断也撤掉: **默认零全局变量** —— `__bfNavDiag` 只在开关为 true 期间存在。
watch(() => settings.value.调试?.暴露状态, 开 => {
  if (开) return;
  const w = (界面文档()?.defaultView ?? null) as any;
  if (w) delete w.__bfNavDiag;
});

/** 插入位置: 消息级锚点 —— 这一节已并入「拼装」页（2026-11-19），
 *  锚点概念只保留在迁移映射里（见 条目列表.ts 的 `迁移旧段`）。
 *  这里不再有编辑入口，所以不再声明 锚点选项 / 添加 / 删除。 */
function 确认清空生理数据() {
  if (window.confirm('清空所有 NPC 的生理数据？好感/恋爱等其它字段不受影响，清掉的数据不可恢复。'))
    清空生理数据();
}
</script>
