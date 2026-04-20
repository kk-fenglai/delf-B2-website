# FEI 官方 DELF B2 Tout Public 样卷

本目录存放从 France Éducation International (FEI) 官方下载的 **DELF B2 Tout Public sujets d'exemple**。

**来源页面**：https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b2/exemples-sujets

---

## ⚠️ 版权与使用约束

1. 这些文件是 FEI（法国教育部下属机构）官方发布供考生免费备考练习使用
2. **允许**：下载供本站开发参考、把题目内容重新排版录入为我们 Prisma 数据库的题目（带官方来源标注）
3. **不允许**：把 FEI 的原版 PDF/MP3 作为付费订阅内容锁定；未经许可在商业产品中大规模转载原文件
4. 每道由 FEI 样卷转录而来的题目，在 `explanation` 末尾必须加 `— 来源：France Éducation International (FEI 官方 DELF B2 sujet d'exemple)`
5. 建议把 FEI 样卷放在 FREE 层（`isFreePreview: true`），付费层用**原创仿真题**

---

## 📥 下载清单

### 样卷 1（Exemple 1）→ 存到 `b2-tp-exemple1/`

| 文件 | 下载链接 | 本地保存为 |
|------|---------|-----------|
| 考生题册（CO+CE+PE） | https://www.france-education-international.fr/document/delf-b2-tp-candidat-coll-exemple1 | `candidat.pdf` |
| 考官批改册（答案+评分） | https://www.france-education-international.fr/document/delf-b2-tp-correcteur-coll-exemple1 | `correcteur.pdf` |
| 监考手册 | https://www.france-education-international.fr/document/delf-b2-tp-surveillant-coll-exemple1 | `surveillant.pdf` |
| 听力音频 1 | https://www.france-education-international.fr/audio/1180 | `audio-1.mp3` |
| 听力音频 2 | https://www.france-education-international.fr/audio/1181 | `audio-2.mp3` |
| 听力音频 3 | https://www.france-education-international.fr/audio/1182 | `audio-3.mp3` |
| 听力音频 4 | https://www.france-education-international.fr/audio/1183 | `audio-4.mp3` |

### 样卷 2（Exemple 2）→ 存到 `b2-tp-exemple2/`

| 文件 | 下载链接 | 本地保存为 |
|------|---------|-----------|
| 考生题册 | https://www.france-education-international.fr/document/delf-b2-tp-candidat-coll-exemple2 | `candidat.pdf` |
| 考官批改册 | https://www.france-education-international.fr/document/delf-b2-tp-correcteur-coll-exemple2 | `correcteur.pdf` |
| 监考手册 | https://www.france-education-international.fr/document/delf-b2-tp-surveillant-coll-exemple2 | `surveillant.pdf` |
| 听力音频 1 | https://www.france-education-international.fr/audio/1187 | `audio-1.mp3` |
| 听力音频 2 | https://www.france-education-international.fr/audio/1188 | `audio-2.mp3` |
| 听力音频 3 | https://www.france-education-international.fr/audio/1189 | `audio-3.mp3` |

### 口语样卷（PO examples）→ 存到 `b2-tp-exemple-po/`

| 文件 | 下载链接 | 本地保存为 |
|------|---------|-----------|
| 考生题目 | https://www.france-education-international.fr/document/delf-b2-tp-candidat-ind | `candidat.pdf` |
| 考官指导 | https://www.france-education-international.fr/document/delf-b2-tp-examinateur-ind | `examinateur.pdf` |

### 评分标准（PE / PO grilles，不入题库，供展示说明用）

- 写作评分网格：https://www.france-education-international.fr/document/grille-pe-b2
- 写作能力描述：https://www.france-education-international.fr/document/descript-perf-pe-b2
- 口语评分网格：https://www.france-education-international.fr/document/grille-po-b2
- 口语能力描述：https://www.france-education-international.fr/document/descript-perf-po-b2

---

## 📋 下载 + 导入步骤

1. **下载**：浏览器点击上表每个链接，按「本地保存为」列的文件名存到对应子目录
2. **转录**：对照 `candidat.pdf`（题目）和 `correcteur.pdf`（答案+解析），按下方 JSON 模板填 `parsed.json`（每个 exemple 目录一个）
3. **导入**：运行 `node backend/scripts/importFeiSample.js b2-tp-exemple1`，会 upsert 进 Prisma SQLite DB
4. **前端验证**：`GET /api/exams` 应返回新的 ExamSet；访问 `/practice/listening` 应能看到这套题

---

## JSON 模板（`parsed.json`）

```json
{
  "title": "DELF B2 Tout Public · Exemple 1 (FEI)",
  "year": 2024,
  "description": "Source: France Éducation International - Sujet d'exemple officiel DELF B2 TP Exemple 1",
  "isFreePreview": true,
  "questions": [
    {
      "skill": "CO",
      "type": "SINGLE",
      "order": 1,
      "prompt": "À quoi la journaliste s'intéresse-t-elle principalement ?",
      "passage": "[transcription partielle ou consigne]",
      "audioUrl": "/audio/fei/b2-tp-exemple1/audio-1.mp3",
      "points": 2,
      "explanation": "La journaliste parle des... — 来源：France Éducation International",
      "options": [
        { "label": "A", "text": "...", "isCorrect": false, "order": 0 },
        { "label": "B", "text": "...", "isCorrect": true, "order": 1 },
        { "label": "C", "text": "...", "isCorrect": false, "order": 2 }
      ]
    }
  ]
}
```

题目类型枚举：`SINGLE` | `MULTIPLE` | `TRUE_FALSE` | `FILL` | `ESSAY` | `SPEAKING`
Skill 枚举：`CO` | `CE` | `PE` | `PO`

---

## 音频文件说明

音频 MP3 建议**不放进 git 仓库**（体积大 + 版权），而是放在：
- 本地 dev：`backend/content/fei-samples/<exemple>/audio-*.mp3`
- 生产：上传到 CDN（阿里云 OSS / Cloudflare R2），`audioUrl` 指向 CDN 路径

本 repo 的 `.gitignore` 已配置忽略 `.pdf` 和 `.mp3`（见根 `.gitignore`）。
