/**
 * DeepSeek V4 API defaults to thinking mode. For single-turn tool calls (essay/oral
 * graders), disable it to reduce latency and token use — aligned with legacy
 * deepseek-chat non-thinking behaviour. See https://api-docs.deepseek.com/guides/thinking_mode
 *
 * @param {{ provider?: string, providerId?: string }} taskModel — MODEL_CATALOG row
 * @returns {Record<string, unknown>} spread into chat.completions.create body
 */
function deepseekV4RequestExtras(_taskModel) {
  // deepseek-chat (the stable alias) does not enable thinking by default — no extras needed.
  return {};
}

module.exports = { deepseekV4RequestExtras };
