-- Seed test-phase billing policy once (30-day AI_UNLIMITED trial, payments off).
-- Skipped if an admin already saved billing_policy.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT
  'billing_policy',
  '{
    "trialEnabled": true,
    "trialDays": 30,
    "trialPlan": "AI_UNLIMITED",
    "paymentsEnabled": false,
    "paymentsDisabledMessage": {
      "zh": "平台目前处于测试阶段，无需订阅即可免费使用。请使用免费试用，如有问题请联系客服。",
      "en": "We are in a beta testing period — no paid subscription is required. Please use the free trial instead.",
      "fr": "La plateforme est en phase de test — aucun abonnement payant n''est requis. Utilisez l''essai gratuit."
    }
  }'::jsonb,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "AppSetting" WHERE "key" = 'billing_policy'
);
