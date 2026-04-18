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

### 测试账号

| 邮箱 | 密码 | 套餐 |
|------|------|------|
| `free@delfluent.com` | `demo1234` | 免费版 |
| `demo@delfluent.com` | `demo1234` | 标准版 |
| `ai@delfluent.com` | `demo1234` | AI 版 |
| `ai-unlimited@delfluent.com` | `demo1234` | AI 无限版 |

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

## 🗺️ 路线图

- [x] **v0.1 MVP** — 注册登录 · 听力/阅读练习 · 自动批改 · 学习中心
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
