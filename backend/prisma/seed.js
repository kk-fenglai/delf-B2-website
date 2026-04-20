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
