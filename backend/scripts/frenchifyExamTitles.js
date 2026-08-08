// One-off: convert exam-set titles to French (no Chinese). The DELF exam is in
// French, so titles should be too. Systematic tokens (skill words, mock
// markers, 第N套, dates) are mapped by rule; the ~41 titles whose TOPIC was
// written in Chinese are translated via an explicit override map.
//
// Safe by default: dry-run prints every change and flags any title that would
// still contain CJK (so nothing slips through). Pass --apply to write, which
// first dumps a backup of {id, oldTitle} to scripts/_title-backup.json.
//
//   node scripts/frenchifyExamTitles.js            # dry-run
//   node scripts/frenchifyExamTitles.js --apply    # write to DB

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Exact-title overrides for Chinese-topic titles (precedence over systematic).
const OVERRIDES = {
  'DELF B2 听力示例 · 测试版': 'DELF B2 Compréhension de l’oral · exemple (version de test)',
  'DELF B2 听力示例 · 测试版（双文档）': 'DELF B2 Compréhension de l’oral · exemple (version de test, deux documents)',

  'DELF B2 PO 模拟 · 社交媒体与青少年': 'DELF B2 Production orale · Les réseaux sociaux et les adolescents',
  'DELF B2 PO 模拟 · 远程办公与城市规划': 'DELF B2 Production orale · Le télétravail et l’aménagement urbain',
  'DELF B2 PO 模拟 · 食品工业与消费者信息': 'DELF B2 Production orale · L’industrie alimentaire et l’information des consommateurs',

  'DELF B2 写作 · 保留夏末免费音乐会': 'DELF B2 Production écrite · Maintenir les concerts gratuits de fin d’été',
  'DELF B2 写作 · 公共场所视频监控': 'DELF B2 Production écrite · La vidéosurveillance dans les lieux publics',
  'DELF B2 写作 · 公园垃圾问题': 'DELF B2 Production écrite · Le problème des déchets dans les parcs',
  'DELF B2 写作 · 公益跑步赛被取消': 'DELF B2 Production écrite · L’annulation d’une course caritative',
  'DELF B2 写作 · 反对市中心四车道大道': 'DELF B2 Production écrite · Contre une avenue à quatre voies au centre-ville',
  'DELF B2 写作 · 反对市政杂志全面数字化': 'DELF B2 Production écrite · Contre la numérisation totale du magazine municipal',
  'DELF B2 写作 · 抗议取消法语培训': 'DELF B2 Production écrite · Protester contre la suppression des cours de français',
  'DELF B2 写作 · 拯救小城电影院': 'DELF B2 Production écrite · Sauver le cinéma d’une petite ville',
  'DELF B2 写作 · 推广图书漂流': 'DELF B2 Production écrite · Promouvoir le bookcrossing',
  'DELF B2 写作 · 推行远程办公': 'DELF B2 Production écrite · Mettre en place le télétravail',
  'DELF B2 写作 · 消费与社会责任': 'DELF B2 Production écrite · Consommation et responsabilité sociale',
  'DELF B2 写作 · 申请海外职业培训': 'DELF B2 Production écrite · Demande de formation professionnelle à l’étranger',
  'DELF B2 写作 · 社区空地菜园计划': 'DELF B2 Production écrite · Un projet de jardin partagé sur un terrain vague',
  'DELF B2 写作 · 维修咖啡馆计划': 'DELF B2 Production écrite · Un projet de repair café',
  'DELF B2 写作 · 网购货不对板维权': 'DELF B2 Production écrite · Réclamation pour un achat en ligne non conforme',
  'DELF B2 写作 · 老人为儿童读故事': 'DELF B2 Production écrite · Des personnes âgées lisent des histoires aux enfants',
  'DELF B2 写作 · 老板卧底纪录片': 'DELF B2 Production écrite · Le documentaire « Le patron infiltré »',
  'DELF B2 写作 · 负责任消费互助网站': 'DELF B2 Production écrite · Un site d’entraide pour une consommation responsable',
  'DELF B2 写作 · 足球场关闭投诉': 'DELF B2 Production écrite · Plainte contre la fermeture d’un terrain de football',

  'DELF B2 口语 · 人工智能与就业：威胁还是机遇？': 'DELF B2 Production orale · L’intelligence artificielle et l’emploi : menace ou opportunité ?',
  'DELF B2 口语 · 从四天工作制看工作与生活的平衡': 'DELF B2 Production orale · La semaine de quatre jours et l’équilibre entre vie professionnelle et vie privée',
  'DELF B2 口语 · 健康与医疗资源分配': 'DELF B2 Production orale · La santé et la répartition des ressources médicales',
  'DELF B2 口语 · 城市交通与生活质量': 'DELF B2 Production orale · Les transports urbains et la qualité de vie',
  'DELF B2 口语 · 教育：是否应该限制学生在校使用手机？': 'DELF B2 Production orale · Éducation : faut-il limiter l’usage du téléphone à l’école ?',
  'DELF B2 口语 · 消费社会中的过度包装': 'DELF B2 Production orale · Le suremballage dans la société de consommation',
  'DELF B2 口语 · 环境保护与经济利益': 'DELF B2 Production orale · Protection de l’environnement et intérêts économiques',

  'DELF B2 听力 · 健康新趋势': 'DELF B2 Compréhension de l’oral · Les nouvelles tendances de la santé',
  'DELF B2 听力 · 城市与交通': 'DELF B2 Compréhension de l’oral · La ville et les transports',
  'DELF B2 听力 · 工作': 'DELF B2 Compréhension de l’oral · Le travail',
  'DELF B2 听力 · 短听力 2021-11': 'DELF B2 Compréhension de l’oral · Documents courts (I)',
  'DELF B2 听力 · 短听力 2024-01': 'DELF B2 Compréhension de l’oral · Documents courts (II)',
  'DELF B2 听力 · 短听力：仿生学（biomimétisme）': 'DELF B2 Compréhension de l’oral · Documents courts : le biomimétisme',
  'DELF B2 听力 · 短听力：志愿服务（bénévolat）': 'DELF B2 Compréhension de l’oral · Documents courts : le bénévolat',
  'DELF B2 听力 · 长听力 2021-05': 'DELF B2 Compréhension de l’oral · Document long (I)',
  'DELF B2 听力 · 长听力 2021-11': 'DELF B2 Compréhension de l’oral · Document long (II)',
  'DELF B2 听力 · 长听力 2024-03': 'DELF B2 Compréhension de l’oral · Document long (III)',
  'DELF B2 听力 · 长听力：双语与儿童语言习得': 'DELF B2 Compréhension de l’oral · Document long : le bilinguisme et l’acquisition du langage chez l’enfant',
  'DELF B2 听力 · 长听力：社交网络与依赖': 'DELF B2 Compréhension de l’oral · Document long : les réseaux sociaux et la dépendance',
};

const APOS = '’';
function systematic(title) {
  let s = title.replace(/（全真模拟）/g, '').replace(/\(全真模拟\)/g, '');
  s = s
    .replace(/听力/g, 'Compréhension de l' + APOS + 'oral')
    .replace(/阅读/g, 'Compréhension des écrits')
    .replace(/写作/g, 'Production écrite')
    .replace(/口语/g, 'Production orale')
    .replace(/全真模拟/g, 'Examen blanc complet')
    .replace(/仿真题/g, 'Examen blanc')
    .replace(/示例/g, 'exemple')
    .replace(/测试版/g, 'version de test')
    .replace(/双文档/g, 'deux documents')
    .replace(/免费体验/g, 'essai gratuit')
    .replace(/模拟/g, '');
  s = s.replace(/第\s*0*(\d+)\s*套/g, (_m, n) => 'Série ' + n);
  // strip exam dates (YYYY-MM / YYYY年 …) per CLAUDE.md rule 6
  s = s.replace(/\s*\(?20\d{2}[-/年.]?(?:0?[1-9]|1[0-2])?月?\)?/g, '');
  // normalise full-width parens, drop a dangling trailing ')' (import artefact)
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  if (/\)\s*$/.test(s) && !s.includes('(')) s = s.replace(/\s*\)\s*$/, '');
  return s.replace(/\s{2,}/g, ' ').replace(/\s+·/g, ' ·').replace(/·\s*$/g, '').trim();
}

function frenchify(title) {
  if (OVERRIDES[title]) return OVERRIDES[title];
  return systematic(title);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sets = await prisma.examSet.findMany({ select: { id: true, title: true }, orderBy: { createdAt: 'asc' } });

  const changes = [];
  const flagged = [];
  for (const s of sets) {
    const next = frenchify(s.title);
    if (next === s.title) continue;
    if (/[一-鿿]/.test(next)) { flagged.push({ ...s, next }); continue; }
    changes.push({ id: s.id, old: s.title, next });
  }

  console.log(`套题 ${sets.length} | 待改 ${changes.length} | 仍含中文(已跳过) ${flagged.length}\n`);
  changes.forEach((c) => console.log(`  ${c.old}\n   → ${c.next}`));
  if (flagged.length) {
    console.log('\n⚠ 以下标题转换后仍含中文，未处理（需补翻译）：');
    flagged.forEach((f) => console.log(`  ${f.old}  →  ${f.next}`));
  }

  if (!apply) {
    console.log('\n(dry-run) 加 --apply 才会写库。');
    await prisma.$disconnect();
    return;
  }
  if (flagged.length) {
    console.log('\n✗ 存在仍含中文的标题，已中止 --apply。请先补全翻译。');
    await prisma.$disconnect();
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(__dirname, '_title-backup.json'),
    JSON.stringify(changes.map((c) => ({ id: c.id, oldTitle: c.old })), null, 2),
  );
  for (const c of changes) {
    await prisma.examSet.update({ where: { id: c.id }, data: { title: c.next } });
  }
  console.log(`\n✓ 已更新 ${changes.length} 个标题。旧标题备份：scripts/_title-backup.json`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { frenchify };
