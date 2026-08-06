import { useTranslation } from 'react-i18next';

/**
 * Landing hero artwork.
 *
 * The source file is a full ad creative with English headline/CTA baked in.
 * We frame only its photographic half (object-position) so the page's own
 * translated headline and buttons stay the single source of that message.
 */
export default function HeroShowcase() {
  const { t } = useTranslation();

  return (
    <div className="relative rounded-[32px] overflow-hidden min-h-[360px] md:min-h-[520px] shadow-level-2 hidden sm:block bg-surface-container">
      <div
        role="img"
        aria-label={t('landing.showcase.alt')}
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/hero-delf-b2.jpg)',
          // Frames the source's right edge (x≈68%→100%, y≈68%→100%): the
          // tablet's right side, the DELF B2 papers and the pens. Starting at
          // 68% also cuts off the "Try ExamPass Now" button baked into the
          // original, which ends at x≈67%.
          backgroundSize: '351%',
          backgroundPosition: '100% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      />
    </div>
  );
}
