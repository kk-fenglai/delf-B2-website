# AI 批改作文功能实现总结

DELF B2 Production Écrite（书面表达）的 AI 批改与分数预测功能。学生交卷后，系统将作文送入队列，由 **DeepSeek V3** 按官方 25 分评分网格打分并给出逐句修改建议。

> **2026-04 迁移说明**：原先走 Anthropic Claude（Haiku / Sonnet / Opus 三档），因国内访问延迟高 + 成本偏贵，切换到 DeepSeek V3。架构不变，成本下降 ~95%，墙钟时间从 15-30s 压到 3-6s。见文末"迁移记录"。

 关于总分的评价其实你可以换一个思路，先用deepseek生成法语评价，然后根据i8n来实现法语到英语中文的切换、这个方案可行吗 

---

## 一、后端实现

### 1. 评分核心 `backend/src/services/aiGrader.js`

- **多 Provider 支持**：DeepSeek（`api.deepseek.com`）+ Qwen/DashScope（`dashscope.aliyuncs.com`）。两家都走 OpenAI 兼容协议，用 `openai` SDK 的两个实例 + `MODEL_CATALOG[modelKey].provider` 字段做客户端分发
- **并行 fan-out**：一篇作文拆成 3 个并行子调用——
  - `submit_scores`：10 个维度评分 + 每项 ≤ 25 词简评
  - `submit_corrections`：3-8 条原文错误定位（精确 `excerpt`）
  - `submit_summary`：2-4 条亮点 + 80-150 词 `globalFeedback`
- 三个子调用共享同一份 system prompt（DeepSeek 自动按前缀缓存，无 TTL）
- 用 OpenAI `tools` + `tool_choice` 强制返回结构化 JSON（不解析自由文本）
- Zod schema 本地二次校验每个子调用输出，防模型返回畸形
- 总分一律服务端重算（`sum(dimensions.score)`），不信任模型自报总分
- 429 / 5xx 最多重试 1 次（预算紧，速度优先）
- 错误用 `code` 分类（`AI_RATE_LIMITED` / `AI_PROVIDER_DOWN` / `AI_BAD_OUTPUT` …）
- 反馈语言支持 `fr` / `en` / `zh`

### 2. 评分队列 `backend/src/services/essayQueue.js`

- 以 DB 表为队列（零新基础设施），concurrency=3，轮询间隔 800ms
- 状态机：`queued` → `grading` → `done` / `error`
- 进程重启时自动回收卡在 `grading` 的脏行（> 5 分钟）
- 瞬时错误（限流、provider 抖动）回灌队列重试，终端错误落 `errorMessage`
- 优雅关停：`drain()` 等在途任务最多 12 秒落盘后才断 Prisma
- 遗留 Claude 模型字段的老行（如 `model='haiku-4-5'`）自动回落到 `MODEL_KEYS[0]`

### 3. 路由

- `POST /api/sessions/:id/submit` 扩展（`backend/src/routes/sessions.js`）：ESSAY 类型的答案不计入 `totalScore`，而是创建 `Essay` 行入队，响应体返回 `essays[]` 供前端轮询
- `backend/src/routes/essays.js`：
  - `GET /api/user/essays/quota` — 配额、可选模型、阈值
  - `GET /api/user/essays/:id` — 单篇状态轮询（前端 1s 间隔）
  - `POST /api/user/essays/:id/regrade` — 换模型重新批改（走同一套配额与 hourly limiter）
  - `POST /api/user/essays/:id/rewrite` — 修改原文后重批

### 4. 计划门控 `backend/src/middleware/requirePlan.js`

- `FREE` 完全屏蔽 AI 批改；`STANDARD / AI / AI_UNLIMITED` 各自 `models[]` + 月/日配额
- 403 响应体里带 `requiresUpgrade: true`，前端复用同一个升级弹窗路径

### 5. 常量单一来源

- `backend/src/constants/delfRubric.js` — 10 维评分网格，合计 25 分
- `backend/src/constants/delfScoring.js` — 通过线、可信度阈值
- `backend/src/constants/planMatrix.js` — 模型 → DeepSeek providerId + 定价；计划 → 允许模型 + 配额
- 全部通过 API 回传前端，前端不硬编码

### 6. 数据模型扩展 `Essay`

新增列：`status`, `model`, `locale`, `rubric` (JSON), `corrections` (JSON), `strengths` (JSON), `tokensIn/Out/Cached`, `costUsd`, `errorMessage`, `gradedAt`, `sessionId`, `updatedAt`；索引 `(status, createdAt)` 供 worker 扫描。

### 7. 启停集成 `backend/src/index.js`

- 启动时 `essayQueue.startWorker()`；`DEEPSEEK_API_KEY` 缺失时生产环境直接 exit，开发环境只 warn
- SIGTERM/SIGINT 触发 `essayQueue.drain()` 后再断 Prisma

### 8. 分数预测 `backend/src/services/prediction.js`

- `GET /api/user/prediction` — 基于最新每题 attempt，按 CO/CE/PE/PO 四项给出预测分 + pass 判定
- PE/PO 标 `pending_ai`；CO+CE 依 sampleSize 分 none/low/medium/high 置信度
- 输出 what-if 场景 + 最低所需 PE/PO 分

---

## 二、前端实现

### 1. 组件

- `components/EssayGradeCard.tsx` — 批改卡片，1s 轮询 `queued/grading`，展示总分环 / 10 维进度 / 亮点 / 修改建议 / 重批 / 重写
- `components/EssayInlineAnnotations.tsx` — 原文内联标注，按 `excerpt` 精确匹配包 `<mark>`，按类型配色（红/蓝/黄/紫），失配项走下方清单不丢
- `components/AIModelPicker.tsx` — 模型卡片（当前仅 DeepSeek V3 一档，未来加 R1 再切换显示）
- `components/ScorePredictionCard.tsx` — 预测分数卡，含 what-if 滑块

### 2. 超时 / 提示阈值

- `POLL_MS = 1000`（原 1500）
- `STUCK_WARN_MS = 12_000`（原 30_000）
- `STUCK_TIMEOUT_MS = 25_000`（原 90_000）

DeepSeek 典型 3-6s 完成一篇，超过 12s 给 slow warning，超过 25s 视作超时。

### 3. 页面

- `pages/ExamRunner.tsx` — 检测到 ESSAY 题自动拉 `/user/essays/quota`；提交时带 `aiModel` + 当前 i18n 语言作 `aiLocale`
- `pages/ReviewResult.tsx` — 每道 ESSAY 题下内嵌 `EssayGradeCard`，接管后续轮询
- `types/index.ts` — 完整的 `EssayGrade` / `EssayQuota` / `RubricDimension` / `EssayCorrection` 类型
- `ClaudeModelKey` 类型名保留（避免全局重命名），但值已收窄为 `'deepseek-chat'`；legacy 记录渲染侧兜底

### 4. 国际化

`en.json` / `fr.json` / `zh.json` 三套：

- `essay.grade.*`（状态文案、错误提示、按钮）
- `essay.rubric.*`（10 维标签）
- `essay.correctionType.*`（语法/词汇/拼写/句法）
- `essay.model.*`（模型档位、升级提示）
- `essay.quota.*`

---

## 三、计费与配额

| 计划 | 可用模型 | 月配额 | 日配额 |
|---|---|---|---|
| FREE | 无 | 0 | 0 |
| STANDARD | Qwen Turbo | 20 | 10 |
| AI | Qwen Turbo · DeepSeek V3 | 50 | 15 |
| AI_UNLIMITED | Qwen Turbo · DeepSeek V3 · Qwen Plus | 200 | 20 |

- 每次 regrade 计入月配额（真实产生 token 成本）
- 另有 hourly 30 次保护上限，防前端死循环或 token 泄漏烧账单
- `costUsd` 每条记录落库，供运营对账

> **关于计划差异化**：引入 Qwen 之后，三档计划**既靠配额也靠模型**区分——STANDARD 用户只能用最便宜的 Qwen Turbo，AI 解锁中文/法语更平衡的 DeepSeek V3，AI_UNLIMITED 再开 Qwen Plus（更精准的法语反馈）。

---

## 四、错误分类

| `errorMessage` 前缀 | 场景 | 前端展示 |
|---|---|---|
| `ESSAY_TOO_SHORT` | 不足 50 词 | 提示最少词数，不调用 AI |
| `PLAN_UPGRADE_REQUIRED` | FREE 用户 | 跳升级页 |
| `QUOTA_EXCEEDED` | 月配额用尽 | 提示下月重置 |
| `AI_NOT_CONFIGURED` | `DEEPSEEK_API_KEY` 缺失 | 通用 error |
| `AI_RATE_LIMITED` / `AI_PROVIDER_DOWN` | 瞬时故障 | 自动重试，不展示 |
| `AI_BAD_OUTPUT` | 模型返回畸形 JSON | 用户可 retry |
| `AI_OUTPUT_TRUNCATED` | 某个子调用命中 `max_tokens` | 用户可 retry |

---

## 五、部署前必做

1. 生产环境 `DEEPSEEK_API_KEY` 长度 ≥ 30（`env.js` 强校验）
2. 首次部署前执行：`unset DATABASE_URL && cd backend && npx prisma migrate deploy`
3. 检查 CSP：如后续接入 Stripe / 支付宝需要新 CDN，`backend/src/index.js` 的 `connectSrc` / `scriptSrc` 要补
4. `/api/user/essays/*` 下的 rate limiter 窗口 = 1h 30 次，若 QPS 涨了需要调高
5. DeepSeek API 国内直连，不需要 VPN / 代理；海外部署节点同样可访问

---

## 六、后续扩展点

- 单机瓶颈：≥ 100 DAU 时把 `essayQueue.js` 换成 BullMQ 消费者，`Essay` 表结构不变
- Prompt 版本管理：`aiGrader.buildSystemPrompt()` 字符串任何改动都会让 DeepSeek 缓存失效，改版本前先评估量级
- 引入 `deepseek-reasoner`（R1）作为 AI_UNLIMITED 的"深度批改"选项，差异化升级路径
- 口语评分（PO）：复用 `essayQueue` 结构，换支持 audio input 的模型

---

## 七、定价方案（保证 ≥ 80% 毛利）

### 单篇作文实际成本（DeepSeek V3 + 前缀缓存命中后）

| 项 | 数值 |
|---|---|
| 单篇 input tokens（3 个子调用合计） | ~7500（首篇全 fresh，后续 ~70% cache hit） |
| 单篇 output tokens（3 个子调用合计） | ~2400 |
| 单篇 USD 成本 | **≈ $0.003 – $0.005** |
| 换算人民币 | **≈ ¥0.02 – ¥0.04** |

比原 Claude 方案便宜 **20-300 倍**（Haiku ¥0.07、Opus ¥1.44）。

另：
- 支付通道费：3%（微信/支付宝）、3.5%（Stripe 海外）
- 基础设施摊薄（Neon / 邮件 / 服务器）：≈ ¥5/用户/月

### 推荐定价（EUR 锚定，详见 [`定价标准.md`](./定价标准.md)）

| 计划 | 月价 EUR | 年价 EUR | 月配额 | 满配额真实成本 | 毛利率 |
|---|---|---|---|---|---|
| FREE | €0 | — | 0 AI | €0.65 基础设施 | 获客漏斗 |
| STANDARD | **€5.99** | **€59.99** | 5 篇 + 3 口语 | ≈ €0.10 AI + €1.07 固定 | **>80%** |
| AI | **€11.99** | **€119.99** | 30 篇 + 15 口语 | ≈ €0.50 AI + €1.25 固定 | **>85%** |
| AI_UNLIMITED | **€16.99** | **€169.99** | 重度 150+45 | ≈ €1.73 AI + €1.39 固定 | **>81%** |

### 参考标价（USD / CNY，非锚定）

| 计划 | 月价 USD | 月价 CNY |
|---|---|---|
| STANDARD | $6.47 | ¥47 |
| AI | $12.95 | ¥94 |
| AI_UNLIMITED | $18.35 | ¥133 |

### 仍然不能动的红线

1. **regrade 计入月配额** —— 否则学生一篇作文刷 N 次，即使 DeepSeek 很便宜也浪费 token。当前 `routes/essays.js` 已实现。
2. **FREE 绝对不给 AI 额度** —— 转化率低 × 真实成本 + 滥用风险 = 纯亏。
3. **年付打 2 个月折**（10 个月价格）—— 现金流 + 降低流失。
4. **Hourly 30 次 rate limiter 不能去掉** —— 防 token 泄漏 / 恶意刷 API。

### DeepSeek 后的利润模型

表格里是"用户把配额刷满"的场景。即使如此，毛利率都在 90% 以上。真实用户平均只会用 30-50% 配额，**综合毛利率预期 95%+**。

单机成本结构下，现在的瓶颈已不是 AI 费用，而是**基础设施 + 支付通道 + 邮件发送**。

---

## 九、UI 与功能升级（v1.7，2026-05）

### 1. 评分维度折叠面板

**动机**：10 个维度的评分区域垂直展开过长，用户需要大量滚动才能看到后续内容。

**改动文件**：`frontend/src/components/EssayGradeCard.tsx`

- 用 Ant Design `Collapse` 替换原 `div.space-y-2` 列表
- panel header 内联显示：维度名称 + 迷你进度条 + `score/max`
- panel body 仅展示 feedback 文字
- 默认全部折叠；用户点击维度名称展开对应 feedback

```
▶ 遵守题目要求    ████████  2/2
▶ 立论与论证      ██████░░  3/4   ← 点击后展开 feedback
```

---

### 2. 增强内联标注

**动机**：高亮区域没有序号，用户无法快速将原文标注与下方纠错列表对应。

**改动文件**：`frontend/src/components/EssayInlineAnnotations.tsx`

- 每个高亮 `<mark>` 右上角追加序号角标（①②③…）
- 文章下方始终显示统一编号纠错清单（不再区分 matched / unmatched 两套渲染）
- 每条清单项格式：`① [语法] "原文引用" → 建议内容` + issue 说明
- 原 hover Tooltip 保留

---

### 3. 范文例子

**动机**：学生看到扣分后希望对照高分范文理解差距。

**后端改动**：
- `backend/prisma/schema.prisma`：`Question` 新增 `modelEssay String?` 可选字段
- 新迁移 `20260504_add_model_essay`：`ALTER TABLE "Question" ADD COLUMN "modelEssay" TEXT;`
- `backend/src/routes/essays.js`：`GET /user/essays/:id` 在 select 中 join Question，把 `modelEssay` 带入响应
- `backend/src/routes/adminExams.js`：更新题目路由允许写入 `modelEssay`

**前端改动**：
- `frontend/src/pages/admin/AdminExamEdit.tsx`：写作题编辑表单增加"范文"多行文本区
- `frontend/src/components/EssayGradeCard.tsx`：`status === 'done'` 且 `modelEssay` 非空时底部出现"查看范文"按钮，点击打开 `Modal` 展示全文

---

### 4. 个性化模板

**动机**：学生积累了常用句型和文章结构框架，希望在写作时快速复用，不需要每次从零开始。

支持两种模板类型：
- `phrase`：常用句型库（短片段，如论证句式、过渡语）
- `structure`：文章结构框架（整篇骨架，含引言/论证/结论占位）

**后端改动**：

`backend/prisma/schema.prisma` 新增：
```prisma
model EssayTemplate {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  content   String
  type      String   @default("phrase")  // "phrase" | "structure"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId, createdAt])
}
```

新迁移 `20260504_add_essay_template`。

新路由文件 `backend/src/routes/essayTemplates.js`：
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/user/templates` | 列出用户所有模板（可按 `?type=` 过滤） |
| POST | `/api/user/templates` | 创建模板（`{ title, content, type }`） |
| PUT | `/api/user/templates/:id` | 更新模板内容或标题 |
| DELETE | `/api/user/templates/:id` | 删除模板 |

- 需要 `requireAuth`，每用户最多 50 条（防滥用）
- 挂载：`backend/src/index.js` 加 `app.use('/api/user/templates', require('./routes/essayTemplates'))`

**前端改动**：

新组件 `frontend/src/components/TemplateDrawer.tsx`：
- Ant Design `Drawer`（右侧滑出）
- 顶部 Tab：句型库 / 结构框架（对应 `type=phrase` / `type=structure`）
- 每条模板：标题 + 内容预览 + "插入"按钮 + 编辑/删除
- 底部"新建模板"按钮 → 内嵌 Modal 填写 `title` + `content`
- `onInsert(content)` 回调由父组件（ExamRunner）处理

`frontend/src/pages/ExamRunner.tsx`（约第 431 行 `Input.TextArea` 上方）：
- 增加"我的模板"按钮（`<Button icon={<BookOutlined />}>`）
- 点击开启 `TemplateDrawer`，传入 `onInsert={(content) => updateAnswer((answers[q.id] || '') + content)}`

---

## 八、迁移记录：Claude → DeepSeek（2026-04-20）

### 触发

- 国内访问 `api.anthropic.com` 延迟 5-15s，实际业务经常触发 25s 前端超时
- Opus 单篇成本 ¥1.44 太高，即使混合 fan-out（scores=Opus, corrections+summary=Haiku）也只压到 ¥0.5 左右
- 用户反馈"批改失败，超过 25 秒未完成"

### 改动范围

| 文件 | 改动 |
|---|---|
| `backend/package.json` | `@anthropic-ai/sdk` → `openai@^4.104.0`（DeepSeek 兼容 OpenAI 协议） |
| `backend/src/config/env.js` | `ANTHROPIC_API_KEY` → `DEEPSEEK_API_KEY` + `DEEPSEEK_BASE_URL` |
| `backend/src/constants/planMatrix.js` | 3 款 Claude → 单款 `deepseek-chat` |
| `backend/src/services/aiGrader.js` | 全量重写：`messages.create` → `chat.completions.create`；`tool_use` → `function call`；usage 字段换成 DeepSeek 形态 |
| `backend/src/services/essayQueue.js` | legacy 模型字段兜底 |
| `backend/src/routes/essays.js` | 同上 |
| `frontend/src/components/AIModelPicker.tsx` | 模型列表缩成 1 个 |
| `frontend/src/types/index.ts` | `ClaudeModelKey` 类型收窄为 `'deepseek-chat'` |
| `frontend/src/i18n/locales/*` | 移除 `opusDurationHint`，更新超时提示 |

### 架构决定不变

- 三个子调用的 fan-out 架构保留（DeepSeek 也吃这套）
- Zod 双重校验 / tool_choice 强制结构化 / server-side 总分重算 / 队列模型 / 配额体系全部不动
- API 响应格式对前端完全兼容

### 数据兼容性

- 老 Essay 行 `model` 字段仍是 `haiku-4-5` 等，读端兜底显示 "Haiku 4.5 (legacy)"
- 用户重新批改老作文时自动切到 `deepseek-chat`
- 不需要数据迁移

---

## 十、Bug 修复与调优记录（2026-05）

### 10.1 AI_OUTPUT_TRUNCATED 截断修复

**现象**：用户偶发"AI 输出被截断，请重新批改"报错。

**根因**：`TASK_MAX_TOKENS` 中 `summary` 仅 1000，而 `globalFeedback` schema 允许最长 1200 字符，JSON 开销叠加后必然截断。

**修复**（`backend/src/services/aiGrader.js`）：

| 任务 | 修复前 | 修复后 |
|------|--------|--------|
| `scores` | 1500 | 1200 |
| `corrections` | 2400 | 1800 |
| `summary` | 1000 | 1200 |

---

### 10.2 批改响应慢 / 前端提前超时

**现象**：DeepSeek API 繁忙时，批改动辄 20-30s，前端 25s 就报超时。

**根因**：
1. `SUBCALL_TIMEOUT_MS` 设置过短（`qwen-turbo` 仅 8s，`deepseek-chat` 仅 10s）——API 稍慢就触发重试，耗时翻倍
2. 前端 `STUCK_TIMEOUT_MS = 25_000`，后端还在处理时前端已经报错

**修复**：

`backend/src/services/aiGrader.js` & `oralGrader.js`：
```
qwen-turbo:    8s  → 25s
deepseek-chat: 10s → 30s
qwen-plus:     12s → 35s
```

`frontend/src/components/EssayGradeCard.tsx`：
```
STUCK_WARN_MS:    12s → 20s
STUCK_TIMEOUT_MS: 25s → 60s
```

---

### 10.3 Prisma 关系未生成导致批改卡住

**现象**：添加 Essay → Question 关系并跑完迁移后，批改页面一直显示"已进入队列"，轮询接口报 500。

**根因**：`npm run dev` 只跑 `nodemon`，不自动执行 `prisma generate`。schema 新增关系后旧 Prisma 客户端不认识 `include: { question: ... }`，导致 GET `/user/essays/:id` 抛错。

**修复**：每次修改 `schema.prisma` 后需手动执行：
```bash
npx prisma generate
npm run dev
```

---

### 10.4 DeepSeek V4 Flash 拒绝 forced tool_choice 导致批改失败

**现象**：批改报错"批改请求被拒，请联系管理员"（`AI_BAD_REQUEST`）。

**根因**：尝试对 `deepseek-v4-flash` 强制 `tool_choice`，但 DeepSeek V4 系列 API 不支持该参数，直接返回 400。

**正确行为**：`forceToolChoice` 对所有 `deepseek-v4*` 模型均设为 `false`；仅 Qwen 系列强制 tool_choice。

```js
// aiGrader.js & oralGrader.js
const forceToolChoice = !(
  taskModel?.provider === 'deepseek' &&
  String(taskModel?.providerId || '').startsWith('deepseek-v4')
);
```

> ⚠️ **注意**：DeepSeek V4 不能强制 tool_choice 是 API 限制，无法绕过。模型依赖 system prompt 中的指令自行调用工具，偶尔会出现不调用的情况（`AI_NO_TOOL_USE`），此时自动重试一次。这是 DeepSeek V4 系列的已知限制。
