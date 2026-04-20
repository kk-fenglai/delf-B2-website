# AI 批改作文功能实现总结

DELF B2 Production Écrite（书面表达）的 AI 批改与分数预测功能。学生交卷后，系统将作文送入队列，由 **DeepSeek V3** 按官方 25 分评分网格打分并给出逐句修改建议。

> **2026-04 迁移说明**：原先走 Anthropic Claude（Haiku / Sonnet / Opus 三档），因国内访问延迟高 + 成本偏贵，切换到 DeepSeek V3。架构不变，成本下降 ~95%，墙钟时间从 15-30s 压到 3-6s。见文末"迁移记录"。

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

### 推荐定价（人民币市场）

| 计划 | 月价 | 年价 | 月配额 | 满配额真实成本 | 毛利率（纯 AI 成本） |
|---|---|---|---|---|---|
| FREE | ¥0 | — | 0 | ¥5 | 获客漏斗 |
| STANDARD | **¥29** | **¥290** | 20 篇 | ≈ ¥0.8 | **>97%** |
| AI | **¥69** | **¥690** | 50 篇 | ≈ ¥2 | **>97%** |
| AI_UNLIMITED | **¥99** | **¥990** | 200 篇 | ≈ ¥8 | **>90%** |

### 海外市场定价（美元）

| 计划 | 月价 | 年价 |
|---|---|---|
| STANDARD | $4.9 | $49 |
| AI | $9.9 | $99 |
| AI_UNLIMITED | $14.9 | $149 |

### 仍然不能动的红线

1. **regrade 计入月配额** —— 否则学生一篇作文刷 N 次，即使 DeepSeek 很便宜也浪费 token。当前 `routes/essays.js` 已实现。
2. **FREE 绝对不给 AI 额度** —— 转化率低 × 真实成本 + 滥用风险 = 纯亏。
3. **年付打 2 个月折**（10 个月价格）—— 现金流 + 降低流失。
4. **Hourly 30 次 rate limiter 不能去掉** —— 防 token 泄漏 / 恶意刷 API。

### DeepSeek 后的利润模型

表格里是"用户把配额刷满"的场景。即使如此，毛利率都在 90% 以上。真实用户平均只会用 30-50% 配额，**综合毛利率预期 95%+**。

单机成本结构下，现在的瓶颈已不是 AI 费用，而是**基础设施 + 支付通道 + 邮件发送**。

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
