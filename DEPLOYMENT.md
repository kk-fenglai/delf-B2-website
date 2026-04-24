# 生产部署方案（海外华人留学生方向）

本文档是 Delfluent B2 平台首次上线的操作手册。目标读者：项目维护者本人。

---

## 1. 架构总览

```
                     ┌──────────────────────────────┐
                     │  用户浏览器 (留学生 / 海外华人) │
                     └──────────────┬───────────────┘
                                    │ HTTPS
                                    ▼
                     ┌──────────────────────────────┐
                     │  Vercel  (前端 SPA + CDN)     │
                     │  Vite + React 静态文件         │
                     │  /api/* 重写到 Fly             │
                     └──────────────┬───────────────┘
                                    │
                  ┌─────────────────┼──────────────────┐
                  │                 │                  │
                  │ /api/*          │ Stripe webhook   │ DB
                  ▼                 │ (直连，不经 Vercel) ▼
       ┌──────────────────┐         │           ┌────────────────┐
       │  Fly.io (HKG)    │◀────────┘           │ Neon Postgres   │
       │  Express 容器     │                    │ (US East 等)    │
       │  + essayQueue    │────────────────────▶│                │
       │  + reconcile     │                    └────────────────┘
       └──────┬───────────┘
              │
              ├──▶ Stripe (Card / WeChat Pay / Alipay)
              ├──▶ DeepSeek API (作文 AI 评分)
              └──▶ SMTP (邮件验证 / 找回密码)
```

**职责划分**：

| 组件 | 职责 | 区域 |
|---|---|---|
| Vercel | 前端静态托管 + CDN + `/api` 反代 | 全球 |
| Fly.io | Express 后端 + 常驻 worker | hkg |
| Neon | Postgres 主库 | US East（默认） |
| Stripe | 唯一支付通道，含 wechat_pay / alipay payment method | 全球 |
| DeepSeek | 作文 AI 评分 | 全球可达 |

---

## 2. 部署前准备

### 2.1 注册账号
- [ ] [Cloudflare](https://dash.cloudflare.com/sign-up)（DNS 用，免费）
- [ ] [Vercel](https://vercel.com/signup)（用 GitHub 登录最方便）
- [ ] [Fly.io](https://fly.io/app/sign-up)（要绑信用卡）
- [ ] [Neon](https://console.neon.tech/signup)（免费档够起步）
- [ ] [Stripe](https://dashboard.stripe.com/register)（提交资料后 1–3 天激活）

### 2.2 安装 CLI
```bash
# Fly CLI（Windows PowerShell）
iwr https://fly.io/install.ps1 -useb | iex

# Vercel CLI
npm i -g vercel

# 已有的：node ≥ 20、npm
```

### 2.3 准备域名（可选但推荐）
- 在 Cloudflare 买/转入一个域名（10–15 美元/年）
- 主站：`yoursite.com` → Vercel
- API：`api.yoursite.com` → Fly.io

---

## 3. 数据库（Neon）

1. 控制台 → New Project
   - Name: `delfluent`
   - Region: **AWS US East (N. Virginia)** —— Fly hkg 到这里 ~180ms，比东南亚区贵
   - Postgres version: 16
2. 拿到连接串：
   ```
   postgresql://USER:PASS@ep-xxx.us-east-2.aws.neon.tech/delfluent?sslmode=require
   ```
3. **先不要 run migrate**，等下统一在部署时跑

> **本地开发也用 Neon**：在 Neon 控制台 → Branches → Create branch（叫 `dev`）。把这条 URL 写到 `backend/.env` 的 `DATABASE_URL`。免去本地装 Postgres。

---

## 4. Stripe 配置

### 4.1 启用支付方式
1. Dashboard → Settings → Payment methods
2. 启用 **Card**、**WeChat Pay**、**Alipay**
3. 检查 Account currency。海外账号若不支持 CNY，需要把 DB 里的 `Price.currency` 改成 USD/HKD：
   ```sql
   UPDATE "Price" SET currency='USD' WHERE active=true;
   -- 同时调整 amountCents 到合理的美元面额
   ```

### 4.2 拿密钥
- Dashboard → Developers → API keys
- 测试期用 `sk_test_...`，正式上线换 `sk_live_...`

### 4.3 Webhook（先跳过，后端部署完再回来配）

---

## 5. 后端部署（Fly.io）

### 5.1 初始化
```bash
cd backend
fly auth login
fly launch --no-deploy
```
- 提示输入 app 名：建议 `delfluent-backend`（被占用就换，**记得回头改 `frontend/vercel.json` 里的 destination**）
- 提示选区域：选 `hkg`
- 提示创建 Postgres：选 **No**（用 Neon）
- 提示部署：选 **No**（先设 secrets）

### 5.2 配置 secrets
```bash
fly secrets set \
  DATABASE_URL="postgresql://USER:PASS@ep-xxx.neon.tech/delfluent?sslmode=require" \
  JWT_ACCESS_SECRET="$(openssl rand -hex 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 48)" \
  FRONTEND_URL="https://your-vercel-domain.vercel.app" \
  DEEPSEEK_API_KEY="sk-..." \
  DASHSCOPE_API_KEY="sk-..." \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  ADMIN_INITIAL_PASSWORD="Strong_Init_Password_2026!" \
  SMTP_HOST="smtp.163.com" \
  SMTP_PORT="465" \
  SMTP_SECURE="true" \
  SMTP_USER="your@163.com" \
  SMTP_PASS="your_163_authcode" \
  SMTP_FROM="DELFluent <your@163.com>"
```

> `STRIPE_WEBHOOK_SECRET` 还没拿到，先用占位 `whsec_pending`，回头更新。

### 5.3 首次部署
```bash
fly deploy
```
- `release_command` 会跑 `prisma migrate deploy` 创建表（第一次会走 init migration）
- 部署完拿到 URL：`https://delfluent-backend.fly.dev`

### 5.4 验证
```bash
curl https://delfluent-backend.fly.dev/api/health
# 期望: { "status": "ok", "service": "delfluent-backend", "db": "ok" }
```

### 5.5 Seed 数据
```bash
fly ssh console -C "node prisma/seed.js"
fly ssh console -C "node scripts/seedBilling.js"
```

---

## 6. 前端部署（Vercel）

### 6.1 改 `vercel.json` 的 destination
如果你的 Fly app 名不是 `delfluent-backend`，编辑 `frontend/vercel.json`：
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR_FLY_APP.fly.dev/api/:path*" }
  ]
}
```

### 6.2 部署
```bash
cd frontend
vercel
```
- Set up and deploy: **Y**
- Which scope: 选你的账号
- Link to existing project: **N**
- Project name: `delfluent-frontend`
- Directory: `./`（默认）
- Override settings: **N**（Vercel 自动识别 Vite）

部署后拿到 URL：`https://delfluent-frontend-xxx.vercel.app`

### 6.3 回头更新 Fly 的 FRONTEND_URL
```bash
cd ../backend
fly secrets set FRONTEND_URL="https://delfluent-frontend-xxx.vercel.app"
# 修改 secret 会触发重启，CORS 才会更新
```

---

## 7. Stripe Webhook（部署完才能配）

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL：**直接打 Fly，不要走 Vercel**
   ```
   https://delfluent-backend.fly.dev/api/pay/stripe/webhook
   ```
3. 监听事件：勾选
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
4. 创建后拿到 `whsec_xxx`，回 Fly 更新：
   ```bash
   fly secrets set STRIPE_WEBHOOK_SECRET="whsec_xxx"
   ```

---

## 8. 端到端验收清单

- [ ] `https://yoursite.vercel.app` 能打开，看到首页
- [ ] 浏览器 DevTools 看 `/api/health` 返回 `{"status":"ok","db":"ok"}`
- [ ] 注册新账号 → 收到验证邮件 → 点链接验证成功
- [ ] 登录 → admin 用 ADMIN_INITIAL_PASSWORD 进 `/admin`，**立即改密码**
- [ ] 用户端选购套餐 → Stripe Checkout 跳转
- [ ] 用 [Stripe 测试卡](https://stripe.com/docs/testing#cards) `4242 4242 4242 4242` 付款 → webhook 触发 → User.plan 升级
- [ ] WeChat Pay 测试模式：Stripe 测试环境会显示模拟扫码页 → 点 "Authorize Test Payment"
- [ ] Alipay 同上
- [ ] 提交一篇作文 → 30 秒内 Essay.status 变 `done`，看到 AI 评分

---

## 9. 已知遗留 / 后续工作

### 9.1 静态音频（首版未做）
- `backend/content/fei-samples/*.mp3` 目前不在 Docker 镜像里
- 听力相关接口会返回 404
- **解决方案**：迁到 Cloudflare R2，参见 Task 6（待办）
- 短期 workaround：手动把 mp3 推到 Fly 持久卷，或临时 COPY 进镜像

### 9.2 essayQueue 单实例锁
- 当前 SQLite 风格的"先 findFirst 再 updateMany"在多 Fly 实例并发下可能重复 claim
- 现在 `min_machines_running = 1` + 单实例运行 → 安全
- 扩到多实例时改用 Postgres `SELECT ... FOR UPDATE SKIP LOCKED`（`backend/src/services/essayQueue.js:32` 已有 TODO）

### 9.3 国内直连支付通道
- `routes/payments/wechat.js` 和 `routes/payments/alipay.js` 代码保留但默认禁用
- 未来若想拿国内直连商户号（手续费更低），设置：
  ```bash
  fly secrets set ENABLE_DIRECT_WECHAT=true ENABLE_DIRECT_ALIPAY=true \
    PAY_PUBLIC_BASE_URL=https://api.yoursite.com \
    WECHAT_APP_ID=... WECHAT_MCHID=... ...
  ```
- 前提：中国大陆公司主体 + 备案过的回调域名

### 9.4 邮件送达率
- 当前用 163 SMTP，国际收件方易进垃圾邮件
- 用户主要在海外时建议换 [Resend](https://resend.com)（免费 3000 封/月）或 SendGrid

### 9.5 监控
- 暂未集成。建议加：
  - [UptimeRobot](https://uptimerobot.com)：定时打 `/api/health`，宕机邮件告警
  - [Sentry](https://sentry.io)：前端 + 后端错误聚合
- Fly 自带 metrics 在 dashboard 里看 CPU / 内存 / 请求量

---

## 10. 日常运维 cheatsheet

### Fly
```bash
fly logs                    # 实时日志
fly ssh console             # SSH 进容器
fly status                  # 实例状态
fly secrets list            # 看哪些 secret 设了（不显示值）
fly deploy                  # 重新部署
fly scale memory 2048       # 内存升到 2GB（OCR 撑不住时）
```

### Neon
- 控制台 → SQL Editor 直接跑 SQL
- Branches 功能：开发 / 测试 / 生产用不同 branch，互不干扰
- 备份：付费档自动 PITR；免费档建议每周 `pg_dump` 一次

### Vercel
```bash
vercel --prod               # 部署到生产域名
vercel logs                 # 看 build / runtime 日志
vercel env add KEY          # 加环境变量（前端的 VITE_* 要在这里加）
```

---

## 11. 成本预算

| 项目 | 月成本 | 说明 |
|---|---|---|
| Vercel Hobby | $0 | 100GB 流量够小流量 |
| Fly.io | $5–8 | shared-cpu-1x 1GB 一台 |
| Neon Free | $0 | 0.5GB 存储 + 计算时长够起步 |
| Stripe | 按交易抽成 | 3.4% + $0.30 / 单 |
| 域名 | $1 | $12/年 摊月 |
| **合计** | **~$6–9 + Stripe 手续费** | |

> 当 DAU 到 200+ 时再升 Fly 内存到 2GB、Neon 升到 Launch ($19/月)。
