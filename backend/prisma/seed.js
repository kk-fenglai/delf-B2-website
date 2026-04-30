// Seed: sample DELF B2 仿真题 (original questions matching exam format)
//
// Safety:
//   - The admin user is always upserted (needed for first deploy on any env).
//   - Demo/sample user accounts are only created in NON-production environments
//     unless you explicitly set ALLOW_PROD_SEED=true.
//   - Example exam sets are created only when there are no existing exam sets,
//     so re-running this in prod won't duplicate content.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_PROD_SEED = process.env.ALLOW_PROD_SEED === 'true';

async function main() {
  console.log(`🌱 Seeding database (NODE_ENV=${process.env.NODE_ENV || 'development'})...`);

  // ---- Super Admin — always ensure exists ----
  const adminInitialPwd = process.env.ADMIN_INITIAL_PASSWORD || 'DELFluent$Admin@2026!Prod';
  if (IS_PROD && !process.env.ADMIN_INITIAL_PASSWORD) {
    console.warn('⚠️  ADMIN_INITIAL_PASSWORD not set — using default. Change it immediately after first login.');
  }
  const adminPwdHash = await bcrypt.hash(adminInitialPwd, 12);
  await prisma.user.upsert({
    where: { email: 'alzy1210@163.com' },
    update: { role: 'SUPER_ADMIN', status: 'ACTIVE', emailVerified: true },
    create: {
      email: 'alzy1210@163.com',
      passwordHash: adminPwdHash,
      name: 'Super Admin',
      plan: 'AI_UNLIMITED',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`✅ Super admin ready: alzy1210@163.com`);
  console.log('⚠️  Change this password IMMEDIATELY after first login!');

  // ---- Demo users — dev/staging only ----
  if (IS_PROD && !ALLOW_PROD_SEED) {
    console.log('⏭️  Skipping demo users + sample exam sets (NODE_ENV=production).');
    console.log('   To force-create them, set ALLOW_PROD_SEED=true. Not recommended.');
    return;
  }

  const demoPwd = await bcrypt.hash('demo1234', 12);
  await prisma.user.upsert({
    where: { email: 'demo@delfluent.com' },
    update: { emailVerified: true },
    create: {
      email: 'demo@delfluent.com',
      passwordHash: demoPwd,
      name: '演示用户',
      plan: 'STANDARD',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: 'free@delfluent.com' },
    update: { emailVerified: true },
    create: {
      email: 'free@delfluent.com',
      passwordHash: demoPwd,
      name: '免费用户',
      plan: 'FREE',
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  const oneYearLater = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  await prisma.user.upsert({
    where: { email: 'ai@delfluent.com' },
    update: { plan: 'AI', subscriptionEnd: oneYearLater, emailVerified: true },
    create: {
      email: 'ai@delfluent.com',
      passwordHash: demoPwd,
      name: 'AI版用户',
      plan: 'AI',
      subscriptionEnd: oneYearLater,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.upsert({
    where: { email: 'ai-unlimited@delfluent.com' },
    update: { plan: 'AI_UNLIMITED', subscriptionEnd: oneYearLater, emailVerified: true },
    create: {
      email: 'ai-unlimited@delfluent.com',
      passwordHash: demoPwd,
      name: 'AI无限版用户',
      plan: 'AI_UNLIMITED',
      subscriptionEnd: oneYearLater,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Idempotency — don't duplicate sample exams on re-run.
  const existingExamCount = await prisma.examSet.count();
  if (existingExamCount > 0) {
    console.log(`⏭️  ${existingExamCount} exam set(s) already exist — skipping sample content.`);
    return;
  }

  // ---- Exam Set 1: 免费体验套题 ----
  const freeSet = await prisma.examSet.create({
    data: {
      title: 'DELF B2 仿真题 2024 - 免费体验',
      year: 2024,
      description: '面向新用户的免费体验套题，包含听力和阅读样题',
      isFreePreview: true,
      isPublished: true,
      questions: {
        create: [
          // --- Listening (CO) ---
          {
            skill: 'CO',
            type: 'SINGLE',
            order: 1,
            prompt: "D'après l'interview, quel est le principal sujet abordé ?",
            passage: "[Transcript] Bonjour à tous et bienvenue dans notre émission. Aujourd'hui, nous allons aborder un sujet qui concerne des millions de Français : l'impact du télétravail sur la productivité des employés français depuis 2020. Nous avons invité deux experts pour nous éclairer sur les transformations profondes que cette nouvelle organisation du travail a engendrées dans les entreprises, ainsi que sur ses conséquences pour les salariés eux-mêmes.",
            audioUrl: 'https://example.com/audio/demo-co-1.mp3',
            explanation: "发言人在开头明确提到 \"l'impact du télétravail sur la productivité\"，即远程办公对生产力的影响。",
            points: 2,
            options: {
              create: [
                { label: 'A', text: "L'impact du télétravail sur la productivité", isCorrect: true, order: 0 },
                { label: 'B', text: 'Les nouvelles technologies en entreprise', isCorrect: false, order: 1 },
                { label: 'C', text: 'La formation continue des salariés', isCorrect: false, order: 2 },
                { label: 'D', text: "L'évolution du droit du travail", isCorrect: false, order: 3 },
              ],
            },
          },
          {
            skill: 'CO',
            type: 'MULTIPLE',
            order: 2,
            prompt: 'Quels avantages du télétravail sont mentionnés ? (Plusieurs réponses possibles)',
            passage: "[Transcript] Les employés interrogés citent en premier lieu le gain de temps considérable sur les trajets domicile-travail, souvent plus d'une heure par jour. Ils évoquent aussi une amélioration notable de l'équilibre entre vie professionnelle et vie personnelle, notamment pour les parents de jeunes enfants. En revanche, la rémunération reste inchangée et les perspectives de promotion ne semblent pas accélérées par cette nouvelle organisation du travail.",
            audioUrl: 'https://example.com/audio/demo-co-1.mp3',
            explanation: '录音中明确提到了时间节省（A）和工作生活平衡（C）。',
            points: 3,
            options: {
              create: [
                { label: 'A', text: 'Gain de temps dans les transports', isCorrect: true, order: 0 },
                { label: 'B', text: 'Meilleure rémunération', isCorrect: false, order: 1 },
                { label: 'C', text: 'Équilibre vie pro / vie perso', isCorrect: true, order: 2 },
                { label: 'D', text: 'Promotions plus rapides', isCorrect: false, order: 3 },
              ],
            },
          },
          // --- Reading (CE) ---
          {
            skill: 'CE',
            type: 'SINGLE',
            order: 10,
            prompt: "Selon l'article, quelle est la principale cause de l'augmentation du prix du logement à Paris ?",
            passage: "Depuis une décennie, le prix de l'immobilier à Paris ne cesse de grimper. Si la spéculation financière est souvent pointée du doigt, les experts estiment que c'est avant tout le manque chronique de logements neufs qui alimente la hausse des prix. La capitale manque cruellement de terrains constructibles, et les projets de rénovation urbaine peinent à aboutir faute de consensus politique...",
            explanation: "文章中 \"c'est avant tout le manque chronique de logements neufs qui alimente la hausse des prix\" 明确指出新建住房短缺是主因。",
            points: 2,
            options: {
              create: [
                { label: 'A', text: 'La spéculation financière', isCorrect: false, order: 0 },
                { label: 'B', text: 'Le manque de logements neufs', isCorrect: true, order: 1 },
                { label: 'C', text: "L'augmentation du tourisme", isCorrect: false, order: 2 },
                { label: 'D', text: 'Les politiques fiscales', isCorrect: false, order: 3 },
              ],
            },
          },
          {
            skill: 'CE',
            type: 'TRUE_FALSE',
            order: 11,
            prompt: 'Les experts considèrent que la spéculation est la cause principale.',
            passage: "(voir texte ci-dessus)",
            explanation: '文章明确说主因是新建住房短缺，而非投机。',
            points: 2,
            options: {
              create: [
                { label: 'V', text: 'Vrai', isCorrect: false, order: 0 },
                { label: 'F', text: 'Faux', isCorrect: true, order: 1 },
                { label: 'N', text: 'On ne sait pas', isCorrect: false, order: 2 },
              ],
            },
          },
          // --- Writing (PE) ---
          {
            skill: 'PE',
            type: 'ESSAY',
            order: 20,
            prompt: "Le maire de votre ville envisage d'interdire les voitures en centre-ville pour lutter contre la pollution. Rédigez une lettre argumentée (250 mots minimum) au journal local dans laquelle vous exprimez votre opinion sur cette mesure.",
            explanation: '参考答案结构：引入话题 → 赞同/反对立场 → 至少3个论据 → 结论呼吁。B2级写作要求使用连接词、多样句型、准确词汇。',
            points: 25,
          },
        ],
      },
    },
  });
  console.log('✅ Created free preview set:', freeSet.id);

  // ---- Exam Set 2: 付费套题（需订阅）----
  const paidSet = await prisma.examSet.create({
    data: {
      title: 'DELF B2 仿真题 2024-Set A',
      year: 2024,
      description: '完整套卷，含听力、阅读、写作各项',
      isFreePreview: false,
      isPublished: true,
      questions: {
        create: [
          {
            skill: 'CO',
            type: 'SINGLE',
            order: 1,
            prompt: "Quel est l'objectif principal de la conférence annoncée ?",
            passage: "[Transcript] Mesdames et messieurs, c'est avec grand plaisir que nous vous annonçons l'ouverture officielle du congrès international de médecine. Cet événement, qui rassemble cette année plus de trois mille chercheurs venus du monde entier, a pour objectif principal de promouvoir la recherche scientifique dans le domaine des maladies chroniques et de favoriser les collaborations internationales entre les laboratoires universitaires et les instituts publics.",
            audioUrl: 'https://example.com/audio/set-a-co-1.mp3',
            explanation: '完整解析需订阅后查看。',
            points: 2,
            options: {
              create: [
                { label: 'A', text: 'Promouvoir la recherche scientifique', isCorrect: true, order: 0 },
                { label: 'B', text: 'Vendre des produits pharmaceutiques', isCorrect: false, order: 1 },
                { label: 'C', text: 'Former de nouveaux médecins', isCorrect: false, order: 2 },
                { label: 'D', text: 'Réunir des investisseurs', isCorrect: false, order: 3 },
              ],
            },
          },
          {
            skill: 'CE',
            type: 'SINGLE',
            order: 10,
            prompt: "Quelle est la thèse défendue par l'auteur ?",
            passage: "Le numérique a profondément transformé notre rapport au savoir. Alors qu'autrefois l'accès à l'information était l'apanage d'une élite disposant de bibliothèques bien fournies, aujourd'hui chacun peut, depuis son téléphone, consulter en quelques secondes une quantité vertigineuse de ressources. Pourtant, cette démocratisation apparente cache un paradoxe : l'abondance d'informations rend plus difficile le tri entre sources fiables et rumeurs...",
            explanation: '作者认为信息过载反而使辨识可靠信息变得困难。',
            points: 2,
            options: {
              create: [
                { label: 'A', text: 'Le numérique rend le savoir accessible à tous sans difficulté', isCorrect: false, order: 0 },
                { label: 'B', text: "L'abondance d'informations complique le tri des sources fiables", isCorrect: true, order: 1 },
                { label: 'C', text: 'Les bibliothèques sont devenues inutiles', isCorrect: false, order: 2 },
                { label: 'D', text: "L'éducation doit se numériser entièrement", isCorrect: false, order: 3 },
              ],
            },
          },
        ],
      },
    },
  });
  console.log('✅ Created paid set:', paidSet.id);

  // ---- Production Orale sample sets (3) ----
  // Each set is a single-question Production Orale exam: a short article
  // (passage) + a thèse to defend (prompt) + 4-5 follow-up débat questions.
  // Themes are classic DELF B2 PO topics: writes/reads/society.
  const poSamples = [
    {
      title: 'DELF B2 PO 模拟 · 社交媒体与青少年',
      year: 2025,
      description: 'Production Orale · sujet "Réseaux sociaux et adolescents"',
      isFreePreview: true,
      passage: `D'après une étude menée par l'Observatoire de la jeunesse en 2024, les adolescents français passent en moyenne 4 h 30 par jour sur les réseaux sociaux. Si ces plateformes leur permettent de maintenir un lien social et de découvrir de nouveaux contenus, plusieurs études récentes alertent sur les conséquences psychologiques d'un usage intensif : troubles du sommeil, anxiété sociale, baisse de l'estime de soi, et surtout phénomènes de comparaison permanente avec des images souvent retouchées. Plusieurs pays européens, à l'image de la Norvège ou des Pays-Bas, envisagent désormais d'interdire purement et simplement l'accès des moins de 15 ans à ces réseaux.`,
      prompt: `Vous dégagerez le problème soulevé par ce document, puis vous présenterez votre opinion sur le sujet de manière argumentée. Pensez-vous qu'il faille interdire les réseaux sociaux aux mineurs de moins de 15 ans ?`,
      followUps: [
        { text: 'Pensez-vous vraiment qu\'une interdiction soit applicable dans la pratique ? Comment contourneraient-ils l\'âge minimum ?',
          expectedAngle: 'Faisabilité technique de la vérification d\'âge ; comparaison avec d\'autres restrictions (alcool, tabac).' },
        { text: 'Selon vous, quel rôle les parents devraient-ils jouer dans l\'éducation aux médias numériques ?',
          expectedAngle: 'Médiation parentale, dialogue, paramétrage du contrôle parental, exemple personnel.' },
        { text: 'Certains soutiennent que ces réseaux sont aussi un espace d\'apprentissage et de créativité. Que leur répondez-vous ?',
          expectedAngle: 'Reconnaître les bénéfices (créativité, expression) tout en tenant sa position.' },
        { text: 'Si une telle interdiction était votée demain en France, quelles en seraient les conséquences sociales ?',
          expectedAngle: 'Effets sur la sociabilité, sentiment d\'exclusion, marché noir d\'accès, conséquences économiques pour les plateformes.' },
        { text: 'Pensez-vous que les jeunes adultes (18-25 ans) seraient prêts à se déconnecter volontairement ? Pourquoi ?',
          expectedAngle: 'Habitudes ancrées, FOMO, dépendance affective vs sursaut de conscience.' },
      ],
    },
    {
      title: 'DELF B2 PO 模拟 · 远程办公与城市规划',
      year: 2025,
      description: 'Production Orale · sujet "Télétravail et aménagement du territoire"',
      isFreePreview: false,
      passage: `Depuis 2020, le télétravail s'est imposé comme une nouvelle norme dans une grande partie du secteur tertiaire français. Selon l'INSEE, près de 30 % des cadres travaillent désormais au moins deux jours par semaine depuis leur domicile. Si cette évolution améliore la qualité de vie de nombreux salariés et réduit les émissions liées aux transports pendulaires, elle pose aussi des questions épineuses pour l'aménagement du territoire. Les centres-villes des grandes métropoles voient leur fréquentation chuter, les commerçants de quartier souffrent d'une perte de clientèle, tandis que les villes moyennes connaissent un regain d'attractivité. Doit-on s'en réjouir ou s'en inquiéter ?`,
      prompt: `Présentez le problème soulevé puis défendez votre point de vue : le télétravail est-il, à terme, une chance ou une menace pour l'équilibre des territoires français ?`,
      followUps: [
        { text: 'Comment expliquez-vous la baisse de fréquentation des centres-villes des grandes métropoles ?',
          expectedAngle: 'Causalité directe avec la baisse de présence des cadres, effet domino sur la restauration et le commerce.' },
        { text: 'Selon vous, les entreprises devraient-elles obliger leurs salariés à revenir au bureau ?',
          expectedAngle: 'Tension liberté individuelle vs cohésion d\'équipe ; cadre juridique français.' },
        { text: 'Le télétravail accentue-t-il les inégalités sociales, à votre avis ?',
          expectedAngle: 'Différence entre cols blancs et cols bleus, accès au logement de qualité, fracture numérique.' },
        { text: 'Quelles politiques publiques pourraient accompagner cette transformation ?',
          expectedAngle: 'Aides à l\'installation en zone rurale, fibre optique, transport interurbain, fiscalité.' },
        { text: 'Pensez-vous qu\'on reviendra un jour au mode "100 % présentiel" ?',
          expectedAngle: 'Argumentation sur l\'irréversibilité culturelle vs cycles économiques.' },
      ],
    },
    {
      title: 'DELF B2 PO 模拟 · 食品工业与消费者信息',
      year: 2025,
      description: 'Production Orale · sujet "Étiquetage alimentaire et industrie agroalimentaire"',
      isFreePreview: false,
      passage: `Depuis 2017, le Nutri-Score, étiquetage nutritionnel volontaire allant de A (vert, le meilleur) à E (rouge, le moins favorable), figure sur de nombreux produits alimentaires en France. Plébiscité par les associations de consommateurs et de nombreux nutritionnistes, ce système est en revanche vivement critiqué par certains industriels — notamment ceux du fromage ou des produits typiques de l'agriculture méditerranéenne — qui estiment qu'il pénalise injustement leurs produits, au profit de plats préparés industriels rendus artificiellement plus "verts" par des reformulations. Bruxelles envisage aujourd'hui de rendre le Nutri-Score obligatoire dans toute l'Union européenne.`,
      prompt: `Présentez le problème puis défendez votre opinion : faut-il imposer le Nutri-Score à l'ensemble des produits alimentaires en Europe ?`,
      followUps: [
        { text: 'Le consommateur moyen comprend-il vraiment ce que signifient les lettres A à E selon vous ?',
          expectedAngle: 'Lisibilité visuelle vs compréhension nutritionnelle réelle, éducation à la santé.' },
        { text: 'Que répondez-vous aux producteurs de fromage AOP qui se sentent stigmatisés ?',
          expectedAngle: 'Distinction entre nutrition pure et tradition culturelle, modulation par la portion consommée.' },
        { text: 'L\'industrie agroalimentaire ne risque-t-elle pas de simplement reformuler ses produits pour gagner une lettre ?',
          expectedAngle: 'Effet pervers : reformulation cosmétique sans réelle amélioration nutritionnelle.' },
        { text: 'Pensez-vous que ce type d\'étiquetage devrait s\'étendre à d\'autres domaines (vêtements, électronique) ?',
          expectedAngle: 'Pertinence et limites d\'un score unique sur des univers complexes ; comparaison avec l\'écolabel.' },
        { text: 'En tant que consommateur, votre comportement d\'achat a-t-il changé depuis l\'apparition de cet affichage ?',
          expectedAngle: 'Réponse personnelle assumée et nuancée, conscience de ses propres biais.' },
      ],
    },
  ];

  for (const sample of poSamples) {
    const created = await prisma.examSet.create({
      data: {
        title: sample.title,
        year: sample.year,
        description: sample.description,
        isFreePreview: sample.isFreePreview,
        isPublished: true,
        questions: {
          create: [
            {
              skill: 'PO',
              type: 'SPEAKING',
              order: 1,
              prompt: sample.prompt,
              passage: sample.passage,
              points: 25,
              followUps: {
                create: sample.followUps.map((f, i) => ({
                  order: i,
                  text: f.text,
                  expectedAngle: f.expectedAngle,
                })),
              },
            },
          ],
        },
      },
    });
    console.log('✅ Created PO sample:', created.title, `(${created.id})`);
  }

  console.log('🎉 Seed complete!');
  console.log('Test accounts:');
  console.log('  demo@delfluent.com / demo1234  (标准版)');
  console.log('  free@delfluent.com / demo1234  (免费版)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
