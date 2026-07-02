import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Divider, Spin, Tag, Typography } from 'antd';
import { CloseOutlined, LockOutlined, TranslationOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const { Text, Paragraph } = Typography;

const AI_PLANS = ['AI', 'AI_UNLIMITED'];

type WordResult = {
  word: string; lemma: string; pos: string; ipa: string;
  meanings: string[]; forms: string; examples: Array<{ fr: string; tr: string }>;
};
type SentenceResult = {
  translation: string; grammar: string[]; vocab: Array<{ fr: string; tr: string }>;
};
type PopupState =
  | { kind: 'loading'; x: number; y: number }
  | { kind: 'word'; x: number; y: number; data: WordResult }
  | { kind: 'sentence'; x: number; y: number; data: SentenceResult }
  | { kind: 'upsell'; x: number; y: number }
  | { kind: 'toolong'; x: number; y: number }
  | { kind: 'error'; x: number; y: number };

// Render guards: the backend normalizes AI replies, but never trust a network
// payload enough to crash the whole page over it (React throws on object children).
function textOf(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
}
function listOf(v: unknown): string[] {
  return Array.isArray(v) ? v.map(textOf).filter(Boolean) : [];
}
function pairsOf(v: unknown): Array<{ fr: string; tr: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it: any) => ({ fr: textOf(it?.fr ?? it), tr: textOf(it?.tr) }))
    .filter((p) => p.fr || p.tr);
}

// A selection of up to 3 tokens with no sentence punctuation is treated as a
// dictionary lookup; anything longer becomes sentence translation + grammar.
function isWordSelection(text: string) {
  return text.length <= 40 && !/[.!?;:]/.test(text) && text.split(/\s+/).length <= 3;
}

/**
 * 划词助手 for CE reading passages, 法语助手 style: select a word to get a
 * dictionary card, select a sentence for translation + grammar notes, or
 * translate the whole passage inline. AI-plan users only; others get an
 * upgrade prompt (server enforces the same gate with 403 upsell).
 */
export default function ReadingAssistant({ text }: { text: string }) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const plan = user?.effectivePlan || user?.plan || 'FREE';
  const isAiUser = AI_PLANS.includes(plan);
  const lang = i18n.language?.split('-')[0] || 'zh';

  const containerRef = useRef<HTMLDivElement>(null);
  // Floating "look up" trigger next to the current selection.
  const [trigger, setTrigger] = useState<{ x: number; y: number; text: string } | null>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);
  // Full-passage translation, interleaved per paragraph when counts align.
  const [fullZh, setFullZh] = useState<string[] | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  // Dismiss trigger/popup when clicking outside the passage panel.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setTrigger(null);
        setPopup(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Popup coordinates are relative to the container so they scroll with the text.
  const relativePos = (rect: DOMRect) => {
    const base = containerRef.current!.getBoundingClientRect();
    return { x: rect.left - base.left + rect.width / 2, y: rect.bottom - base.top };
  };

  const onMouseUp = () => {
    const sel = window.getSelection();
    const raw = sel?.toString().trim() || '';
    if (!sel || sel.isCollapsed || !raw) {
      setTrigger(null);
      return;
    }
    // Only react to selections inside the passage text itself.
    if (!containerRef.current?.contains(sel.anchorNode)) return;
    setPopup(null);
    setTrigger({ ...relativePos(sel.getRangeAt(0).getBoundingClientRect()), text: raw });
  };

  const lookup = async () => {
    if (!trigger) return;
    const { x, y, text: selected } = trigger;
    setTrigger(null);
    if (!isAiUser) {
      setPopup({ kind: 'upsell', x, y });
      return;
    }
    // Explain the limit instead of silently ignoring an over-long selection.
    if (selected.length > 600) {
      setPopup({ kind: 'toolong', x, y });
      return;
    }
    setPopup({ kind: 'loading', x, y });
    try {
      if (isWordSelection(selected)) {
        const { data } = await api.post('/assistant/word', { word: selected, lang }, { timeout: 30000 });
        setPopup({ kind: 'word', x, y, data });
      } else {
        const { data } = await api.post('/assistant/sentence', { text: selected, lang }, { timeout: 45000 });
        setPopup({ kind: 'sentence', x, y, data });
      }
    } catch (e: any) {
      if (e?.response?.status === 403 && e.response.data?.upsell) setPopup({ kind: 'upsell', x, y });
      else setPopup({ kind: 'error', x, y });
    }
  };

  const translateFull = async () => {
    if (!isAiUser) {
      setPopup({ kind: 'upsell', x: 0, y: 24 });
      return;
    }
    if (fullZh) {
      setShowFull((v) => !v);
      return;
    }
    setFullLoading(true);
    try {
      // Long passages can take a while to translate — well past the 15s default.
      const { data } = await api.post('/assistant/passage', { text, lang }, { timeout: 120000 });
      const parts = String(data.translation).split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
      setFullZh(parts);
      setShowFull(true);
    } catch {
      setPopup({ kind: 'error', x: 0, y: 24 });
    } finally {
      setFullLoading(false);
    }
  };

  const popupCard = popup && (
    <Card
      size="small"
      className="app-surface"
      style={{
        position: 'absolute',
        left: Math.max(0, Math.min(popup.x - 150, (containerRef.current?.clientWidth || 320) - 300)),
        top: popup.y + 6,
        width: 300,
        zIndex: 30,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      }}
      // Keep the card's own clicks from triggering the outside-dismiss handler.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button
        type="text"
        size="small"
        icon={<CloseOutlined />}
        onClick={() => setPopup(null)}
        style={{ position: 'absolute', top: 4, right: 4 }}
      />
      {popup.kind === 'loading' && (
        <div className="text-center py-2"><Spin size="small" /> <Text type="secondary" className="ml-2">{t('assistant.loading')}</Text></div>
      )}
      {popup.kind === 'error' && <Text type="danger">{t('assistant.error')}</Text>}
      {popup.kind === 'toolong' && <Text type="secondary">{t('assistant.tooLong')}</Text>}
      {popup.kind === 'upsell' && (
        <div>
          <Text strong><LockOutlined /> {t('assistant.upsellTitle')}</Text>
          <Paragraph type="secondary" className="!mb-2 mt-1 text-xs">{t('assistant.upsellDesc')}</Paragraph>
          <Link to="/pricing"><Button size="small" type="primary">{t('assistant.upgrade')}</Button></Link>
        </div>
      )}
      {popup.kind === 'word' && (
        <div>
          <Text strong className="text-base">{textOf(popup.data.lemma) || textOf(popup.data.word)}</Text>
          {textOf(popup.data.ipa) && <Text type="secondary" className="ml-2">[{textOf(popup.data.ipa)}]</Text>}
          {textOf(popup.data.pos) && <Tag className="ml-2">{textOf(popup.data.pos)}</Tag>}
          <ul className="pl-5 my-2">
            {listOf(popup.data.meanings).map((m, i) => <li key={i}>{m}</li>)}
          </ul>
          {textOf(popup.data.forms) && <Text type="secondary" className="text-xs">{textOf(popup.data.forms)}</Text>}
          {pairsOf(popup.data.examples).length > 0 && (
            <>
              <Divider className="my-2" />
              {pairsOf(popup.data.examples).map((ex, i) => (
                <div key={i} className="text-xs mb-1">
                  <div><Text italic>{ex.fr}</Text></div>
                  <div><Text type="secondary">{ex.tr}</Text></div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {popup.kind === 'sentence' && (
        <div>
          <Text strong>{t('assistant.translationTitle')}</Text>
          <Paragraph className="!mb-2 mt-1">{textOf(popup.data.translation)}</Paragraph>
          {listOf(popup.data.grammar).length > 0 && (
            <>
              <Text strong>{t('assistant.grammarTitle')}</Text>
              <ul className="pl-5 my-1">
                {listOf(popup.data.grammar).map((g, i) => <li key={i} className="text-xs mb-1">{g}</li>)}
              </ul>
            </>
          )}
          {pairsOf(popup.data.vocab).length > 0 && (
            <>
              <Divider className="my-2" />
              {pairsOf(popup.data.vocab).map((v, i) => (
                <div key={i} className="text-xs"><Text italic>{v.fr}</Text> — <Text type="secondary">{v.tr}</Text></div>
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }} onMouseUp={onMouseUp}>
      <div className="flex justify-between items-center mb-2 gap-2">
        <Text type="secondary" className="text-xs">{t('assistant.hint')}</Text>
        <Button
          size="small"
          icon={<TranslationOutlined />}
          loading={fullLoading}
          onClick={translateFull}
        >
          {fullZh && showFull ? t('assistant.hideTranslation') : t('assistant.fullTranslate')}
        </Button>
      </div>
      {paragraphs.map((para, i) => (
        <div key={i}>
          <p>{para}</p>
          {/* Interleave only when the model kept paragraph alignment. */}
          {showFull && fullZh && fullZh.length === paragraphs.length && (
            <p><Text type="secondary">{fullZh[i]}</Text></p>
          )}
        </div>
      ))}
      {showFull && fullZh && fullZh.length !== paragraphs.length && (
        <Alert type="info" className="mt-2" message={<div style={{ whiteSpace: 'pre-wrap' }}>{fullZh.join('\n\n')}</div>} />
      )}
      {trigger && (
        <Button
          size="small"
          type="primary"
          icon={<TranslationOutlined />}
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(trigger.x - 40, (containerRef.current?.clientWidth || 200) - 90)),
            top: trigger.y + 4,
            zIndex: 30,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
          onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
          onClick={lookup}
        >
          {t('assistant.lookup')}
        </Button>
      )}
      {popupCard}
    </div>
  );
}
