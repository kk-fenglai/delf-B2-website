// Seeds a 2-document DELF B2 listening demo into the active database.
//
//   Document 1 (long, played twice with 3-min gap): 2 questions, Q1 + Q2
//   Document 2 (short, played once):                 1 question, Q3
//
// Re-runnable: deletes the previous demo set (if any) before inserting.
// Audio files used: backend/content/fei-samples/co-demo-q{1,2,3}.wav
//   - co-demo-q1.wav becomes Document 1's audio (we re-use it; the test
//     content is the same theme so this is fine for demo purposes).
//   - co-demo-q3.wav becomes Document 2's audio.
// You can also drop any other mp3/wav into content/fei-samples and update
// the AUDIO_FILES constants below.
//
// Usage:
//   cd backend
//   node scripts/seedCoDemo.js

const prisma = require('../src/prisma');

const TITLE = 'DELF B2 听力示例 · 测试版（双文档）';

const DOC1_AUDIO = '/api/audio/fei/co-demo-q1.wav';
const DOC2_AUDIO = '/api/audio/fei/co-demo-q3.wav';

async function main() {
  // Wipe child rows of any prior run of THIS script (same title), but leave
  // older demos alone if they have user sessions pointing at them — those
  // FKs would block delete and we don't want a destructive seed.
  const prior = await prisma.examSet.findFirst({ where: { title: TITLE } });
  if (prior) {
    console.log(`prior demo set found (${prior.id}); wiping children + reusing the row`);
    await prisma.questionOption.deleteMany({ where: { question: { examSetId: prior.id } } });
    await prisma.userAttempt.deleteMany({ where: { question: { examSetId: prior.id } } });
    await prisma.question.deleteMany({ where: { examSetId: prior.id } });
    await prisma.audioDocument.deleteMany({ where: { examSetId: prior.id } });
    await prisma.examSet.update({
      where: { id: prior.id },
      data: { isPublished: true, isFreePreview: true, year: 2024 },
    });
  }

  const set = prior || await prisma.examSet.create({
    data: {
      title: TITLE,
      year: 2024,
      description: '听力模块功能演示 · 验证 2 个 AudioDocument、播放次数（2/1）、读题/间隔/答题时间窗。',
      isPublished: true,
      isFreePreview: true,
    },
  });

  // ---- Document 1: long doc, played twice, 3-min gap, 60s prep ----
  // For demo, shorten the windows so it's testable in under 2 minutes:
  // prep 20s, gap 30s, no extra answer window (user just continues to doc 2).
  const doc1 = await prisma.audioDocument.create({
    data: {
      examSetId: set.id,
      order: 0,
      title: 'Exercice 1 · Document long',
      audioUrl: DOC1_AUDIO,
      maxPlays: 2,
      prepSeconds: 20,
      gapSeconds: 30,
      answerSeconds: 0,
    },
  });

  await prisma.question.create({
    data: {
      examSetId: set.id,
      audioDocumentId: doc1.id,
      skill: 'CO',
      type: 'SINGLE',
      order: 1,
      prompt: "D'après l'enregistrement, quel est le sujet principal du document ?",
      passage: '[录音稿示例] La nouvelle politique environnementale de la ville vise principalement à réduire la pollution de l\'air en limitant la circulation automobile dans le centre-ville.',
      explanation: 'Le locuteur précise dès le début que la politique cible la pollution de l\'air.',
      points: 2,
      options: {
        create: [
          { label: 'A', text: "La pollution de l'air en ville", isCorrect: true,  order: 0 },
          { label: 'B', text: 'Le coût des transports publics',  isCorrect: false, order: 1 },
          { label: 'C', text: 'Le bruit dans le centre-ville',   isCorrect: false, order: 2 },
          { label: 'D', text: 'La construction de pistes cyclables', isCorrect: false, order: 3 },
        ],
      },
    },
  });

  await prisma.question.create({
    data: {
      examSetId: set.id,
      audioDocumentId: doc1.id,
      skill: 'CO',
      type: 'MULTIPLE',
      order: 2,
      prompt: 'Quelles mesures sont citées par le locuteur ? (Plusieurs réponses possibles)',
      passage: '[录音稿示例] Les mesures incluent la création de zones piétonnes, la gratuité des transports publics le week-end, et l\'installation de nouvelles bornes de recharge pour véhicules électriques.',
      explanation: 'Trois mesures sont citées : zones piétonnes, transports publics gratuits le week-end, bornes de recharge.',
      points: 3,
      options: {
        create: [
          { label: 'A', text: 'Zones piétonnes',                                isCorrect: true,  order: 0 },
          { label: 'B', text: 'Transports publics gratuits le week-end',       isCorrect: true,  order: 1 },
          { label: 'C', text: 'Bornes de recharge pour véhicules électriques', isCorrect: true,  order: 2 },
          { label: 'D', text: 'Interdiction totale des voitures',              isCorrect: false, order: 3 },
        ],
      },
    },
  });

  // ---- Document 2: short doc, played once, no gap, 30s prep ----
  const doc2 = await prisma.audioDocument.create({
    data: {
      examSetId: set.id,
      order: 1,
      title: 'Exercice 2 · Document court',
      audioUrl: DOC2_AUDIO,
      maxPlays: 1,
      prepSeconds: 15,
      gapSeconds: 0,
      answerSeconds: 30,
    },
  });

  await prisma.question.create({
    data: {
      examSetId: set.id,
      audioDocumentId: doc2.id,
      skill: 'CO',
      type: 'TRUE_FALSE',
      order: 3,
      prompt: 'Le locuteur affirme que la politique a déjà donné des résultats mesurables.',
      passage: '[录音稿示例] Il est encore trop tôt pour évaluer l\'impact réel de cette politique, mais les premières observations sont encourageantes.',
      explanation: "Faux. Le locuteur dit explicitement « il est encore trop tôt pour évaluer l'impact réel ».",
      points: 2,
      options: {
        create: [
          { label: 'V', text: 'Vrai', isCorrect: false, order: 0 },
          { label: 'F', text: 'Faux', isCorrect: true,  order: 1 },
        ],
      },
    },
  });

  console.log(`\n✅ seeded: ${set.title}`);
  console.log(`   examSetId = ${set.id}`);
  console.log(`   doc1      = ${doc1.id}  (maxPlays=2, prep=${doc1.prepSeconds}s, gap=${doc1.gapSeconds}s)`);
  console.log(`   doc2      = ${doc2.id}  (maxPlays=1, prep=${doc2.prepSeconds}s)`);
  await prisma.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
