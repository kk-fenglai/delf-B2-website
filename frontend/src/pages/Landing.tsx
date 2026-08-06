import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLevelStore } from '../stores/level';
import MaterialIcon from '../components/MaterialIcon';
import HeroShowcase from '../components/HeroShowcase';

const FEATURES = [
  { icon: 'headphones', key: 'co', to: '/practice/listening', fr: "Compréhension de l'oral" },
  { icon: 'menu_book', key: 'ce', to: '/practice/reading', fr: 'Compréhension des écrits' },
  { icon: 'edit_document', key: 'pe', to: '/practice/writing', fr: 'Production écrite' },
  { icon: 'record_voice_over', key: 'po', to: '/practice/speaking', fr: 'Production orale' },
];

// The CEFR ladder the two diplomas cover: DELF A1–B2, DALF C1–C2.
const DELF_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
const DALF_LEVELS = ['C1', 'C2'] as const;

const CERT_FACTS = [
  { icon: 'workspace_premium', title: 'factValidity', desc: 'factValidityDesc' },
  { icon: 'verified', title: 'factOfficial', desc: 'factOfficialDesc' },
  { icon: 'public', title: 'factGlobal', desc: 'factGlobalDesc' },
];

export default function Landing() {
  const { t } = useTranslation();
  const level = useLevelStore((s) => s.level);

  return (
    <div>
      {/* Hero */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center py-10 md:py-16">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-on-surface mb-4">
            {t('landing.title', { level })}
            <svg className="block mt-2" width="220" height="12" viewBox="0 0 220 12" fill="none" aria-hidden="true">
              <path d="M2 9C40 3 120 1 218 6" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </h1>
          <p className="font-serif text-passage-serif text-on-surface-variant mb-8 max-w-xl">
            {t('landing.subtitle')}
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              to="/register"
              className="bg-primary text-on-primary px-8 py-3.5 rounded-xl text-headline-sm hover:opacity-90 transition-opacity active:scale-95 inline-flex items-center gap-2"
            >
              {t('landing.ctaStart')}
              <MaterialIcon name="arrow_forward" size={20} />
            </Link>
            <Link
              to="/exam-guide"
              className="px-8 py-3.5 rounded-xl text-headline-sm text-primary border-2 border-primary/30 hover:border-primary transition-colors inline-flex items-center"
            >
              {t('nav.examGuide')}
            </Link>
          </div>
          <Link to="/pricing" className="inline-block mt-4 text-sm font-semibold text-on-surface-variant hover:text-primary">
            {t('landing.ctaPricing')} →
          </Link>
        </div>

        <HeroShowcase />
      </section>

      {/* 4-skill bento */}
      <section className="py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <Link
              key={f.key}
              to={f.to}
              className="group bg-surface-container-lowest rounded-xl p-6 shadow-level-1 border-t-4 border-transparent hover:border-primary hover:shadow-level-2 hover:-translate-y-1 transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-primary-container/10 text-primary flex items-center justify-center mb-4">
                <MaterialIcon name={f.icon} size={24} fill />
              </div>
              <h3 className="text-headline-sm text-on-surface mb-1">{t(`landing.features.${f.key}.title`)}</h3>
              <div className="text-[11px] text-on-surface-variant mb-3">{f.fr}</div>
              <p className="text-body-base text-on-surface-variant mb-4">{t(`landing.features.${f.key}.desc`)}</p>
              <span className="text-sm font-semibold text-primary inline-flex items-center gap-1">
                {t('landing.ctaStart')}
                <MaterialIcon name="arrow_forward" size={16} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* DELF / DALF explainer — what the diplomas are and where B2 sits */}
      <section className="py-8">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-headline-md md:text-3xl font-bold text-on-surface mb-2">
            {t('landing.certs.title')}
          </h2>
          <p className="text-body-base text-on-surface-variant mb-0">
            {t('landing.certs.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {CERT_FACTS.map((f) => (
            <div key={f.title} className="bg-surface-container-lowest rounded-xl p-5 shadow-level-1 flex gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-container/10 text-primary flex items-center justify-center shrink-0">
                <MaterialIcon name={f.icon} size={22} fill />
              </div>
              <div className="min-w-0">
                <div className="text-headline-sm text-on-surface mb-0.5">{t(`landing.certs.${f.title}`)}</div>
                <p className="text-sm text-on-surface-variant mb-0">{t(`landing.certs.${f.desc}`)}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { name: 'delf', levels: DELF_LEVELS, accent: 'text-primary bg-primary-container/10' },
            { name: 'dalf', levels: DALF_LEVELS, accent: 'text-secondary bg-secondary-container/15' },
          ].map((group) => (
            <div key={group.name} className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
              <div className="flex items-baseline gap-3 mb-4">
                <span className={`px-3 py-1 rounded-lg text-headline-sm font-bold ${group.accent}`}>
                  {t(`landing.certs.${group.name}Title`)}
                </span>
                <span className="text-sm text-on-surface-variant">
                  {t(`landing.certs.${group.name}Subtitle`)}
                </span>
              </div>
              <ul className="space-y-3">
                {group.levels.map((lv) => {
                  const isB2 = lv === 'B2';
                  return (
                    <li
                      key={lv}
                      className={`flex gap-3 rounded-lg p-3 ${
                        isB2 ? 'bg-primary-container/10 ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <span
                        className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-bold ${
                          isB2 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {lv}
                      </span>
                      <div className="min-w-0">
                        {isB2 && (
                          <span className="inline-block text-label-caps uppercase text-primary mb-0.5">
                            {t('landing.certs.b2Badge')}
                          </span>
                        )}
                        <p className="text-sm text-on-surface-variant mb-0">
                          {t(`landing.certs.levels.${lv}`)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 glass-panel rounded-xl p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="min-w-0">
            <p className="text-body-base text-on-surface mb-1">{t('landing.certs.b2Note')}</p>
            <p className="text-sm text-on-surface-variant mb-0">{t('landing.certs.scoring')}</p>
          </div>
          <Link
            to="/register"
            className="bg-primary text-on-primary px-6 py-3 rounded-xl text-headline-sm inline-flex items-center gap-2 shrink-0 self-start md:self-auto md:ml-auto"
          >
            {t('landing.certs.cta')}
            <MaterialIcon name="arrow_forward" size={20} />
          </Link>
        </div>
      </section>

      {/* My question bank band */}
      <section className="py-4">
        <Link
          to="/my-exams"
          className="flex items-center gap-4 bg-surface-container-lowest rounded-xl p-6 shadow-level-1 border-2 border-transparent hover:border-primary hover:shadow-level-2 transition-all"
        >
          <div className="w-12 h-12 rounded-lg bg-primary-container/10 text-primary flex items-center justify-center shrink-0">
            <MaterialIcon name="inventory_2" size={24} fill />
          </div>
          <div className="min-w-0">
            <h2 className="text-headline-sm text-on-surface mb-0.5">{t('landing.myExamsTitle')}</h2>
            <p className="text-body-base text-on-surface-variant mb-0">{t('landing.myExamsDesc')}</p>
          </div>
          <MaterialIcon name="arrow_forward" size={22} className="ml-auto text-on-surface-variant shrink-0" />
        </Link>
      </section>

      {/* Mock exam band */}
      <section className="py-4 pb-12">
        <Link
          to="/practice/mock"
          className="glass-panel relative overflow-hidden rounded-xl p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-level-1 hover:shadow-level-2 transition-shadow"
        >
          <div
            className="absolute inset-0 z-0 opacity-30 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 100% 100%, #2563eb 0%, transparent 50%)' }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2 text-primary">
              <MaterialIcon name="timer" size={20} fill />
              <span className="text-label-caps uppercase">{t('practice.hub.mockDuration')}</span>
            </div>
            <h2 className="text-headline-md text-on-surface mb-1">{t('landing.mockTitle')}</h2>
            <p className="text-body-base text-on-surface-variant mb-0">{t('landing.mockDesc')}</p>
          </div>
          <span className="relative z-10 bg-primary text-on-primary px-8 py-3.5 rounded-xl text-headline-sm inline-flex items-center gap-2 shrink-0 self-start md:self-auto">
            {t('practice.hub.startSimulation')}
            <MaterialIcon name="arrow_forward" size={20} />
          </span>
        </Link>
      </section>
    </div>
  );
}
