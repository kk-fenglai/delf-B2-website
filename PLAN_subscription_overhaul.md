# 订阅方案改造 — 实施分工

> 目标方案（用户已确认 2026-05-21）：
>
> - **FREE**：阅读 3 套/月 · 听力 3 套/月 · 全真模拟 2 套/月 · 错题本基础
> - **STANDARD ¥29/月**：阅读听力不限次 · 全真模拟不限次 · 作文 AI 5 篇/月 · 口语 AI 3 次/月 · 完整错题本
> - **AI ¥69/月**：标准版全部 + 作文 AI 30 篇/月 + 口语 AI 15 次/月 + 作文模板自定义 3 个
> - **AI 无限 ¥99/月**：AI 版全部 + 作文/口语 AI 不限次（日 30/15）+ 模板不限 + OCR 拍照作文 + 新功能优先

> 用户已选择：FREE 限额 = **每月 reset · 按 session 数**；模板 = **用户手写保存**；OCR = **拍手写作文 → 转文字 → 走 essay AI 批改**。

---

## 价格 / 配额 现状对照

| 项 | 现状 | 目标 | 改动 |
|---|---|---|---|
| 价格 ¥29 / ¥69 / ¥99 (CNY 月付) | DB 已是 2900 / 6900 / 9900 | 同 | **无需改动** |
| `PLAN_CAPS.STANDARD` 5 essays / 3 orals | 已是 5 / 3 | 同 | **无需改动** |
| `PLAN_CAPS.AI` 30 essays / 15 orals | 已是 30 / 15 | 同 | **无需改动** |
| `PLAN_CAPS.AI_UNLIMITED` UNLIMITED / 日 30 / 日 15 | 已是 | 同 | **无需改动** |

后端 `backend/src/constants/planMatrix.js` 的 `PLAN_CAPS` 已经对得上，本次不动。

---

## 阶段 1 ── 文案 + FREE 月度配额（本次任务）

### 1.1 i18n 文案更新

文件：
- `frontend/src/i18n/locales/zh.json` — `pricing.plans.{free,standard,ai,ai_unlimited}.features`
- `frontend/src/i18n/locales/en.json` — 同上
- `frontend/src/i18n/locales/fr.json` — 同上

**zh.json 目标值**：
```jsonc
"free": {
  "name": "免费版",
  "price": "¥0",
  "period": "",
  "cta": "免费注册",
  "features": [
    "阅读练习 3 套/月",
    "听力练习 3 套/月",
    "全真模拟 2 套/月",
    "错题本基础功能"
  ]
},
"standard": {
  "name": "标准版",
  "cta": "开通标准版",
  "features": [
    "阅读 / 听力无限次练习",
    "全真模拟考无限次",
    "作文 AI 批改 5 篇/月",
    "口语 AI 批改 3 次/月",
    "完整错题本"
  ]
},
"ai": {
  "name": "AI 版",
  "cta": "开通 AI 版",
  "features": [
    "标准版全部功能",
    "作文 AI 批改 30 篇/月",
    "口语 AI 批改 15 次/月",
    "作文模板库 自定义 3 个"
  ]
},
"ai_unlimited": {
  "name": "AI 无限",
  "cta": "开通 AI 无限",
  "features": [
    "AI 版全部功能",
    "作文 AI 不限次（日 30 篇）",
    "口语 AI 不限次（日 15 次）",
    "作文模板库无限",
    "OCR 拍照上传作文 → AI 批改",
    "新功能优先体验"
  ]
}
```

en.json / fr.json 用对应的翻译，结构同上（4 条 / 5 条 / 4 条 / 6 条）。翻译参考：
- 英：Reading practice 3 sets/month、Listening practice 3 sets/month、Full mock 2 sets/month、Basic mistake book；Unlimited reading & listening practice、Unlimited full mocks、5 essays AI/month、3 orals AI/month、Full mistake book；…
- 法：3 séries de lecture/mois、3 séries d'écoute/mois、2 simulations/mois、Carnet d'erreurs (base)；…

### 1.2 FREE 月度配额：后端

#### Schema 改动
`backend/prisma/schema.prisma` 的 `ExamSession`：
```prisma
model ExamSession {
  ...
  skill        String?    // 'CE' | 'CO' | 'PE' | 'PO' | null  (null = 全真模拟/EXAM mode)
  ...
}
```

迁移：`npx prisma migrate dev --name examsession_skill`。旧行 skill 留 null（不影响计数，因为只查最近一个月的数据，全是新创建的）。

#### planMatrix.js 加 free 限额
`backend/src/constants/planMatrix.js`：
```js
const PLAN_CAPS = {
  FREE: {
    models: [],
    monthlyEssays: 0,
    dailyEssays: 0,
    monthlyOralExams: 0,
    dailyOralExams: 0,
    // 新增：免费用户每月可创建的 session 数（按 skill 分桶）
    freeMonthlySessions: {
      CE: 3,
      CO: 3,
      MOCK: 2,  // mode = 'EXAM'
    },
  },
  STANDARD: { ..., freeMonthlySessions: null },  // null = 无限
  AI:        { ..., freeMonthlySessions: null },
  AI_UNLIMITED: { ..., freeMonthlySessions: null },
};
```

#### 拦截创建 session

`backend/src/routes/sessions.js` 的 `POST /` 现在 schema 只接收 `examSetId` 和 `mode`。改为：
```js
const schema = z.object({
  examSetId: z.string(),
  mode: z.enum(['PRACTICE', 'EXAM']).default('PRACTICE'),
  skill: z.enum(['CE', 'CO', 'PE', 'PO']).optional(),  // 仅 PRACTICE 时有意义
});
```

在 `prisma.examSession.create` 前加配额检查：
```js
const plan = req.userPlan || 'FREE';
const caps = PLAN_CAPS[plan];
if (caps.freeMonthlySessions) {
  // 桶：EXAM 模式归 MOCK；PRACTICE 模式按 skill
  const bucket = data.mode === 'EXAM' ? 'MOCK' : data.skill;
  if (bucket && caps.freeMonthlySessions[bucket] !== undefined) {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const used = await prisma.examSession.count({
      where: {
        userId: req.userId,
        createdAt: { gte: monthStart },
        ...(bucket === 'MOCK'
          ? { mode: 'EXAM' }
          : { mode: 'PRACTICE', skill: bucket }),
      },
    });
    if (used >= caps.freeMonthlySessions[bucket]) {
      return res.status(402).json({
        error: 'Free quota reached for this category',
        code: 'FREE_QUOTA_EXCEEDED',
        bucket,
        used,
        cap: caps.freeMonthlySessions[bucket],
        requiresUpgrade: true,
      });
    }
  }
}

const session = await prisma.examSession.create({
  data: {
    userId: req.userId,
    examSetId: data.examSetId,
    mode: data.mode,
    skill: data.mode === 'EXAM' ? null : (data.skill || null),
  },
});
```

#### 暴露 quota 给前端
新增 `GET /api/user/exams/quota`（或加进现有 `/user/me` 响应），返回：
```json
{
  "plan": "FREE",
  "freeSessions": {
    "CE": { "used": 1, "cap": 3 },
    "CO": { "used": 0, "cap": 3 },
    "MOCK": { "used": 2, "cap": 2 }
  },
  "resetAt": "2026-06-01T00:00:00Z"
}
```
非 FREE 用户返回 `freeSessions: null`。前端用这个数据：
- 在 `/practice` 页面顶部显示剩余次数
- 在阅读/听力/模拟入口卡片上显示"还剩 X 次"
- 在用尽时把"开始练习"换成"升级解锁"

### 1.3 FREE 月度配额：前端

#### 调用方改动
现在 `frontend/src/pages/SkillPractice.tsx` 调用 `POST /sessions` 没有传 `skill`。改成传当前 skill。同理 `ExamRunner.tsx`（mock 模式）。

#### 拦截响应
`frontend/src/api/client.ts` 已经有 402 拦截吗？检查一下；没有就在调用方处理：
```ts
catch (err: any) {
  if (err?.response?.status === 402 && err.response.data?.code === 'FREE_QUOTA_EXCEEDED') {
    setUpgradeOpen(true);  // 弹升级提示 modal
    return;
  }
  throw err;
}
```

#### 升级提示组件
现在 `Pricing.tsx` 已经有，复用即可。需要做一个 `<FreeQuotaUpgradeModal>` 组件，文案区分 bucket：
- `bucket=CE` → "本月阅读练习已用完 3/3，升级标准版解锁不限次"
- `bucket=CO` → 同
- `bucket=MOCK` → "本月全真模拟已用完 2/2..."

挂在 `App.tsx` 或者每个 practice 页面里。

#### i18n key
新增 `freeQuota.exceeded.{ce,co,mock}` 三个文案，3 种语言。

### 1.4 验收

- 新 FREE 用户连开 3 个 CE practice session：第 4 次返回 402，前端弹升级 modal。
- 同一用户开 mock：前 2 次成功，第 3 次拒绝。
- STANDARD 用户：无任何拦截。
- 月初 reset（手动改一个 ExamSession 的 createdAt 到上个月，再开新 session）。
- 现有的 `isFreePreview` 套题访问控制保持不变 —— 跟新配额是叠加关系：FREE 用户只能进 isFreePreview 的题，且每月名额按 bucket 算。

---

## 阶段 2 ── 作文模板库（独立 PR）

### 2.1 Schema
`backend/prisma/schema.prisma`：
```prisma
model EssayTemplate {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String   @db.VarChar(120)
  content   String   @db.Text     // 用户手写的模板正文
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, createdAt])
}
```

### 2.2 配额
`planMatrix.js`：
```js
FREE:         { ..., maxEssayTemplates: 0 },
STANDARD:     { ..., maxEssayTemplates: 0 },
AI:           { ..., maxEssayTemplates: 3 },
AI_UNLIMITED: { ..., maxEssayTemplates: UNLIMITED },
```

### 2.3 API
新建 `backend/src/routes/essayTemplates.js`：
- `GET    /api/user/essay-templates` — 列出当前用户的模板
- `POST   /api/user/essay-templates` `{title, content}` — 新建（限额检查）
- `PATCH  /api/user/essay-templates/:id` `{title?, content?}` — 编辑
- `DELETE /api/user/essay-templates/:id` — 删除

所有路由 `requireAuth`；POST 加 `requirePlan('AI')` + 计数限额。content 长度限制：≤ 8000 字符。

挂到 `backend/src/index.js` 的路由表。

### 2.4 前端
新页面 `frontend/src/pages/EssayTemplates.tsx`：
- 列表 + 新建 + 编辑 + 删除
- 显示"已用 X / Y"（Y 来自 `/user/me` 或新增 quota endpoint）
- 用尽时按钮变"升级到 AI 无限"

在作文练习页（`SkillPractice.tsx` 写作部分 / 作文编辑器组件）加"插入模板"按钮 → 下拉用户模板列表 → 点击后插到 textarea 光标位置。

路由：`/practice/writing/templates` 或菜单里加一项。

### 2.5 i18n
`essayTemplates.{list,create,edit,delete,emptyState,quotaExceeded,insertButton,...}` 三种语言。

### 2.6 验收
- AI 用户能创建 3 个，第 4 个被拒。
- AI_UNLIMITED 不限。
- STANDARD/FREE 看到入口但点进去显示"升级到 AI 版解锁"。
- 写作时能一键插入模板内容。

---

## 阶段 3 ── OCR 拍照上传作文（独立 PR，需要外部服务）

### 3.1 OCR 服务选型（**决策待定**）

候选：
- **百度 OCR** / **腾讯云 OCR** / **阿里云 OCR** — 国内常用，按调用计费，中文/法语都支持
- **Tencent General OCR** + 自家后端做 layout 整理
- **Google Cloud Vision** — 海外，价格高
- **Qwen-VL** / **Claude Vision** — 多模态大模型直接出文本，质量高但贵

**推荐**：先用 **Tencent General OCR** 走 `GeneralAccurateOCR` 接口（手写优化版），月用量 1000 次内免费。法语手写支持需要测一下；如果识别率太差，回退到 Claude Vision (sonnet) 直接 prompt "OCR this handwritten French essay"。

需要的环境变量（写到 `backend/src/config/env.js`）：
```js
OCR_PROVIDER: 'tencent' | 'claude' | 'mock',
OCR_TENCENT_SECRET_ID, OCR_TENCENT_SECRET_KEY, OCR_TENCENT_REGION,
```

### 3.2 后端

新建 `backend/src/services/ocr.js`：
- `transcribeImage(filePath, { language: 'fr' }) → { text, confidence, provider }`
- 不同 provider 的 dispatch（同 `stt.js` 的模式）
- Mock 模式（dev）：直接返回 fileName 作为 text

新建 `backend/src/routes/essayOCR.js`：
- `POST /api/user/essays/ocr` (multipart: `image` 字段)
  - `requireAuth` + `requirePlan('AI_UNLIMITED')`
  - rate limit：每用户每小时 ≤ 10 次（OCR 不便宜）
  - 文件限制：≤ 8 MB；`image/jpeg|png|webp|heic`
  - 流程：保存图片到 `backend/content/essay-ocr/<yyyy-mm>/` → 调用 `transcribeImage` → 返回 `{ text, confidence }`
  - 不直接创建 Essay 行，让前端拿到文本后用户编辑、再走原 essay 提交流程

### 3.3 前端

写作页面加"拍照上传"按钮（条件：`user.plan === 'AI_UNLIMITED'`）：
- 点击 → 触发 `<input type="file" accept="image/*" capture="environment">`
- 上传到 `/user/essays/ocr` → 拿到 text → 填到作文编辑器 textarea
- 显示 confidence；如果 < 0.8 提示"识别可能有误，请检查"
- 加 loading spinner（OCR 通常 3-8s）

i18n：`essayOcr.{button, uploading, lowConfidence, error, planRequired}` 三语。

### 3.4 验收
- AI 无限用户拍照上传：返回识别文本，填入编辑器。
- STANDARD/AI 用户看不到按钮（或点击提示升级）。
- 大于 8MB / 非图片 → 400 + 提示。
- Rate limit 触发 → 429。
- 识别完后正常走 essay AI 批改流程。

---

## 风险与注意事项

1. **schema 迁移要小心**：阶段 1 给 `ExamSession` 加 `skill` 字段；阶段 2 加 `EssayTemplate` 表。每个迁移要在 dev 上跑一遍 + 检查 prod 备份。

2. **现有 isFreePreview 系统不能动**。FREE 月度配额是叠加在 isFreePreview 之上的：即使套题是 freePreview，FREE 用户开 session 还是要扣月度名额。

3. **session "未提交" 也算 quota 吗？** 当前设计：算（在 `POST /sessions` 创建时就检查/计数）。这样防止刷新刷 quota。代价是用户开了不做也扣额度。如果觉得太严，可以改成"在 `POST /sessions/:id/submit` 完成后才计数" —— 但要小心并发：一个用户同时开多个 tab 都没提交，会绕过限额。**建议先按"创建时扣"实施，观察一周再决定**。

4. **OCR 计费**。Tencent OCR 1000 次/月免费，之后 ¥0.15/次。一个用户每天上限 10 次的话，AI 无限活跃用户 200 人时，月调用量峰值 6 万次 → ¥9000/月。考虑：是否只对 AI 无限用户开放 + 是否进一步收紧 daily cap。

5. **新功能首先体验**：AI 无限的卖点之一。当前没有 feature flag 系统。建议先用一个简单的 `process.env.AI_UNLIMITED_BETA_FEATURES = "templates_v2,ocr_v2"` 控制开关，等真正有 beta 功能时再单独做 schema。

---

## 改动文件清单速查

阶段 1（本次）：
- `frontend/src/i18n/locales/{zh,en,fr}.json` — features 文案
- `backend/prisma/schema.prisma` — `ExamSession.skill`
- `backend/prisma/migrations/<timestamp>_examsession_skill/` — 迁移
- `backend/src/constants/planMatrix.js` — `freeMonthlySessions`
- `backend/src/routes/sessions.js` — POST / 加 skill + 配额拦截
- `backend/src/routes/user.js`（或新建）— GET /user/exams/quota
- `frontend/src/pages/{SkillPractice,ExamRunner}.tsx` — 传 skill 字段
- `frontend/src/components/FreeQuotaUpgradeModal.tsx` — 新增
- `frontend/src/App.tsx`（或各 practice 页）— 挂 modal + 调 quota
- `frontend/src/i18n/locales/{zh,en,fr}.json` — `freeQuota.*` 文案

阶段 2：
- `backend/prisma/schema.prisma` — `EssayTemplate`
- 迁移
- `backend/src/constants/planMatrix.js` — `maxEssayTemplates`
- `backend/src/routes/essayTemplates.js` — 新建
- `backend/src/index.js` — 挂路由
- `frontend/src/pages/EssayTemplates.tsx` — 新增
- 作文编辑器组件 — 加"插入模板"下拉
- `frontend/src/i18n/locales/*.json` — `essayTemplates.*`

阶段 3：
- `backend/src/config/env.js` — OCR_* 环境变量
- `backend/src/services/ocr.js` — 新增
- `backend/src/routes/essayOCR.js` — 新增
- `backend/src/index.js` — 挂路由
- 作文编辑器组件 — 加拍照上传按钮（条件渲染）
- `frontend/src/i18n/locales/*.json` — `essayOcr.*`
