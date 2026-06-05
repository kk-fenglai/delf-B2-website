# AI 口语全真模拟功能实现总结

DELF B2 Production Orale（口语）的全真模拟与 AI 评分功能。学生按官方流程「30 min 准备 → 5 min 独白 → 与考官辩论 → 提交」完成模拟，系统将所有录音送入队列，先用 **DashScope ASR** 转写，再由 **DeepSeek V3 / Qwen** 按官方 25 分网格 9 维度打分。

> **设计原则**：第二部分「与考官互动辩论」用**题库静态问题**而不是实时 AI 对话——管理员预置 4-5 个 follow-up 问题，学生依次录答。这样零实时推理成本、对带宽要求低，又能完整覆盖官方流程。

---

## 一、与官方 DELF B2 PO 流程对齐

| 阶段 | 时长 | 学生动作 | 系统动作 |
|---|---|---|---|
| Préparation | 30 min（练习模式 5 min，可手动「提前开始」） | 阅读 1 篇短文 + 写笔记 | 倒计时 + 笔记 localStorage 自动暂存 |
| Partie 1 · Monologue | 5-7 min | 基于短文表达个人立场 | 单次录音 + 计时硬截止 |
| Partie 2 · Débat | 5-10 min | 依次回答 4-5 个考官问题 | 每问 90s 限时录答 |
| 评分 | 后台 | — | STT 转写 + LLM 按 25 分网格批改 |

---

## 二、后端实现

### 1. 评分网格 `backend/src/constants/delfOralRubric.js`

官方 PO B2 9 维度 25 分（与 PE 的 10 维度网格不同——口语没有「orthographe」、没有「consigne」，但多了 `interaction` 和 `phonologie`）：

| key | max | 说明 |
|---|---|---|
| `presentation` | 2 | Présenter le point de vue |
| `argumentation` | 4 | Argumenter / défendre |
| `interaction` | 4 | Réagir et dialoguer（**仅评估 [REPONSE i] 段**） |
| `aisance` | 3 | Aisance et fluidité |
| `lexique_etendue` | 2 | 词汇广度 |
| `lexique_maitrise` | 2 | 词汇准确度 |
| `morphosyntaxe_etendue` | 3 | 句法广度 |
| `morphosyntaxe_maitrise` | 2 | 句法准确度 |
| `phonologie` | 3 | 语音、节奏、流畅度（**仅基于转写文本特征**） |

同文件还导出录音时长策略（`MONOLOGUE_MAX_SEC = 300` / `FOLLOW_UP_MAX_SEC = 90` / `PREP_DEFAULT_SEC = 1800` / `PREP_PRACTICE_SEC = 300`）以及最低词数（`MIN_WORDS = 80`，约 50s 慢速 B2 法语）。

### 2. STT 服务 `backend/src/services/stt.js`

- **协议**：DashScope OpenAI 兼容模式的 `audio.transcriptions.create()`，复用 `openai` SDK
- **默认模型**：`qwen-audio-asr`（`DASHSCOPE_ASR_MODEL` env 可切 `paraformer-v2` / `sensevoice-v1` / `whisper-1`）
- **输入**：本地文件路径 + ISO-639-1 语种（默认 `fr`）；**输出**：`{ text, model }`
- **错误码归类**：
  - `STT_RATE_LIMITED` / `STT_PROVIDER_DOWN` / `STT_CALL_FAILED` → 瞬时，自动回灌队列
  - `STT_BAD_AUDIO` → 文件损坏 / 格式不支持，终态
  - `STT_EMPTY` → 转写为空，几乎可以肯定是录音静音，终态
  - `STT_NOT_CONFIGURED` → 缺 `DASHSCOPE_API_KEY`
- 1 次重试 + 60s 超时

### 3. PO 评分服务 `backend/src/services/oralGrader.js`（仿 `aiGrader.js`）

- **输入**：`{ oral.transcriptCombined, question, followUps[], modelKey, locale }`
- **三并行 fan-out**（与 PE 相同节奏，wall time 可控）：
  - `submit_scores`：9 维度评分 + 简评（每项 ≤ 25 词）
  - `submit_corrections`：3-8 条转写错误（语法 / 词汇 / 句法 / 语域）
  - `submit_summary`：strengths[] + 80-150 词 globalFeedback
- 共享同一份 system prompt（DeepSeek 自动按前缀缓存）
- **PO 与 PE 评分的关键差异**——system prompt 中显式要求 LLM：
  > 「输入是 ASR 转写。可能含语气词 / 重复 / 错别字（明显的 ASR 误识别要宽容）。phonologie 维度仅就转写明显特征评估（断词、重启、破句）；发音准度无法直接评估，宁中位也不要苛刻。disfluences 别和 aisance 重复扣分。」
- **段落标记约定**：转写文本带 `[MONOLOGUE]` / `[DEBAT Qi]` / `[REPONSE i]` 标签，LLM 用这个分辨「这一段是独白还是回应考官」，从而正确归位 `interaction` 维度
- 总分服务端重算（`sum(dimensions.score)`），不信任模型自报
- Zod 双重校验 + 错误码统一为 `AI_*` 前缀（与 PE 共用错误处理代码）

### 4. PO 队列 `backend/src/services/oralQueue.js`（仿 `essayQueue.js`）

- **状态机**：`queued → transcribing → grading → done/error`
  - 比 PE 多 1 个中间态 `transcribing`，让前端可以显示「正在转写录音…」
  - 单个 worker 内部完成「转写 → 评分」整套流程，不分两次 claim 减少状态机复杂度
- concurrency=2（比 PE 的 3 低，因为 STT + LLM 串行单任务更慢，单条耗时 30-60s）
- 进程重启时自动回收 `transcribing` / `grading` 卡死行
- 瞬时错误（`STT_RATE_LIMITED` / `AI_PROVIDER_DOWN` 等）回灌队列重试，终态错误落 `errorMessage`
- 优雅停机：`drain({ timeoutMs: 15000 })` 等在途任务落盘后才断 Prisma

### 5. 路由

#### 录音上传 `backend/src/routes/recordings.js`

- `POST /api/user/recordings` — multer diskStorage（沿用 `adminExams.js` 的模式），单文件 ≤ 8 MB，按 `yyyy-mm` 分片落盘
  - body: `audio`（file）+ `questionId` + `sessionId` + `followUpId?` + `durationSec`
  - 返回 `{ recording: { id, ... } }`
  - 每分钟 60 次 / 用户上限（防恶意刷盘）
- `GET /api/user/recordings/:id/audio` — **认证 + 拥有者校验后**才能播放，支持 byte-range（前端 `<audio>` 标签可拖拽进度条）
- `GET /api/user/recordings?sessionId=xxx` — 列表，用于断点续录恢复

#### PO 评分 `backend/src/routes/orals.js`（仿 `essays.js`）

- `GET /api/user/orals/quota` — 配额 + 阈值 + 9 维度回传
- `GET /api/user/orals/:id` — 单条状态轮询（前端 1.5s 间隔）
- `POST /api/user/orals/:id/regrade` — 换模型重批（**复用已有转写**，仅重新走 LLM；计入月配额）

#### 提交接入 `backend/src/routes/sessions.js`

`POST /api/sessions/:id/submit` 扩展：当 `q.type === 'SPEAKING'` 时——
- 答案约定为 `{ recordingIds: [...] }`
- 服务端二次校验「这些 recording 必须属于本用户 + 本 question」（防客户端把别人的录音挂到自己的 session 上）
- 每个 SPEAKING 题创建一行 `Oral` 入队（与 ESSAY 分支并列）
- 同时把 recording 的 `sessionId` 回填，方便 review 页按 sessionId 查找

#### 管理员后台 `backend/src/routes/adminExams.js`

- `VALID_TYPES` 加 `'SPEAKING'`
- 新增 `validateQuestionShape` 规则：
  - SPEAKING 必须 `skill === 'PO'`
  - SPEAKING 必须有 ≥ 1 个 follow-up（最多 6 个）
  - 非 SPEAKING 不允许带 follow-up
- 创建 / 更新 / 批量导入路径都把 `followUps[]` 一起写入 `OralFollowUp` 表

### 6. 配额 `backend/src/constants/planMatrix.js`

每个套餐加 `monthlyOralExams`（一次模拟 = 1 配额，与作文配额独立）：

| 计划 | 月配额（口语） | 月配额（作文） | 备注 |
|---|---|---|---|
| FREE | 0 | 0 | 完全屏蔽 |
| STANDARD | 5 | 20 | 口语单条成本 ~PE 的 5 倍（含 STT） |
| AI | 15 | 50 | |
| AI_UNLIMITED | 30 | 200 | |

**为什么口语配额比作文严**：单次模拟约 6-8 分钟有效音频，STT 成本 + LLM 成本约 ¥0.15-0.3，是 PE 单篇的 5-8 倍。

### 7. 启停集成 `backend/src/index.js`

- 启动时同时跑 `essayQueue.startWorker()` + `oralQueue.startWorker()`
- `DASHSCOPE_API_KEY` 缺失时生产环境直接 exit（与 DeepSeek 同等地位的强约束），开发环境 warn
- SIGTERM / SIGINT 触发 `oralQueue.drain({ timeoutMs: 15000 })`（比 PE 的 12s 长，因为 STT 阶段不可中断）
- `helmet` CSP 加 `mediaSrc: 'blob:'`，让前端 `<audio src="blob:...">` 即时回放刚录的音频
- 录音文件**不**走 `express.static` 公开 mount——必须走 `/api/user/recordings/:id/audio` 鉴权

### 8. 数据模型 `backend/prisma/schema.prisma`

新增 3 张表（migration: `20260430164435_oral_module/migration.sql`）：

```prisma
model OralFollowUp {
  id            String   @id @default(cuid())
  questionId    String
  order         Int
  text          String                       // 考官问题原文 (FR)
  audioUrl      String?                      // 可选 TTS 预录
  expectedAngle String?                      // 评分时给 LLM 的参考方向，不展示给学生
  @@index([questionId, order])
}

model Recording {
  id              String    @id @default(cuid())
  userId          String
  sessionId       String?
  questionId      String
  followUpId      String?                    // null = 独白
  audioPath       String                     // 相对 RECORDINGS_DIR
  mimeType        String
  durationSec     Int
  sizeBytes       Int
  transcript      String?                    // STT 完成后回填
  transcriptModel String?
  transcribedAt   DateTime?
  createdAt       DateTime  @default(now())
}

model Oral {
  id           String   @id @default(cuid())
  userId       String
  sessionId    String?
  questionId   String
  status       String   @default("queued")   // queued|transcribing|grading|done|error
  model        String?
  locale       String?
  aiScore      Int?                          // 0..25
  aiFeedback   String?
  rubric       String?                       // JSON
  corrections  String?                       // JSON
  strengths    String?                       // JSON
  transcriptCombined String?                 // [MONOLOGUE]…[DEBAT]…拼接
  recordingIds String?                       // JSON: [recId, ...]
  tokensIn / tokensOut / tokensCached / costUsd / errorMessage / gradedAt
}
```

`Question.type='SPEAKING'` 时字段语义：`prompt` = 独白指令（thèse），`passage` = 短文素材，`explanation` = 模范回答要点（评分参考，不展示给学生）。

---

## 三、前端实现

### 1. 录音组件 `frontend/src/components/AudioRecorder.tsx`

- **MediaRecorder 多格式探测**：webm/opus → ogg/opus → mp4/aac，按浏览器支持降级
- **实时波形**：`AudioContext` + `AnalyserNode` 算 RMS，60fps 渲染单条电平条（不画完整频谱，避免移动端卡顿）
- **硬截止倒计时**：达到 `maxSeconds` 自动 stop（防止学生忘记停止）
- **录后回放**：内嵌 `<audio src="blob:...">`，可在上传前确认
- **特征探测**：`navigator.mediaDevices` / `MediaRecorder` 缺失时直接展示「换设备」提示，不静默失败（解决 iOS < 14.1 / 老 Edge 静默坏的问题）
- **bitrate 32kbps mono opus**：5 分钟独白 < 1 MB，一次模拟 5-7 段录音总和远低于 8 MB 单文件上限
- props：`maxSeconds` / `onComplete(blob, durationSec, mimeType)` / `disabled` / `allowRetake` / `label`

### 2. 主页面 `frontend/src/pages/SpeakingExam.tsx`（替换原 `SpeakingPlaceholder.tsx`）

四步状态机（Ant Design `<Steps>`）：

```
preparation → monologue → interaction → submitting → submitted
```

- **Préparation**：左 Card 渲染短文（`prompt + passage`）、右 Card 笔记本 + 顶部倒计时 Tag
  - 笔记 500ms debounce 写 `localStorage`（key: `oral-prep-notes:${examId}`）
  - 「立即开始」按钮：剩余时间 > 60s 弹确认 Modal，避免误操作
  - URL `?mode=exam` 强制 30 min；默认练习模式 5 min
- **Monologue**：左侧 Card 同时显示笔记 + 短文摘要（学生录音时仍可看到自己的提纲），右侧 AudioRecorder（5 min 硬截止）
  - 录音完成后立即上传，成功后推进到 interaction 阶段
- **Interaction**：依次播放 follow-up（文本 + 可选 TTS 音频）+ 90s AudioRecorder
  - 每问独立录音、独立上传，最后一问录完自动 submit
- **Submit**：调 `/api/sessions/:id/submit` 把所有 recording id 一次性提交 → 缓存 result 到 `sessionStorage` → 跳 `/review/:sessionId`
  - submit 失败可重试（保留所有已上传录音，不丢数据）

**Session 懒创建**：进入页面不立即建 session，等学生真正开始独白才 `POST /api/sessions`，避免「打开看一眼就退出」也产生统计垃圾。

**配额预检**：进入页面立即拉 `/user/orals/quota`，`monthlyCap === 0` 时直接渲染升级页，不让学生录半天才发现没额度。

### 3. 评分卡 `frontend/src/components/OralGradeCard.tsx`（仿 `EssayGradeCard.tsx`）

- 1.5s 轮询 `status`，三种中间态文案不同（queued / transcribing / grading）
- 25s 慢警告，90s 前端超时（STT 30-60s + LLM 4-8s，比 PE 宽容很多）
- **Done 状态**展示：
  - 总分环 + 9 维度进度条 + 每项 `feedback`
  - strengths 列表
  - corrections 列表（按类型 Tag 分色）
  - **转写折叠面板**：`<Collapse>` 内放完整 transcriptCombined（带 `[MONOLOGUE]` / `[DEBAT]` 标签）+ 每段录音的 `<audio>` 回放（走 `/api/user/recordings/:id/audio` 私有路径）
- **Error 状态**：错误码 → i18n key 映射，可重试的错误展示模型选择器 + retry 按钮，不可重试的（NO_RECORDING、PLAN_UPGRADE_REQUIRED）走升级链接
- **Regrade**：复用已有转写，只重新跑 LLM（regrade 走配额，与 PE 一致）

### 4. 路由集成 `frontend/src/App.tsx`

```tsx
<Route path="/practice/speaking"        element={<SkillPractice skill="PO" />} />
<Route path="/practice/speaking/:examId" element={<SpeakingExam />} />
```

`SpeakingExam` 是独立页面（不复用 `ExamRunner`），因为口语流程跟其它技能差异太大：30 min 准备 + 多段录音的状态机塞进 ExamRunner 会污染那个组件的代码路径。

### 5. ReviewResult 集成

`pages/ReviewResult.tsx` 在每道 SPEAKING 题下挂 `<OralGradeCard />`（与 ESSAY 题挂 `<EssayGradeCard />` 对称）。session result 接口同时返回 `essays[]` 和 `orals[]`。

### 6. 类型 `frontend/src/types/index.ts`

新增：`OralStatus` / `OralRubricKey`（9 个）/ `OralCorrectionType`（4 个）/ `OralRubricDimension` / `OralCorrection` / `OralGrade` / `OralQuota` / `SubmitResponseOral` / `UploadedRecording` / `OralFollowUp`。

### 7. 国际化

`fr.json` / `en.json` / `zh.json` 三套：

- `oral.exam.*` — 4 步流程文案、按钮、提示
- `oral.recorder.*` — 录音组件
- `oral.rubric.*` — 9 维标签
- `oral.correctionType.*` — grammar / lexique / syntaxe / register
- `oral.grade.*` — 状态、错误、操作

并把老的 `practice.po.comingSoonDesc` 那一组清掉，PracticeHub 上的「即将上线」标签改成「AI 评分」。

---

## 四、配额与计费

| 计划 | 月口语配额 | 满配额单月真实成本 | 毛利率 |
|---|---|---|---|
| FREE | 0 | ¥0 | 获客漏斗 |
| STANDARD | 5 | ≈ ¥1.0 | **>96%**（月价 ¥29） |
| AI | 15 | ≈ ¥3.0 | **>95%**（月价 ¥69） |
| AI_UNLIMITED | 30 | ≈ ¥6.0 | **>93%**（月价 ¥99） |

### 单次口语模拟实际成本

| 项 | 数值 |
|---|---|
| 6 段录音总时长 | ~7 分钟（独白 5 min + 4 个 90s follow-up，按平均利用率算） |
| STT（DashScope `qwen-audio-asr`） | ~¥0.07-0.12 |
| LLM 评分（DeepSeek V3，3 个子调用） | ~¥0.05-0.10（前缀缓存命中后） |
| 磁盘存储（Opus 32kbps，6 段 ≈ 1.5 MB） | 可忽略 |
| **合计** | **≈ ¥0.15-0.25 / 次模拟** |

约是 PE 单篇成本的 5 倍，所以配额相应严了 4-7 倍。

> **regrade 计入配额**——同 PE 的红线一致：哪怕复用已有转写，重跑 LLM 仍消耗 token；不计配额会被刷。

---

## 五、错误分类

| `errorMessage` 前缀 | 场景 | 前端展示 |
|---|---|---|
| `NO_RECORDING` | 提交时 recordingIds 为空 / 无效 | 提示重录，不调用 AI |
| `PLAN_UPGRADE_REQUIRED` | FREE 用户 | 跳升级页 |
| `QUOTA_EXCEEDED` | 月配额用尽 | 提示下月重置 |
| `STT_NOT_CONFIGURED` | `DASHSCOPE_API_KEY` 缺失 | 通用 error |
| `STT_BAD_AUDIO` | 文件损坏 / 格式不支持 | 提示重录 |
| `STT_EMPTY` | 录音几乎全静音 | 提示「未检测到语音」 |
| `STT_RATE_LIMITED` / `STT_PROVIDER_DOWN` / `STT_CALL_FAILED` | 瞬时故障 | 自动重试，不展示 |
| `AI_ORAL_TOO_SHORT` | 转写词数 < 80 | 提示「内容过短无法评分」 |
| `AI_BAD_OUTPUT` / `AI_OUTPUT_TRUNCATED` | 模型返回畸形 | 用户可 retry |
| `AI_RATE_LIMITED` / `AI_PROVIDER_DOWN` | 瞬时故障 | 自动重试 |
| `FRONTEND_TIMEOUT` | 90s 仍未出结果 | 服务端可能稍后落地，提示稍后刷新 |

---

## 六、部署前必做

1. 应用 migration：
   ```bash
   cd backend
   unset DATABASE_URL
   npx prisma migrate deploy
   ```
2. 重新 seed（创建 3 套 PO 样卷）：
   ```bash
   npm run seed
   ```
   样卷主题：社交媒体与青少年 / 远程办公与城市规划 / Nutri-Score 食品标签
3. 环境变量：
   - **必需**：`DASHSCOPE_API_KEY`（生产硬约束 / 开发可选）
   - **可选**：
     - `DASHSCOPE_ASR_MODEL`（默认 `qwen-audio-asr`，可换 `paraformer-v2` / `sensevoice-v1` / `whisper-1`）
     - `DASHSCOPE_ASR_TIMEOUT_MS`（默认 60_000）
4. 创建录音目录（首次启动 `recordings.js` 会自动建，但生产建议预创建并 `chmod 750`）：
   ```
   backend/content/recordings/
   ```
5. 端到端冒烟：放一段 ≥ 3s 的法语样本到 `backend/scripts/fixtures/sample-fr.webm`，然后：
   ```bash
   cd backend
   node scripts/smokeOral.js
   ```
   会跑完 login → 拉配额 → 找 PO 题 → 建 session → 上传录音 → submit → 轮询 oral 至终态 → 校验 `aiScore ∈ [0, 25]` / 9 维 rubric / transcript 非空。
6. CSP：当前 `mediaSrc` 已经放开 `blob:`，如未来要改用 OSS 公网回放，需要把 OSS 域名加进 `connectSrc` + `mediaSrc`
7. **录音不要走公网静态托管**——`/api/user/recordings/:id/audio` 的鉴权是隐私底线，迁 OSS 时要保留 signed URL 模式

---

## 七、风险与缓解

| 风险 | 缓解 |
|---|---|
| **STT 准确率波动**（模型对法语口音的识别不稳定） | system prompt 显式「对明显 ASR 误识别词宽容」；UI 给学生展示完整转写，让低分有据可查 |
| **iOS Safari 录音兼容**（< 14.1 不支持 MediaRecorder） | 特征探测 + 明确提示「换设备」；不静默失败 |
| **录音占盘**（每用户每月最多 30 次 × ~1.5 MB ≈ 45 MB） | 加定时清理任务（90 天前 + 已评分 + 保留 transcript）作为 v1 后置 |
| **30 min 准备时长在练习场景太长** | 默认 `mode=practice` 时 5 min；`?mode=exam` 才 30 min |
| **学生中途刷新页面** | 笔记 localStorage 保留；已上传录音存在 DB（按 session+question 查可恢复）；未录段需重录 |
| **client 把别人的录音挂自己 session** | submit 时 `findMany({ id: { in: ids }, userId, questionId })` 二次校验 |

---

## 八、验收标准

1. ✅ 走完 4 步流程，最终 `Oral.status='done'` 且 `aiScore` 在 `[0, 25]`，9 维 rubric 完整
2. ✅ 转写至少包含独白主旨词（与录音内容相关）
3. ✅ 配额命中：第 6 次（STANDARD）`POST /api/sessions/:id/submit` 创建的 Oral 行 `status='error'`，`errorMessage='QUOTA_EXCEEDED'`
4. ✅ 中断重进 `/practice/speaking/:examId`：已上传的录音保留（DB 中 Recording 行未删），未上传段落要求重录
5. ✅ 管理员后台可创建 PO 题 + 4 个 follow-ups（`POST /api/admin/exams/:id/questions` 带 `type='SPEAKING'` 和 `followUps[]`），前端 `SpeakingExam` 流程能渲染所有问题

---

## 九、后续扩展点

- **真实音频评分**：现在 `phonologie` 维度只能从转写文本特征间接判断（断词、重启）。引入支持 audio 输入的多模态模型（Gemini 1.5 Audio / Qwen-Audio）后可改成「转写 + 原音」一起喂 LLM，发音准度评分会真实很多
- **TTS 考官提问**：admin 录入 follow-up 时挂个 TTS 音频，让学生听到考官「真人」提问，氛围感更强
- **辩论分支**：把 follow-up 改成有条件触发（学生主张 A → 走 follow-up A1/A2，主张 B → 走 B1/B2），用 LLM 实时选支但不直接生成提问，平衡成本和真实感
- **存储迁 OSS**：`recordings.js` 的 multer 改用 `multer-s3`（或阿里云 OSS 等），signed URL 改用 OSS 临时签名；`audioPath` 字段语义不变
- **批量清理**：`scripts/pruneOldRecordings.js` 跑 cron，删 90 天前已评分的录音，保留 transcript
- **共享 PE 的 hourly limiter**：当前 PO regrade 用了独立 limiter（30/h），若日活上来后可以合并到一起统一控

---

## 十、与 AI 批改作文（PE）的架构对比

| 维度 | PE（作文） | PO（口语） |
|---|---|---|
| 输入 | 学生键入的 250+ 词文本 | ≤ 8 MB / 段 webm/opus 音频 × N 段 |
| 中间态 | `queued → grading` | `queued → transcribing → grading` |
| 评分网格 | 10 维 25 分 | **9 维** 25 分（无 orthographe / consigne，多 interaction / phonologie） |
| 子调用数 | 3（scores + corrections + summary） | 3（同结构） |
| 单条总耗时 | 3-6s（DeepSeek V3） | 30-60s（STT 25-50s + LLM 4-8s） |
| 队列 concurrency | 3 | 2 |
| 月配额（STANDARD） | 20 | 5 |
| 单条成本 | ¥0.02-0.04 | ¥0.15-0.25 |
| 评分提示中的特殊约束 | 无 | 「输入是 ASR 转写，对识别错误宽容；phonologie 只看转写明显特征；disfluences 别和 aisance 重复扣」 |

整体复用度极高：planMatrix / requirePlan / 错误码体系 / 模型选择器 / 队列结构 / 评分卡轮询模式 / i18n 键空间组织——PE 已经踩过的所有坑 PO 直接吃红利。
