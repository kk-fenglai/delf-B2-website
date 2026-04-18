import { validatePassword } from '../utils/passwordPolicy';

const COLORS = ['#e5e7eb', '#ef4444', '#f59e0b', '#10b981', '#059669', '#047857'];
const LABELS = ['', '很弱', '较弱', '一般', '较强', '很强'];

export default function PasswordStrengthBar({ password }: { password: string }) {
  const { strength, reasons } = validatePassword(password);
  const filled = password ? strength + 1 : 0;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 4, height: 6, marginTop: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 3,
              background: i < filled ? COLORS[filled] : '#e5e7eb',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: reasons.length ? '#ef4444' : '#059669', marginTop: 4, minHeight: 18 }}>
        {password ? (reasons.length ? reasons.join('；') : `✓ 强度：${LABELS[filled]}`) : '至少 10 位，建议混合大小写、数字和符号'}
      </div>
    </div>
  );
}
