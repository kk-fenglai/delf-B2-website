# 🇫🇷 DELFluent · DELF B2 真题训练平台

[![Status](https://img.shields.io/badge/status-MVP%20v0.1-green)](https://github.com/kk-fenglai/delf-B2-webiste)
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
| ✍️ **写作 (PE)** | 富文本编辑 · 字数统计 · AI 批改（v1.5）|
| 🎙️ **口语 (PO)** | 录音上传 · AI 评测（v2.0）|
| 🔐 **账户系统** | JWT 双令牌 · bcrypt 哈希 · 多订阅套餐权限 |
| 📊 **学习中心** | 四项能力雷达图 · 练习历史追踪 |
| 🌐 **多语言** | 中文 · English · Français 一键切换 |
| 💳 **订阅方案** | FREE / STANDARD / AI / AI_UNLIMITED 四档 |

---

## 📦 技术栈

### Frontend
```
React 18 · TypeScript · Vite · Ant Design · Tailwind CSS
Zustand · React Router · ECharts · react-i18next · Axios
```

### Backend
```
Node.js · Express · Prisma ORM · SQLite (dev) / PostgreSQL (prod)
JWT · bcryptjs · Zod · @anthropic-ai/sdk (v1.5)
```

---

## 🚀 本地运行

### 准备
- Node.js ≥ 20
- （生产环境用 PostgreSQL，开发环境 SQLite 开箱即用）

### 后端
```bash
cd backend
cp .env.example .env              # 填入 JWT 密钥
npm install
npx prisma migrate dev --name init
npm run seed                      # 导入仿真题种子数据
npm run dev                       # → http://localhost:4000
```

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
├── PRD.md                    # 产品需求文档（英文）
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
   - 填入真实 `DATABASE_URL`（生产用 PostgreSQL）
   - 填入 163.com 授权码到 `SMTP_PASS`
   - 设置 `ADMIN_INITIAL_PASSWORD` 为强密码
   - **将 `NODE_ENV=production`**
2. `cd backend && vi prisma/schema.prisma` 把 `provider = "sqlite"` 改为 `"postgresql"`
3. `npx prisma migrate deploy`（生产用 deploy 不用 dev）
4. `npm run seed`（仅超管上线，不会创建演示账户）
5. `pm2 start src/index.js --name delfluent-api`（或 systemd / Docker）
6. 首次登录超管后**立即改密码**
7. 前端：`cd frontend && npm run build` 产物部署到 CDN / Nginx
8. 建议前置 Nginx 或 CDN 统一 TLS + HTTP/2，以及 WAF 防 CC

## 🗺️ 路线图

- [x] **v0.1 MVP** — 注册登录 · 听力/阅读练习 · 自动批改 · 学习中心
- [x] **v0.2 生产级安全** — 邮箱验证 · refresh rotation · 状态守卫 · 管理后台 · 审计日志
- [ ] **v1.0 标准版** — 完整模拟考试 · 错题本 · PDF 成绩单
- [ ] **v1.5 AI 版 Beta** — Claude API 写作批改 · AI 学习助手
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
