import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MaterialIcon from '../components/MaterialIcon';

const FEATURES = [
  { icon: 'headphones', key: 'co', to: '/practice/listening', fr: "Compréhension de l'oral" },
  { icon: 'menu_book', key: 'ce', to: '/practice/reading', fr: 'Compréhension des écrits' },
  { icon: 'edit_document', key: 'pe', to: '/practice/writing', fr: 'Production écrite' },
  { icon: 'record_voice_over', key: 'po', to: '/practice/speaking', fr: 'Production orale' },
];

export default function Landing() {
  const { t } = useTranslation();

  return (
    <div>
      {/* Hero */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center py-10 md:py-16">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-on-surface mb-4">
            {t('landing.title')}
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

        {/* Visual panel — gradient composition with the four épreuves */}
        <div className="relative rounded-[32px] overflow-hidden bg-gradient-to-br from-primary via-primary-container to-tertiary-container min-h-[320px] md:min-h-[420px] shadow-level-2 hidden sm:block">
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #ffffff 0%, transparent 40%), radial-gradient(circle at 80% 90%, #2fd9f4 0%, transparent 45%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[120px] font-black text-white/20 select-none">B2</span>
          </div>
          <div className="absolute bottom-6 left-6 right-6 glass-panel rounded-2xl p-4 flex items-center justify-between gap-3">
            {FEATURES.map((f) => (
              <div key={f.key} className="flex flex-col items-center gap-1 text-primary">
                <MaterialIcon name={f.icon} size={26} fill />
                <span className="text-label-caps uppercase">{f.key}</span>
              </div>
            ))}
          </div>
        </div>
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
