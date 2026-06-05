// One-off: replace the 4 follow-ups of each per-topic PO set with simpler,
// clear B2-level débat questions. Overwrites content/oral-sets/oral-0X files.
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'content', 'oral-sets');

const fu = {
  1: [
    { text: "Pensez-vous que chacun peut vraiment agir pour protéger la planète ?", expectedAngle: "个人能否有所作为，能举例" },
    { text: "Qui doit faire le plus d'efforts : les habitants, les entreprises ou l'État ?", expectedAngle: "区分三方责任并选择" },
    { text: "Faut-il obliger les gens à consommer moins, ou simplement les informer ?", expectedAngle: "强制 vs 引导，权衡" },
    { text: "Et vous, que faites-vous au quotidien pour protéger l'environnement ?", expectedAngle: "落到个人日常具体做法" },
  ],
  2: [
    { text: "Pour vous, partir vivre à l'étranger, c'est plutôt une chance ou un risque ?", expectedAngle: "明确立场，给理由" },
    { text: "Faut-il aller dans un autre pays pour bien apprendre une langue ?", expectedAngle: "让步/反驳，承认其他途径" },
    { text: "Quelles sont, selon vous, les plus grandes difficultés quand on part vivre ailleurs ?", expectedAngle: "列举主要困难" },
    { text: "Aimeriez-vous vivre dans un autre pays ? Pourquoi ?", expectedAngle: "个人意愿+理由" },
  ],
  3: [
    { text: "Pensez-vous que nous mangeons tous de plus en plus la même chose ?", expectedAngle: "是否认同现象，举例" },
    { text: "Est-ce un problème si les plats deviennent les mêmes partout ?", expectedAngle: "评估利弊，文化多样性" },
    { text: "La mondialisation de la nourriture a-t-elle aussi de bons côtés ?", expectedAngle: "让步，承认积极面" },
    { text: "Que peut-on faire pour garder les plats traditionnels ?", expectedAngle: "提出具体做法" },
  ],
  4: [
    { text: "Pour vous, le télétravail a-t-il plus d'avantages ou d'inconvénients ?", expectedAngle: "明确立场并举例" },
    { text: "Est-ce que tous les métiers peuvent se faire à la maison ?", expectedAngle: "区分行业，举反例" },
    { text: "Travailler chez soi, est-ce bon pour les relations entre collègues ?", expectedAngle: "社会关系影响" },
    { text: "Aimeriez-vous travailler à la maison ? Pourquoi ?", expectedAngle: "个人意愿+理由" },
  ],
  5: [
    { text: "Pensez-vous que manger bio est vraiment meilleur pour la santé ?", expectedAngle: "健康效果 vs 营销，批判" },
    { text: "Le prix plus élevé du bio est-il justifié, selon vous ?", expectedAngle: "性价比权衡" },
    { text: "Bien manger, est-ce surtout une question d'argent ou d'habitude ?", expectedAngle: "区分预算 vs 习惯" },
    { text: "Et vous, faites-vous attention à ce que vous mangez ?", expectedAngle: "个人习惯，具体" },
  ],
  6: [
    { text: "Aimeriez-vous manger chez une personne que vous ne connaissez pas ?", expectedAngle: "个人意愿，信任/安全" },
    { text: "Peut-on parler d'un vrai moment d'amitié si l'hôte est payé ?", expectedAngle: "商业化是否削弱真诚" },
    { text: "Ce genre de site est-il une bonne idée, selon vous ?", expectedAngle: "整体评价利弊" },
    { text: "Pensez-vous que l'argent change les relations entre les gens ?", expectedAngle: "普遍命题，避免绝对" },
  ],
};

let bad = 0;
fs.readdirSync(outDir).filter((f) => /^oral-\d+\.import\.json$/.test(f)).sort().forEach((f) => {
  const idx = parseInt(f.match(/oral-(\d+)/)[1], 10);
  const file = path.join(outDir, f);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const q = s.questions[0];
  const list = fu[idx];
  if (!list) { console.log(`(skip ${f}: no preset)`); return; }
  q.followUps = list.map((x, i) => ({ order: i, text: x.text, expectedAngle: x.expectedAngle }));
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  const ok = q.followUps.length === 4 && q.followUps.every((x) => x.text.length <= 500);
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} ${f}  | ${s.title}`);
});
console.log(bad ? `\n❌ ${bad} 套异常` : '\n✅ 已更新 6 套，每套 4 条更简单易懂的 B2 追问');
