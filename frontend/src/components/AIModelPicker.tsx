import { Card, Radio, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined, ThunderboltOutlined, DeploymentUnitOutlined, AimOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClaudeModelKey, ModelTier, EssayModelOption } from '../types';

const { Text } = Typography;

// Canonical ordering. Any model not in `allowedModels` is shown disabled so
// the user can still see the upgrade path.
const ALL_MODELS: Array<{ key: ClaudeModelKey; label: string; tier: ModelTier }> = [
  { key: 'haiku-4-5',  label: 'Haiku 4.5',  tier: 'fast' },
  { key: 'sonnet-4-6', label: 'Sonnet 4.6', tier: 'balanced' },
  { key: 'opus-4-7',   label: 'Opus 4.7',   tier: 'precise' },
];

const TIER_ICON: Record<ModelTier, React.ReactNode> = {
  fast: <ThunderboltOutlined />,
  balanced: <DeploymentUnitOutlined />,
  precise: <AimOutlined />,
};

type Props = {
  allowedModels: ClaudeModelKey[];
  value: ClaudeModelKey | null;
  onChange: (m: ClaudeModelKey) => void;
  defaultModel?: ClaudeModelKey | null;
  models?: EssayModelOption[]; // optional server-provided labels (wins over ALL_MODELS)
};

export default function AIModelPicker({ allowedModels, value, onChange, defaultModel, models }: Props) {
  const { t } = useTranslation();
  const labelFor = (k: ClaudeModelKey) =>
    models?.find((m) => m.key === k)?.label || ALL_MODELS.find((m) => m.key === k)?.label || k;

  return (
    <div className="mt-3">
      <div className="mb-2">
        <Text strong>{t('essay.model.pickerTitle')}</Text>
        <div className="text-xs text-gray-500">{t('essay.model.pickerSubtitle')}</div>
      </div>
      <Radio.Group
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ALL_MODELS.map((m) => {
            const allowed = allowedModels.includes(m.key);
            const isDefault = defaultModel === m.key;
            const card = (
              <Card
                size="small"
                hoverable={allowed}
                className={`transition ${
                  value === m.key && allowed ? 'border-2 !border-brand' : ''
                } ${!allowed ? 'opacity-60' : ''}`}
                onClick={() => allowed && onChange(m.key)}
                style={{ cursor: allowed ? 'pointer' : 'not-allowed' }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="text-xl">{TIER_ICON[m.tier]}</span>
                      {labelFor(m.key)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t(`essay.model.tier.${m.tier}`)}
                    </div>
                  </div>
                  {allowed ? (
                    <Radio value={m.key} />
                  ) : (
                    <LockOutlined className="text-gray-400 mt-1" />
                  )}
                </div>
                <div className="mt-2 flex gap-1 flex-wrap">
                  {isDefault && allowed && <Tag color="blue">{t('essay.model.default')}</Tag>}
                  {!allowed && <Tag color="default">{t('essay.model.locked')}</Tag>}
                </div>
              </Card>
            );
            return allowed ? (
              <div key={m.key}>{card}</div>
            ) : (
              <Tooltip key={m.key} title={t('essay.model.upgrade')}>
                <Link to="/pricing" onClick={(e) => e.stopPropagation()}>
                  {card}
                </Link>
              </Tooltip>
            );
          })}
        </div>
      </Radio.Group>
    </div>
  );
}
