# 🇫🇷 DELFluent · DELF B2 真题训练平台

[![Status](https://img.shields.io/badge/status-Beta%20v1.5-blue)](https://github.com/kk-fenglai/delf-B2-webiste)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![React](https://img.shields.io/badge/react-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/prisma-5-2D3748?logo=prisma)](https://www.prisma.io)
[![Ant Design](https://img.shields.io/badge/ant%20design-5-0170FE?logo=antdesign)](https://ant.design)
[![i18n](https://img.shields.io/badge/i18n-zh%20%7C%20en%20%7C%20fr-yellow)](#)

> 面向 DELF B2 考生的系统化在线训练平台：**听 · 说 · 读 · 写** 四项全真模拟，AI 智能批改，月订阅制商业化。

---

## ✨ 主要特性

| 模块 | 说明 |
|------|------|
| 🎧 **听力 (CO)** | 内嵌音频播放器 + 浏览器 TTS 备用朗读 · 速度调节 · 限次播放 |
| 📖 **阅读 (CE)** | 长文 + 题目同屏展示 · 支持单选/多选/判断/填空 |
| ✍️ **写作 (PE)** | 富文本编辑 · 字数统计 · **照片 OCR 识别作文** · AI 批改（DeepSeek V3 · 并行 fan-out）|
| 🎙️ **口语 (PO)** | 录音上传 · AI 评测（v2.0）|
| 🔐 **账户系统** | JWT 双令牌 · bcrypt 哈希 · 多订阅套餐权限 |
| 📊 **学习中心** | 四项能力雷达图 · 练习历史追踪 |
| 🌐 **多语言** | 中文 · English · Français 一键切换 |
| 💳 **订阅方案** | FREE / STANDARD / AI / AI_UNLIMITED 四档 |
| 💰 **订阅支付** | **Stripe Checkout（海外主路径）**：Card / Link / Stripe-hosted WeChat Pay & Alipay · **月度订阅自动续费** · Customer Portal 自助管理 · 管理员一键退款；微信 V3 / 支付宝直连代码保留，按 flag 关停 |
| 🧾 **成绩单** | PDF 成绩单下载 |

---

## 📦 技术栈

### Frontend
```
React 18 · TypeScript · Vite · Ant Design · Tailwind CSS
Zustand · React Router · ECharts · react-i18next · Axios
```

### Backend
```
Node.js · Express · Prisma ORM · PostgreSQL（dev/prod 统一，推荐 Neon dev branch + prod branch）
JWT · bcryptjs · Zod · openai SDK → DeepSeek V3 (AI grading)
tesseract.js → OCR（识别用户上传的作文照片）
stripe → Stripe Checkout / Customer Portal / Webhook（默认主路径）
wechatpay-axios-plugin · alipay-sdk → 国内通道（V3 / RSA2，flag 关停，代码保留）
```

---

## 🧾 写作照片 OCR（识别作文）

在写作题（PE）输入框上方可直接上传照片，将识别出的文字自动填入作文框，随后即可进行 AI 批改。

### API（后端）

- **接口**：`POST /api/user/essays/ocr`
- **鉴权/套餐**：需要登录且套餐 ≥ `STANDARD`
- **请求**：`multipart/form-data`
  - `image`: 图片文件（PNG/JPG/WEBP，≤ 8MB）
  - `lang`（可选）: `fr` / `en` / `zh`（默认 `fr`；也支持 `fra`/`eng`/`chi_sim` 或组合如 `fra+eng`）
- **返回**：`{ text, confidence, lang }`

### 拍照建议

- 尽量正对、光线充足、对焦清晰，裁掉多余背景
- 手写体/倾斜/反光会显著降低识别率

## 💰 订阅支付（Stripe-first）

**v1 海外单通道**：Stripe Checkout 一次性 + 订阅双模式，覆盖 Card / Link / Stripe-hosted WeChat Pay / Stripe-hosted Alipay。微信 V3 / 支付宝直连代码完整保留，靠 `ENABLE_DIRECT_WECHAT=false` / `ENABLE_DIRECT_ALIPAY=false` 默认不挂载路由。EUR 锚定定价见 `backend/src/constants/pricing.js` 与管理后台价目表。

### 更新记录（2026-04-30）

- **管理后台（支付）**：支持在后台编辑价格档“展示名”（不改 `code`），并在价目表中展示
- **多币种订阅**：新增 `PriceStripeMapping`（按 `priceId + currency` 绑定 Stripe recurring `price_xxx`），订阅 Checkout 优先按币种匹配
- **可靠性**：Stripe Checkout Session 创建失败时，不再遗留 `PENDING` 订单；会立刻标记为 `FAILED` 并写审计日志
- **Stripe 支付方式**：一次性支付 Checkout 支持 WeChat Pay / Alipay（是否展示取决于 Stripe 账号与币种/地区）

### 能力矩阵

| 能力 | 说明 |
|------|------|
| 一次性购买 | Stripe Checkout `mode=payment`，按月 / 按年 |
| 自动续费 | Stripe Subscription（`mode=subscription`）；扣款由 Stripe 自驱，本地用 `invoice.paid` webhook 入账，3 次失败 → 合约 SUSPENDED |
| 自助管理 | Stripe Customer Portal：换卡 / 取消订阅 / 下载发票，由 `POST /api/pay/stripe/portal` 拉起 |
| 价目管理 | Product / Price 存 DB，管理员后台 CRUD（订阅档需填 `stripePriceId`），无需改代码 |
| 订单对账 | worker 每 10 分钟兜底：补丢失 webhook 单 + 关超时未付单（`checkout.sessions.retrieve`） |
| 退款 | 管理员后台一键退款；按 `externalTradeNo` 前缀自动选 `pi_*` / `in_*` 路径，全额退则用户回落 FREE |
| 幂等 | `PaymentOrder(provider, providerOrderNo)` 联合 unique；`invoice.id` 复用做 `providerOrderNo`，重放 webhook 直接 P2002 |
| 审计 | 所有关键事件写 `AdminLog`（PAYMENT_COMPLETED / FAILED / REFUNDED / CONTRACT_* / RECONCILE_FIXUP） |
| 国内通道（保留） | 微信 V3 Native QR + 周期扣款合约 / 支付宝 precreate + 周期协议；`ENABLE_DIRECT_*=true` 时挂载 |

### 主要路由（Stripe，默认启用）

- `GET /api/pay/products` — 拉价目（公开）
- `POST /api/pay/stripe/checkout` — 创建 Checkout Session（`subscribe:true` 走订阅模式）
- `POST /api/pay/stripe/portal` — 拉起 Customer Portal
- `POST /api/pay/stripe/webhook` — 接 6 个事件（`checkout.session.completed` / `async_payment_succeeded` / `invoice.paid` / `invoice.payment_failed` / `customer.subscription.updated` / `customer.subscription.deleted`）
- `GET /api/pay/orders` · `GET /api/pay/contracts` — 用户自查
- `/api/admin/products|prices|payment-orders|contracts` — 运营后台

> 国内通道路由 `/api/pay/{wechat,alipay}/*` 仅在对应 `ENABLE_DIRECT_*=true` 时挂载。

### Env（最小集，海外部署）

```
# Stripe（默认主通道）
STRIPE_SECRET_KEY=sk_live_...                    # 测试用 sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CHECKOUT_SUCCESS_URL=https://your-domain.com/checkout/stripe/success?orderId={ORDER_ID}
STRIPE_CHECKOUT_CANCEL_URL=https://your-domain.com/checkout/stripe/cancel?orderId={ORDER_ID}

# 国内通道默认关闭（要开就设为 true，并补齐 WECHAT_* / ALIPAY_* + PAY_PUBLIC_BASE_URL）
ENABLE_DIRECT_WECHAT=false
ENABLE_DIRECT_ALIPAY=false
```

> 生产环境启动时 `env.js` 强校验：Stripe / 微信 / 支付宝 **至少一套** 完整，否则直接 exit；`PAY_MOCK_ENABLED=true` 在生产也会拒绝启动。Stripe-first 部署需在 Stripe Dashboard 建 recurring Price、配 webhook、启用 Customer Portal。

---

## 🚀 本地运行

### 准备
- Node.js ≥ 20
- PostgreSQL 数据库（dev/prod 都用 PG）。最省事的方案是 [Neon](https://console.neon.tech) 免费档，开两个 branch 分别给 dev / prod，不用本地装 Postgres

### 后端
```bash
cd backend
cp .env.example .env              # 填入 DATABASE_URL（Neon 连接串）+ JWT 密钥 + DEEPSEEK_API_KEY
npm install
npx prisma migrate deploy         # 应用 prisma/migrations 下两个迁移
npm run seed                      # 仿真题 + 4 个 demo 账号（仅 NODE_ENV=development）
npm run seed:billing              # 默认 Product/Price 价目（管理后台可改）
npm run dev                       # → http://localhost:4000
```

> Windows / PowerShell 用户注意：如果系统级环境变量里有旧的 `DATABASE_URL`，它会盖掉 `.env`（仅影响 `npx prisma ...` 这类 CLI；运行时 `npm run dev` 会被 `dotenv override:true` 覆盖回来）。要么先 `$env:DATABASE_URL='...'` 临时覆盖，要么用 `[Environment]::SetEnvironmentVariable('DATABASE_URL', $null, 'User')` 永久清除。

> 获取 DeepSeek API key：[platform.deepseek.com](https://platform.deepseek.com/api_keys)（国内直连，无需 VPN）。测试阶段充 10 元约够几千篇作文。

### 前端
```bash
cd frontend
npm install
npm run dev                       # → http://localhost:5173
```

### 测试账号（仅 `NODE_ENV=development` 下由 seed 创建）

| 邮箱 | 密码 | 套餐 |
|------|------|------|
| `free@delfluent.com` | `demo1234` | 免费版 |
| `demo@delfluent.com` | `demo1234` | 标准版 |
| `ai@delfluent.com` | `demo1234` | AI 版 |
| `ai-unlimited@delfluent.com` | `demo1234` | AI 无限版 |

> ⚠️ 这些账户在 `NODE_ENV=production` 时**不会被创建**（除非显式设置 `ALLOW_PROD_SEED=true`）。生产部署只会 upsert `alzy1210@163.com` 超级管理员。

---

## 📂 目录结构

```
delf-b2-website/
├── README.md                 # 本文件
├── backend/                  # Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型
│   │   └── seed.js           # 种子数据（仿真题）
│   └── src/
│       ├── routes/           # auth / exams / sessions / user
│       ├── services/         # grader (自动批改)
│       ├── middleware/       # auth / errorHandler
│       └── utils/            # jwt
└── frontend/                 # React + TS
    └── src/
        ├── pages/            # 8 个页面
        ├── components/       # AppLayout / AudioPlayer / LanguageSwitcher
        ├── i18n/             # zh / en / fr 翻译
        ├── api/              # axios client
        └── stores/           # Zustand
```

---

## 🛡️ 生产级部署清单

完成本迭代后，系统已具备以下生产级安全能力（详见 `backend/.env.example`）：

| 能力 | 实现 |
|------|------|
| **启动时强制校验 env** | `src/config/env.js`：JWT 密钥 <32 字符、等同 `.env.example` 占位、生产缺 SMTP 都会 `exit(1)` |
| **Refresh token 轮换 + 撤销** | 每次 `/refresh` 旋转，旧 token 被重放时自动撤销整条链；管理员可 `POST /admin/users/:id/revoke-sessions` 强制下线 |
| **账户状态实时校验** | `requireAuth` 异步查 DB，被停用/软删除用户立即拒绝，不再等 JWT 到期 |
| **邮箱验证** | 注册后必须点击邮件链接激活才能登录；未验证状态下仅开放白名单路径 |
| **密码策略** | 长度 ≥ 10 + 至少 3 类字符 + 常见弱密码黑名单，前后端一致 |
| **结构化日志** | pino，内置 requestId、密码/token 字段自动脱敏 |
| **生产错误处理** | 生产环境不泄露堆栈，Prisma/Zod/JWT 错误显式映射 |
| **管理员 2FA** | 密码 → 邮件 6 位验证码 → 签发 admin token |
| **管理员敏感操作二次确认** | 直接改密/硬删除需重新输入管理员密码（`X-Admin-Password` 头） |
| **IP 白名单** | `ADMIN_IP_ALLOWLIST` 环境变量限制 `/api/admin/*` 来源 |
| **速率限制** | 登录 30/15min、管理员登录 10/15min、密码重置 5/1h、admin API 200/min |
| **Helmet CSP + HSTS** | 生产自动开启 HSTS（2 年 + includeSubDomains + preload） |
| **软删除优先** | 默认软删除（可恢复）；硬删除仅超管 + 密码二次确认 |
| **Graceful shutdown** | SIGTERM/SIGINT 触发 Prisma 断连再 exit，15s 安全保底 |
| **健康探活** | `GET /api/health` 含 DB 连通检查（503 on failure） |
| **审计日志** | 所有管理员动作写入 `AdminLog` 表，前端可查 |

### 部署前 Checklist

1. `cp backend/.env.example backend/.env` 并：
   - `openssl rand -hex 48` 生成两个**不同**的 JWT 密钥
   - 填入真实 `DATABASE_URL`（PostgreSQL，建议 Neon prod branch，URL 含 `sslmode=require`）
   - 填入 163.com 授权码到 `SMTP_PASS`
   - 设置 `ADMIN_INITIAL_PASSWORD` 为强密码
   - **将 `NODE_ENV=production`**
2. `npx prisma migrate deploy`（生产用 deploy 不用 dev）
3. `npm run seed`（生产只 upsert 超级管理员，**不会**创建 demo 账户，除非 `ALLOW_PROD_SEED=true`）
4. `npm run seed:billing` 下发默认 Product/Price（金额/币种/`stripePriceId` 都需要再到管理后台改）
5. `pm2 start src/index.js --name delfluent-api`（或 systemd / Docker）
6. 首次登录超管后**立即改密码**
7. 前端：`cd frontend && npm run build` 产物部署到 CDN / Nginx
8. 建议前置 Nginx 或 CDN 统一 TLS + HTTP/2，以及 WAF 防 CC
9. **订阅支付（Stripe-first）**：
   - `.env` 配齐 `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `STRIPE_CHECKOUT_{SUCCESS,CANCEL}_URL`
   - Stripe Dashboard：给每个月度套餐建 recurring Price，把 `price_xxx` 填到管理后台对应 `Price.stripePriceId`
   - Stripe Dashboard：Settings → Billing → 启用 **Customer Portal**（推荐 cancel-at-end-of-period）
   - Stripe Dashboard：Webhooks → 加 endpoint `https://<域名>/api/pay/stripe/webhook`，订阅 `checkout.session.completed`、`async_payment_succeeded`、`invoice.paid`、`invoice.payment_failed`、`customer.subscription.updated`、`customer.subscription.deleted`
   - Nginx：`/api/pay/stripe/webhook` 透传原始 body，保留 `Stripe-Signature` 头，不要 strip
   - 国内通道（可选）：把 `ENABLE_DIRECT_WECHAT/ALIPAY=true`，补 `WECHAT_*` / `ALIPAY_*` + `PAY_PUBLIC_BASE_URL`，notify URL 配成 `https://<域名>/api/pay/{wechat,alipay}/notify`

## 🗺️ 路线图

- [x] **v0.1 MVP** — 注册登录 · 听力/阅读练习 · 自动批改 · 学习中心
- [x] **v0.2 生产级安全** — 邮箱验证 · refresh rotation · 状态守卫 · 管理后台 · 审计日志
- [x] **v1.0 标准版** — 完整模拟考试 · 错题本 · PDF 成绩单
- [x] **v1.5 AI 版 Beta** — DeepSeek V3 写作批改（并行 fan-out，单篇 <¥0.05） · AI 学习助手
- [x] **v1.6 订阅支付（代码就绪，待 Stripe Dashboard 接线）** — Stripe Checkout 一次性 + 订阅双模式 · Customer Portal 自助管理 · 商品/价格后台（含 `stripePriceId`） · 管理员一键退款 · reconcile worker 兜底；微信 V3 / 支付宝直连代码保留靠 flag 关停
- [ ] **v2.0 AI 版正式** — AI 口语评测 · 备考计划生成 · 移动端优化
- [ ] **v2.5** — 社区 · 教师版 · B2B API

---

## ⚠️ 法律与合规声明

- 本平台题目均为**原创仿真题**，题型格式对齐 DELF B2 真题但内容完全原创，规避版权风险
- DELF B2 官方真题版权归 **France Éducation international (CIEP)** 所有，商用需官方授权
- 上线前需补充：隐私政策 · 用户协议 · ICP 备案（中国大陆部署）

---

## 📜 License

MIT © 2026 kk-fenglai
