// Source data for DELF B2 Production Orale topic cards transcribed from the
// scanned PDF (content/fei-samples/incoming/oral-source.pdf).
// Each entry -> one exam set with one SPEAKING question + 4 simple B2 débat
// follow-ups. buildOralSets.js turns this into oral-NN.import.json files.
//
// followUps: { t: question text (FR), a: expectedAngle (中文评分方向，不展示学生) }
// source: null when the original document gave no readable attribution.

module.exports = [
  // ---------------- page 3 ----------------
  {
    title: "Formation continue : les MOOC font leur timide révolution",
    source: "Le Monde",
    passage: `Le numérique fait une entrée discrète dans le secteur de la formation continue. Beaucoup lui prédisent pourtant un bel avenir grâce aux cours interactifs en ligne appelés MOOC*. Mais, traditionnellement, la formation continue s'appuie sur le « présentiel ». Les entreprises veulent avoir la certitude que le salarié assiste bien aux cours. Et pour cela, il doit signer, physiquement, sur une feuille de présence. Comment faire lorsqu'il s'agit d'un MOOC ? Le salarié est devant son écran. Même s'il entre son nom et son mot de passe pour suivre les séquences vidéo, faire les quiz, échanger avec ses « pairs » (des apprenants comme lui) ou avec un professeur, comment être sûr que c'est bien lui qui fait les exercices ? Les deux mondes ne se connaissent pas. « Les entreprises ont une vraie curiosité, un vrai intérêt. Mais, mal renseignées, elles hésitent encore à franchir le pas », affirme Mathieu Nebra, cofondateur d'un site de cours en ligne. Il faudra donc convaincre avant d'emporter la partie.
* MOOC : Massive Open Online Course, en français CLOM : cours en ligne ouvert et massif.`,
    followUps: [
      { t: "Avez-vous déjà suivi un cours en ligne ? Qu'en avez-vous pensé ?", a: "个人经历+评价" },
      { t: "Selon vous, peut-on aussi bien apprendre en ligne qu'en classe ?", a: "线上 vs 线下对比" },
      { t: "Quels sont, pour vous, les avantages des cours en ligne ?", a: "列举优点" },
      { t: "Pensez-vous que les cours en ligne vont remplacer les cours en classe ?", a: "预测+立场" },
    ],
  },
  {
    title: "Se professionnaliser à un âge avancé : un nouveau possible ?",
    source: "Le Monde",
    passage: `Louise Brun, 84 ans, vient de devenir avocate au barreau* de Toulouse. Louise n'avait pas fait d'études et avait occupé toute sa vie des postes ne nécessitant pas de diplômes. Une fois retraitée, elle a poursuivi son rêve : faire du droit. Après avoir décroché le bac, elle s'est inscrite à la faculté de Toulouse, où elle a réussi. Elle explique son envie d'apprendre : « Étudier m'apporte la force et l'envie de vivre qui fait oublier la vieillesse. Je voulais vraiment faire du droit pour connaître le fonctionnement de la justice et aider les autres. Avec l'espérance de vie que l'on atteint aujourd'hui, on devrait changer de mentalité et inciter les gens à faire des études à tout âge, pour avancer et progresser, revaloriser enfin le travail des seniors. » L'idée est louable, néanmoins comment gérer alors les différences d'âge entre étudiants, différences pouvant s'avérer problématiques. Autre question importante : y aura-t-il assez de travail pour tout le monde ?
* barreau : l'ensemble des avocats d'un tribunal.`,
    followUps: [
      { t: "Pensez-vous qu'on peut apprendre à tout âge ?", a: "立场" },
      { t: "Aimeriez-vous reprendre des études plus tard dans votre vie ?", a: "个人意愿" },
      { t: "Quels avantages un étudiant plus âgé peut-il apporter à une classe ?", a: "积极面" },
      { t: "Selon vous, est-il difficile d'étudier quand on est plus âgé ? Pourquoi ?", a: "困难分析" },
    ],
  },
  {
    title: "Petit client deviendra grand",
    source: "www.wort.lu/fr",
    passage: `Il existe de plus en plus de messages publicitaires destinés aux enfants sur Internet. Les annonceurs ont compris depuis longtemps déjà que les jeunes étaient des cibles intéressantes et que l'on pouvait vite les transformer en consommateurs. Mais faut-il voir dans l'exposition des jeunes enfants à la publicité un danger, ou faut-il l'accepter et les accompagner ? Cette question est nécessaire, « qu'il s'agisse d'Internet ou de la télévision », souligne Valérie Dupong, pour qui il existe deux options. La première est l'interdiction. La deuxième consiste à dire que, même s'il y a des risques, ils ne justifient pas d'interdire Internet : il faut éduquer les jeunes afin qu'ils développent un esprit critique. La protection des jeunes exige désormais une éducation aux médias. Si les parents sont les mieux placés pour aider leurs enfants à développer un regard critique sur les programmes de télévision et la publicité qui les entrecoupe, ils sont aussi les mieux placés pour faire prendre conscience à leurs enfants des risques de la navigation sur Internet.`,
    followUps: [
      { t: "Pensez-vous que la publicité a trop d'influence sur les enfants ?", a: "立场" },
      { t: "Faut-il interdire la publicité destinée aux enfants ?", a: "禁止 vs 教育" },
      { t: "Qui doit protéger les enfants face à la publicité : les parents ou l'État ?", a: "责任归属" },
      { t: "Comment apprendre aux enfants à avoir un esprit critique ?", a: "具体方法" },
    ],
  },

  // ---------------- page 4 ----------------
  {
    title: "École : bientôt le retour du redoublement ?",
    source: "Le Monde",
    passage: `En 2014, la ministre de l'éducation nationale de l'époque avait pris un décret affirmant « le caractère exceptionnel du redoublement* », soit une quasi-interdiction de faire redoubler les élèves. Deux raisons expliquaient cette décision. La première, c'est que le redoublement coûtait cher : environ 2 milliards d'euros par an. La seconde, c'est qu'il est le plus souvent inefficace. Pourtant, on aurait pu penser qu'un élève peut progresser l'année du redoublement, puisqu'il refait le même programme. Mais à long terme, « le redoublement n'a pas d'effet sur les performances scolaires », affirmait, en janvier 2015, le Conseil national d'évaluation du système scolaire dans un rapport. Aujourd'hui, le nouveau ministre français de l'éducation veut autoriser à nouveau les conseils de classe à faire redoubler les élèves qui ne sont pas au niveau. Et vous, que pensez-vous du redoublement ? Bonne ou mauvaise idée ?
* redoublement : fait, pour un élève, de recommencer une année dans la même classe.`,
    followUps: [
      { t: "Pour vous, le redoublement est-il une bonne ou une mauvaise idée ?", a: "立场" },
      { t: "Connaissez-vous quelqu'un qui a redoublé ? Comment ça s'est passé ?", a: "经历/例子" },
      { t: "Comment aider un élève en difficulté, sans le faire redoubler ?", a: "替代方案" },
      { t: "L'école devrait-elle s'adapter à chaque élève, selon vous ?", a: "观点" },
    ],
  },
  {
    title: "Pourquoi entreprendre entre amis ?",
    source: null,
    passage: `« Quand on a lancé notre société, notre entourage nous a mis en garde : vous êtes trop jeunes, vous êtes deux amies. Heureusement, on ne l'a pas écouté », se souviennent Mallorie et Marie. Les deux jeunes femmes, qui se sont rencontrées sur les bancs de l'école, ont fondé une centrale de réservation de soins de beauté et de bien-être sur Internet. Entreprendre entre amis peut-il représenter une prise de risque supplémentaire ? « Tout projet entrepreneurial est risqué, note Marie-Christine Barbot Grizzo, maîtresse de conférences à l'Université du Mans. La mauvaise entente entre deux associés peut mener à l'échec de l'entreprise. Rien ne prouve que ce risque augmente si les deux associés étaient déjà amis avant de se lancer. En revanche, la dimension amicale de leur relation doit impérativement être prise en compte dans la façon de concevoir l'entreprise, pour bien définir le rôle de chacun », préconise-t-elle. Il vaut donc mieux mettre toutes les chances de son côté pour lier avec succès amitié et affaires !`,
    followUps: [
      { t: "Travailler avec un ami, est-ce une bonne idée selon vous ?", a: "立场" },
      { t: "Quels sont les risques de travailler avec un ami ?", a: "风险" },
      { t: "Préféreriez-vous créer une entreprise seul(e) ou avec quelqu'un ?", a: "个人选择" },
      { t: "Peut-on rester amis quand on travaille ensemble ?", a: "友谊维持" },
    ],
  },
  {
    title: "Scolarisation des moins de 3 ans : pour ou contre ?",
    source: "www.doctissimo.fr",
    passage: `Le ministère de l'éducation nationale souhaite favoriser l'inscription à l'école des enfants de moins de trois ans. Mais cette décision fait débat. Pour les professionnels de la petite enfance, à deux ans, les enfants sont encore des bébés qui ont des besoins spécifiques : sommeil, attention, protection, affection. Bernard Golse, psychiatre pour enfants, s'oppose à la scolarisation des tout-petits : « À deux ans, les enfants ont bien d'autres choses à faire qu'apprendre ! La scolarisation avant 2 ans et demi n'a aucun sens. » D'un autre côté, la scolarisation à deux ans semble présenter un véritable intérêt sur le développement du langage. Isabelle Ravallier, enseignante, explique : « À l'école, l'enfant va développer son langage en situation, ce qui est très important pour la suite de son développement, mais également pour sa socialisation. » La professionnelle rappelle aussi un autre avantage non négligeable selon elle : « L'école maternelle est gratuite, ce qui est positif. Cela permet aux femmes de travailler plus facilement. »`,
    followUps: [
      { t: "Pour vous, est-ce une bonne idée d'aller à l'école avant trois ans ?", a: "立场" },
      { t: "À quel âge un enfant devrait-il commencer l'école, selon vous ?", a: "观点+理由" },
      { t: "Quels sont les avantages d'aller à l'école très jeune ?", a: "优点" },
      { t: "Est-ce le rôle de l'école ou de la famille de s'occuper des tout-petits ?", a: "责任归属" },
    ],
  },

  // ---------------- page 5 ----------------
  {
    title: "Est-on sérieux quand on s'engage à 17 ans ?",
    source: null,
    passage: `À l'âge du lycée, on a parfois envie de changer le monde. Pourtant, les jeunes se méfient de la politique. Beaucoup de lycéens privilégient des actions protestataires comme la signature de pétitions, les manifestations ou le boycott de produits. Certains décident de s'engager dans des associations humanitaires ou pour l'environnement. C'est le cas de Matéo, 17 ans, qui a rejoint un mouvement citoyen inspiré par Greta Thunberg, une jeune militante écologiste médiatisée à l'âge de 15 ans. « Cela m'a permis de mieux comprendre et de réaliser qu'il est urgent d'agir. Depuis que je me suis engagé, je me sens utile, ça m'évite de culpabiliser. » Pourtant, les jeunes confient qu'ils ne se sentent pas toujours écoutés ou pris au sérieux par les adultes. À un âge perçu comme difficile et instable, cette démarche n'est pas toujours valorisée et peut même sembler suspecte. Les adultes soupçonnent vite les jeunes d'être manipulés, et les parents craignent aussi que cet investissement ne prenne du temps sur les études.`,
    followUps: [
      { t: "Selon vous, les jeunes s'intéressent-ils à la politique ?", a: "观点" },
      { t: "Pensez-vous qu'on est assez sérieux à 17 ans pour s'engager ?", a: "立场" },
      { t: "Vous êtes-vous déjà engagé(e) pour une cause ? Laquelle ?", a: "经历" },
      { t: "Faut-il, selon vous, écouter davantage les jeunes ?", a: "立场" },
    ],
  },
  {
    title: "Lutte contre l'incivisme",
    source: "www.davidlisnard.fr",
    passage: `La nouvelle campagne de communication réalisée par la Mairie de Cannes, dans le cadre de la lutte contre l'incivisme, insiste sur la responsabilité de chacun vis-à-vis du bien commun. Un nouveau message, qui s'accompagne d'un Guide du civisme, pour rappeler les règles élémentaires de respect en collectivité et les mesures mises en place pour inciter à les observer. Parce qu'adopter un comportement civique et transmettre les bons réflexes relève de notre responsabilité à tous. Lutter contre l'incivisme relève d'une volonté forte de défendre et d'améliorer la qualité de vie des Cannois, pour une ville plus agréable à vivre, plus pratique, plus dynamique et prospère, mieux protégée et solidaire et, enfin, fidèle à son identité. Cette lutte devra être transversale et répondre à quatre objectifs : la préservation de l'environnement et des espaces publics ; la propreté des espaces verts, des rues et des quartiers ; la protection des contribuables ; la responsabilité individuelle et la prise de conscience collective d'appartenance à une même communauté.`,
    followUps: [
      { t: "Qu'est-ce qu'un comportement incivique pour vous ? Donnez un exemple.", a: "定义+例子" },
      { t: "L'incivisme est-il un vrai problème dans votre ville ?", a: "现状" },
      { t: "Comment encourager les gens à être plus respectueux ?", a: "措施" },
      { t: "Faut-il punir les incivilités ou plutôt éduquer ?", a: "惩罚 vs 教育" },
    ],
  },
  {
    title: "Les femmes doivent sortir des stéréotypes",
    source: "Le Figaro",
    passage: `La lutte contre les idées reçues est un combat qui dure depuis longtemps, surtout en matière de management. À l'occasion de la journée de la femme, une enquête montre qu'en France, les salariés préfèrent être managés par un homme. Et cette tendance est valable pour les deux sexes, puisque 67 % des hommes et 61 % des femmes partagent cette opinion. Autrement dit : autorité, charisme, leadership, pouvoir (et autres compétences) sont toujours considérés comme des qualités masculines. « Ces résultats sont bien sûr à mettre en perspective avec le faible nombre de femmes managers et avec le fait que, historiquement, les femmes accédant à des postes de responsables empruntaient naturellement les codes de management dits masculins », précise Aline Crépin, responsable de l'étude.`,
    followUps: [
      { t: "Pensez-vous qu'il existe encore des métiers « d'hommes » et des métiers « de femmes » ?", a: "立场" },
      { t: "Préféreriez-vous travailler pour un homme ou une femme ? Pourquoi ?", a: "个人+理由（可中立）" },
      { t: "D'où viennent ces stéréotypes, selon vous ?", a: "成因" },
      { t: "Comment faire changer ces idées reçues ?", a: "措施" },
    ],
  },

  // ---------------- page 6 ----------------
  {
    title: "« On voudrait inviter une femme pilote d'avion à l'école »",
    source: "C'est classe ! — blog de Libération",
    passage: `Dans certaines écoles, les enseignants expliquent en quoi une fille peut faire tous les métiers et un garçon jouer à la dînette ou passer l'aspirateur. Une directrice d'école témoigne : « Pour nous, c'était une évidence, car c'était dans la continuité de ce que nous avions déjà engagé. L'an dernier, on avait lancé des ateliers philo en CM1 et en CM2* autour de thèmes comme : “Peut-on être heureux en faisant tout ce qu'on veut ?”, “Pourquoi doit-on aller à l'école ?” ou “Qu'est-ce que le racisme ?”, pour améliorer le climat scolaire. On avait déjà l'idée de travailler sur les stéréotypes filles-garçons. » Une enseignante se souvient avoir un jour annoncé à sa classe qu'elle ferait bientôt une activité d'accrobranche : « Un élève a alors levé le doigt : “Et les filles, qu'est-ce qu'elles vont faire pendant ce temps-là ?” » D'autres abordent plutôt ce sujet dans leur pratique quotidienne, au fil des disciplines.
* CM1 et CM2 : 4e et 5e années de l'école primaire.`,
    followUps: [
      { t: "Est-ce le rôle de l'école de lutter contre les stéréotypes ?", a: "立场" },
      { t: "Avez-vous remarqué des différences d'éducation entre filles et garçons ?", a: "观察/经历" },
      { t: "Pensez-vous que tous les métiers sont ouverts aux filles comme aux garçons ?", a: "立场" },
      { t: "Comment l'école pourrait-elle mieux traiter ce sujet ?", a: "措施" },
    ],
  },
  {
    title: "Pour ou contre la télémédecine ?",
    source: null,
    passage: `Bientôt, il sera possible de prendre rendez-vous avec un médecin et d'obtenir un diagnostic en ligne, le tout grâce à la « télémédecine ». Ce mot désigne l'ensemble des consultations et des actes médicaux réalisés à distance, au moyen d'un dispositif utilisant les technologies de l'information et de la communication (webcaméra, mail, etc.). La télémédecine est notamment prévue pour améliorer de façon significative l'accès aux soins, surtout dans les régions dites « fragiles », où il y a moins de deux médecins pour 1 000 habitants. D'après une enquête récente, les Français sont très partagés : pour beaucoup de personnes interrogées, ce qui plaide en faveur de la télémédecine, c'est qu'elle permettra au malade de rester chez lui, ou qu'elle offrira un gain de temps et une intervention rapide en cas d'urgence. Mais parmi les principaux freins, beaucoup regrettent le contact direct avec le médecin. Par conséquent, s'ils devaient consulter à distance, ils le feraient essentiellement pour des maladies sans gravité.`,
    followUps: [
      { t: "Seriez-vous prêt(e) à consulter un médecin en ligne ?", a: "个人意愿" },
      { t: "Quels sont, selon vous, les avantages de la télémédecine ?", a: "优点" },
      { t: "Pensez-vous que le contact direct avec le médecin est important ?", a: "立场" },
      { t: "La technologie peut-elle vraiment améliorer la santé ?", a: "观点" },
    ],
  },
  {
    title: "Les robots vont-ils vraiment voler nos emplois ?",
    source: "www.20minutes.fr",
    passage: `« Les pays qui ont le plus de robots sont aussi ceux qui ont le moins de chômage. Alors que les pays sous-équipés en robots sont ceux où l'industrie est la plus faible et où le chômage est le plus élevé », notait le journaliste économique François Lenglet, souhaitant combattre « l'idée selon laquelle les robots créent le chômage ». « Intégrer des robots dans l'industrie, c'est la solution pour maintenir nos emplois industriels ! », estime pour sa part le Syndicat des machines et technologies de production, qui souligne que l'implantation de robots peut augmenter la productivité, donc créer des embauches. Le Forum économique mondial affirmait que 5 millions d'emplois seraient détruits dans le monde du fait de l'apparition des robots dans le monde du travail. Les plus touchés seraient les employés qui réalisent des tâches administratives. Cependant, ce phénomène devrait être compensé par la création de 2,1 millions de nouveaux emplois, principalement dans les domaines spécialisés, tels que l'informatique, les mathématiques et l'ingénierie.`,
    followUps: [
      { t: "Pensez-vous que les robots vont supprimer beaucoup d'emplois ?", a: "立场" },
      { t: "Quels métiers pourraient être remplacés par des robots ?", a: "举例" },
      { t: "Les robots peuvent-ils aussi créer des emplois ?", a: "积极面" },
      { t: "Aimeriez-vous travailler avec des robots ? Pourquoi ?", a: "个人" },
    ],
  },

  // ---------------- page 7 ----------------
  {
    title: "Inégalités de salaire : les Françaises appelées à cesser le travail !",
    source: null,
    passage: `Un collectif féministe appelle les femmes à quitter leur travail ce lundi 7 novembre à 16 h 34, et ce… jusqu'à la fin de l'année. La raison de cette précision dans la date est simple : si l'on se base sur l'écart de salaire moyen entre hommes et femmes, les Françaises travailleront à partir de ce moment « bénévolement » pendant les deux mois restants de l'année, en comparaison avec leurs collègues masculins. Sur Facebook, le collectif a créé un événement pour appeler les « femmes, les hommes, les syndicats et les organisations féministes à rejoindre le mouvement du 7 novembre 16 h 34 » et à multiplier les événements et manifestations pour faire de l'inégalité salariale une problématique politique centrale. Le mouvement s'inspire d'une idée lancée par des Islandaises : le 24 octobre dernier, ces dernières ont quitté le travail à 14 h 38 pour aller manifester devant le Parlement et réclamer, elles aussi, l'égalité de salaire. Espérons que cela permettra enfin d'éveiller les consciences et de faire évoluer la situation.`,
    followUps: [
      { t: "Les inégalités de salaire entre hommes et femmes existent-elles dans votre pays ?", a: "现状" },
      { t: "Comment expliquer ces différences de salaire, selon vous ?", a: "成因" },
      { t: "Que peut-on faire pour réduire ces inégalités ?", a: "措施" },
      { t: "Pensez-vous que les manifestations sont un bon moyen d'agir ?", a: "手段评价" },
    ],
  },
  {
    title: "Espaces verts, espaces chers ?",
    source: "consofutur.com",
    passage: `Le souhait d'avoir des centres-villes plus verts est de plus en plus fort dans les projets des municipalités. Des études scientifiques cherchent aujourd'hui à évaluer précisément les avantages des villes vertes. Le premier, c'est que certaines plantes permettraient de lutter contre la pollution. Un autre effet recherché est la lutte contre les températures élevées dans les zones urbaines denses : l'ombre des arbres limite le réchauffement des surfaces bétonnées et, plus généralement, les plantes rafraîchissent l'air. De plus, les façades végétalisées des immeubles réduisent les nuisances sonores au niveau de la rue. Mais il faut aussi regarder les inconvénients, comme l'augmentation de la circulation des pollens (le nombre de personnes allergiques augmente), la nécessité de réguler les espèces animales invasives, ou encore le coût énorme de ces installations et de leur entretien. Un sondage révèle que, pour plus de 8 Français sur 10, habiter près d'un espace vert est un critère important au moment de choisir leur logement.`,
    followUps: [
      { t: "Pour vous, est-il important d'avoir des espaces verts en ville ?", a: "立场" },
      { t: "Habitez-vous près d'un parc ? Est-ce agréable ?", a: "经历" },
      { t: "La nature en ville coûte cher : qui devrait payer, selon vous ?", a: "成本/责任" },
      { t: "Comment rendre les villes plus vertes ?", a: "措施" },
    ],
  },
  {
    title: "Espèces en voie de disparition",
    source: "France Inter",
    passage: `En France, un peu plus d'un paiement sur deux se fait encore en espèces, mais la monnaie dans nos poches est de plus en plus rare. L'idée de vivre sans monnaie est à la mode : dans un pays comme la Suède, seuls 20 % des achats se font encore en liquide. Notre portefeuille se virtualise et on parle de « moyens de paiement dématérialisés ». En tête, on retrouve la carte bancaire et le paiement sans contact, qui équipe déjà 2/3 des cartes, ainsi que de plus en plus… de smartphones. Car votre futur portefeuille, c'est votre mobile ! Et pour ceux qui n'ont pas accès à un compte bancaire, des solutions se développent heureusement. Exemple : le compte Nickel, qui s'ouvre en quelques minutes dans un bureau de tabac. Et la vie privée ? De ce côté, c'est plutôt mal parti. En témoigne l'annonce faite par le géant Google, qui a exprimé vouloir récolter l'historique des terminaux de paiement aux États-Unis pour améliorer son ciblage publicitaire.`,
    followUps: [
      { t: "Payez-vous plutôt en liquide ou par carte ? Pourquoi ?", a: "个人习惯" },
      { t: "Pensez-vous qu'on pourra bientôt vivre sans argent liquide ?", a: "预测" },
      { t: "Le paiement sans contact pose-t-il un problème de vie privée ?", a: "隐私" },
      { t: "Quels sont les risques d'une société sans argent liquide ?", a: "风险" },
    ],
  },

  // ---------------- page 8 ----------------
  {
    title: "Les étudiants pensent repartir vivre chez leurs parents",
    source: null,
    passage: `Appartements trop petits, loyers trop chers et précarité : les étudiants sont les premières victimes de la crise. Selon l'Observatoire de la vie étudiante, seuls 13 % des étudiants vivent dans des « établissements conçus pour les étudiants » ; le reste se loge sur le marché traditionnel, beaucoup plus cher. Pire, ils seraient 40 % à envisager de retourner vivre dans le cocon familial si leur situation financière ne s'améliore pas. Les étudiants sont ainsi de plus en plus nombreux à exercer un petit boulot pour subvenir à leurs besoins et alléger le poids financier que portent leurs parents. « Avec la crise économique et la montée du coût des études, ils en ont besoin pour vivre. Nous sommes obligés de tenir compte de leur état de fatigue, d'allonger les délais de remise des devoirs, d'enrichir les cours pour qu'ils se suffisent à eux-mêmes », témoigne un maître de conférences. Ces étudiants manquent certains cours pour rejoindre leur travail et leur taux de réussite aux examens s'en trouve sérieusement affecté.`,
    followUps: [
      { t: "Est-il difficile pour les étudiants de se loger dans votre pays ?", a: "现状" },
      { t: "Faut-il travailler pendant ses études, selon vous ?", a: "立场" },
      { t: "Vivre chez ses parents pendant les études : bonne ou mauvaise idée ?", a: "观点" },
      { t: "Comment aider financièrement les étudiants ?", a: "措施" },
    ],
  },
  {
    title: "Le déclin de l'empire masculin ?",
    source: "Télérama",
    passage: `Quel chemin parcouru depuis 1965, quand les femmes devaient obtenir l'autorisation de leur mari pour travailler… Dans Un siècle de travail des femmes en France, 1901-2011, on apprend que les jeunes avocats, magistrats et médecins d'aujourd'hui sont en majorité des femmes ! Même le secteur des ingénieurs se féminise enfin. On retrouve les mêmes progressions de l'activité féminine que dans les autres pays occidentaux, en plus rapide. Personne n'avait prévu cette croissance incroyable. Mais ce sont encore les critères classiques de domination masculine (salaire, pouvoir) qui permettent d'évaluer cette nouvelle « supériorité » féminine. On ne parle pas de bien-être, de carrières plus souples, d'un travail qui pèse moins sur nos vies à tous, d'un meilleur équilibre entre temps professionnel et temps familial. Femmes et hommes mènent une vie aussi épuisante, pas plus adaptés les uns que les autres à l'implacable* économie contemporaine.
* déclin : diminution, baisse. * implacable : d'une dureté qu'on ne peut pas calmer.`,
    followUps: [
      { t: "Pensez-vous que la place des femmes au travail a beaucoup changé ?", a: "观点" },
      { t: "Dans votre pays, les femmes et les hommes sont-ils égaux au travail ?", a: "现状" },
      { t: "Qu'est-ce qu'une réussite professionnelle, pour vous ?", a: "价值观" },
      { t: "Un meilleur équilibre entre travail et vie privée est-il possible ?", a: "立场" },
    ],
  },
  {
    title: "Trop d'argent dans le football ?",
    source: null,
    passage: `Peu de secteurs sont plus visibles, plus commentés et finalement plus critiqués que celui du football. Les droits télévisuels annuels de diffusion des matchs, qui coûtent 652 millions d'euros, ont, par exemple, indigné beaucoup de monde. Pourtant, les sommes collectées participent non seulement à l'entretien du football amateur sur tout le territoire, mais surtout financent le football professionnel. Le football professionnel est une industrie particulièrement concurrentielle et un spectacle de plus en plus coûteux, mais il n'est pas payé par le contribuable. Bien mieux, il génère beaucoup d'argent pour les caisses de l'État : 1,3 milliard d'euros de contributions fiscales et sociales par an. Cependant, une autre question reste particulièrement sensible : le salaire des joueurs. Gagnent-ils trop ? La durée très courte des carrières rend moins importantes les sommes gagnées : sur la durée d'une carrière normale, elles perdent leur caractère exceptionnel. Quand on regarde attentivement, le football apparaît donc pour ce qu'il est : à la fois un sport, un spectacle et une entreprise.`,
    followUps: [
      { t: "Pensez-vous que les footballeurs gagnent trop d'argent ?", a: "立场" },
      { t: "Le sport est-il devenu trop commercial, selon vous ?", a: "观点" },
      { t: "Aimez-vous le football ou un autre sport ? Lequel ?", a: "个人" },
      { t: "L'argent a-t-il une bonne ou une mauvaise influence sur le sport ?", a: "利弊" },
    ],
  },

  // ---------------- page 9 ----------------
  {
    title: "Les limites de la vidéosurveillance",
    source: "www.liberation.fr",
    passage: `De nombreux lycées français seront prochainement équipés de la vidéosurveillance. Ce projet, qui a pour but de renforcer la sécurité dans les établissements scolaires, provoque une grande inquiétude du côté des parents d'élèves, qui s'interrogent sur l'utilisation possible des données et des images ainsi obtenues. « Il est question de les envoyer vers des centres de surveillance urbains, mais qui les observera ? À l'intérieur des établissements, les caméras ne vont pas empêcher qu'il y ait des problèmes avec les élèves et, même, au contraire, peuvent être vues comme une provocation pour certains ! » affirme Nathalie Gaujac, elle-même maman d'une lycéenne. « Sur des cités scolaires très étendues où on ne peut pas mettre partout du personnel, cela peut se comprendre, mais on ne remplacera jamais la présence humaine. On voit bien que les villes ont déjà des caméras partout et pourtant ce n'est pas cela qui fait baisser la délinquance. »`,
    followUps: [
      { t: "Y a-t-il beaucoup de caméras de surveillance dans votre ville ?", a: "现状" },
      { t: "Pensez-vous que les caméras améliorent vraiment la sécurité ?", a: "立场" },
      { t: "La vidéosurveillance pose-t-elle un problème de vie privée ?", a: "隐私" },
      { t: "Préférez-vous des caméras ou plus de personnel humain ?", a: "选择" },
    ],
  },
  {
    title: "Les salariés européens passent trop de temps sur Internet",
    source: null,
    passage: `Les employés européens passent de plus en plus de temps sur Internet au bureau. Un usage, en partie personnel, qui les limite dans leur productivité au travail. En effet, un employé passe, en moyenne, 1,53 heure par jour sur Internet, selon une étude réalisée dans cinq pays européens. La navigation personnelle représente la majorité de ce temps, soit 50 minutes par jour, l'équivalent de 25 jours par an. D'un point de vue financier, ces 50 minutes représenteraient un coût équivalent à 1,2 mois de salaire par an. Au-delà des chiffres, l'étude fait apparaître cinq points importants pour les entreprises : le risque d'impact de la navigation personnelle sur la productivité, les problèmes liés à la sécurité des données de l'entreprise, le ralentissement du débit d'Internet en cas de consultation de sites de vidéos, les risques juridiques et, enfin, les dangers pour l'e-réputation* de l'entreprise en cas de problème.
* e-réputation : image d'une personne ou d'une entreprise sur Internet.`,
    followUps: [
      { t: "Utilisez-vous Internet pour des raisons personnelles au travail ou en cours ?", a: "个人习惯" },
      { t: "Est-ce normal de surfer sur Internet pendant le travail ?", a: "立场" },
      { t: "Les entreprises devraient-elles contrôler l'usage d'Internet ?", a: "管控观点" },
      { t: "Internet nous rend-il plus ou moins productifs ?", a: "利弊" },
    ],
  },
  {
    title: "Un congé paternité obligatoire et plus long",
    source: "www.lefigaro.fr",
    passage: `L'Observatoire français des conjonctures économiques (OFCE) vient de proposer un changement du congé paternité afin de le rendre obligatoire et plus long. « La naissance des enfants augmente les inégalités professionnelles ; les tâches domestiques et familiales sont toujours majoritairement réalisées par les femmes ; celles-ci ne peuvent donc pas profiter du marché du travail de la même façon que les hommes », alerte l'organisme. Ainsi, même si les pères sont aujourd'hui plus nombreux à profiter d'un congé qui dure actuellement 11 jours, la réforme a surtout raccourci la durée du congé maternité pouvant être pris par les mères. C'est pourquoi l'organisme propose cette nouvelle mesure, afin de réduire les inégalités entre les deux sexes. À titre d'exemple, en Norvège, le congé parental est d'une durée d'un an environ : 10 semaines sont réservées à la mère et 10 semaines au père, le reste étant à partager de façon flexible entre les deux parents.`,
    followUps: [
      { t: "Le congé paternité devrait-il être plus long, selon vous ?", a: "立场" },
      { t: "Faut-il rendre le congé paternité obligatoire ?", a: "强制观点" },
      { t: "Qui s'occupe le plus des enfants et de la maison, dans votre pays ?", a: "现状" },
      { t: "Comment mieux partager les tâches entre les parents ?", a: "措施" },
    ],
  },

  // ---------------- page 10 ----------------
  {
    title: "Payer des femmes enceintes pour qu'elles arrêtent de fumer",
    source: null,
    passage: `Rémunérer des femmes enceintes pour les encourager à arrêter de fumer ? Cette approche positive, jugée plus efficace que la culpabilisation, est testée dans seize maternités de France. Aujourd'hui encore, 20 % des femmes enceintes continuent à fumer tout au long de leur grossesse, avec de nombreux risques de complications pour le futur bébé. Pour tenter d'y remédier, ces maternités vont essayer, pour la première fois, de convaincre de futures mamans d'arrêter de fumer en leur offrant des bons d'achat. Un total de 400 femmes enceintes va être recruté : des volontaires, majeures, qui doivent être enceintes de moins de quatre mois et demi et fumer un minimum de cinq cigarettes quotidiennes. Cette méthode est certes étonnante : chercher à récompenser plutôt qu'à éduquer. Le principe serait d'encourager les personnes dépendantes plutôt que de les punir ou de leur faire honte ; il faudrait les accompagner dans leurs difficultés plutôt que de les accuser et de les isoler.`,
    followUps: [
      { t: "Payer les gens pour arrêter de fumer : bonne ou mauvaise idée ?", a: "立场" },
      { t: "Vaut-il mieux récompenser ou punir pour changer un comportement ?", a: "奖 vs 罚" },
      { t: "Comment peut-on aider quelqu'un à arrêter de fumer ?", a: "措施" },
      { t: "L'État doit-il intervenir dans nos habitudes de santé ?", a: "干预观点" },
    ],
  },
  {
    title: "Opéra ma non troppo : l'opéra au cinéma",
    source: "Philippe Herlin",
    passage: `Le Metropolitan Opera de New York a lancé la mode il y a six ans, avec succès : les projections d'opéras en direct dans les salles de cinéma ont trouvé un réel public. Bien sûr, rien ne remplace la présence dans une salle d'opéra, mais l'expérience n'est pas de moins bonne qualité : elle s'avère surtout différente. Le direct confère à l'événement l'excitation de la représentation. Le grand écran nous plonge au cœur de l'action. Les gros plans apportent un regard que même les spectateurs placés au premier rang ne peuvent découvrir. Les sensations sont bien présentes. À environ 28 euros la place, cela en vaut la peine : plus cher qu'une place de cinéma, mais moins qu'une place à l'opéra, ce prix attire un nouveau public. L'initiative est fondamentalement positive : des personnes qui n'avaient pas l'occasion de voir ces spectacles l'auront désormais. Tant mieux ! Mais ces diffusions ne doivent pas être un prétexte à la suppression des places financièrement accessibles dans les salles.
* ma non troppo : en langage musical, littéralement « mais pas trop ».`,
    followUps: [
      { t: "Aimeriez-vous voir un opéra ou un concert au cinéma ?", a: "个人意愿" },
      { t: "Voir un spectacle sur écran, est-ce aussi bien qu'en vrai ?", a: "对比" },
      { t: "La culture est-elle assez accessible à tous, selon vous ?", a: "现状" },
      { t: "Comment rendre la culture moins chère pour tout le monde ?", a: "措施" },
    ],
  },
  {
    title: "Le CV numérique gagne du terrain",
    source: "Matthieu Chaumes, l'Express",
    passage: `Fini le papier, ou presque : c'est en version électronique que le CV fait son apparition. Les réseaux sociaux professionnels s'imposent aussi comme un complément indispensable. Olivier Ballu, directeur d'un cabinet de recrutement, n'est plus habitué à recevoir de candidatures manuscrites : il préfère consulter ses courriels. « C'est l'époque qui veut ça, c'est plus simple et plus rapide », nous explique-t-il. Le CV électronique a fait une victime : la lettre de motivation. Généralement, elle accompagne le CV en pièce jointe, mais elle est beaucoup moins décisive qu'avant. Plus qu'une victoire de l'électronique sur le papier, Internet a permis l'émergence de nouveaux supports pour obtenir un entretien d'embauche. Les réseaux sociaux professionnels ont aujourd'hui la préférence de millions d'utilisateurs. Au-delà d'une présence sur Internet, un candidat peut aussi se créer une page personnelle qu'il laissera en ligne, afin que de futurs employeurs puissent consulter et comparer les différentes candidatures. Le temps est-il venu de dire adieu aux traditionnelles lettres de motivation ?`,
    followUps: [
      { t: "Avez-vous déjà préparé un CV ? Comment l'avez-vous fait ?", a: "经历" },
      { t: "Les réseaux sociaux sont-ils utiles pour trouver un travail ?", a: "观点" },
      { t: "La lettre de motivation est-elle encore utile, selon vous ?", a: "立场" },
      { t: "Faut-il faire attention à ce qu'on publie en ligne quand on cherche un emploi ?", a: "网络形象" },
    ],
  },

  // ---------------- page 11 ----------------
  {
    title: "Une loi pour mannequins difficile à appliquer",
    source: "www.leparisien.fr",
    passage: `Rien n'a changé dans les expositions de mode. Les profils des mannequins* qui défilent pour les plus grandes marques sont toujours les mêmes : les femmes sont très grandes et d'une minceur extrême. Une loi de santé a pourtant été adoptée, dont deux articles sont aujourd'hui connus comme étant la « loi mannequins ». Ces deux articles, attendus depuis longtemps par une grande partie de la population, devaient instituer la mention « photographie retouchée » dans les magazines, ainsi que l'obligation d'une visite médicale et d'un indice de masse corporelle minimal pour les modèles désirant travailler en France. Des mesures pour lutter contre les problèmes de poids et une image de la femme dangereuse pour la santé. Du côté de la profession, le silence est absolu : les grandes agences de mannequins refusent de communiquer. Impossible donc de savoir si elles envisagent de modifier leurs habitudes.
* mannequin : personne qui présente les collections de mode au public en portant des vêtements.`,
    followUps: [
      { t: "La mode donne-t-elle une image irréaliste du corps, selon vous ?", a: "立场" },
      { t: "Faut-il indiquer quand une photo a été retouchée ?", a: "观点" },
      { t: "La mode a-t-elle une influence sur la façon dont on se voit ?", a: "影响" },
      { t: "Comment protéger la santé des mannequins ?", a: "措施" },
    ],
  },
  {
    title: "L'art pour tous : emprunter une œuvre d'art",
    source: "france3-regions.francetvinfo.fr",
    verify: true,
    passage: `Mettre l'art à la portée de tous, c'est la devise de l'artothèque municipale de Grenoble. On peut y entrer, décrocher un tableau du mur et repartir avec. À vrai dire, n'importe qui ne peut pas emprunter : il faut tout de même montrer sa carte d'abonné pour adopter une œuvre de son choix, trois au maximum pour trois mois. Trois mois, c'est peu pour que l'art se diffuse sur tous les murs, mais rien ne vous empêche, si vous vous êtes attaché à une œuvre, de la ramener puis de la reprendre à nouveau, plus tard. Il n'y a pas que les particuliers qui peuvent en profiter, mais aussi les écoles et les maisons de retraite. Mais est-on prêt à emprunter une œuvre d'art à l'époque où l'on télécharge toute la culture : livres, films, musique ?`,
    followUps: [
      { t: "Aimeriez-vous emprunter une œuvre d'art pour la mettre chez vous ?", a: "个人意愿" },
      { t: "Pensez-vous que l'art est accessible à tout le monde ?", a: "现状" },
      { t: "Comment donner aux gens l'envie d'aimer l'art ?", a: "措施" },
      { t: "Préférez-vous voir l'art dans un musée ou chez vous ?", a: "偏好" },
    ],
  },
  {
    title: "Ville ou campagne ?",
    source: "20 minutes",
    passage: `« Cela dépend de qui on est et de quelle vie on veut mener », prévient Jean-François Buet, président de la Fédération nationale des agents immobiliers. « Est-ce qu'on veut pouvoir s'occuper de son jardin et écouter les petits oiseaux ? Ou est-ce qu'on veut aller au théâtre et avoir une pharmacie dans sa rue ? » La campagne a de quoi séduire : l'environnement est plus calme et on accède aux espaces verts dès qu'on pose un pied dehors. Mais cette situation risque de ne pas convenir à tout le monde. « Si vous essayez de faire vivre un ado dans une zone où le Wi-Fi ne passe pas, vous risquez de vous heurter à des situations conflictuelles », plaisante Jean-François Buet. Mais il faut aussi s'attendre à ne pas accéder aux commerces aussi facilement qu'en ville et à mettre plus de 15 minutes en voiture pour aller faire les boutiques. Et côté ville ? En moyenne, les Parisiens passent 1 h 16 dans le métro ou leur voiture chaque jour, et 22 % des habitants d'Île-de-France sont exposés à un niveau de bruit supérieur aux valeurs réglementaires.`,
    followUps: [
      { t: "Préférez-vous vivre en ville ou à la campagne ? Pourquoi ?", a: "立场+理由" },
      { t: "Quels sont, pour vous, les avantages de la vie en ville ?", a: "优点" },
      { t: "La vie à la campagne est-elle plus agréable, selon vous ?", a: "观点" },
      { t: "Où aimeriez-vous vivre plus tard ?", a: "个人计划" },
    ],
  },

  // ---------------- page 12 ----------------
  {
    title: "Vers un développement du télétravail",
    source: "Les Échos",
    passage: `Le télétravail ne doit plus être réservé au seul secteur privé. Alors que le ministre de l'Industrie invite une nouvelle fois les entreprises à développer les possibilités de travail à distance, on cherche aussi à lancer le mouvement dans le secteur public. L'objectif est de trouver un cadre permettant à des personnes de travailler de manière régulière depuis chez elles. Le ministre voit beaucoup de vertus au télétravail, un « outil d'équilibre des territoires » qui peut « améliorer les conditions de travail des salariés. Il entraîne plus de concentration, plus de flexibilité dans l'organisation des journées, une meilleure répartition entre vie professionnelle et vie privée », ce qui doit aussi permettre « d'améliorer la place et le rôle de la femme ». Afin, toutefois, de ne pas trop « isoler » le salarié, le ministre veut limiter le télétravail à deux ou trois jours par semaine au maximum et garantir sa réversibilité*. Il a, de plus, assuré que le télétravail ne se ferait que sur la base du volontariat.
* réversibilité : ici, fait de revenir sur une décision déjà prise.`,
    followUps: [
      { t: "Le télétravail devrait-il être possible dans tous les secteurs, même public ?", a: "立场" },
      { t: "Combien de jours par semaine peut-on télétravailler sans s'isoler ?", a: "观点+量度" },
      { t: "Le télétravail aide-t-il à mieux séparer vie professionnelle et vie privée ?", a: "利弊" },
      { t: "Le télétravail doit-il rester un choix, jamais une obligation ?", a: "自愿原则" },
    ],
  },
  {
    title: "Qui aime les Jeux olympiques ?",
    source: null,
    passage: `On sait maintenant que Paris organisera les Jeux olympiques en 2024, mais une minorité de personnes convaincues s'opposent encore et toujours à cette décision. Depuis quelques années, ces opposants se font entendre et s'élèvent contre l'organisation des Jeux à Paris. Le collectif « Non aux JO 2024 à Paris » s'inscrit dans une démarche citoyenne et demande l'opinion du peuple. Frédéric Viale, un des porte-paroles de ce mouvement, voit trois raisons à l'opposition du collectif aux Jeux olympiques : le coût, l'écologie et la démocratie. « Les JO vont coûter très cher, comme tous les autres, et c'est nous qui paierons ; cela va détruire des forêts et augmenter la circulation ! Et puis, plus grave, personne ne nous a demandé notre avis ! Les citoyens devraient pouvoir décider, cela les concerne », dit-il. Cette opinion semble partagée partout dans le monde, puisque de moins en moins de pays se portent candidats pour l'organisation de cette grande fête du sport. Est-ce bientôt la fin du rêve olympique ?`,
    followUps: [
      { t: "Aimez-vous regarder les Jeux olympiques ? Pourquoi ?", a: "个人" },
      { t: "Pensez-vous que les JO coûtent trop cher ?", a: "立场" },
      { t: "Les grands événements sportifs sont-ils bons pour une ville ?", a: "利弊" },
      { t: "Faut-il demander l'avis des citoyens pour ce genre de projet ?", a: "民主观点" },
    ],
  },
  {
    title: "CoÉcrire : l'école des robots où les instituteurs sont les enfants",
    source: "RFI",
    passage: `Des chercheurs suisses ont mis au point un programme numérique et pédagogique nommé CoÉcrire, qui permet aux enfants de prendre la place de leur professeur, avec pour objectif d'apprendre à écrire à des robots. Ce programme s'inspire d'une méthode pédagogique que l'on peut résumer par « apprendre en enseignant ». Nao, l'androïde conçu par la société française Aldebaran, reçoit des cours d'écriture donnés par les enfants et prend le rôle du dernier de la classe, celui qui a besoin d'aide. Les jeunes élèves lui montrent comment écrire des lettres correctement sur une tablette. En s'appliquant à corriger les erreurs d'écriture du robot, la méthode bénéficie avant tout aux élèves, en les obligeant à former correctement les lettres qu'ils sont en train d'enseigner. CoÉcrire est au stade du prototype : il a été employé dans des classes du primaire auprès de 70 élèves âgés de 6 à 8 ans. Malheureusement, nous ne savons pas si Nao, qui n'est qu'une machine, sait maintenant lire et écrire grâce à ses jeunes professeurs.`,
    followUps: [
      { t: "Pensez-vous qu'on apprend mieux en enseignant aux autres ?", a: "立场" },
      { t: "Les robots ont-ils leur place à l'école, selon vous ?", a: "观点" },
      { t: "Aimeriez-vous apprendre quelque chose à un robot ?", a: "个人" },
      { t: "La technologie aide-t-elle vraiment les enfants à apprendre ?", a: "利弊" },
    ],
  },

  // ---------------- page 13 ----------------
  {
    title: "L'école inversée",
    source: "internetactu.blog.lemonde.fr",
    passage: `Dans le mouvement dit de « l'école inversée », les enseignants enregistrent leurs cours en vidéo et les élèves les regardent sur leur smartphone ou chez eux. Surtout, ils les regardent plusieurs fois sans avoir peur de passer pour des imbéciles. Et puis, la classe devient un lieu d'activité, dans un rapport direct entre l'enseignant et les élèves. Ce qui permet aux enseignants d'identifier beaucoup plus vite ceux qui n'ont pas compris. Évidemment, il y aurait, dans le détail, beaucoup à discuter dans cette « école inversée » qui exige des enseignants plus de créativité et d'énergie ; mais il y a quelque chose de très intéressant du point de vue de l'usage des technologies : d'un côté, on pousse jusqu'au bout la logique de leur place dans la vie des élèves ; mais ce renversement produit, paradoxalement, une disparition de la technologie en classe. La classe devient alors le lieu de la parole, des questions, du dialogue. C'est comme si l'utilisation de la technologie à la maison replaçait l'humain à l'école. Qui s'en plaindrait ?`,
    followUps: [
      { t: "Que pensez-vous de l'idée de regarder les cours en vidéo à la maison ?", a: "立场" },
      { t: "Préférez-vous écouter un cours ou faire des exercices en classe ?", a: "偏好" },
      { t: "La technologie a-t-elle une bonne place dans l'éducation ?", a: "观点" },
      { t: "Cette méthode pourrait-elle marcher dans votre pays ?", a: "可行性" },
    ],
  },
  {
    title: "La déconnexion, enfin un droit pour les employés",
    source: null,
    passage: `Dans un monde où nous sommes tous connectés, il n'est pas rare de répondre aux courriels professionnels à toute heure de la journée, y compris le week-end. Ainsi, les problèmes liés à la fatigue professionnelle ont augmenté. En France, plus de 12 % de la population active est touchée par ce phénomène, qui n'est pas reconnu comme maladie professionnelle. Une très large majorité de dirigeants d'entreprises ayant réclamé des règles pour l'usage des outils numériques en dehors du travail, le « droit à la déconnexion » est donc né. « La loi n'exige pas des employés qu'ils éteignent leur téléphone professionnel en rentrant chez eux, ni que les sociétés arrêtent de leur envoyer des courriels. Ce ne serait pas adapté à une entreprise qui travaille à l'international. Il n'y a pas de mode d'emploi précis : ce sont les entreprises qui doivent trouver des solutions adaptées. Un responsable peut, par exemple, vérifier que ses employés respectent ce principe de déconnexion », précise Patrick Thiébart, avocat.`,
    followUps: [
      { t: "Répondez-vous aux messages du travail le soir ou le week-end ?", a: "个人习惯" },
      { t: "Devrait-on avoir le droit de se déconnecter du travail ?", a: "立场" },
      { t: "Être toujours connecté, est-ce mauvais pour la santé ?", a: "健康观点" },
      { t: "Qui doit fixer les règles : l'État ou l'entreprise ?", a: "责任归属" },
    ],
  },
  {
    title: "Les crèches d'entreprise",
    source: "Le Figaro",
    passage: `PME* et grands groupes multiplient les actions et les services innovants afin de trouver des solutions d'accueil pour les enfants de leurs collaborateurs. Une manière de contourner l'embouteillage toujours plus dense aux portes des crèches : seul un enfant de moins de 3 ans sur neuf a aujourd'hui une place dans ces structures ! Les entreprises mesurent mieux l'importance d'une politique favorisant la conciliation entre vie professionnelle et vie familiale. Elles y trouvent un moyen de fidéliser leurs salariés, de lutter contre l'absentéisme et les congés parentaux prolongés, de motiver l'esprit de groupe et d'améliorer ainsi la productivité. « Les collaborateurs sont plus investis dans leur travail, l'entreprise a tout à y gagner. C'est un investissement social et humain », estiment-elles. Cette logique répond par ailleurs à une très forte demande des parents salariés : 97 % d'entre eux estiment que l'équilibre entre ces différents temps est un sujet de préoccupation majeur et 53 % choisissent en priorité les crèches d'entreprise comme service à mettre en place.
* PME : Petites et Moyennes Entreprises.`,
    followUps: [
      { t: "Est-ce une bonne idée que les entreprises ouvrent des crèches ?", a: "立场" },
      { t: "Est-il difficile de trouver un mode de garde pour les enfants ?", a: "现状" },
      { t: "Comment mieux concilier travail et vie de famille ?", a: "措施" },
      { t: "Les entreprises doivent-elles aider les parents qui travaillent ?", a: "责任观点" },
    ],
  },

  // ---------------- page 14 ----------------
  {
    title: "La femme au foyer est de retour",
    source: "www.letemps.ch",
    passage: `Les femmes, qui travaillent aujourd'hui massivement, ont parcouru un long chemin pour obtenir l'égalité des chances. Néanmoins, un nouveau mouvement les a surprises : les femmes au foyer, qui s'intéressent davantage aux recettes de cuisine qu'à la dernière action féministe. Parmi elles, Hélène Bonhomme et son blog, dont le succès lui permet d'écrire de petits articles pour un hebdomadaire français. « Osez dire que vous êtes au foyer, et vous êtes soudain ignorée. Les gens ont une vision négative des tâches maternelles », raconte cette mère de deux enfants. En réalité, ce serait plutôt le contraire : « En période de crise, renvoyer les femmes à la maison permet de réduire le chômage, d'assurer des soins gratuits, d'éviter d'installer des crèches. On rappelle discrètement, à travers des messages, que les plats maison sont meilleurs pour la santé, que les loisirs créatifs sont importants pour l'éducation des enfants… des activités qui prennent du temps et maintiennent la femme à la maison avec l'illusion que c'est utile », constate l'historienne Anne Rothenbühler.`,
    followUps: [
      { t: "Que pensez-vous du choix de rester à la maison pour s'occuper des enfants ?", a: "立场" },
      { t: "Ce choix devrait-il concerner seulement les femmes, selon vous ?", a: "性别角色" },
      { t: "Le travail à la maison (tâches ménagères) est-il assez reconnu ?", a: "观点" },
      { t: "Pensez-vous qu'on juge trop les mères au foyer ?", a: "社会评判" },
    ],
  },
  {
    title: "La journée des parents au bureau",
    source: "www.cbnews.fr",
    passage: `Un réseau social professionnel a lancé à l'échelle mondiale une idée qui a de quoi surprendre : la Journée des parents au bureau. Cette initiative a pour but d'encourager les entreprises du monde entier à ouvrir leurs portes aux parents de leurs collaborateurs, afin de leur faire découvrir, de l'intérieur, la vie professionnelle de leurs enfants. « Nous travaillons pour rendre nos proches fiers de nous. La plupart des salariés sont ici parce que leurs parents les ont soutenus », explique un jeune employé. Cet événement annuel a été lancé en 2013, suite à la publication d'une étude mondiale qui révélait que plus d'un parent sur trois ne comprenait pas le métier de son enfant. De plus, 50 % des salariés pensent que leurs parents ont encore des compétences professionnelles et des conseils à leur transmettre. Et si cette journée était aussi une manière de transmettre un message positif autour de l'âge et de valoriser les seniors ?`,
    followUps: [
      { t: "Vos parents comprennent-ils bien votre travail ou vos études ?", a: "个人" },
      { t: "Est-ce une bonne idée d'inviter ses parents au bureau ?", a: "立场" },
      { t: "Les parents ont-ils encore des conseils utiles à donner sur le travail ?", a: "观点" },
      { t: "Faut-il mieux valoriser les personnes âgées dans la société ?", a: "社会态度" },
    ],
  },
  {
    title: "La folie des textos",
    source: "huffingtonpost.fr",
    verify: true,
    passage: `Nous vivons aujourd'hui à une époque où il suffit de cliquer sur un bouton pour communiquer. Nos messages sont presque toujours instantanés : par téléphone, par messagerie, etc. Notre société est la plus connectée de l'histoire de l'humanité, mais sans doute de manière superficielle. Pendant la journée, il nous arrive souvent de regarder notre téléphone et de prendre le temps de lire nos messages, mais nous n'avons pas toujours le temps d'y répondre. Pourtant, l'attente d'une réponse est devenue presque insupportable et peut même être prise comme une insulte. Avant, nous attendions que notre interlocuteur réponde à son rythme ; cela devient aujourd'hui impossible. Faut-il mesurer l'attachement que l'on a pour ses amis en fonction de notre temps de réponse aux SMS ? Autrefois, ne menions-nous pas une vie bien pleine en dehors des smartphones et des réseaux sociaux ? Ou sommes-nous désormais branchés en permanence sur nos téléphones, à vérifier régulièrement nos messages, sans pour autant avoir le temps d'y répondre de façon aussi satisfaisante que nous le souhaiterions ?`,
    followUps: [
      { t: "Répondez-vous tout de suite à vos messages ? Pourquoi ?", a: "个人习惯" },
      { t: "Pensez-vous qu'on passe trop de temps sur son téléphone ?", a: "立场" },
      { t: "Les textos ont-ils changé notre façon d'être amis ?", a: "影响" },
      { t: "Pourrait-on vivre aujourd'hui sans smartphone ?", a: "假设/反思" },
    ],
  },

  // ---------------- page 15 ----------------
  {
    title: "Une entreprise sans courriel ?",
    source: "www.leparisien.fr",
    passage: `Dans certaines entreprises, un vendredi par mois, le mail est remplacé par le téléphone et les discussions orales. « Si tout le monde reçoit moins de courriels ce jour-là, c'est moins de stress pour le week-end et lors du retour au travail le lundi matin, puisqu'il y a moins de réponses », souligne le directeur d'une entreprise parisienne qui, comme plusieurs autres entreprises en France, limite l'usage de la messagerie électronique à ses salariés pour les aider à mieux communiquer. Il n'est évidemment pas question de supprimer les courriels : c'est juste un moyen de faire de la pédagogie sur leurs avantages et leurs inconvénients. « Vouloir toujours tout faire immédiatement et par écrit n'est pas toujours bon. Répondre trop vite à trop de gens à la fois engendre parfois des dégâts importants », souligne le patron. « Des malentendus peuvent être évités quand c'est dit de vive voix. » Cette déconnexion ne fait pourtant pas l'unanimité auprès des employés, qui ont l'impression de perdre du temps.`,
    followUps: [
      { t: "Envoyez-vous beaucoup de courriels ou de messages chaque jour ?", a: "个人习惯" },
      { t: "Préférez-vous communiquer par écrit ou de vive voix ?", a: "偏好" },
      { t: "Trop de courriels, est-ce une source de stress, selon vous ?", a: "立场" },
      { t: "Une journée sans messagerie au travail : bonne idée ?", a: "观点" },
    ],
  },
  {
    title: "La perche à selfie",
    source: "Libération",
    verify: true,
    passage: `Le selfie était le mot de l'année 2013, la perche à selfie l'invention de 2014, et elle fait beaucoup parler d'elle en 2015. La perche à selfie incarne deux problèmes contemporains du mauvais goût photographique : le tourisme et le narcissisme. Pourtant, la pratique du selfie n'est pas si narcissique qu'il n'y paraît. Le selfie est avant tout une pratique conversationnelle, une documentation de l'instant. Tourné vers soi, l'autoportrait au smartphone est en fait davantage orienté vers Internet : il constitue plus un discours sur l'environnement extérieur (« je suis ici / avec ») que sur soi-même. La haine de la perche à selfie témoigne aussi de notre rapport à la technologie : nous l'adulons, mais nous détestons qu'elle soit visible. On peste devant la marée de smartphones dans les concerts, on refuse de voir apparaître les téléphones à table. La technologie est toujours plus puissante, mais doit être toujours moins visible. La perche à selfie semble traverser cette tendance et montrer que nous aimons la technologie et les accessoires, malgré tout.
* selfie : autoportrait, en général fait au smartphone.`,
    followUps: [
      { t: "Aimez-vous prendre des selfies ? Pourquoi ?", a: "个人" },
      { t: "Pensez-vous que les selfies sont un signe de narcissisme ?", a: "立场" },
      { t: "Utilise-t-on trop son smartphone dans les lieux publics ?", a: "观点" },
      { t: "La technologie occupe-t-elle trop de place dans notre vie ?", a: "反思" },
    ],
  },
  {
    title: "L'information sur Internet",
    source: "huffingtonpost.fr",
    passage: `Les erreurs factuelles, volontaires ou non, circulent aujourd'hui facilement sur Internet. Or, les pratiques informationnelles, notamment des plus jeunes, sont essentiellement liées à leurs usages d'Internet et des réseaux sociaux. Il convient donc d'interroger la manière dont les jeunes consomment, analysent, s'approprient et créent les informations qui circulent sur le web, car les fausses informations se propagent à grande vitesse à cause des réseaux sociaux. Le gouvernement devrait s'intéresser davantage à cette problématique et voter des lois pour protéger les internautes ; toutefois, plusieurs questions se posent. Certains y voient une menace pour la liberté d'expression et questionnent l'impact réel d'un tel dispositif : il paraît dangereux de penser pouvoir contrôler les contenus publiés sur Internet. D'autres moyens d'agir existent, notamment l'éducation de tous à l'information et aux outils numériques, en particulier des futurs citoyens. L'esprit critique est une compétence essentielle du citoyen du 21e siècle : analyser une source, mettre en perspective l'information, en extraire l'essentiel, prendre du recul sur les contenus, s'interroger et s'approprier la démarche journalistique sont autant de savoirs indispensables.`,
    followUps: [
      { t: "Où cherchez-vous vos informations : Internet, télévision, journaux ?", a: "个人习惯" },
      { t: "Comment savoir si une information est vraie ou fausse ?", a: "方法" },
      { t: "Faut-il contrôler ce qui se publie sur Internet ?", a: "立场" },
      { t: "L'école doit-elle apprendre à utiliser l'information ?", a: "教育观点" },
    ],
  },

  // ---------------- page 16 ----------------
  {
    title: "Garez-vous bien, vous êtes filmés !",
    source: "Mathias Galante, Le Parisien",
    verify: true,
    passage: `Garer sa voiture en double file pour aller boire un café ou acheter sa baguette devient de plus en plus risqué pour le porte-monnaie* dans le centre-ville de plusieurs villes du sud de la France. Un dispositif de vidéo-verbalisation, qui permet de sanctionner d'une amende les adeptes de ce mode de stationnement anarchique, s'étend dans certaines villes. Des caméras pilotées par des agents installés au centre de supervision de la police municipale surveillent les voitures mal garées. Les conducteurs qui détestent les embouteillages du centre-ville vont apprécier, mais ce n'est pas le cas de tous les commerçants. « Pour le trafic routier, c'est une bonne chose, mais pour mes affaires, non. Il y a du monde dans mes magasins et mes clients se garent en double file. Il faudrait une marge de tolérance de cinq à dix minutes », explique ce boulanger. « Et puis, les caméras qui remplacent les personnes, c'est mauvais pour le contact humain. » On peut également se demander jusqu'où ira la vidéosurveillance.
* porte-monnaie : ici, l'argent que l'on possède.`,
    followUps: [
      { t: "Les caméras sont-elles un bon moyen de faire respecter les règles ?", a: "立场" },
      { t: "Le stationnement est-il un problème dans votre ville ?", a: "现状" },
      { t: "Faut-il punir ou plutôt prévenir les petites infractions ?", a: "惩罚 vs 预防" },
      { t: "Y a-t-il trop de caméras dans l'espace public, selon vous ?", a: "观点" },
    ],
  },
  {
    title: "Une nouvelle formule pour combattre le chômage chez les jeunes",
    source: "huffingtonpost.fr",
    passage: `L'Union européenne doit aider les jeunes. En effet, la crise économique a provoqué une forte augmentation du chômage parmi eux et, bien que la situation change peu à peu, aujourd'hui encore presque un jeune sur cinq se trouve sans emploi. Dans ce contexte, les jeunes demandent aux gouvernements de leurs pays respectifs de prendre des mesures pour améliorer les systèmes d'apprentissage. Cependant, ces dernières ne sont pas toujours mises en place. C'est pourquoi la Commission européenne a décidé de les aider. Pour cela, elle a annoncé le début de l'initiative « Erasmus Pro », qui permet à des jeunes de partir faire leur formation dans un autre pays de l'Union européenne. Ce programme devrait donc permettre aux jeunes Européens de réaliser non seulement une partie, mais aussi, s'ils le souhaitent, l'ensemble de leur formation dans un autre pays. Mais cette initiative provoquerait-elle une fuite des jeunes vers l'étranger, comme certains le craignent ?`,
    followUps: [
      { t: "Le chômage des jeunes est-il un problème dans votre pays ?", a: "现状" },
      { t: "Partir se former à l'étranger : bonne idée pour trouver un emploi ?", a: "立场" },
      { t: "Que peut-on faire pour aider les jeunes à trouver du travail ?", a: "措施" },
      { t: "Faut-il craindre que les jeunes partent travailler à l'étranger ?", a: "人才外流" },
    ],
  },

  // ---------------- page 17 ----------------
  {
    title: "Journée sans voiture",
    source: null,
    passage: `C'est aujourd'hui la journée sans voiture : toute la capitale sera interdite aux automobilistes et aux utilisateurs de motos ou de scooters. Une Parisienne, en promenade sur les quais de Seine, approuve l'initiative de la municipalité. « Paris, c'est une merveille sans voiture. Il serait souhaitable que l'on arrive de plus en plus, pour notre santé à tous et pour celle de nos enfants, à éviter tous ces pots d'échappement qui polluent », dit-elle. Pour ce groupe de jeunes amis à vélo, la capitale offre des possibilités de déplacement sans la voiture. « Les transports en commun sont déjà une très belle alternative », estime l'un d'eux. « Marcher, ça permet de faire du sport au lieu de polluer », souligne un autre. Cette opération ne fait cependant pas l'unanimité. Pour Pierre Chasseray, de l'association 40 Millions d'automobilistes, le vélo n'est pas adapté à tout le monde : « C'est bien qu'il y ait des gens qui fassent du vélo, mais ils n'ont pas de mallette et ne sont pas en costume-cravate », dit-il.`,
    followUps: [
      { t: "Que pensez-vous des journées sans voiture en ville ?", a: "立场" },
      { t: "Comment vous déplacez-vous le plus souvent ? Pourquoi ?", a: "个人习惯" },
      { t: "Faut-il limiter la voiture dans les centres-villes ?", a: "观点" },
      { t: "Les transports en commun sont-ils une bonne alternative à la voiture ?", a: "评价" },
    ],
  },
  {
    title: "Caissières contre caisses automatiques",
    source: "AgoraVox",
    passage: `Deux camps s'affrontent : l'un pour prétendre que les caisses automatiques vont permettre une plus grande satisfaction du client (rapidité), et l'autre que ce système automatisé va mettre à la porte un grand nombre de travailleurs. Réfléchissons à ce problème, qui symbolise une des contradictions majeures de notre époque : la rentabilité fera toujours préférer la machine à l'homme dans toutes les tâches difficiles et répétitives. Mais les emplois sont menacés par ces machines, qui leur enlèvent peu à peu leur travail. Pourtant, ces travaux sont difficiles, souvent ennuyeux et épuisants, physiquement et moralement. En théorie, nous devrions tous nous réjouir de la suppression de tous ces travaux pénibles ; en théorie, cette suppression devrait permettre soit plus de loisirs, soit la création d'emplois plus attrayants. Mais, en pratique, cette suppression engendre chômage et précarité, désocialisation et tout ce qui s'ensuit.`,
    followUps: [
      { t: "Utilisez-vous les caisses automatiques dans les magasins ?", a: "个人习惯" },
      { t: "Les machines vont-elles supprimer beaucoup d'emplois, selon vous ?", a: "立场" },
      { t: "Préférez-vous être servi par une personne ou par une machine ?", a: "偏好" },
      { t: "Comment protéger les emplois face aux machines ?", a: "措施" },
    ],
  },
  {
    title: "Écouter de la musique au travail rend plus productif",
    source: "nrjob.com",
    passage: `En 1972, une étude avait déjà montré que les personnes qui écoutaient de la musique au travail avaient un taux de performance et de productivité plus élevé. Une autre étude, de 2015, révèle les bienfaits que la musique apporte en termes de concentration et d'efficacité. La musique permet notamment de s'isoler des environnements de travail trop bruyants et nuisant à la concentration (bureaux partagés, notamment) et de favoriser la concentration. Selon le type de musique écoutée et son volume, différentes zones du cerveau sont stimulées. Néanmoins, la musique a également des effets négatifs, car écouter de la musique en travaillant implique nécessairement une division des ressources cérébrales, qui peut nuire à la performance. Toute la subtilité d'une écoute de musique efficace consiste donc à trouver un bon équilibre et à savoir sélectionner des musiques ne sollicitant pas trop les aptitudes cognitives. Certains types de musique sont davantage adaptés à certaines activités. Les managers seront-ils désormais moins réticents à laisser leurs équipes mettre leur casque pendant les heures de travail ?`,
    followUps: [
      { t: "Écoutez-vous de la musique quand vous travaillez ou étudiez ?", a: "个人习惯" },
      { t: "La musique vous aide-t-elle à vous concentrer ?", a: "个人体验" },
      { t: "Devrait-on pouvoir écouter de la musique au travail ?", a: "立场" },
      { t: "Dans quels moments la musique peut-elle déranger ?", a: "辩证" },
    ],
  },

  // ---------------- page 18 ----------------
  {
    title: "Succès controversé du soutien scolaire en ligne",
    source: "Estelle Maussion, La Croix",
    passage: `Vidéos explicatives, tests en tout genre, visioconférence avec un professeur : l'offre de soutien scolaire sur Internet se développe de plus en plus. Le succès de ces sites s'explique par l'essor des cours privés et par un univers familier et ludique pour les enfants. De plus, il profite directement du développement des nouvelles technologies à l'école. Le soutien scolaire sur Internet présente de nombreux avantages : des leçons à la carte, des disponibilités interactives 24 heures sur 24, pour des coûts variés. « Internet peut être un support de qualité », reconnaît le directeur de l'Iredu (Institut de recherche sur l'éducation), « mais la question de l'efficacité des cours se pose : il semble effectivement difficile de maintenir l'attention de l'élève devant l'écran et de vérifier que l'interaction lui est profitable. » Le directeur met également en garde contre un risque de creusement* des inégalités scolaires : « Les cours particuliers classiques sont très utilisés par les familles aisées ; cette méthode virtuelle est plus utilisée par les familles les plus modestes. »
* creusement : approfondissement.`,
    followUps: [
      { t: "Avez-vous déjà utilisé un site de soutien scolaire ou des cours en ligne ?", a: "经历" },
      { t: "Le soutien scolaire en ligne est-il efficace, selon vous ?", a: "立场" },
      { t: "Tout le monde a-t-il les mêmes chances face à ces outils ?", a: "公平" },
      { t: "Comment aider les élèves en difficulté ?", a: "措施" },
    ],
  },
  {
    title: "Pour un « droit à l'oubli » sur le Net",
    source: "Damien Leloup, Le Monde",
    verify: true,
    passage: `Certains prônent* la possibilité d'effacer les données personnelles des adolescents, au nom de la protection de l'enfance. Et si l'on pouvait, en quelques clics, faire disparaître d'Internet les photos, les messages un peu idiots et autres contenus que l'on a publiés à l'adolescence — le plus souvent sans avoir conscience qu'ils resteraient accessibles des années plus tard ? C'est l'une des propositions présentées par la défenseure des enfants, qui s'occupe de défendre leurs droits. Pour protéger les plus jeunes, elle recommande une série de mesures pédagogiques et la mise en place d'un véritable « droit à l'oubli », qui permettrait d'obtenir l'effacement de données à caractère personnel que la personne avait rendues disponibles lorsqu'elle était enfant. Mais la création de ce droit à l'oubli est loin de faire l'unanimité : les opposants voient d'un mauvais œil la mise en place d'un cadre juridique lourd, avec des objectifs jugés irréalisables et des coûts trop élevés.
* prôner : recommander.`,
    followUps: [
      { t: "Faut-il pouvoir effacer ce qu'on a publié sur Internet quand on était jeune ?", a: "立场" },
      { t: "Faites-vous attention à ce que vous publiez en ligne ?", a: "个人习惯" },
      { t: "Internet n'oublie rien : est-ce un problème, selon vous ?", a: "观点" },
      { t: "Comment protéger les jeunes sur Internet ?", a: "措施" },
    ],
  },
  {
    title: "Moins productif à cause des téléphones ?",
    source: "lci.fr",
    passage: `Le développement d'Internet et des smartphones a eu pour effet d'augmenter le temps passé à travailler en dehors de nos horaires de bureau et le sentiment d'urgence, notamment en nous rendant joignables en permanence. Mais, paradoxalement, ces changements technologiques ont eu aussi pour effet de nous rendre moins productifs. Pour parvenir à ce constat, des chercheurs ont demandé à 95 personnes, de 19 à 56 ans, de se livrer à un test de concentration dans quatre situations différentes sur leur lieu de travail : avec leur smartphone dans la poche, puis posé sur leur bureau, enfermé dans un tiroir, et enfin totalement retiré de la pièce. Les résultats ont montré que les participants étaient d'une productivité beaucoup plus faible lorsque le smartphone se trouvait sur le bureau. À l'inverse, chaque fois que celui-ci s'éloignait de son propriétaire, l'effet sur ses performances au travail était immédiat : 26 % plus productif. C'est pourquoi beaucoup d'entreprises essaient aujourd'hui d'interdire les téléphones intelligents dans les bureaux.`,
    followUps: [
      { t: "Votre téléphone vous distrait-il quand vous travaillez ?", a: "个人体验" },
      { t: "Pourriez-vous travailler sans votre smartphone à côté de vous ?", a: "假设" },
      { t: "Les entreprises devraient-elles interdire les téléphones au bureau ?", a: "立场" },
      { t: "Comment mieux se concentrer aujourd'hui, selon vous ?", a: "措施" },
    ],
  },

  // ---------------- page 19 ----------------
  {
    title: "Consultez votre médecin sur Internet",
    source: null,
    passage: `La télémédecine, qui permet la consultation à distance, va se banaliser pour répondre aux problèmes médicaux des régions peu peuplées et améliorer le suivi des malades. « Il ne faut pas avoir une vision caricaturale : la télémédecine, ce n'est pas “je vais sur un site et j'ai un médecin qui me fait mon diagnostic et envoie l'ordonnance” », souligne-t-on dans l'entourage de la ministre de la Santé. La télémédecine veut, en effet, « répondre à un vrai besoin quand l'offre de soins n'y répond pas bien, éviter le déplacement des patients, améliorer l'accès aux soins et le suivi des pathologies chroniques », précise-t-on. La télémédecine ne s'exercera que sur contrat avec les autorités nationales ou avec l'Agence régionale de santé (ARS), dans des zones où l'accès aux médecins est difficile, et donc probablement dans des structures de regroupement médicales bien équipées, plutôt que chez les médecins de ville. Certains médecins s'inquiètent, par ailleurs, du processus de rémunération, qui pourrait varier d'une région à l'autre et induire « une insupportable injustice pour les médecins, mais également pour les patients ».`,
    followUps: [
      { t: "Est-il facile de voir un médecin là où vous habitez ?", a: "现状" },
      { t: "La télémédecine peut-elle aider les régions où il y a peu de médecins ?", a: "立场" },
      { t: "Consulter un médecin à distance : en quoi est-ce différent ?", a: "对比" },
      { t: "Quelles maladies pourrait-on soigner à distance, selon vous ?", a: "举例" },
    ],
  },
  {
    title: "Vacances : attention aux informations publiées en ligne",
    source: null,
    passage: `Enfin les vacances ! C'est le bon moment pour prendre du temps en famille et se reposer. Mais attention : annoncer à tout le monde, sur les réseaux sociaux, qu'on s'en va passer des vacances à l'étranger, c'est la porte ouverte à tous les problèmes ! Un selfie devant le Colisée de Rome ou la Tour Eiffel confirmera à vos amis, à leurs amis et aux amis de vos amis que vous n'êtes plus chez vous. On prend alors le risque que ces informations tombent entre de mauvaises mains : une personne pourrait bien visiter votre appartement en votre absence et repartir avec vos objets de valeur. Pire encore, certaines personnes comptent les jours restant avant un départ et publient des messages comme « trois nuits avant le départ ». C'est informer tout le monde qu'on ne sera pas à la maison. Alors, pourquoi prendre autant de précautions pour protéger sa maison lors d'un départ en vacances et ne plus en prendre sur les réseaux sociaux ?`,
    followUps: [
      { t: "Publiez-vous des photos de vacances sur les réseaux sociaux ?", a: "个人习惯" },
      { t: "Partager sa vie en ligne, est-ce dangereux, selon vous ?", a: "立场" },
      { t: "Quelles précautions prenez-vous pour protéger votre vie privée ?", a: "措施" },
      { t: "Pensez-vous qu'on partage trop de choses sur Internet ?", a: "观点" },
    ],
  },
  {
    title: "Si le tourisme profite du patrimoine, il doit payer pour son entretien",
    source: "AFP",
    verify: true,
    passage: `Doubler les tarifs d'entrée des musées pour les touristes non européens, augmenter la taxe de séjour, autoriser les musées à vendre des œuvres : le Conseil d'analyse économique (CAE) a présenté des propositions parfois inattendues pour le patrimoine culturel français. Ce rapport, intitulé « Valoriser le patrimoine culturel français », propose de nombreuses pistes, dont certaines sont susceptibles de surprendre une partie du monde culturel, mais aussi certains acteurs économiques. Des professeurs d'économie préconisent un « tarif différencié entre visiteurs français et étrangers (hors UE), comme cela se pratique dans de nombreux pays ». Les auteurs ne sont pas favorables à une gratuité généralisée dans les musées très fréquentés. Ils sont favorables à une tarification variable en fonction de l'heure d'entrée dans le musée et de la période de l'année. Enfin, le rapport suggère d'autoriser à céder certaines œuvres, selon une procédure très encadrée, pour que le revenu de la vente serve à acquérir de nouvelles œuvres.`,
    followUps: [
      { t: "Les touristes devraient-ils payer plus cher pour visiter les musées ?", a: "立场" },
      { t: "Les musées devraient-ils être gratuits pour tout le monde ?", a: "观点" },
      { t: "Comment financer l'entretien des monuments et des musées ?", a: "措施" },
      { t: "Le tourisme est-il bon ou mauvais pour le patrimoine ?", a: "利弊" },
    ],
  },

  // ---------------- page 20 ----------------
  {
    title: "Santé : vivre plus, c'est vivre mieux ?",
    source: "Jean-Yves Nau, Le Monde",
    passage: `L'espérance de vie augmente, mais les hommes et les femmes vivent-ils plus longtemps en bonne santé et en conservant leur autonomie ? Peut-on quantifier la qualité de l'espérance de vie ? Tel est l'objectif que s'était fixé un groupe de chercheurs travaillant dans le cadre de l'Observatoire européen des espérances de santé. Les résultats de ce travail original, coordonné par un directeur de recherche à l'Institut national français de la santé et de la recherche médicale, ont été publiés récemment. Cette recherche visait notamment à préciser quelle était l'espérance de vie moyenne dite « sans incapacité » des personnes âgées de 50 ans et plus. Ce travail scientifique soulève une série de questions : vivre plus longtemps veut-il dire conserver une bonne qualité de vie ? Les gouvernements doivent-ils retarder l'âge de la retraite ? Comment conserver un bon état de santé en même temps qu'on prolonge la durée de vie ?`,
    followUps: [
      { t: "Vivre longtemps ou vivre en bonne santé : qu'est-ce qui compte le plus pour vous ?", a: "价值观" },
      { t: "Comment rester en bonne santé en vieillissant ?", a: "措施" },
      { t: "Faut-il retarder l'âge de la retraite, selon vous ?", a: "立场" },
      { t: "Comment la société peut-elle mieux s'occuper des personnes âgées ?", a: "社会措施" },
    ],
  },
  {
    title: "La pharmacie en ligne légalisée",
    source: "AFP, Le Point",
    verify: true,
    passage: `La vente en ligne de médicaments en libre accès a désormais un cadre légal. La ministre de la Santé a présenté un texte pour encadrer cette pratique, à la condition que la vente soit effectuée à partir du site Internet d'une pharmacie. Cette activité « n'est autorisée que pour les pharmaciens » et devra être exercée « en conformité avec les dispositions du Code de déontologie et avec les bonnes pratiques de dispensation par Internet ». Mais l'Ordre national des pharmaciens n'a cessé de mettre le gouvernement en garde. « Le médicament n'est pas un bien de consommation ordinaire », a rappelé l'Ordre. Dans ce document critique, l'Ordre estime également : « Rien ne peut remplacer le conseil relatif au médicament donné en face à face par le pharmacien. » Au-delà de la sécurité du patient, l'Ordre s'inquiète de la confidentialité des données, de la falsification des médicaments, du non-respect des règles de la profession et de l'automédication des personnes. Après les courses en ligne, la santé en ligne ?`,
    followUps: [
      { t: "Achèteriez-vous des médicaments sur Internet ?", a: "个人意愿" },
      { t: "Le conseil du pharmacien est-il important, selon vous ?", a: "立场" },
      { t: "Acheter des médicaments en ligne : quels sont les risques ?", a: "风险" },
      { t: "Peut-on tout acheter sur Internet ?", a: "反思" },
    ],
  },
  {
    title: "Vidéosurveillance dans l'entreprise : jusqu'où peut-on épier les salariés ?",
    source: "Laurence Neuer, Le Point",
    verify: true,
    passage: `Lors d'un contrôle dans une entreprise de transport, la Commission nationale de l'informatique et des libertés a ordonné l'interruption immédiate d'un dispositif de vidéosurveillance : les salariés étaient filmés en permanence à leur poste de travail. « Cette surveillance permanente n'était justifiée par aucun motif de sécurité ou de lutte contre des dégradations matérielles », reproche la Commission. Plusieurs sanctions pécuniaires* ont aussi été prononcées, notamment à l'encontre d'une société de prêt-à-porter qui a, sous couvert de lutte contre le vol, installé des caméras pour filmer les salariés de façon permanente, y compris dans des lieux où aucune marchandise n'était stockée, et sans les en avoir informés. La Commission a aussi rappelé à l'ordre une société qui filmait les salariés dans des espaces de repos : une mesure excessive par rapport à l'objectif de protection des personnes et des biens. Certains employés réclament l'enlèvement de ces caméras, estimant qu'elles représentent une atteinte à leur vie privée.
* pécuniaire : relatif à l'argent.`,
    followUps: [
      { t: "Filmer les salariés au travail, est-ce acceptable, selon vous ?", a: "立场" },
      { t: "Où s'arrête le droit d'une entreprise de surveiller ses employés ?", a: "界限" },
      { t: "Vous sentiriez-vous à l'aise, filmé(e) toute la journée au travail ?", a: "个人感受" },
      { t: "Comment protéger la vie privée des salariés ?", a: "措施" },
    ],
  },

  // ---------------- page 21 ----------------
  {
    title: "Rêvez-vous d'un bureau comme à la maison ?",
    source: "Floriane Salgues, L'Express",
    passage: `« On peut travailler efficacement dans des espaces qui ne soient pas des prisons. Et pourquoi pas même allongé dans l'herbe », s'amusait Alain Iribarne, directeur de recherche au Centre national de la recherche scientifique. Sous la plaisanterie pointe l'idée que l'on pourrait se sentir au travail comme à la maison. Le précepte semble tantôt utopique, tantôt néfaste. Quelques entreprises ont pourtant tenté le défi : espaces ouverts avec des arbres, salons silencieux, salle de gym. Le bureau comme à la maison apparaît comme l'une des nouvelles armes anti-stress. Mais pas pour Nathalie Menez, directrice des services généraux d'un groupe de santé, qui trouve même le terme « choquant ». « Les salariés n'apprécient pas forcément de retrouver sur leur lieu de travail les meubles qu'ils peuvent avoir chez eux. Derrière le concept, il y a un risque de confusion, car non, au travail, je ne suis pas à la maison », explique-t-elle. L'architecte préfère favoriser des « bulles personnelles » : des aménagements cloisonnés pour favoriser le travail au calme.`,
    followUps: [
      { t: "Dans quel type d'espace aimez-vous travailler ou étudier ?", a: "个人偏好" },
      { t: "Faut-il que le bureau ressemble à la maison, selon vous ?", a: "立场" },
      { t: "Comment rendre un lieu de travail plus agréable ?", a: "措施" },
      { t: "Vaut-il mieux séparer le travail et la vie privée ?", a: "观点" },
    ],
  },
  {
    title: "La fête des voisins : à quoi sert cette fête ?",
    source: null,
    verify: true,
    passage: `La fête des voisins est devenue, depuis sa création en 2000, un rendez-vous incontournable. C'est une occasion festive et conviviale de rencontrer ceux et celles qui vivent tout près de chez nous. On se retrouve avec les habitants de son immeuble ou de sa rue, un jour par an, fin mai ou début juin, pour faire plus ample connaissance autour d'un verre ou d'un buffet : cette idée simple rencontre un succès grandissant et répond à un vrai besoin de convivialité. Qu'on le veuille ou non, nous avons tous des voisins ! Ils peuvent être sympathiques et serviables, indifférents ou désagréables, souriants ou bruyants. Mais nous savons bien qu'entretenir de bonnes relations de voisinage facilite la vie au quotidien. Le but est également de rompre l'anonymat et l'isolement qui existent souvent dans nos villes. Mais si une soirée de fête dans l'année est l'occasion de nouer ou de renouer le contact avec ses voisins et incite à les respecter, cela peut-il vraiment permettre d'instaurer une solidarité de proximité ?`,
    followUps: [
      { t: "Connaissez-vous bien vos voisins ?", a: "个人现状" },
      { t: "Est-il important d'avoir de bonnes relations avec ses voisins ?", a: "立场" },
      { t: "Une fête des voisins est-elle une bonne idée, selon vous ?", a: "观点" },
      { t: "Comment lutter contre l'isolement dans les villes ?", a: "措施" },
    ],
  },
  {
    title: "Ce n'est pas la violence des jeux vidéo qui rend agressif",
    source: null,
    verify: true,
    passage: `On ne compte plus le nombre d'études qui se concentrent sur le lien entre jeux vidéo violents et agressivité des joueurs. Certaines personnes n'hésitent pas à affirmer que ces jeux génèrent de « véritables monstres » ; d'autres études soulignent un impact sur le comportement. Mais inutile de dramatiser : certains spécialistes démentent tout lien entre la violence des jeux vidéo et les comportements agressifs. On pourrait croire qu'une nouvelle étude sur ce thème ne ferait que répéter les mêmes arguments, parfois contradictoires. Pourtant, une récente expérience révèle que les comportements violents des joueurs seraient liés non pas au contenu violent du jeu, mais aux difficultés rencontrées par le joueur dans ce jeu. Autrement dit, l'agressivité viendrait surtout de la frustration que l'on ressent lorsqu'on a du mal à comprendre un jeu ou lorsqu'on perd. La difficulté du jeu aurait donc davantage d'influence sur le comportement que son contenu.`,
    followUps: [
      { t: "Jouez-vous aux jeux vidéo ? Lesquels ?", a: "个人" },
      { t: "Pensez-vous que les jeux vidéo rendent violent ?", a: "立场" },
      { t: "Les jeux vidéo ont-ils aussi de bons côtés ?", a: "积极面" },
      { t: "Faut-il limiter le temps passé sur les jeux vidéo ?", a: "观点" },
    ],
  },

  // ---------------- page 22 ----------------
  {
    title: "Faut-il noter les professeurs ?",
    source: null,
    passage: `En France, cela se pratique surtout dans les écoles de commerce : les professeurs et leurs interventions y sont notés par les étudiants. Dans une école de Grenoble, pour chaque cours, les étudiants doivent remplir un questionnaire d'évaluation anonyme, avec 11 questions au total. D'abord sur le cours lui-même, ensuite sur le professeur : pédagogie, connaissances, préparation ou dynamisme. La direction de l'école assure que c'est seulement un indicateur, pas un motif de renvoi d'un enseignant ; il n'y a pas de classement des intervenants. Et pour empêcher que les étudiants échangent une évaluation positive contre une bonne note, le système comporte quelques garanties : les élèves doivent évaluer leurs professeurs avant d'obtenir leurs notes, et les professeurs n'ont pas connaissance de leurs évaluations avant de rendre leurs copies. Les étudiants de première année sont surpris de devoir noter leurs profs, mais finalement, 90 % d'entre eux répondent et approuvent cette méthode. Les enseignants, eux, se demandent si leurs étudiants ont la compétence et la maturité pour juger leur travail.`,
    followUps: [
      { t: "Les élèves devraient-ils pouvoir noter leurs professeurs ?", a: "立场" },
      { t: "Les élèves sont-ils capables de juger un bon professeur ?", a: "辩证" },
      { t: "Qu'est-ce qu'un bon professeur, pour vous ?", a: "标准" },
      { t: "Comment améliorer la qualité de l'enseignement ?", a: "措施" },
    ],
  },
  {
    title: "Le congé de paternité bientôt obligatoire ?",
    source: "L'Express",
    passage: `Les jeunes papas pourraient devenir beaucoup plus nombreux à s'occuper de leur bébé juste après sa naissance si le congé paternité devenait obligatoire. Une idée à laquelle le gouvernement se dit favorable, pour diminuer les inégalités hommes-femmes. Depuis le 1er janvier 2002, les pères ont le droit de prendre onze jours de congé paternité (18 en cas de naissances multiples), qui s'ajoutent aux trois jours d'absence accordés pour une naissance. Bien que l'employeur ne puisse pas refuser ce congé, rémunéré par la Sécurité sociale, seulement deux tiers des pères y ont recours. Cette mesure « permettrait de rétablir un regard plus égalitaire sur les jeunes parents ». Pour le ministère, un congé obligatoire permettrait de « casser la discrimination qui sévit dans l'entreprise » et de « casser un stéréotype : les hommes sont aussi capables de s'occuper de leurs enfants ». Et ce n'est qu'un début : il faudra envisager qu'il soit plus long et mieux rémunéré, et s'attaquer au congé parental (trois ans maximum), qui éloigne souvent durablement les femmes du marché du travail.`,
    followUps: [
      { t: "Les hommes devraient-ils prendre autant de congé que les femmes à la naissance d'un enfant ?", a: "立场" },
      { t: "Pourquoi, selon vous, peu de pères prennent ce congé ?", a: "成因" },
      { t: "Rendre ce congé obligatoire : bonne idée ?", a: "强制观点" },
      { t: "Comment partager plus justement les tâches familiales ?", a: "措施" },
    ],
  },
  {
    title: "Faut-il changer radicalement les systèmes éducatifs ?",
    source: "Le Nouvel Observateur",
    verify: true,
    passage: `La Webacadémie, un organisme presque unique en France, a pour but de sauver des jeunes déscolarisés, passionnés d'ordinateurs, de jeux vidéo et de programmes informatiques. Rien à voir avec l'école classique : à la Webacadémie, ambiance détendue, animateurs peu classiques et rock en fond sonore. Les jeunes se lèvent quand ils veulent et peuvent travailler en groupe, selon le mode et le rythme voulus (l'école est même ouverte la nuit), pour devenir en deux ans développeurs internet. David, un élève, témoigne : « J'avais laissé tomber le lycée parce que je trouvais le milieu trop strict, conventionnel, infantilisant. Pourtant, j'avais de la rigueur : j'étais capable de passer toute une nuit à réparer un ordinateur ! Mais quand on ne rentre pas dans le moule*, on est immédiatement taxé de mauvais élève. Ici, c'est fini, le rapport classique prof / élève : on est traités comme des adultes responsables. » À une époque où les jeunes qui décrochent de l'école sont de plus en plus nombreux, faut-il s'intéresser davantage à ce genre d'initiative ?
* rentrer dans le moule : faire comme tout le monde, être conforme.`,
    followUps: [
      { t: "L'école classique convient-elle à tous les élèves ?", a: "立场" },
      { t: "Pourquoi certains jeunes quittent-ils l'école, selon vous ?", a: "成因" },
      { t: "Faut-il changer la façon d'enseigner aujourd'hui ?", a: "观点" },
      { t: "Comment garder les jeunes motivés à l'école ?", a: "措施" },
    ],
  },

  // ---------------- page 23 ----------------
  {
    title: "Danger des écrans : quelles solutions ?",
    source: "www.franceinter.fr",
    passage: `Anne-Lise Ducanda, médecin à Paris, constate des symptômes chroniques chez les moins de quatre ans qui passent plusieurs heures par jour sur des tablettes ou des smartphones : ce sont souvent des enfants renfermés sur eux-mêmes, qui ne la regardent pas quand elle leur parle, qui ont des retards de langage, des troubles du sommeil, etc. Et le plus frappant, c'est qu'il suffit de conseiller aux parents de couper l'accès aux écrans pour que les choses s'arrangent. Les parents à qui le docteur Ducanda en parle lui répondent tous : « Pourquoi ne nous a-t-on rien dit ? » Elle tient à ne surtout pas les culpabiliser, car la plupart ne pensent pas à mal : ils occupent leur enfant avec une tablette le temps de préparer le dîner. Ils ne s'imaginaient pas que c'était aussi dangereux et se posent deux questions essentielles : « Faut-il faire une différence entre les écrans ? » et « Comment limiter l'exposition des enfants aux écrans dans le monde d'aujourd'hui ? »`,
    followUps: [
      { t: "Les enfants passent-ils trop de temps devant les écrans, selon vous ?", a: "立场" },
      { t: "À partir de quel âge un enfant peut-il utiliser une tablette ?", a: "观点" },
      { t: "Comment limiter le temps d'écran des enfants ?", a: "措施" },
      { t: "Les écrans ont-ils aussi des avantages pour les enfants ?", a: "辩证" },
    ],
  },
  {
    title: "Quels rapports entre les jeunes et le travail en 2030 ?",
    source: "Les Échos",
    passage: `Les jeunes générations veulent appartenir à une entreprise qui correspond à leur mode de vie et qui est en phase avec leurs valeurs. Ainsi, la notion de « devoir travailler » risque de disparaître au profit d'un emploi qui a du sens. Il existe chez les jeunes générations un désir d'engagement très fort : pour elles, un travail utile est un travail d'intérêt général, qui apporte de réels changements à la société. Ainsi, le poste et le salaire ne suffiront plus seuls à motiver les jeunes. Et puisque le business se fera différemment, il faudra gérer l'humain autrement. Les futures générations veulent un manager 2.0*, bienveillant, qui sait faire confiance, laisser de l'autonomie et reconnaître le travail de ses collaborateurs. La pression constante des résultats et la multiplication des flux d'information exigent un manager capable de prendre du recul et soucieux du bien-être de ses équipes. Ainsi, le manager autoritaire devrait disparaître au profit d'un patron plus humain et inspirant.
* manager 2.0 : dirigeant moderne, à l'aise avec les nouvelles technologies.`,
    followUps: [
      { t: "Qu'attendez-vous le plus d'un travail : un bon salaire ou un travail qui a du sens ?", a: "价值观" },
      { t: "Un bon chef, comment est-il, selon vous ?", a: "标准" },
      { t: "Pensez-vous que les jeunes voient le travail autrement que leurs parents ?", a: "代际对比" },
      { t: "Le travail occupe-t-il trop de place dans la vie aujourd'hui ?", a: "反思" },
    ],
  },
  {
    title: "Les séries télé méritent-elles un tel succès ?",
    source: null,
    passage: `Inutile de se scandaliser, c'est un fait : les séries télé fascinent un très grand nombre de personnes, jusqu'à être désormais même étudiées à l'université. Comment donc justifier une telle fascination ? Certaines personnes ont donné leur opinion. Marie : « Au cinéma, les personnages sont souvent des héros fantasmés. Ils sont beaux, riches, puissants, et vivent des situations très éloignées de notre vie quotidienne. Au contraire, les séries télé présentent généralement des préoccupations et des cadres de vie qui nous sont familiers, et ce, quotidiennement. Cela crée un sentiment de complicité et de familiarité. » Loïc : « Franchement, j'ai du mal à comprendre, avec des scénarios souvent bêtes et simplistes, pourquoi elles ont autant de succès et pourquoi les gens perdent leur temps à les regarder. C'est peut-être par manque de communication avec leur entourage que certaines personnes finissent par devenir accros aux séries : de cette manière, elles peuvent partager leurs problèmes et leurs aspirations. Mais n'y aurait-il pas alors un remède plus intelligent ? »`,
    followUps: [
      { t: "Regardez-vous des séries télé ? Lesquelles aimez-vous ?", a: "个人" },
      { t: "Pourquoi les séries ont-elles autant de succès, selon vous ?", a: "成因" },
      { t: "Peut-on apprendre quelque chose en regardant des séries ?", a: "辩证" },
      { t: "Passe-t-on trop de temps devant les écrans, selon vous ?", a: "立场" },
    ],
  },

  // ---------------- page 24 ----------------
  {
    title: "Et si l'on prenait du temps pour soi ?",
    source: "Marie-Christine Deprund, L'Express",
    passage: `C'est le mot d'ordre du psychiatre Laurent Schmitt, qui publie un ouvrage où il rappelle ce besoin essentiel : retrouver « son temps intime », celui que l'on consacre à soi-même et non pas aux autres ou aux exigences du travail. Nous avons complètement changé de temporalité. On voit des touristes multiplier frénétiquement les visites, des mères accumuler les activités culturelles et sportives dans l'emploi du temps des enfants, des couples gérer des agendas sociaux. Nous avons transformé notre rapport au temps, au point de le concevoir désormais comme un bien matériel, un objet de consommation : on le gagne, on le comptabilise, on le rentabilise. À force d'être disponible pour tous — patron, famille, clients, amis —, on a oublié de l'être pour soi. La prise de conscience se fait souvent lors d'un arrêt obligatoire (maladie, chômage, divorce, retraite) qui provoque une cassure et oblige à reconsidérer toute l'organisation de l'existence. Alors, avant de craquer, prêt à vous faire plaisir et à prendre votre temps ?`,
    followUps: [
      { t: "Prenez-vous assez de temps pour vous ?", a: "个人现状" },
      { t: "Manque-t-on de temps dans la vie moderne, selon vous ?", a: "观点" },
      { t: "Que faites-vous pour vous détendre ?", a: "个人" },
      { t: "Comment trouver un meilleur équilibre dans sa vie ?", a: "措施" },
    ],
  },
  {
    title: "Louer un ami local",
    source: "Le Figaro",
    passage: `Faire du tourisme dans une ville inconnue est toujours plus agréable en compagnie d'une personne qui en connaît tous les secrets. Mais comme ce n'est pas toujours possible, une jeune femme, Alice Moura, a eu l'idée de proposer les services d'« amis locaux ». Elle a donc créé un site Internet sur lequel vous pouvez louer un ami local ! Le coût varie selon les villes : 60 euros à Paris, 80 euros à Milan, 77 dollars à Rio de Janeiro et 90 dollars à San Francisco. Ce service fonctionne aujourd'hui dans 15 villes comme Paris, New York, Barcelone, Shanghai et New Delhi, grâce à 27 « amis locaux » qui parlent tous au moins une langue étrangère et proposent des circuits personnalisés. Pour « l'ami local », c'est un travail d'appoint*, mais cela ne fait vivre personne, souligne Alice Moura. « C'est bien plus pour se distraire que pour gagner de l'argent. » De fait, dans de nombreux cas, l'ami local est devenu un véritable ami, selon elle. Alors, dans ce cas, pourquoi le payer ?
* travail d'appoint : travail qui permet de compléter un salaire.`,
    followUps: [
      { t: "Aimeriez-vous visiter une ville avec un « ami local » ?", a: "个人意愿" },
      { t: "Peut-on devenir vraiment ami avec quelqu'un qu'on paie ?", a: "辩证" },
      { t: "Comment préférez-vous découvrir une nouvelle ville ?", a: "偏好" },
      { t: "Que pensez-vous de ces nouveaux services sur Internet ?", a: "观点" },
    ],
  },
  {
    title: "Les covacances, un nouveau moyen pour partir pas cher",
    source: null,
    passage: `Ils ne se connaissent pas, mais n'hésitent pas à partir en vacances ensemble. Cette tendance, en plein essor, est liée à un souci d'économie, mais aussi au désir d'éviter la solitude. Un tour-opérateur et un site Internet sont désormais consacrés à cette nouvelle formule. Les covacances, déclinaison estivale de la colocation et du covoiturage, existaient déjà, mais, avec le lancement de forums et de sites Internet, le phénomène est monté en puissance. Une agence de voyage explique : « On recevait de plus en plus de courriers de clients qui en avaient marre de payer le supplément réservé aux personnes seules. On a donc décidé de leur proposer une solution. » Jusqu'ici, seuls quelques dizaines de groupes sont partis, car la formule ne va pas de soi : n'est-il pas risqué de partir avec des inconnus ? Les agences de voyages sont là pour éviter les mésaventures et n'hésitent pas à rappeler qu'en plus des motivations économiques, cela peut être une occasion de faire de nouvelles rencontres.`,
    followUps: [
      { t: "Partiriez-vous en vacances avec des inconnus ?", a: "个人意愿" },
      { t: "Quels sont les avantages et les risques de cette formule ?", a: "利弊" },
      { t: "Préférez-vous voyager seul, en famille ou en groupe ?", a: "偏好" },
      { t: "Internet a-t-il changé notre façon de voyager ?", a: "观点" },
    ],
  },

  // ---------------- page 25 ----------------
  {
    title: "Je consomme, donc je suis",
    source: "Elle",
    passage: `Depuis trente ans, la société de consommation conditionne les habitants des pays développés à acheter toujours plus, et il est très difficile de s'extraire de cette offre. Presque malgré eux, les consommateurs sont entraînés dans une course effrénée* pour posséder le dernier portable. Malgré tous les discours sur l'être, l'avoir est devenu une valeur : consommer rassure sur le fait que l'on est vivant et agit comme un pansement sur les doutes existentiels. Mais, depuis peu, les psychologues alertent l'opinion publique sur les effets négatifs de ces achats futiles*. Selon eux, il existerait un vrai contentement à ne pas consommer et à être ainsi dans la réalité de soi-même, plutôt que dans l'illusion d'être heureux grâce à la consommation. Décider de ne pas acheter un produit et s'apercevoir ensuite qu'il ne nous manque pas, renoncer à s'offrir un livre parce que sa bibliothèque est pleine d'ouvrages qu'on n'a pas lus… autant d'exemples qui procureraient plus de plaisir que de consommer.
* effréné : excessif. * futile : superficiel.`,
    followUps: [
      { t: "Pensez-vous qu'on achète trop de choses aujourd'hui ?", a: "立场" },
      { t: "Acheter rend-il vraiment heureux, selon vous ?", a: "观点" },
      { t: "Avez-vous déjà renoncé à acheter quelque chose ? Comment l'avez-vous vécu ?", a: "经历" },
      { t: "Comment consommer de façon plus raisonnable ?", a: "措施" },
    ],
  },
  {
    title: "La grande illusion du coaching en ligne",
    source: "David Abiker, L'Express",
    verify: true,
    passage: `Les personnes pouvant nous aider à gérer notre quotidien en ligne sont nombreuses : des sites pour faire connaissance, améliorer son potentiel de séduction ou préparer son mariage existent. Ils racontent la vitalité commerciale d'Internet et l'étendue de notre détresse relationnelle et sentimentale. Ils disent également combien la société du coaching* commercial a remplacé, plus ou moins avantageusement, les références et les hiérarchies d'autrefois. Qu'il s'agisse d'apprendre, de maigrir, de se soigner, de grandir ou de se confier, Internet nous apporte un substitut. De l'autre côté de l'écran, l'internaute solitaire s'imagine peut-être que le succès et la performance relationnelle sont à portée de souris. Bien entendu, le client se fabrique des illusions : illusion d'apprendre à séduire vite fait, d'aimer sans risque, d'écouter sans se tromper, de divorcer sans se ruiner, de vivre sans souffrir. Le Net organise la promesse d'une réussite émotionnelle et relationnelle avec les mêmes outils marketing que la réservation en ligne de billets d'avion. Quand saurons-nous dire stop ?
* coaching : accompagnement individuel.`,
    followUps: [
      { t: "Peut-on vraiment apprendre à mieux vivre grâce à des sites Internet ?", a: "立场" },
      { t: "Demandez-vous parfois conseil sur Internet ?", a: "个人习惯" },
      { t: "Internet peut-il remplacer l'aide d'une vraie personne ?", a: "辩证" },
      { t: "Pourquoi, selon vous, ces sites ont-ils du succès ?", a: "成因" },
    ],
  },
  {
    title: "Le téléphone portable à l'école",
    source: "www.20minutes.fr",
    verify: true,
    passage: `L'utilisation du téléphone portable ne facilite pas l'apprentissage, mais entraîne au contraire une diminution de l'attention et de la mémorisation chez les élèves. À la récréation, au lieu de se parler, les élèves jouent à des jeux vidéo. Si tout le monde semble d'accord sur la nécessité d'une interdiction des portables dans l'enceinte des collèges, la manière de la mettre en œuvre pose question : casiers individuels ? tiroirs à l'entrée des classes ? L'interdiction complète est compliquée. « Dans mon collège, nous avions fait un travail d'éducation pour insister auprès des élèves sur les excès à éviter. Nous avions aussi demandé aux parents de nous aider à contrôler une utilisation raisonnable du portable. Cela avait plutôt été efficace », indique un professeur. « Tout commence par la famille. On ne peut pas interdire à un enfant ce dont nous sommes nous-mêmes incapables de nous passer. » Mais sommes-nous prêts à donner l'exemple et à nous déconnecter réellement ?`,
    followUps: [
      { t: "Faut-il interdire le téléphone portable à l'école ?", a: "立场" },
      { t: "Le téléphone empêche-t-il les jeunes de se parler ?", a: "观点" },
      { t: "À quel âge un enfant devrait-il avoir un téléphone ?", a: "观点" },
      { t: "Les adultes donnent-ils le bon exemple, selon vous ?", a: "反思" },
    ],
  },

  // ---------------- page 26 ----------------
  {
    title: "Les quotas de parité doivent-ils s'appliquer dans les entreprises ?",
    source: "Pascale Weil, Le Monde",
    verify: true,
    passage: `Le problème est bel et bien réel : les femmes, malgré leur niveau d'instruction, restent sous-représentées dans les instances dirigeantes, sont les premières sacrifiées dans la crise et sont les plus sujettes aux inégalités de rémunération. Les causes sont connues : leur sous-représentation dans certains métiers, leur maternité à l'âge où les hauts potentiels sont identifiés, sans oublier que les femmes osent moins que les hommes demander des promotions. Mais les quotas sont-ils la solution à ces inégalités ? En effet, l'entreprise poursuit un projet économique et, pour cela, elle est en droit de fonctionner selon des critères de compétitivité qui lui permettent de gagner dans la concurrence. Pourquoi devrait-elle refléter toute la société ? Peut-être parce qu'elle se présente comme un lieu où il fait bon travailler, pour attirer les meilleurs. L'entreprise a besoin de diversité : mais laquelle, et comment ? La parité est-elle le critère de diversité le plus pertinent ?`,
    followUps: [
      { t: "Y a-t-il assez de femmes aux postes de direction, selon vous ?", a: "现状" },
      { t: "Les quotas sont-ils une bonne solution pour plus d'égalité ?", a: "立场" },
      { t: "Pourquoi y a-t-il moins de femmes aux postes importants ?", a: "成因" },
      { t: "Comment rendre le monde du travail plus égalitaire ?", a: "措施" },
    ],
  },
  {
    title: "Le port de l'uniforme, une contrainte pour les filles ?",
    source: "www.slate.fr",
    verify: true,
    passage: `À chaque fois que le débat sur le port de l'uniforme à l'école revient, on évite systématiquement de parler des problèmes qu'il pose en ce qui concerne les filles et les garçons. Même si certaines écoles françaises, ayant déjà imposé l'uniforme à leurs élèves, ont choisi une tenue neutre, beaucoup de personnes pensent que les filles devraient nécessairement porter une jupe. Or, une fille en jupe, dans une cour de récréation, à la cantine ou dans les allées de son école, va être perçue dans son corps et son genre, ce qui va déterminer la façon dont elle va se comporter dans l'espace. Imposer la jupe obligatoire aux fillettes et aux jeunes femmes les oblige à adopter une certaine attitude, ce qui est totalement contradictoire avec l'objectif du port de l'uniforme, censé offrir les mêmes conditions à tous à l'école.`,
    followUps: [
      { t: "Êtes-vous pour ou contre l'uniforme à l'école ?", a: "立场" },
      { t: "L'uniforme rend-il les élèves plus égaux, selon vous ?", a: "观点" },
      { t: "Filles et garçons devraient-ils porter la même tenue ?", a: "性别平等" },
      { t: "Que portiez-vous à l'école ? Aviez-vous le choix ?", a: "经历" },
    ],
  },
  {
    title: "Devenir végétarien, est-ce raisonnable ?",
    source: "www.letemps.ch",
    verify: true,
    passage: `De nombreux adolescents et jeunes adultes décident aujourd'hui de ne plus consommer de produits issus des animaux ou de leur exploitation, principalement par convictions écologiques. De plus en plus de restaurants proposent des produits qui s'adaptent à ce style de vie. Cependant, un tel régime demande de bonnes connaissances en diététique, car il peut provoquer des problèmes de santé ; c'est pourquoi il est déconseillé aux enfants en pleine croissance et aux adolescents. En outre, au-delà de l'équilibre alimentaire, cette décision affecte également la vie familiale, comme le confirme Philippe, père de famille : « Au début, nous préparions des plats différents, mais nous nous sommes rapidement rendu compte que c'était impossible à organiser. C'est pourquoi, désormais, nous mangeons tous des plats végétariens quand nous sommes ensemble. Ma consommation de viande a diminué, mais je ne suis pas encore prêt à arrêter d'en manger, surtout quand on sait qu'énormément de personnes ne peuvent pas en consommer pour des raisons économiques. »`,
    followUps: [
      { t: "Pourriez-vous devenir végétarien ? Pourquoi ?", a: "立场" },
      { t: "Pourquoi de plus en plus de jeunes arrêtent-ils la viande ?", a: "成因" },
      { t: "Manger végétarien est-il bon pour la santé, selon vous ?", a: "观点" },
      { t: "Nos habitudes alimentaires doivent-elles changer pour l'environnement ?", a: "环保" },
    ],
  },

  // ---------------- page 27 ----------------
  {
    title: "Faut-il emmener ses enfants avec soi en vacances ?",
    source: "www.slate.fr",
    verify: true,
    passage: `Vous avez choisi d'avoir des enfants ? Cela ne veut pas dire que vous devez les emmener partout, tout le temps, avec vous. En effet, partir en vacances avec des enfants n'est pas très facile, surtout quand ils n'ont pas le même âge. Selon certains parents, il vaudrait mieux éviter de partir loin avec eux. D'autres se plaignent du fait que la présence des enfants ne permet pas de profiter réellement des vacances : si l'on peut envoyer les enfants au club de plage ou avoir l'aide des grands-parents, c'est mieux, car on retrouve généralement les enfants beaucoup plus fatigués. Parce que, là aussi, il faut les nourrir, les soigner, les surveiller : ces activités laissent peu de temps pour lire ou se reposer sur la plage. De fait, certains parents préfèrent ne pas emmener leurs jeunes enfants en vacances. C'est pourquoi les hôtels interdits aux enfants connaissent, partout dans le monde, de plus en plus de succès.`,
    followUps: [
      { t: "Les vacances en famille sont-elles toujours reposantes, selon vous ?", a: "立场" },
      { t: "Que pensez-vous des hôtels interdits aux enfants ?", a: "观点" },
      { t: "Comment réussir des vacances en famille ?", a: "措施" },
      { t: "Préférez-vous partir en famille, entre amis ou seul ?", a: "偏好" },
    ],
  },
  {
    title: "Et si vous louiez vos vêtements ?",
    source: "Ava Djamshidi, Le Parisien",
    verify: true,
    passage: `Les mariages, les communions et autres festivités annuelles ramènent toujours la même question : « Qu'est-ce que je vais mettre ? » Rien que d'y penser, ça donne la migraine et ça fait mal au porte-monnaie. Mais les prises de tête vestimentaires ne touchent pas que les femmes. Céline, 35 ans, a trouvé la solution. « J'ai loué », avoue-t-elle. « Je voulais quelque chose d'original, mais il n'était pas question que je me ruine* », explique-t-elle. Elle a découvert un stand de « prêt-à-louer » : matières nobles, coupes parfaites. « Avec la location, on teste, on n'a pas de regret », ajoute la trentenaire. Pour ceux qui sont à l'origine de cette boutique, ce mode de consommation pourrait bien se généraliser. « On se lasse vite des vêtements qu'on achète dans les supermarchés de la mode », sourit-elle. « Nos placards débordent et, malgré tout, on répète qu'on n'a rien à se mettre. Avec la location, on peut sans cesse renouveler sa garde-robe. »
* se ruiner : dépenser beaucoup d'argent.`,
    followUps: [
      { t: "Loueriez-vous des vêtements au lieu de les acheter ?", a: "个人意愿" },
      { t: "Achète-t-on trop de vêtements aujourd'hui ?", a: "立场" },
      { t: "Que pensez-vous de cette nouvelle façon de consommer ?", a: "观点" },
      { t: "Comment consommer la mode de façon plus responsable ?", a: "措施" },
    ],
  },
];
