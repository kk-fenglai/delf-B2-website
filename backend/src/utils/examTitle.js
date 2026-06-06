// Strip exam session date / region from titles shown to learners.
// Admin may keep source metadata in description / explanation fields.

function sanitizeExamTitle(title) {
  if (!title || typeof title !== 'string') return title;
  let t = title.trim();

  // PE: DELF B2 写作真题 · 2021年3月（法国） — 主题
  t = t.replace(
    /^(DELF B2\s+)写作真题\s*·\s*\d{4}年\d{1,2}月(?:（[^）]*）)?\s*[—–-]\s*/u,
    '$1写作 · ',
  );

  // CE: DELF B2 阅读 CE · 2024-01 法国场（…  or  · Texte 1（…
  t = t.replace(
    /^(DELF B2\s+)阅读\s*CE\s*·\s*\d{4}[-/]\d{1,2}\s*(?:法国场|中国场|国内场|越南场|非洲场)?\s*·?\s*(?:Texte\s*\d+\s*（)?/iu,
    '$1阅读 · ',
  );

  // CE legacy: DELF B2 CE · Topic (2021-07 法国场)
  t = t.replace(
    /^(DELF B2\s+)CE\s*·\s*(.+?)\s*\(\d{4}[-/]\d{1,2}\s*[^)]*场\)\s*$/u,
    '$1阅读 · $2',
  );

  // Mock bundles: 仿真题 2024 - / 2024-Set
  t = t.replace(/^(DELF B2\s+)仿真题\s+20\d{2}\s*[-–]\s*/u, '$1仿真题 · ');
  t = t.replace(/^(DELF B2\s+)仿真题\s+(20\d{2}-Set\s)/u, '$1仿真题 · $2');

  // Normalize stray "真题"
  t = t.replace(/写作真题/g, '写作');

  // Collapse separators
  t = t.replace(/\s*·\s*·\s*/g, ' · ');
  t = t.replace(/\s{2,}/g, ' ');
  return t.trim();
}

/** Remove exam-date provenance from learner-visible descriptions. */
function sanitizeExamDescription(description) {
  if (!description || typeof description !== 'string') return description;
  let d = description.trim();
  // Drop trailing provenance after first sentence when it cites 来源：YYYY年…
  d = d.replace(/([。！？!?])\s*来源[：:][^。！？!?]*[。！？!?]?/u, '$1');
  // Leading "2023年11月中国考场真题 …"
  d = d.replace(/^\d{4}年\d{1,2}月[^。！？!?]*(?:考场|真题)[^。！？!?]*[。！？!?]\s*/u, '');
  // Trailing FEI disclaimer blocks that repeat session info — keep if no date
  return d.trim();
}

module.exports = { sanitizeExamTitle, sanitizeExamDescription };
