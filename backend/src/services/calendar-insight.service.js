import prisma from '../config/prisma.js';

export async function checkInsightStaleness(insight, userId) {
  const now = new Date();

  // EDGE CASE 1: No insights yet for new users
  if (!insight) {
    return {
      stale: true,
      reason: 'No insights generated yet',
      firstTime: true
    };
  }

  // EDGE CASE 2: generated an hour ago to prevent spam
  const timeSinceGeneration = now - new Date(insight.generatedAt);
  const hoursSinceGeneration = timeSinceGeneration / (60 * 60 * 1000);
  
  if (hoursSinceGeneration < 1) {
    return {
      stale: false,
      reason: 'Recently generated',
      minutesAgo: Math.floor(timeSinceGeneration / (60 * 1000))
    };
  }

  // EDGE CASE 3: Check if user has enough events for meaningful insights
  const timeWindow = getAnalysisTimeWindow();

  // Rule 1: Need at least 5 total events in the 21-day analysis window
  const totalEventsCount = await prisma.event.count({
    where: {
      ownerId: userId,
      startTime: {
        gte: timeWindow.start,
        lte: timeWindow.end
      }
    }
  });

  if (totalEventsCount < 5) {
    return {
      stale: false,
      notEnoughData: true,
      reason: 'Not enough events',
      message: 'Add more events to your calendar to get insights'
    };
  }

  // Rule 2: If no future events, require enough past data for retrospective insights
  const futureEventsCount = await prisma.event.count({
    where: {
      ownerId: userId,
      startTime: { gt: now }
    }
  });

  if (futureEventsCount === 0 && totalEventsCount < 10) {
    return {
      stale: false,
      notEnoughData: true,
      reason: 'No upcoming events',
      message: 'Add upcoming events to get planning insights'
    };
  }

  // RULE 1: a week since last insight
  const insightAgeDays = timeSinceGeneration / (24 * 60 * 60 * 1000);
  
  if (insightAgeDays >= 7) {
    return {
      stale: true,
      reason: `Weekly refresh due - insight is ${Math.floor(insightAgeDays)} days old`,
      ageInDays: Math.floor(insightAgeDays)
    };
  }

  // RULE 2: Event changes (new and edited events)
  
  // Count new events (created after insight was generated)
  const newEventsCount = await prisma.event.count({
    where: {
      ownerId: userId,
      createdAt: { gt: insight.generatedAt }
    }
  });

  const editedEventsCount = await prisma.event.count({
    where: {
      ownerId: userId,
      updatedAt: { gt: insight.generatedAt },
      createdAt: { lte: insight.generatedAt }
    }
  });

  const totalChanges = newEventsCount + editedEventsCount;

  if (totalChanges >= 5) {
    return {
      stale: true,
      reason: `${totalChanges} calendar changes since last analysis`,
      changes: {
        added: newEventsCount,
        edited: editedEventsCount,
        total: totalChanges
      }
    };
  }

  // NOT STALE - insight is still fresh
  return {
    stale: false,
    reason: 'Insight is still current',
    ageInDays: Math.floor(insightAgeDays),
    changesSince: totalChanges
  };
}

export async function getLatestInsight(userId) {
  return await prisma.calendarInsight.findFirst({
    where: { userId },
    orderBy: { generatedAt: 'desc' }
  });
}

export function getAnalysisTimeWindow() {
  const now = new Date();
  
  // Start: 7 days ago
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);  // Start of day
  
  // End: 14 days from now
  const end = new Date(now);
  end.setDate(end.getDate() + 14);
  end.setHours(23, 59, 59, 999);  // End of day
  
  return { start, end };
}