import prisma from '../config/prisma.js';
import Anthropic from '@anthropic-ai/sdk';
import {
  checkInsightStaleness,
  getLatestInsight,
  getAnalysisTimeWindow
} from '../services/calendar-insight.service.js';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const USE_MOCK_AI = process.env.USE_MOCK_AI === 'true';

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

const getTextFromResponse = (response) => {
  return (response?.content || [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
};

const stripCodeFence = (text) => {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
};

const parseModelJson = (rawText) => {
  const cleaned = stripCodeFence(rawText);
  return JSON.parse(cleaned);
};

/**
 * Generates calendar insights using AI
 */
export const generateCalendarInsights = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    // Get time window for analysis (last 7 days + next 14 days)
    const timeWindow = getAnalysisTimeWindow();

    // Fetch events in the time window
    const events = await prisma.event.findMany({
      where: {
        ownerId: userId,
        startTime: {
          gte: timeWindow.start,
          lte: timeWindow.end
        }
      },
      orderBy: { startTime: 'asc' }
    });

    // Check if enough data
    if (events.length < 3) {
      return res.status(400).json({
        message: 'Not enough events to generate insights. Please add at least 3 upcoming events.',
        eventsCount: events.length
      });
    }

    // Calculate statistics
    const now = new Date();
    const futureEvents = events.filter(e => new Date(e.startTime) > now);
    
    // Calculate hours by category
    const calculateHours = (eventsList) => {
      return eventsList.reduce((total, event) => {
        const duration = (new Date(event.endTime) - new Date(event.startTime)) / (1000 * 60 * 60);
        return total + duration;
      }, 0);
    };

    const totalHours = calculateHours(futureEvents);

    // Find upcoming deadlines (events in next 14 days)
    const upcomingDeadlines = futureEvents
      .filter(e => {
        const daysUntil = Math.ceil((new Date(e.startTime) - now) / (1000 * 60 * 60 * 24));
        return daysUntil <= 14;
      })
      .map(e => ({
        title: e.title,
        date: e.startTime,
        daysUntil: Math.ceil((new Date(e.startTime) - now) / (1000 * 60 * 60 * 24))
      }));

    // Build prompt for AI
    const eventsSummary = futureEvents.map(e => {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      const duration = Math.round((end - start) / (1000 * 60));
      
      return `- ${e.title}: ${start.toLocaleDateString()} ${start.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })} (${duration} min)${e.notes ? ` | Notes: ${e.notes}` : ''}`;
    }).join('\n');

    const prompt = `You are an academic advisor helping a university student optimize their schedule.

CURRENT DATE: ${now.toLocaleDateString()}
TIME PERIOD ANALYZED: ${timeWindow.start.toLocaleDateString()} to ${timeWindow.end.toLocaleDateString()}

UPCOMING EVENTS (${futureEvents.length} total):
${eventsSummary}

STATISTICS:
- Total events: ${futureEvents.length}
- Total scheduled hours: ${totalHours.toFixed(1)}h
- Upcoming deadlines (next 14 days): ${upcomingDeadlines.length}

${upcomingDeadlines.length > 0 ? `DEADLINES:\n${upcomingDeadlines.map(d => `- ${d.title}: ${d.daysUntil} days away`).join('\n')}` : ''}

TASK:
Analyze this student's calendar and provide insights to help them plan their week effectively.

Return a JSON object with this exact structure:
{
  "observation": "One key observation about their time allocation or schedule patterns (2-3 sentences)",
  "concern": "One specific concern, risk, or upcoming challenge if any, otherwise null (1-2 sentences or null)",
  "suggestion": "One specific, actionable suggestion with concrete time/day references (2-3 sentences)",
  "encouragement": "Brief encouraging message (1-2 sentences)",
  "urgentActions": ["Specific action 1", "Specific action 2"] or null if none needed
}

Guidelines:
- Be specific: Reference actual events, days, and times from their calendar
- Be actionable: Give concrete steps they can take this week
- Be encouraging but honest: Acknowledge what's working while addressing concerns
- Keep it concise: This should be a quick weekly check-in, not an essay
- If no major concerns, set concern to null
- If no urgent actions needed, set urgentActions to null`;

    // Generate insight
    let insightData;

    if (USE_MOCK_AI) {
      // Mock response for development
      insightData = {
        observation: `You have ${futureEvents.length} events scheduled over the next 3 weeks, totaling ${totalHours.toFixed(1)} hours of commitments.`,
        concern: upcomingDeadlines.length > 0 
          ? `You have ${upcomingDeadlines.length} upcoming deadline(s) in the next 2 weeks.` 
          : null,
        suggestion: `Review your schedule and ensure you have adequate preparation time for upcoming events.`,
        encouragement: `Your calendar shows good organization. Keep maintaining this structure!`,
        urgentActions: upcomingDeadlines.length > 2 
          ? [`Prioritize preparation for ${upcomingDeadlines[0].title}`] 
          : null
      };
    } else {
      const client = getAnthropicClient();

      if (!client) {
        return res.status(500).json({
          message: 'AI service is not configured. Please contact support.'
        });
      }

      const response = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 500,
        temperature: 0.3,
        system: 'You are a concise academic productivity advisor. Return ONLY valid JSON with no markdown fences or additional text.',
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const rawText = getTextFromResponse(response);
      insightData = parseModelJson(rawText);
    }

    // Save insight to database
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + 7); // Valid for 7 days

    const savedInsight = await prisma.calendarInsight.create({
      data: {
        userId,
        observation: insightData.observation,
        concern: insightData.concern || null,
        suggestion: insightData.suggestion,
        encouragement: insightData.encouragement,
        urgentActions: insightData.urgentActions ? JSON.stringify(insightData.urgentActions) : null,
        validUntil,
        eventsAnalyzed: events.length,
        timeWindowStart: timeWindow.start,
        timeWindowEnd: timeWindow.end
      }
    });

    // Return the insight with metadata
    return res.json({
      insight: {
        id: savedInsight.id,
        observation: savedInsight.observation,
        concern: savedInsight.concern,
        suggestion: savedInsight.suggestion,
        encouragement: savedInsight.encouragement,
        urgentActions: savedInsight.urgentActions ? JSON.parse(savedInsight.urgentActions) : null,
        generatedAt: savedInsight.generatedAt,
        validUntil: savedInsight.validUntil
      },
      metadata: {
        eventsAnalyzed: events.length,
        timeWindow: {
          start: timeWindow.start,
          end: timeWindow.end
        }
      }
    });

  } catch (error) {
    console.error('Calendar insights generation error:', error);

    if (error instanceof SyntaxError) {
      return res.status(502).json({
        message: 'AI returned invalid response format. Please try again.'
      });
    }

    return res.status(500).json({
      message: 'Failed to generate insights. Please try again.'
    });
  }
};

/**
 * Gets the latest insight and staleness check for the user
 */
export const getInsightStatus = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    // Get latest insight
    const latestInsight = await getLatestInsight(userId);

    if (!latestInsight) {
      return res.json({
        hasInsight: false,
        message: 'No insights generated yet',
        staleness: {
          stale: true,
          firstTime: true,
          reason: 'No insights generated yet'
        }
      });
    }

    // Check staleness
    const stalenessCheck = await checkInsightStaleness(latestInsight, userId);

    // Return insight with staleness info
    return res.json({
      hasInsight: true,
      insight: {
        id: latestInsight.id,
        observation: latestInsight.observation,
        concern: latestInsight.concern,
        suggestion: latestInsight.suggestion,
        encouragement: latestInsight.encouragement,
        urgentActions: latestInsight.urgentActions ? JSON.parse(latestInsight.urgentActions) : null,
        generatedAt: latestInsight.generatedAt,
        validUntil: latestInsight.validUntil,
        eventsAnalyzed: latestInsight.eventsAnalyzed
      },
      staleness: stalenessCheck
    });

  } catch (error) {
    console.error('Get insight status error:', error);
    return res.status(500).json({
      message: 'Failed to retrieve insight status.'
    });
  }
};