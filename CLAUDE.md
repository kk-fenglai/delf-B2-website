# CLAUDE.md — Gotchas

本次（2026-04-18 生产级加固迭代）我自己踩过的坑。写在这里避免复犯。

## 1. 跑 Prisma CLI 前先 `unset DATABASE_URL`

## 2. Admin stats 两个接口字段名不一致

## 3. 调试鉴权时记得先杀 node + 关速率限制

## 4. 日志里抓 token 不能裸用 grep

## 5. CSP 改了默认，生产加新 CDN 时会中断。

## 6. Windows 下 bash `&` 后的 cwd 不跟随

---

> 本文件只列"我踩过的坑"，不是项目文档。架构和 API 看 `README.md`。
