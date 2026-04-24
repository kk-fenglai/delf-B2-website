# delf_B2_reading（怎么用）

本文件夹用于把 DELF B2 阅读材料整理进题库，导入路径固定为后台 **JSON 批量导入**：`/admin/exams/import`（对应后端 `POST /api/admin/exams/import`）。

> 版权提示：真题/扫描件通常有版权风险，不建议把 PDF 原件提交到公开仓库，也不建议直接作为线上付费内容发布；更安全做法是仅本地自用整理练习，或只使用官方公开样卷。

---

## 你要准备的两个文件

- **录入模板**：`delf_B2_reading/import_template.md`
  - 一篇文章写一次，下面多道题自动继承 `passage`
  - `answer:`（如 `A` 或 `A,B`）会自动转换为 `options[].isCorrect`
- **转换脚本**：`backend/scripts/convertReadingMarkdownToImportJson.js`
  - 把你填写好的 Markdown 转成可直接导入的 JSON
  - 本地先做严格校验（与后端规则一致），报错会提示行号

---

## 推荐流程（最稳：OCR → 手动校对 → 一键导入）

### Step 1：先把扫描 PDF 变成“可复制文字层”

目标：从 PDF 里复制出来的法语文本尽量不乱码，人工校对更快。

- **推荐工具**：OCRmyPDF（开源）`https://github.com/ocrmypdf/OCRmyPDF`

示例命令：

```bash
# 语言建议 fra，必要时 eng+fra
ocrmypdf -l fra --deskew --clean "input.pdf" "output.ocr.pdf"
```

如果你更习惯 GUI，也可以用 Adobe Acrobat / ABBYY FineReader 做 OCR。

### Step 2：按模板写 Markdown（文章 + 多题）

复制 OCR 后 PDF 的文章/题干/选项/答案，粘贴到你自己的录入文件，例如：

- `delf_B2_reading/CE_2024-02_FR.md`（你自己新建）

模板参考：`delf_B2_reading/import_template.md`

### Step 3：Markdown → JSON（本地生成导入文件）

在 PowerShell 里运行：

```bash
cd backend
node scripts/convertReadingMarkdownToImportJson.js "..\delf_B2_reading\CE_2024-02_FR.md" -o "..\delf_B2_reading\CE_2024-02_FR.json"
```

### Step 4：后台导入

- 打开：`/admin/exams/import`
- 上传（或粘贴）`CE_2024-02_FR.json`
- 点击“提交导入”

---

## 常见报错（脚本会提示行号）

- **Missing YAML frontmatter**：忘了写开头的 `--- ... ---` 元信息（title/year 等）
- **No questions parsed**：没有用 `### Q: 1` 这种题块标题
- **CE question must have a passage**：阅读题不在 `## Passage:` 下面，也没在题块里写 `passage: ...`
- **SINGLE/TRUE_FALSE needs exactly 1 correct option**：用 `answer:` 或在正确选项末尾加 `*`
- **ESSAY must not have options**：作文题不要写 `options:` 和任何 `- A) ...`
