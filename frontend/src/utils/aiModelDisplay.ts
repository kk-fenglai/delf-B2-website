import type { TFunction } from 'i18next';
import type { ClaudeModelKey } from '../types';

const TIER_KEY: Partial<Record<ClaudeModelKey, string>> = {
  'qwen-turbo': 'ai.model.fast',
  'deepseek-chat': 'ai.model.balanced',
  'qwen-plus': 'ai.model.precise',
};

/** User-facing model name — never exposes vendor brands (DeepSeek, Qwen, etc.). */
export function aiModelDisplayName(t: TFunction, model: ClaudeModelKey | string | null): string {
  if (!model) return t('ai.model.displayName');
  const tierKey = TIER_KEY[model as ClaudeModelKey];
  if (tierKey) return t(tierKey);
  if (model.startsWith('haiku')) return t('ai.model.fast');
  if (model.startsWith('sonnet')) return t('ai.model.balanced');
  if (model.startsWith('opus')) return t('ai.model.precise');
  return t('ai.model.displayName');
}
