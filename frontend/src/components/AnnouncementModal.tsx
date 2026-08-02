import { useEffect, useState } from 'react';
import { Modal, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MaterialIcon from './MaterialIcon';

/** Cleared on every login so the notice reappears once per sign-in. */
export const ANNOUNCEMENT_SEEN_KEY = 'announcement-seen';

type Localized = { zh?: string; en?: string; fr?: string };

interface Announcement {
  title: Localized;
  body: Localized;
  version: string | null;
}

/** Pick the copy for the active UI language, falling back to zh. */
function pick(text: Localized, lang: string): string {
  const key = (lang.split('-')[0] || 'zh') as keyof Localized;
  return text[key] || text.zh || '';
}

/**
 * Site-wide notice shown once per sign-in, on top of any logged-in page.
 * Renders nothing unless an admin has switched the announcement on.
 */
export default function AnnouncementModal() {
  const { t, i18n } = useTranslation();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/user/announcement')
      .then((r) => {
        const a: Announcement | null = r.data?.announcement || null;
        if (cancelled || !a) return;
        // Re-show when the wording changed, even within the same session.
        if (sessionStorage.getItem(ANNOUNCEMENT_SEEN_KEY) === a.version) return;
        setAnnouncement(a);
        setOpen(true);
      })
      // A failed notice must never block the page the user asked for.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    if (announcement?.version) {
      sessionStorage.setItem(ANNOUNCEMENT_SEEN_KEY, announcement.version);
    }
    setOpen(false);
  };

  if (!announcement) return null;

  const body = pick(announcement.body, i18n.language);

  return (
    <Modal
      open={open}
      onCancel={dismiss}
      centered
      width={460}
      title={null}
      footer={null}
      styles={{ content: { borderRadius: 16, padding: 28 } }}
    >
      <div className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <MaterialIcon name="campaign" size={30} fill />
        </div>
        <h2 className="text-headline-md text-on-surface m-0 mb-3">
          {pick(announcement.title, i18n.language)}
        </h2>
        <p className="text-body-base text-on-surface-variant whitespace-pre-line m-0 mb-6">
          {body}
        </p>
        <Button
          type="primary"
          block
          size="large"
          onClick={dismiss}
          className="h-11 rounded-xl font-semibold"
        >
          {t('announcement.gotIt')}
        </Button>
      </div>
    </Modal>
  );
}
