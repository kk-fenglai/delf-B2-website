# DELFluent · DELF B2 真题训练平台 (MVP)

基于 PRD v1.0 的 MVP 实现。包含用户注册登录、题库浏览、听力/阅读练习、答案核对、基础学习统计。

## 📦 技术栈

- **前端**: React 18 + TypeScript + Vite + Ant Design + Tailwind CSS + Zustand + ECharts
- **后端**: Node.js + Express + Prisma + PostgreSQL
- **认证**: JWT (access + refresh tokens)
- **AI (Phase 2)**: Anthropic Claude API

## 📁 目录结构

```
delf B2 website/
├── PRD.md                  # 产品需求文档
├── backend/                # 后端 API
│   ├── prisma/
│   │   ├── schema.prisma   # 数据库模型
│   │   └── seed.js         # 种子数据（仿真题）
│   └── src/
│       ├── index.js
│       ├── routes/         # auth / exams / sessions / user
│       ├── services/       # grader (自动批改)
│       ├── middleware/     # auth / errorHandler
│       └── utils/          # jwt
└── frontend/               # 前端应用
    └── src/
        ├── pages/          # Landing / Login / Register / Dashboard / Practice / ExamRunner / ReviewResult / Pricing
        ├── components/     # AppLayout
        ├── api/            # axios client
        ├── stores/         # Zustand 认证 store
        └── types/          # TS 类型
```

## 🚀 本地运行

### 1. 准备 PostgreSQL

```bash
# 使用 Docker 快速启动
docker run --name delfluent-pg -e POSTGRES_PASSWORD=password -e POSTGRES_DB=delfluent -p 5432:5432 -d postgres:16
```

### 2. 启动后端

```bash
cd backend
cp .env.example .env            # 编辑填入 JWT 密钥
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed                    # 注入仿真题数据
npm run dev                     # → http://localhost:4000
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev                     # → http://localhost:5173
```

### 🧪 测试账号

| 邮箱 | 密码 | 套餐 |
|------|------|------|
| `demo@delfluent.com` | `demo1234` | 标准版（可访问全部题目）|
| `free@delfluent.com` | `demo1234` | 免费版（仅免费体验套题）|

## 🎯 MVP 已实现功能

- [x] 邮箱注册 / 登录 / JWT 鉴权
- [x] 题库列表 + 按技能筛选
- [x] 免费/付费访问控制（access control）
- [x] 听力 (CO) 题目 + 内嵌音频播放器
- [x] 阅读 (CE) 题目 + 原文展示
- [x] 写作 (PE) 输入区（字数统计，AI批改待 v1.5）
- [x] 自动批改（单选/多选/判断/填空）
- [x] 结果回顾：用户答案 vs 正确答案 + 解析
- [x] 学习中心：四项能力雷达图 + 练习历史
- [x] 订阅方案展示页（支付接入 TODO）
- [x] 中文界面 + 响应式布局 + 法国主色调 `#1A3A5C`

## 📋 后续路线图（按 PRD）

- **v1.0 标准版**（6周）：完整模拟考试模式 · 错题本 · PDF 成绩单 · 更多题库
- **v1.5 AI版 Beta**（6周）：Claude API 写作批改 · AI 学习助手 · 个性化推荐
- **v2.0 AI版正式**（8周）：AI 口语评测（阿里云语音识别）· 备考计划生成 · 移动端优化

## ⚠️ 重要提示

- **题库内容**：MVP 全部使用**原创仿真题**（格式对齐 DELF B2 真题，规避版权风险）
- **支付接入**：微信支付 / 支付宝将在 v1.0 接入
- **AI批改**：Phase 2 接入 Claude API，当前写作题暂不自动评分
- **合规**：上线前需补充隐私政策、用户协议、ICP备案（中国大陆部署）

## 📄 相关文档

- `PRD.md` - 完整产品需求文档（英文版）
- 用户提供的 `DELFB2_PRD.docx` - 中文产品需求文档（已作为最终方案依据）
