import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MaterialIcon from '../components/MaterialIcon';
import LevelBadge from '../components/LevelBadge';
import type { Skill } from '../types';
import { useLevelStore } from '../stores/level';

type SkillEntry = {
  skill: Skill;
  frName: string; // official épreuve name — factual, not translated
  icon: string;
  watermark: string;
  descKey: string;
  to: string;
  ai?: boolean; // AI features use the secondary (violet) color
};

const entries: SkillEntry[] = [
  { skill: 'CO', frName: "Compréhension de l'oral", icon: 'hearing', watermark: 'headphones', descKey: 'practice.hub.coDesc', to: '/practice/listening' },
  { skill: 'CE', frName: 'Compréhension des écrits', icon: 'auto_stories', watermark: 'menu_book', descKey: 'practice.hub.ceDesc', to: '/practice/reading' },
  // TCF only（语法结构）— filtered out for systems whose skill list has no 'grammar' slug.
  { skill: 'SL', frName: 'Structures de la langue', icon: 'spellcheck', watermark: 'rule', descKey: 'practice.hub.slDesc', to: '/practice/grammar' },
  { skill: 'PE', frName: 'Production écrite', icon: 'edit_document', watermark: 'edit', descKey: 'practice.hub.peDesc', to: '/practice/writing', ai: true },
  { skill: 'PO', frName: 'Production orale', icon: 'mic', watermark: 'record_voice_over', descKey: 'practice.hub.poDesc', to: '/practice/speaking', ai: true },
];

type SkillStat = { skill: Skill; total: number; correct: number; accuracy: number };

export default function PracticeHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Record<string, SkillStat>>({});
  const system = useLevelStore((s) => s.system);
  const systems = useLevelStore((s) => s.systems);
  // Cards follow the current system's skill slugs, in its order (DELF/IELTS:
  // listening/reading/writing/speaking; TCF: listening/grammar/reading).
  const slugs = systems?.find((s) => s.key === system)?.skills.map((s) => s.slug)
    ?? ['listening', 'reading', 'writing', 'speaking'];
  const visibleEntries = slugs
    .map((slug) => entries.find((e) => e.to === `/practice/${slug}`))
    .filter((e): e is SkillEntry => !!e);
  const isTcf = system === 'TCF';

  useEffect(() => {
    api.get('/user/progress').then((r) => {
      const map: Record<string, SkillStat> = {};
      (r.data?.skillStats ?? []).forEach((s: SkillStat) => { map[s.skill] = s; });
      setStats(map);
    }).catch(() => {});
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-display-lg text-on-surface mb-2 flex items-center gap-3 flex-wrap">
          {t('practice.hub.title')}
          <LevelBadge />
        </h1>
        <p className="text-body-base text-on-surface-variant max-w-2xl">{t('practice.hub.subtitle')}</p>
      </header>

      {/* 2×2 skill grid — CO / CE / PE / PO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {visibleEntries.map((e) => {
          const stat = stats[e.skill];
          const accuracy = stat && stat.total > 0 ? Math.round(stat.accuracy) : null;
          const tone = e.ai
            ? { tile: 'bg-secondary-container/20 text-secondary', chip: 'text-secondary bg-secondary-container/20', mark: 'text-secondary' }
            : { tile: 'bg-primary-container/10 text-primary', chip: 'text-primary bg-primary-container/10', mark: 'text-primary' };
          return (
            <button
              key={e.skill}
              type="button"
              onClick={() => navigate(e.to)}
              className="bg-surface-container-lowest rounded-xl p-6 text-left relative overflow-hidden group border-2 border-transparent shadow-level-1 transition-all duration-200 hover:border-primary hover:shadow-level-2 hover:-translate-y-0.5"
            >
              <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity ${tone.mark}`}>
                <MaterialIcon name={e.watermark} size={60} fill />
              </div>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${tone.tile}`}>
                  <MaterialIcon name={e.icon} size={24} fill />
                </div>
                <div>
                  <h2 className="text-headline-md text-on-surface">{e.frName}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-label-caps uppercase px-2 py-0.5 rounded ${tone.chip}`}>{t(`skill.${e.skill}`)}</span>
                    {e.skill === 'PO' && (
                      <span className="text-label-caps uppercase px-2 py-0.5 rounded text-secondary bg-secondary-container/20">
                        {t('practice.hub.aiGradedTag')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-body-base text-on-surface-variant mb-6 relative z-10">{t(e.descKey)}</p>
              {accuracy != null && (
                <div className="relative z-10">
                  <div className="flex justify-between text-label-caps uppercase mb-2 text-on-surface-variant">
                    <span>{t('practice.hub.accuracy')}</span>
                    <span>{accuracy}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-tertiary rounded-full" style={{ width: `${accuracy}%` }} />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* My question bank entry */}
      <Link
        to="/my-exams"
        className="flex items-center gap-4 bg-surface-container-lowest rounded-xl p-6 mb-8 shadow-level-1 border-2 border-transparent transition-all hover:border-primary hover:shadow-level-2"
      >
        <div className="w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary shrink-0">
          <MaterialIcon name="inventory_2" size={24} fill />
        </div>
        <div className="min-w-0">
          <h2 className="text-headline-sm text-on-surface">{t('nav.myExams')}</h2>
          <p className="text-body-base text-on-surface-variant mb-0 truncate">{t('myExams.subtitle')}</p>
        </div>
        <MaterialIcon name="arrow_forward" size={22} className="ml-auto text-on-surface-variant" />
      </Link>

      {/* Full mock exam band */}
      <section className="glass-panel rounded-xl p-6 lg:p-8 relative overflow-hidden shadow-level-1">
        <div
          className="absolute inset-0 z-0 opacity-30 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 100% 100%, #2563eb 0%, transparent 50%)' }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2 text-primary">
              <MaterialIcon name="timer" size={20} fill />
              <span className="text-label-caps uppercase">{t(isTcf ? 'practice.hub.tcfMockDuration' : 'practice.hub.mockDuration')}</span>
            </div>
            <h2 className="text-display-lg text-on-surface mb-2">{t('practice.hub.mockTitle')}</h2>
            <p className="text-body-base text-on-surface-variant">{t(isTcf ? 'practice.hub.tcfMockDesc' : 'practice.hub.mockDesc')} · {t(isTcf ? 'practice.hub.tcfMockTag' : 'practice.hub.mockTag')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/practice/mock')}
            className="bg-primary text-on-primary px-8 py-4 rounded-xl text-headline-sm hover:opacity-90 transition-opacity active:scale-95 flex items-center justify-center gap-2 shrink-0 shadow-level-2"
          >
            {t('practice.hub.startSimulation')}
            <MaterialIcon name="arrow_forward" size={20} />
          </button>
        </div>
      </section>
    </div>
  );
}
