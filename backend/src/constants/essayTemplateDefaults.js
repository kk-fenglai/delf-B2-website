// Pre-built system templates for DELF B2 PE (Production Écrite).
// Organised by topic so the frontend can filter without a DB query.
// Add new entries here; they are served alongside user templates via
// GET /api/user/templates and are visible (read-only) to all users.

const SYSTEM_TEMPLATES = [

  // ── Structures générales ────────────────────────────────────────────────
  {
    id: 'sys-struct-lettre',
    title: 'Structure — Lettre ouverte',
    topic: 'general',
    type: 'structure',
    content:
`[Ville], le [date]

Monsieur/Madame le Rédacteur en chef,

Je me permets de vous écrire à la suite de l'article intitulé « [titre] » publié dans votre magazine. [Brève présentation de votre position].

[§ Argument 1]
En premier lieu, ... En effet, ... C'est ainsi que ...

[§ Argument 2]
Par ailleurs, ... À titre d'exemple, ... Il convient de souligner que ...

[§ Nuance / concession]
Certes, ... Cependant, ... Or, ...

[§ Conclusion]
En définitive, j'espère que vous prendrez en compte ce point de vue et je vous encourage à ...

Je vous prie d'agréer, Monsieur/Madame, l'expression de mes salutations distinguées.

[Prénom Nom]`,
  },

  {
    id: 'sys-struct-article',
    title: 'Structure — Article de presse',
    topic: 'general',
    type: 'structure',
    content:
`[Titre accrocheur — question rhétorique ou affirmation percutante]

Dans un contexte où [situation actuelle], la question de [sujet] suscite de vifs débats. [Annonce du plan en une phrase].

Un phénomène en pleine expansion
Selon [source / étude], ... De fait, ... Il apparaît que ...

Des enjeux multiples
D'une part, ... D'autre part, ... C'est pourquoi ...

Vers des solutions durables ?
Face à ce constat, ... Il serait souhaitable que ... En définitive, ...

[Prénom Nom]`,
  },

  {
    id: 'sys-conn-general',
    title: 'Connecteurs logiques — Indispensables B2',
    topic: 'general',
    type: 'phrase',
    content:
`INTRODUCTION
• Dans un contexte où... / À l'heure où...
• La question de [sujet] suscite de vifs débats.
• Il convient de s'interroger sur...

ADDITION
• De plus / En outre / Par ailleurs / Qui plus est

OPPOSITION & CONCESSION
• Certes... mais... / Cependant / Néanmoins / Or
• Si... il n'en demeure pas moins que...
• En dépit de... / Malgré...

CONSÉQUENCE
• C'est pourquoi / Ainsi / De ce fait / Il s'ensuit que

ILLUSTRATION
• À titre d'exemple / C'est le cas de
• Comme en témoigne... / Tel est le cas lorsque

CONCLUSION
• En définitive / Pour conclure / Force est de constater que...
• Il ressort de cette analyse que...`,
  },

  // ── Technologie & Réseaux sociaux ──────────────────────────────────────
  {
    id: 'sys-tech-struct',
    title: 'Technologie — Plan argumenté',
    topic: 'technologie',
    type: 'structure',
    content:
`[Position] : Les technologies numériques présentent des avantages indéniables, mais nécessitent une régulation stricte.

§ 1 — BIENFAITS
→ Accès à l'information et formation en ligne
→ Lien social et mobilisation citoyenne (#MeToo, mouvements climatiques)
→ Création d'emplois dans l'économie numérique

§ 2 — RISQUES
→ Désinformation et bulles cognitives
→ Cyberharcèlement et atteinte à la vie privée
→ Addiction aux écrans et isolement social

§ 3 — SOLUTIONS
→ Éducation aux médias dès le plus jeune âge
→ Responsabilisation des plateformes (modération, transparence)
→ Législation européenne (ex. : DSA — Digital Services Act)`,
  },

  {
    id: 'sys-tech-phrases',
    title: 'Technologie — Phrases clés',
    topic: 'technologie',
    type: 'phrase',
    content:
`• À l'ère du numérique, les nouvelles technologies transforment profondément nos modes de vie.
• Les réseaux sociaux constituent un vecteur essentiel de communication et de mobilisation citoyenne.
• Le numérique offre des opportunités sans précédent en matière d'accès à l'information.
• L'addiction aux écrans et la désinformation représentent des dérives préoccupantes.
• La fracture numérique creuse les inégalités entre populations connectées et non connectées.
• Il convient de réguler l'usage des plateformes afin de protéger les utilisateurs les plus vulnérables.
• L'intelligence artificielle soulève des questions éthiques auxquelles nos sociétés doivent répondre.`,
  },

  // ── Environnement & Développement durable ──────────────────────────────
  {
    id: 'sys-env-struct',
    title: 'Environnement — Plan argumenté',
    topic: 'environnement',
    type: 'structure',
    content:
`[Position] : La protection de l'environnement est une responsabilité collective exigeant des actions concrètes à tous les niveaux.

§ 1 — ÉTAT DES LIEUX
→ Données scientifiques (rapports du GIEC, ONU)
→ Conséquences : fonte des glaces, événements climatiques extrêmes, extinction d'espèces

§ 2 — RESPONSABILITÉS PARTAGÉES
→ États : accords climatiques (Accord de Paris), réglementations sectorielles
→ Entreprises : économie circulaire, réduction des émissions de CO₂
→ Citoyens : consommation responsable, mobilité durable

§ 3 — SOLUTIONS
→ Transition vers les énergies renouvelables (solaire, éolien)
→ Éducation environnementale dès l'école primaire
→ Taxation carbone et incitations fiscales vertes`,
  },

  {
    id: 'sys-env-phrases',
    title: 'Environnement — Phrases clés',
    topic: 'environnement',
    type: 'phrase',
    content:
`• Face à l'urgence climatique, des mesures radicales s'imposent à l'échelle mondiale.
• Le réchauffement climatique menace la biodiversité et les équilibres écosystémiques.
• La transition énergétique vers les énergies renouvelables est désormais incontournable.
• Le principe de développement durable suppose de concilier croissance économique et préservation de l'environnement.
• Les générations futures ne doivent pas payer le prix de notre insouciance écologique.
• Chaque individu a un rôle à jouer dans la lutte contre le dérèglement climatique.
• La surconsommation et l'obsolescence programmée aggravent la crise environnementale.`,
  },

  // ── Éducation & Jeunesse ───────────────────────────────────────────────
  {
    id: 'sys-edu-struct',
    title: 'Éducation — Plan argumenté',
    topic: 'education',
    type: 'structure',
    content:
`[Position] : La réforme du système éducatif est une priorité pour garantir l'égalité des chances.

§ 1 — ENJEUX ACTUELS
→ Décrochage scolaire et inégalités territoriales (zones rurales, REP+)
→ Inadéquation entre formation et marché du travail
→ Prise en compte insuffisante des intelligences multiples

§ 2 — PISTES D'AMÉLIORATION
→ Classes à effectifs réduits et accompagnement personnalisé
→ Valorisation de l'enseignement professionnel et de l'apprentissage
→ Intégration du numérique et des compétences transversales (esprit critique, créativité)

§ 3 — RÔLE DES ACTEURS
→ État : financement équitable et politique éducative ambitieuse
→ Enseignants : formation continue et autonomie pédagogique
→ Familles : implication et accompagnement dans la scolarité`,
  },

  {
    id: 'sys-edu-phrases',
    title: 'Éducation — Phrases clés',
    topic: 'education',
    type: 'phrase',
    content:
`• L'éducation constitue le fondement de toute société démocratique et égalitaire.
• L'accès à une instruction de qualité doit être garanti à tous, indépendamment de l'origine sociale.
• Les méthodes pédagogiques doivent évoluer pour répondre aux défis du XXIe siècle.
• Le numérique offre de nouvelles perspectives pour un apprentissage personnalisé.
• Les inégalités scolaires se répercutent directement sur les inégalités sociales et économiques.
• Investir dans la jeunesse, c'est investir dans l'avenir d'une nation.
• L'orientation précoce risque de figer les destins sociaux plutôt que de les ouvrir.`,
  },

  // ── Travail & Économie ─────────────────────────────────────────────────
  {
    id: 'sys-travail-struct',
    title: 'Travail — Plan argumenté',
    topic: 'travail',
    type: 'structure',
    content:
`[Position] : L'évolution du monde du travail exige une adaptation des politiques sociales et des mentalités.

§ 1 — TRANSFORMATIONS EN COURS
→ Automatisation et intelligence artificielle : menace ou opportunité ?
→ Essor du travail indépendant (freelance, auto-entrepreneurs)
→ Nouvelles aspirations : sens au travail, flexibilité, qualité de vie

§ 2 — DÉFIS
→ Chômage structurel et reconversions professionnelles nécessaires
→ Burn-out et risques psychosociaux liés à la connexion permanente
→ Inégalités femmes-hommes dans l'accès aux postes à responsabilité

§ 3 — SOLUTIONS
→ Formation tout au long de la vie et validation des acquis (VAE)
→ Dialogue social renforcé entre syndicats et direction
→ Politiques publiques de soutien à l'emploi et aux transitions de carrière`,
  },

  {
    id: 'sys-travail-phrases',
    title: 'Travail & Économie — Phrases clés',
    topic: 'travail',
    type: 'phrase',
    content:
`• Le marché du travail connaît de profondes mutations sous l'effet de la numérisation et de l'automatisation.
• Le télétravail favorise une meilleure conciliation entre vie professionnelle et vie personnelle.
• Les conditions de travail influent directement sur la productivité et le bien-être des salariés.
• La précarité de l'emploi fragilise des pans entiers de la population active.
• Investir dans la formation continue est indispensable pour s'adapter aux évolutions du marché.
• Le droit à la déconnexion est désormais reconnu comme une nécessité pour préserver la santé mentale.
• La pénibilité au travail doit être prise en compte dans les politiques de retraite.`,
  },

  // ── Santé & Société ────────────────────────────────────────────────────
  {
    id: 'sys-sante-struct',
    title: 'Santé & Société — Plan argumenté',
    topic: 'sante',
    type: 'structure',
    content:
`[Position] : La santé publique doit être traitée comme une priorité collective, non comme une simple dépense budgétaire.

§ 1 — CONSTATS
→ Inégalités d'accès aux soins (déserts médicaux, coût des mutuelles)
→ Essor des maladies chroniques liées aux modes de vie (sédentarité, alimentation)
→ Vieillissement de la population et pression sur les systèmes de retraite et de soins

§ 2 — DÉFIS
→ Financement durable du système de santé
→ Attractivité des métiers de soignants (conditions, rémunération)
→ Prise en charge de la santé mentale, longtemps négligée

§ 3 — SOLUTIONS
→ Prévention : campagnes de sensibilisation, éducation à la santé dès l'école
→ Télémédecine pour réduire les inégalités territoriales
→ Revalorisation des professions de santé et investissement hospitalier`,
  },

  {
    id: 'sys-sante-phrases',
    title: 'Santé & Société — Phrases clés',
    topic: 'sante',
    type: 'phrase',
    content:
`• La santé publique constitue une priorité absolue pour garantir le bien-être de la population.
• Les inégalités d'accès aux soins se creusent entre zones urbaines et déserts médicaux.
• La prévention est préférable à la guérison, tant sur le plan humain qu'économique.
• La crise sanitaire a mis en lumière la vulnérabilité de nos systèmes de santé.
• Les modes de vie sédentaires et les mauvaises habitudes alimentaires favorisent les maladies chroniques.
• La santé mentale doit être considérée avec la même attention que la santé physique.
• L'espérance de vie a considérablement augmenté, posant de nouveaux défis au système de retraite.`,
  },

  // ── Culture & Patrimoine ───────────────────────────────────────────────
  {
    id: 'sys-culture-struct',
    title: 'Culture & Patrimoine — Plan argumenté',
    topic: 'culture',
    type: 'structure',
    content:
`[Position] : La culture est un bien commun qui mérite un financement public pérenne et un accès élargi à tous.

§ 1 — IMPORTANCE DE LA CULTURE
→ Vecteur d'identité collective et de cohésion sociale
→ Moteur économique (tourisme, industries créatives)
→ Outil de transmission des valeurs et de la mémoire collective

§ 2 — MENACES
→ Mondialisation et homogénéisation culturelle
→ Disparition de langues et pratiques culturelles minoritaires
→ Fracture culturelle entre zones urbaines et rurales

§ 3 — SOLUTIONS
→ Financement public de la culture (subventions, pass culture)
→ Numérisation et accessibilité des œuvres patrimoniales
→ Éducation artistique et culturelle à l'école dès le primaire`,
  },

  {
    id: 'sys-culture-phrases',
    title: 'Culture & Patrimoine — Phrases clés',
    topic: 'culture',
    type: 'phrase',
    content:
`• La culture est le ciment d'une société et le vecteur de son identité collective.
• Le patrimoine culturel constitue un héritage précieux qu'il convient de transmettre aux générations futures.
• La diversité culturelle est une richesse qui mérite d'être protégée et célébrée.
• L'accès à la culture pour tous reste un idéal à atteindre, notamment pour les populations défavorisées.
• La mondialisation menace l'existence de certaines langues et pratiques culturelles minoritaires.
• Le financement public de la culture est un investissement dans le vivre-ensemble.
• La démocratisation culturelle passe par une politique tarifaire inclusive et une offre décentralisée.`,
  },
];

// All unique topic keys, in display order.
const SYSTEM_TOPICS = [
  { key: 'general',       label: 'Général (Structures & Connecteurs)' },
  { key: 'technologie',   label: 'Technologie & Réseaux sociaux' },
  { key: 'environnement', label: 'Environnement' },
  { key: 'education',     label: 'Éducation & Jeunesse' },
  { key: 'travail',       label: 'Travail & Économie' },
  { key: 'sante',         label: 'Santé & Société' },
  { key: 'culture',       label: 'Culture & Patrimoine' },
];

module.exports = { SYSTEM_TEMPLATES, SYSTEM_TOPICS };
