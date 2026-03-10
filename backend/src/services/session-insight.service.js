import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const USE_MOCK_AI = process.env.USE_MOCK_AI === 'true';

const parseBooleanEnv = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const parseIntEnv = (value, fallback, { min, max } = {}) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (min !== undefined && parsed < min) {
    return fallback;
  }

  if (max !== undefined && parsed > max) {
    return fallback;
  }

  return parsed;
};

const SETTINGS = {
  useConditions: parseBooleanEnv(process.env.SESSION_INSIGHT_USE_CONDITIONS, false),
  minDurationSeconds: parseIntEnv(process.env.SESSION_INSIGHT_MIN_DURATION_SECONDS, 900, { min: 0 }),
  minFocusLevel: parseIntEnv(process.env.SESSION_INSIGHT_MIN_FOCUS_LEVEL, 2, { min: 1, max: 5 }),
  requireProgress: parseBooleanEnv(process.env.SESSION_INSIGHT_REQUIRE_PROGRESS, false),
  requireGoals: parseBooleanEnv(process.env.SESSION_INSIGHT_REQUIRE_GOALS, false),
};

let anthropicClient = null;

const getAnthropicClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }

  return anthropicClient;
};

const getResponseText = (response) => {
  return (response?.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
};

const fallbackInsight = (session) => {
  const durationMinutes = Math.round((Number(session?.durationSeconds || 0) / 60) * 10) / 10;
  const focus = Number(session?.focusLevel || 0);
  const pauses = Number(session?.pausedCount || 0);
  const progressText = String(session?.progress || '').trim();

  const summary = [
    `You studied "${session?.sessionTitle || 'your topic'}" for about ${durationMinutes} minute(s) with focus level ${focus}/5.`,
    pauses > 0
      ? `You paused ${pauses} time(s), so reducing interruptions could improve flow in your next session.`
      : 'You maintained flow with no pauses, which is a strong consistency signal.',
    progressText
      ? `Progress note: ${progressText}`
      : 'Add a brief progress note next time so your improvement trend is easier to track.',
  ];

  return summary.join(' ');
};

export const evaluateSessionInsightConditions = (session, { force = false } = {}) => {
  if (force) {
    return { eligible: true, reasons: [], settings: { ...SETTINGS, forced: true } };
  }

  if (!SETTINGS.useConditions) {
    return { eligible: true, reasons: [], settings: SETTINGS };
  }

  const reasons = [];

  if (Number(session?.durationSeconds || 0) < SETTINGS.minDurationSeconds) {
    reasons.push(`duration is below ${SETTINGS.minDurationSeconds} seconds`);
  }

  if (Number(session?.focusLevel || 0) < SETTINGS.minFocusLevel) {
    reasons.push(`focus level is below ${SETTINGS.minFocusLevel}`);
  }

  if (SETTINGS.requireProgress && !String(session?.progress || '').trim()) {
    reasons.push('progress is required');
  }

  if (SETTINGS.requireGoals && !String(session?.goals || '').trim()) {
    reasons.push('goals are required');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    settings: SETTINGS,
  };
};

export const generateSessionInsight = async (session) => {
  const fallback = fallbackInsight(session);

  if (USE_MOCK_AI) {
    return fallback;
  }

  const client = getAnthropicClient();
  if (!client) {
    return fallback;
  }

  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 240,
      temperature: 0.3,
      system: 'You are a concise academic productivity coach. Return plain text only.',
      messages: [
        {
          role: 'user',
          content: `Generate a concise study insight for this recorded session.\n\nSession title: ${session?.sessionTitle || '-'}\nDuration seconds: ${session?.durationSeconds ?? '-'}\nFocus level (1-5): ${session?.focusLevel ?? '-'}\nPaused count: ${session?.pausedCount ?? '-'}\nGoals: ${session?.goals || '-'}\nProgress: ${session?.progress || '-'}\nRemarks: ${session?.remarks || '-'}\n\nRequirements:\n- 2 to 4 short sentences\n- mention one strength and one improvement suggestion\n- plain text only`,
        },
      ],
    });

    const text = getResponseText(response);
    return text || fallback;
  } catch (error) {
    console.error('Session insight AI error:', error);
    return fallback;
  }
};
