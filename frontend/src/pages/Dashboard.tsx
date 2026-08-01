import { useEffect, useMemo, useState } from 'react';
import { Skeleton, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import ScorePredictionCard from '../components/ScorePredictionCard';
import ProgressRing from '../components/ProgressRing';
import MaterialIcon from '../components/MaterialIcon';
import { localizeExamTitle } from '../utils/examTitle';
import type { Skill } from '../types';

const SKILLS: Skill[] = ['CO', 'CE', 'PE', 'PO'];

const SKILL_ICON: Record<Skill, string> = {
  CO: 'hearing', CE: 'auto_stories', PE: 'edit_document', PO: 'mic',
};

const SKILL_PATH: Record<Skill, string> = {
  CO: 'listening', CE: 'reading', PE: 'writing', PO: 'speaking',
};

const SKILL_FR: Record<Skill, string> = {
  CO: "Compréhension de l'oral",
  CE: 'Compréhension des écrits',
  PE: 'Production écrite',
  PO: 'Production orale',
};

type SkillStat = { skill: Skill; total: number; correct: number; accuracy: number };

export default function Dashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/user/progress').then((r) => setData(r.data));
  }, []);

  const statFor = (sk: Skill): SkillStat | undefined =>
    data?.skillStats?.find((x: SkillStat) => x.skill === sk);

  // Overall accuracy across all attempted questions (Σcorrect / Σtotal)
  const overall = useMemo(() => {
    if (!data?.skillStats?.length) return null;
    const total = data.skillStats.reduce((a: number, s: SkillStat) => a + s.total, 0);
    const correct = data.skillStats.reduce((a: number, s: SkillStat) => a + s.correct, 0);
    return total > 0 ? Math.round((correct / total) * 100) : null;
  }, [data]);

  // Strengths = skills at/above overall accuracy; focus = the weakest attempted skills.
  const analysis = useMemo(() => {
    if (!data?.skillStats) return { strengths: [] as SkillStat[], focus: [] as SkillStat[] };
    const attempted = (data.skillStats as SkillStat[]).filter((s) => s.total > 0);
    if (attempted.length < 2 || overall == null) return { strengths: [], focus: [] };
    const sorted = [...attempted].sort((a, b) => b.accuracy - a.accuracy);
    return {
      strengths: sorted.filter((s) => s.accuracy >= overall).slice(0, 2),
      focus: sorted.filter((s) => s.accuracy < overall).slice(-2).reverse(),
    };
  }, [data, overall]);

  if (!data) {
    return (
      <div>
        <Skeleton active paragraph={{ rows: 1 }} className="mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-level-1"><Skeleton active /></div>
          ))}
        </div>
      </div>
    );
  }

  const hasData = data.skillStats.length > 0;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface mb-2">
            {t('dashboard.greeting', { name: user?.name || user?.email })}
          </h1>
          <p className="text-body-base text-on-surface-variant mb-0">
            {t('dashboard.subGreeting', { n: data.totalAttempts })}
          </p>
        </div>
        <Link
          to="/practice"
          className="bg-primary text-on-primary px-6 py-3 rounded-xl text-headline-sm hover:opacity-90 transition-opacity active:scale-95 inline-flex items-center gap-2"
        >
          {t('dashboard.enterPractice')}
          <MaterialIcon name="arrow_forward" size={20} />
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Skill mastery — 4 progress rings */}
        <section className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-headline-md text-on-surface">{t('dashboard.skillMastery')}</h2>
            {overall != null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-container/15 text-tertiary">
                {t('dashboard.overall')} · {overall}%
              </span>
            )}
          </div>
          {!hasData ? (
            <div className="text-center py-10 text-on-surface-variant">
              <MaterialIcon name="query_stats" size={40} className="mb-2 opacity-50" />
              <p className="mb-0">{t('dashboard.noData')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SKILLS.map((sk) => {
                const s = statFor(sk);
                const pct = s && s.total > 0 ? Math.round(s.accuracy) : null;
                return (
                  <Link
                    key={sk}
                    to={`/practice/${SKILL_PATH[sk]}`}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-surface-container-low transition-colors"
                  >
                    <ProgressRing percent={pct} />
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm font-semibold text-on-surface">
                        <MaterialIcon name={SKILL_ICON[sk]} size={16} />
                        {t(`skill.${sk}`)}
                      </div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">{SKILL_FR[sk]}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Score prediction — blue hero framing around the existing card */}
        <section className="lg:col-span-4 rounded-xl p-1.5 bg-gradient-to-br from-primary to-primary-container shadow-level-2">
          <div className="bg-surface-container-lowest rounded-[10px] h-full [&_.ant-card]:shadow-none [&_.ant-card]:bg-transparent">
            <ScorePredictionCard />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strengths / focus areas — derived from real accuracy stats */}
        <section className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
          <h2 className="text-headline-md text-on-surface mb-4">{t('dashboard.analysis')}</h2>
          {analysis.strengths.length === 0 && analysis.focus.length === 0 ? (
            <div className="text-on-surface-variant text-sm py-6 text-center">
              <p className="mb-3">{t('dashboard.analysisEmpty')}</p>
              <Link to="/practice" className="text-primary font-semibold">{t('dashboard.enterPractice')} →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-label-caps uppercase text-tertiary mb-3 flex items-center gap-1">
                  <MaterialIcon name="trending_up" size={16} />
                  {t('dashboard.strengths')}
                </div>
                <ul className="space-y-2">
                  {analysis.strengths.map((s) => (
                    <li key={s.skill} className="flex items-center gap-2 text-sm text-on-surface">
                      <MaterialIcon name={SKILL_ICON[s.skill]} size={18} className="text-tertiary" />
                      <span className="font-semibold">{t(`skill.${s.skill}`)}</span>
                      <span className="text-on-surface-variant ml-auto tabular-nums">
                        {t('dashboard.accuracyOf', { n: Math.round(s.accuracy) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-label-caps uppercase text-error mb-3 flex items-center gap-1">
                  <MaterialIcon name="priority_high" size={16} />
                  {t('dashboard.focusAreas')}
                </div>
                <ul className="space-y-2">
                  {analysis.focus.map((s) => (
                    <li key={s.skill} className="flex items-center gap-2 text-sm text-on-surface">
                      <MaterialIcon name={SKILL_ICON[s.skill]} size={18} className="text-error" />
                      <span className="font-semibold">{t(`skill.${s.skill}`)}</span>
                      <span className="text-on-surface-variant ml-auto tabular-nums">
                        {t('dashboard.accuracyOf', { n: Math.round(s.accuracy) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Recently practiced */}
        <section className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
          <h2 className="text-headline-md text-on-surface mb-4">{t('dashboard.recentSessions')}</h2>
          {data.recentSessions.length === 0 ? (
            <div className="text-on-surface-variant text-sm py-6 text-center">{t('dashboard.noSessions')}</div>
          ) : (
            <ul className="divide-y divide-outline-variant/30">
              {data.recentSessions.map((s: any) => {
                const pct = s.maxScore > 0 ? Math.round((s.totalScore / s.maxScore) * 100) : null;
                return (
                  <li key={s.id} className="py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-on-surface truncate">
                        {localizeExamTitle(s.title, t)}
                        {s.isUserOwned && (
                          <Tag color="cyan" className="ml-2">{t('dashboard.userOwnedTag')}</Tag>
                        )}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        {new Date(s.completedAt).toLocaleDateString()}
                      </div>
                    </div>
                    {pct != null && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${
                        pct >= 50 ? 'bg-tertiary-container/15 text-tertiary' : 'bg-error-container text-on-error-container'
                      }`}>
                        {s.totalScore}/{s.maxScore}
                      </span>
                    )}
                    <Link to={`/review/${s.id}`} className="text-primary text-sm font-semibold shrink-0">
                      {t('dashboard.viewDetail')}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
