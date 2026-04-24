---
title: "DELF B2 阅读 CE · 2024-02 法国场"
year: 2024
description: "阅读 CE（手动录入示例）"
isPublished: false
isFreePreview: false
---

> 用途：把 PDF（尤其扫描件）里的内容手动整理到这个模板里，然后用转换脚本一键生成符合 `/api/admin/exams/import` 的 JSON。

## 录入规则（最重要的几条）

- **一篇文章 + 多道题**：同一篇文章只写一次 `passage`，它下面所有 `CE` 题会自动继承该文章（写入到每题的 `passage` 字段）。
- **题号顺序**：按文档出现顺序自动生成 `order`；你也可以在题块里手动写 `order:` 覆盖。
- **选项正确答案**：
  - 写 `answer:` 最省事（例如 `answer: A` 或 `answer: A,B`），脚本会自动把对应 `options[].isCorrect=true`。
  - 如果不写 `answer:`，你也可以在选项行末尾写 `*` 标记正确项（例如 `- A) ... *`）。
- **题型与选项规则**（与后端一致）：
  - `SINGLE/TRUE_FALSE`：至少 2 个选项，且**恰好 1 个**正确
  - `MULTIPLE`：至少 2 个选项，且**至少 1 个**正确
  - `FILL/ESSAY`：`options` 必须为空（不要写任何 `- A) ...`）

---

## Passage: Texte 1 (可选标题)

```passage
把整篇文章粘贴在这里。
建议从 OCR 过的 PDF 里复制出来，然后人工快速校对重音符号（é è ê ç à ï …）。

可以有多段落。
```

### Q: 1
skill: CE
type: SINGLE
points: 2
prompt: "D'après le texte, quel est le sujet principal ?"
answer: A
explanation: "第 1 段开头明确说……（可选）"
options:
- A) "..."
- B) "..."
- C) "..."
- D) "..."

### Q: 2
skill: CE
type: TRUE_FALSE
points: 1
prompt: "Vrai ou faux : ..."
answer: V
options:
- V) Vrai
- F) Faux

### Q: 3
skill: CE
type: MULTIPLE
points: 3
prompt: "Quelles mesures sont proposées ?"
answer: A,B
options:
- A) "..."
- B) "..."
- C) "..."
- D) "..."

---

## Passage: Texte 2

```passage
第二篇文章内容……
```

### Q: 4
skill: CE
type: SINGLE
points: 2
prompt: "Selon le texte, ..."
options:
- A) "..." *
- B) "..."
- C) "..."
- D) "..."

---

## QuestionsWithoutPassage (可选)

> 这一段用于不依赖文章的题（例如 CO 听力题 passage=听力稿；或 PE 作文题）。

### Q: 101
skill: CO
type: SINGLE
points: 2
prompt: "D'après le document audio, ..."
passage: "（可选）把听力稿粘贴在这里，用户端不会显示也可以留空"
answer: B
options:
- A) "..."
- B) "..."
- C) "..."
- D) "..."

### Q: 102
skill: PE
type: ESSAY
points: 25
prompt: "Rédigez un essai argumenté sur... (250 mots minimum)."
explanation: "（可选）评分要点/写作提示"

