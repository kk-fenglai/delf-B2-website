# DELF B2 听力音频 · GPU 方案（语调自然、口语化）

> 目标：替换现有「太 AI、太平、没有语调起伏」的听力配音，做出**接近真人日常口语、带语调和情绪起伏**的法语听力音频，并接回现有 `R2 + AudioDocument` 管线。

## 0. 为什么走 GPU 这条路（前情）

| 方案 | 结论 |
|---|---|
| OpenAI `gpt-4o-mini-tts`（现状） | 播音腔，太 AI |
| Piper（本地 CPU，已试） | 干净但**单说话人、零语调起伏**，架构决定，救不了，已弃 |
| ElevenLabs（云端付费） | 效果好但按字符收费；脚本里保留了 `--provider eleven` 作为备用 |
| **本机跑大模型** | ❌ 本机只有 Intel Iris Xe 核显，跑不动也练不了 |
| **云端 GPU 跑克隆/微调大模型** | ✅ 本文方案 |

「语调起伏 + 口语感」在技术上只有**会克隆真人声、带情绪控制的大模型**能做到。本机没独显 → 必须借**云端 GPU**。

---

## 1. 结论先行（推荐路径）

1. **模型选 Chatterbox Multilingual（MIT 许可，可商用）**，不要选 XTTS-v2。
   - ⚠️ **许可证是关键**：XTTS-v2 是 Coqui Public Model License，**限制商用**；本站是付费产品，用 XTTS 有法律风险。Chatterbox 是 MIT，商用安全。
2. **做「零样本克隆」，不要真「训练/微调」**。
   - 你说的「训练」，99% 的情况其实只需要**克隆**：喂模型几秒真人法语参考音，它当场用那个音色+语调说你的文稿。**不需要数据集、不需要几天训练。**
   - 真正的微调只有在「要复刻某一个特定人的声音且要极高保真」时才需要，对 DELF 听力没必要（见 §5，列为可选）。
3. **算力用 Google Colab 免费 T4 起步**，不够再上 Colab Pro / RunPod。
4. **集成方式**：Colab 上批量生成每段 WAV → 打包下载 → 用一个轻量导入脚本（复用现有 R2/AudioDocument 写库逻辑）回填到网站。

---

## 2. 两种做法对比

| | A. 零样本克隆（**推荐**） | B. 微调训练（可选/进阶） |
|---|---|---|
| 要不要数据集 | 不要，几段 6–15s 参考音即可 | 要，目标说话人 30min–数小时配对语音 |
| GPU 需求 | T4（免费 Colab）够用 | A100/24GB+，几小时~一天 |
| 上手时间 | 当天出效果 | 数天 |
| 语调自然度 | 高（模型自带韵律 + 参考音情绪） | 高，但提升相对克隆有限 |
| 适合场景 | DELF 听力（多角色、多套题） | 要固定复刻某主播音色 |
| 结论 | **先做这个** | 克隆不满意再考虑 |

---

## 3. 云端 GPU 选择

| 平台 | 免费额度 | 适合 | 备注 |
|---|---|---|---|
| **Google Colab** | 免费 T4（有时长限制） | 首选，零成本验证 | Pro 约 $10/月 给更稳的 GPU |
| Kaggle Notebooks | 每周 ~30h P100/T4 免费 | 备选，免费额度更慷慨 | 需手机验证 |
| RunPod | 按时付费（T4 ~$0.2/h，A100 ~$1–2/h） | 批量大、要 A100 时 | 适合微调 |
| Vast.ai | 竞价更便宜 | 进阶、省钱 | 配置略繁琐 |

> 建议：**先 Colab 免费 T4 跑通方案 A**，确认效果满意，再决定要不要花钱加速全量。

---

## 4. 方案 A 详细步骤（零样本克隆）

### 4.1 准备参考音（决定最终音色与语调）

- 每个「角色」准备一段 **6–15 秒、干净无背景噪、单人、自然口语**的法语 WAV（24kHz 单声道最佳）。
- DELF 听力通常需要：旁白 1 个、对话男声 1 个、对话女声 1 个（≥2 个不同音色才有「多人对话」感）。
- **合法来源（重要，付费产品别踩雷）**：
  - 自己/同事/外包配音演员录几句（拿到授权）。
  - **Mozilla Common Voice 法语集（CC0，可商用）**——挑音色自然的片段当参考音，最省事且无版权风险。
  - ❌ 不要克隆名人/未授权真人的声音。
- 参考音文件示例：`refs/narrateur.wav`、`refs/homme.wav`、`refs/femme.wav`。

### 4.2 Colab 环境

```python
# Colab: 运行时 → 更改运行时类型 → GPU(T4)
!pip -q install chatterbox-tts soundfile
import torch, soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS   # 多语言版

model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
```
> API 以官方 README 为准（仓库 `resemble-ai/chatterbox`）。`exaggeration` 调情绪夸张度、`cfg_weight` 调与参考音的贴合度——这两个就是「语调起伏」的旋钮。

### 4.3 批量生成

把每套题的听力文稿（含 `说话人: 台词` 格式）导出成 JSON（见 §6 导出脚本），然后：

```python
import json, soundfile as sf, numpy as np

GAP = np.zeros(int(24000*0.35))           # 段内 350ms 停顿，对齐现有管线
REF = {"narrateur":"refs/narrateur.wav",
       "homme":"refs/homme.wav", "femme":"refs/femme.wav"}

def voice_for(speaker, idx):
    # 双人对话交替分配男女声；无说话人=旁白
    if not speaker: return REF["narrateur"]
    return REF["homme"] if idx % 2 == 0 else REF["femme"]

data = json.load(open("passages.json"))   # [{slug, fileLabel, turns:[{speaker,text}]}]
for p in data:
    chunks, smap = [], {}
    for t in p["turns"]:
        sp = t["speaker"]
        if sp and sp not in smap: smap[sp] = len(smap)
        ref = voice_for(sp, smap.get(sp, 0))
        wav = model.generate(t["text"], language_id="fr",
                             audio_prompt_path=ref,
                             exaggeration=0.6, cfg_weight=0.5)  # 调这两个找口语感
        chunks.append(np.asarray(wav).squeeze())
        chunks.append(GAP)
    sf.write(f'out/{p["slug"]}__{p["fileLabel"]}.wav',
             np.concatenate(chunks), 24000)
```

### 4.4 取回与试听

- Colab 里 `!zip -r out.zip out` → 下载 `out.zip`，本地解压试听。
- 反复调 `exaggeration`（0.4–0.8）和参考音，直到口语感满意。

### 4.5 接回网站（复用现有管线）

现有 `backend/scripts/voiceMockListening.js` 已经做了：分段 → 上传 R2(`putObject`) → 建 `AudioDocument`（含 DELF 播放规则 `maxPlays/prepSeconds/gapSeconds/answerSeconds`）→ 关联 CO 题。

**最干净的集成**：给它加一个 `--provider prerendered` 模式——不调任何 TTS，而是从本地目录读 Colab 生成好的 `out/<slug>__<fileLabel>.wav`，其余（R2 上传 + 写库）原样复用。这样云端只负责「文稿→WAV」，回填逻辑一行不重写。

> 落地时我可以按这个思路加 `--provider prerendered`（约 30 行），你只要把 `out/` 放进项目即可一键回填。

---

## 5. 方案 B：微调训练（可选，通常不需要）

仅当「零样本克隆」对某个固定音色保真度不够时才考虑。

- **数据**：目标说话人 30 分钟–数小时「音频 + 逐字文稿」配对，切成 5–15s 片段，转写对齐。
- **GPU**：24GB+ 显存（A100/RTX 4090/RunPod），训练几小时~一天。
- **流程**：按 Chatterbox/对应仓库的 finetune 脚本，准备 `metadata.csv`（路径|文稿），跑训练 → 导出 checkpoint → 推理时加载自己的 checkpoint，其余同方案 A。
- **风险**：耗时、调参、容易过拟合到训练录音的风格；对 DELF 这种「只要自然多样」的需求性价比低。

---

## 6. 数据流（文稿 ↔ 网站）

1. **导出文稿**（新建 `backend/scripts/exportCoPassages.js`，从 DB 取 CO 题、按 passage 分组、切 `说话人:台词`，输出 `passages.json`）。逻辑可直接抄 `voiceMockListening.js` 里的 `splitTurns()` / 分组部分。
2. **上传到 Colab**：把 `passages.json` + `refs/` 拖进 Colab。
3. **生成**：§4.3，产出 `out/*.wav`。
4. **回填**：下载 `out/` → `node scripts/voiceMockListening.js --provider prerendered --all-ai`（待加）→ R2 + AudioDocument 自动写好。
5. 纯数据改动，**前端无需重新部署**（与现有配音流程一致）。

---

## 7. 成本与时间估算

| 项 | 估算 |
|---|---|
| 验证（方案A，1 套题） | Colab 免费 T4，半天内出效果，**¥0** |
| 全量重配所有 AI mock | T4 上每段几秒~十几秒，几十套题数小时；免费额度内分批可 **¥0**，Colab Pro ~¥70/月更省心 |
| 微调（方案B，可选） | RunPod A100 数小时，约 ¥30–100 |

---

## 8. 验收标准

- [ ] 同一套题里**不同角色音色明显不同**（对话不再是一个声音）。
- [ ] 语句有**自然语调起伏**，不是平读（对比现状明显改善）。
- [ ] 法语发音、连读、节奏达到母语者水平。
- [ ] 参考音来源**合法可商用**（自录授权 / Common Voice CC0）。
- [ ] 回填后网站听力题正常播放，DELF 播放规则（次数/停顿）不变。

---

## 9. 下一步（建议顺序）

1. 选平台（先 Colab 免费）。
2. 备 3 段法语参考音（旁白/男/女，Common Voice 最快）。
3. 我加 `exportCoPassages.js` 导出文稿 + `--provider prerendered` 回填模式。
4. Colab 跑方案 A 生成 1 套 → 试听调参 → 满意后全量。
5. 仍不满意 → 才上方案 B 微调。
