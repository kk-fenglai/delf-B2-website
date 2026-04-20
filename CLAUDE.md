# CLAUDE.md — Gotchas

本次（2026-04-18 生产级加固迭代）我自己踩过的坑。写在这里避免复犯。

## 1. 跑 Prisma CLI 前先 `unset DATABASE_URL`

## 2. Admin stats 两个接口字段名不一致

## 3. 调试鉴权时记得先杀 node + 关速率限制

## 4. 日志里抓 token 不能裸用 grep

## 5. CSP 改了默认，生产加新 CDN 时会中断。

## 6. Windows 下 bash `&` 后的 cwd 不跟随

## 7. DeepSeek 迁移（2026-04-20）

- `.env` 里 `ANTHROPIC_API_KEY` 要手动改名 `DEEPSEEK_API_KEY`，我不会自动迁移
- DeepSeek 的 usage 字段是 `prompt_tokens` / `completion_tokens` / `prompt_cache_hit_tokens`，不是 Claude 的 `input_tokens` / `output_tokens` / `cache_read_input_tokens`
- DeepSeek 自动按前缀缓存，**不需要**手动加 `cache_control: ephemeral`，也没有 5 分钟 TTL
- tool 调用响应格式不同：`message.tool_calls[0].function.arguments` 是**字符串**，要 `JSON.parse`；Claude 是结构化 `input` 对象
- 老 Essay 行的 `model` 字段仍是 `haiku-4-5` / `sonnet-4-6` / `opus-4-7`，读端兜底渲染为 "(legacy)"，不做数据迁移

---

> 本文件只列"我踩过的坑"，不是项目文档。架构和 API 看 `README.md`。
