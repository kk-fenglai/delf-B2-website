# AI 批改作文功能实现总结

DELF B2 Production Écrite（书面表达）的 AI 批改与分数预测功能。学生交卷后，系统将作文送入队列，由 Claude 按官方 25 分评分网格打分并给出逐句修改建议。

---

## 一、后端实现

### 1. 评分核心 `backend/src/services/aiGrader.js`

- 通过 Anthropic SDK 调用 Claude，使用 `tool_use` + `tool_choice` 强制返回结构化 JSON（不解析自由文本）
- System prompt 带 `cache_control: ephemeral`，命中 5 分钟 prompt 缓存后输入 token 降至 10%
- 三档模型可选：`haiku-4-5` / `sonnet-4-6` / `opus-4-7`
- Zod schema 本地二次校验 tool 输出，防模型返回畸形
- 总分一律服务端重算（`sum(dimensions.score)`），不信任模型自报总分
- 429 / 5xx 指数退避重试 3 次；错误用 `code` 分类（`AI_RATE_LIMITED` / `AI_PROVIDER_DOWN` / `AI_BAD_OUTPUT` …）
- 反馈语言支持 `fr` / `en` / `zh`

### 2. 评分队列 `backend/src/services/essayQueue.js`

- 以 DB 表为队列（零新基础设施），concurrency=3，轮询间隔 1.5s
- 状态机：`queued` → `grading` → `done` / `error`
- 进程重启时自动回收卡在 `grading` 的脏行（> 5 分钟）
- 瞬时错误（限流、provider 抖动）回灌队列重试，终端错误落 `errorMessage`
- 优雅关停：`drain()` 等在途任务最多 12 秒落盘后才断 Prisma

### 3. 路由

- `POST /api/sessions/:id/submit` 扩展（`backend/src/routes/sessions.js`）：ESSAY 类型的答案不计入 `totalScore`，而是创建 `Essay` 行入队，响应体返回 `essays[]` 供前端轮询
- `backend/src/routes/essays.js`：
  - `GET /api/user/essays/quota` — 配额、可选模型、阈值
  - `GET /api/user/essays/:id` — 单篇状态轮询
  - `POST /api/user/essays/:id/regrade` — 换模型重新批改（走同一套配额与 hourly limiter）

### 4. 计划门控 `backend/src/middleware/requirePlan.js`

- `FREE` 完全屏蔽 AI 批改；`STANDARD / AI / AI_UNLIMITED` 各自 `models[]` + 月/日配额
- 403 响应体里带 `requiresUpgrade: true`，前端复用同一个升级弹窗路径

### 5. 常量单一来源

- `backend/src/constants/delfRubric.js` — 10 维评分网格，合计 25 分
- `backend/src/constants/delfScoring.js` — 通过线、可信度阈值
- `backend/src/constants/planMatrix.js` — 模型 → Anthropic ID + 定价；计划 → 允许模型 + 配额
- 全部通过 API 回传前端，前端不硬编码

### 6. 数据模型扩展 `Essay`

新增列：`status`, `model`, `locale`, `rubric` (JSON), `corrections` (JSON), `strengths` (JSON), `tokensIn/Out/Cached`, `costUsd`, `errorMessage`, `gradedAt`, `sessionId`, `updatedAt`；索引 `(status, createdAt)` 供 worker 扫描。

### 7. 启停集成 `backend/src/index.js`

- 启动时 `essayQueue.startWorker()`；ANTHROPIC_API_KEY 缺失时生产环境直接 exit，开发环境只 warn
- SIGTERM/SIGINT 触发 `essayQueue.drain()` 后再断 Prisma

### 8. 分数预测 `backend/src/services/prediction.js`

- `GET /api/user/prediction` — 基于最新每题 attempt，按 CO/CE/PE/PO 四项给出预测分 + pass 判定
- PE/PO 标 `pending_ai`；CO+CE 依 sampleSize 分 none/low/medium/high 置信度
- 输出 what-if 场景 + 最低所需 PE/PO 分

---

## 二、前端实现

### 1. 组件

- `components/EssayGradeCard.tsx` — 批改卡片，3 秒轮询 `queued/grading`，展示总分环 / 10 维进度 / 亮点 / 修改建议 / 换模型重判
- `components/EssayInlineAnnotations.tsx` — 原文内联标注，按 `excerpt` 精确匹配包 `<mark>`，按类型配色（红/蓝/黄/紫），失配项走下方清单不丢
- `components/AIModelPicker.tsx` — 三张模型卡，锁定的型号跳升级页并显示 `LockOutlined`
- `components/ScorePredictionCard.tsx` — 预测分数卡，含 what-if 滑块

### 2. 页面

- `pages/ExamRunner.tsx` — 检测到 ESSAY 题自动拉 `/user/essays/quota`，展示模型选择器；提交时带 `aiModel` + 当前 i18n 语言作 `aiLocale`
- `pages/ReviewResult.tsx` — 每道 ESSAY 题下内嵌 `EssayGradeCard`，接管后续轮询
- `pages/PracticeHub.tsx` + `pages/SkillPractice.tsx` — 按单技能 / 全模考切分入口
- `pages/SpeakingPlaceholder.tsx` — 口语占位，说明 v2 版本上线
- `pages/DashboardPrediction.tsx` — 仪表盘预测区
- `types/index.ts` — 完整的 `EssayGrade` / `EssayQuota` / `RubricDimension` / `EssayCorrection` / `SubmitResponseEssay` / `Prediction*` 类型

### 3. 国际化

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
| STANDARD | Haiku 4.5 | 20 | 10 |
| AI | Haiku / Sonnet | 50 | 15 |
| AI_UNLIMITED | Haiku / Sonnet / Opus | 200（软上限） | 20 |

- 每次 regrade 计入月配额（真实产生 token 成本）
- 另有 hourly 30 次保护上限，防前端死循环或 token 泄漏烧账单
- `costUsd` 每条记录落库，供运营对账

---

## 四、错误分类

| `errorMessage` 前缀 | 场景 | 前端展示 |
|---|---|---|
| `ESSAY_TOO_SHORT` | 不足 50 词 | 提示最少词数，不调用 AI |
| `PLAN_UPGRADE_REQUIRED` | FREE 用户 | 跳升级页 |
| `QUOTA_EXCEEDED` | 月配额用尽 | 提示下月重置 |
| `AI_NOT_CONFIGURED` | ANTHROPIC_API_KEY 缺失 | 通用 error |
| `AI_RATE_LIMITED` / `AI_PROVIDER_DOWN` | 瞬时故障 | 自动重试，不展示 |
| `AI_BAD_OUTPUT` | 模型返回畸形 JSON | 用户可 retry |

---

## 五、部署前必做

1. 生产环境 `ANTHROPIC_API_KEY` 长度 ≥ 40（`env.js` 强校验）
2. 首次部署前执行：`unset DATABASE_URL && cd backend && npx prisma migrate deploy`
3. 检查 CSP：如后续接入 Stripe / 支付宝需要新 CDN，`backend/src/index.js` 的 `connectSrc` / `scriptSrc` 要补
4. `/api/user/essays/*` 下的 rate limiter 窗口 = 1h 30 次，若 QPS 涨了需要调高

---

## 六、后续扩展点

- 单机瓶颈：≥ 100 DAU 时把 `essayQueue.js` 换成 BullMQ 消费者，`Essay` 表结构不变
- Prompt 版本管理：`aiGrader.buildSystemPrompt()` 字符串任何改动都会使 prompt cache 失效，改版本前先评估量级
- Opus 滥用检测：`costUsd` 聚合按用户查询即可建报表
- 口语评分（PO）：复用 `essayQueue` 结构，换 Claude 的 audio input

---

## 七、定价方案（保证 ≥ 20% 毛利）

### 单篇作文实际成本（按 Anthropic 2026-04 价表 + Prompt Cache 命中后）

| 模型 | 单篇成本 |
|---|---|
| Haiku 4.5 | ≈ ¥0.07 |
| Sonnet 4.6 | ≈ ¥0.22 |
| Opus 4.7 | ≈ ¥1.44 |

另：
- 支付通道费：3%（微信/支付宝）、3.5%（Stripe 海外）
- 基础设施摊薄（Neon / 邮件 / 服务器）：≈ ¥5/用户/月

### 推荐定价（人民币市场）

| 计划 | 月价 | 年价 | 月配额 | 可用模型 | 最差成本 | 毛利率 |
|---|---|---|---|---|---|---|
| FREE | ¥0 | — | 0 | 无 AI | ¥5 | 获客漏斗 |
| STANDARD | **¥29** | **¥290** | 20 篇 | Haiku | ¥7 | **76%** |
| AI | **¥69** | **¥690** | 50 篇 | Haiku + Sonnet | ¥19 | **72%** |
| AI_UNLIMITED | **¥99** | **¥990** | 100 篇（Opus ≤ 30） | 全开 | ¥67 | **33%** |

### 海外市场定价（美元）

| 计划 | 月价 | 年价 |
|---|---|---|
| STANDARD | $4.9 | $49 |
| AI | $9.9 | $99 |
| AI_UNLIMITED | $14.9 | $149 |

按 ¥7.2 = $1 换算，Stripe 通道费稍高（3.5%），整体毛利同量级。

### 不能动的红线

1. **AI_UNLIMITED 的 Opus 必须加子配额（≤ 30 篇/月）**
   纯刷 100 篇 Opus 成本 ¥144，直接倒挂。30 篇上限是守住 33% 毛利的关键。
2. **regrade 计入月配额**
   否则学生一篇作文刷 5 次 Opus 就把成本打穿。当前 `routes/essays.js` 已实现。
3. **FREE 绝对不给 AI 额度**
   转化率低 × 真实成本 = 纯亏。
4. **年付打 2 个月折**（10 个月价格）
   现金流更好 + 降低流失；单笔利润下降 17%，但 LTV 提升远超这部分。

### 利润兜底说明

表格里算的是**用户把配额刷满 + 全挑最贵可用模型**的地狱场景。真实用户行为：
- 平均只会用 30-50% 配额
- 绝大部分选 Haiku / Sonnet，Opus 仅偶尔用
- 综合毛利率预期 **60-80%**

表中 20%+ 毛利是"怎么被滥用都不会亏钱"的下限。
