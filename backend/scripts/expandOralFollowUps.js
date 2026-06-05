// One-off: expand each per-topic PO exam-set file under content/oral-sets/
// to 4 follow-ups. Idempotent — appends only until each reaches 4.
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'content', 'oral-sets');

// 2 extra débat questions per topic, keyed by file index (oral-01 -> 1, ...)
const extra = {
  1: [
    { text: "Faut-il, selon vous, contraindre les citoyens par des lois et des taxes, ou plutôt les sensibiliser ?", expectedAngle: "强制 vs 引导，能权衡两种手段" },
    { text: "Êtes-vous personnellement prêt(e) à changer votre mode de vie pour réduire votre empreinte écologique ? Dans quelle mesure ?", expectedAngle: "落到个人实践并说明程度" },
  ],
  2: [
    { text: "Selon vous, à quel âge est-il préférable de partir vivre à l'étranger ?", expectedAngle: "按人生阶段权衡利弊" },
    { text: "Pensez-vous qu'il soit aujourd'hui plus facile ou plus difficile de s'expatrier qu'autrefois ?", expectedAngle: "古今对比，科技/行政因素" },
  ],
  3: [
    { text: "La mondialisation de l'alimentation a-t-elle aussi des aspects positifs, selon vous ?", expectedAngle: "让步，承认积极面（接触多样饮食）" },
    { text: "Quel rôle les consommateurs peuvent-ils jouer face à cette uniformisation ?", expectedAngle: "消费者能动性，具体行为" },
  ],
  4: [
    { text: "Selon vous, le télétravail renforce-t-il ou affaiblit-il les liens entre collègues ?", expectedAngle: "社会关系影响，辩证" },
    { text: "Si vous le pouviez, choisiriez-vous de télétravailler à temps plein, partiellement, ou pas du tout ? Pourquoi ?", expectedAngle: "个人立场+理由，可提混合模式" },
  ],
  5: [
    { text: "Le bio est-il vraiment meilleur pour la santé, ou s'agit-il surtout d'un argument marketing ?", expectedAngle: "健康 vs 营销，批判性" },
    { text: "Que faudrait-il faire pour rendre une alimentation saine accessible à tous ?", expectedAngle: "可及性措施，社会层面" },
  ],
  6: [
    { text: "Ce type de plateforme menace-t-il, selon vous, la restauration traditionnelle ?", expectedAngle: "对传统餐饮的冲击，辩证" },
    { text: "Pensez-vous que l'argent dénature forcément les relations humaines ?", expectedAngle: "上升到普遍命题，避免绝对化" },
  ],
};

let bad = 0;
fs.readdirSync(outDir).filter((f) => /^oral-\d+\.import\.json$/.test(f)).sort().forEach((f) => {
  const idx = parseInt(f.match(/oral-(\d+)/)[1], 10);
  const file = path.join(outDir, f);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const q = s.questions[0];
  const add = extra[idx] || [];
  while (q.followUps.length < 4 && add.length) {
    const f2 = add[q.followUps.length - 2]; // first 2 already present
    if (!f2) break;
    q.followUps.push({ order: q.followUps.length, text: f2.text, expectedAngle: f2.expectedAngle });
  }
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  const ok = q.type === 'SPEAKING' && q.skill === 'PO' && (q.options || []).length === 0
    && q.followUps.length === 4 && s.questions.length === 1;
  if (!ok) bad++;
  console.log(`${ok ? '✅' : '❌'} ${f}  fu=${q.followUps.length}  | ${s.title}`);
});
console.log(bad ? `\n❌ ${bad} 套异常` : '\n✅ 6 套全部合规，每套 1 道口语题 × 4 条追问');
