import prisma from '../config/prisma.js';
import {
  evaluateSessionInsightConditions,
  generateSessionInsight,
} from '../services/session-insight.service.js';

const isAdminUser = async (userId) => {
  if (!userId) {
    return false;
  }

  const user = await prisma.userAuth.findUnique({ where: { id: userId } });
  return user?.username === 'admin';
};

const parseNonNegativeInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

const parseDateValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildSessionEventNotes = ({ goals, remarks, progress, pausedCount, focusLevel, durationSeconds }) => {
  const sections = ['Recorded study session'];

  if (goals) {
    sections.push(`Goals: ${String(goals).trim()}`);
  }

  if (progress) {
    sections.push(`Progress: ${String(progress).trim()}`);
  }

  if (remarks) {
    sections.push(`Remarks: ${String(remarks).trim()}`);
  }

  if (durationSeconds !== undefined) {
    const totalSeconds = Math.max(0, Number(durationSeconds) || 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    sections.push(
      `Tracked duration: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
  }

  if (focusLevel !== undefined) {
    sections.push(`Focus level: ${focusLevel}/5`);
  }

  if (pausedCount !== undefined) {
    sections.push(`Paused ${pausedCount} time${Number(pausedCount) === 1 ? '' : 's'}`);
  }

  return sections.join('\n\n');
};

const buildSessionEventData = ({
  sessionTitle,
  startedAt,
  endedAt,
  goals,
  remarks,
  progress,
  pausedCount,
  focusLevel,
  durationSeconds,
}) => ({
  title: String(sessionTitle).trim(),
  startTime: startedAt,
  endTime: endedAt,
  notes: buildSessionEventNotes({ goals, remarks, progress, pausedCount, focusLevel, durationSeconds }),
  visibility: 'PRIVATE',
});

const createCalendarEventForSession = async (tx, userId, sessionData) => {
  const event = await tx.event.create({
    data: {
      ...buildSessionEventData(sessionData),
      ownerId: userId,
    },
  });

  await tx.eventPermission.create({
    data: {
      eventId: event.id,
      userId,
      role: 'owner',
    },
  });

  return event;
};

const applySessionInsight = async (session, { force = false } = {}) => {
  const evaluation = evaluateSessionInsightConditions(session, { force });

  if (!evaluation.eligible) {
    return prisma.session.update({
      where: { sessionId: session.sessionId },
      data: {
        aiInsightStatus: 'skipped',
        aiInsight: null,
        aiInsightReason: `Skipped by conditions: ${evaluation.reasons.join(', ')}`,
        aiInsightGeneratedAt: null,
      },
    });
  }

  const insight = await generateSessionInsight(session);

  return prisma.session.update({
    where: { sessionId: session.sessionId },
    data: {
      aiInsightStatus: 'generated',
      aiInsight: insight,
      aiInsightReason: null,
      aiInsightGeneratedAt: new Date(),
    },
  });
};

export const createSession = async (req, res) => {
  const userId = req.user?.id;
  const {
    sessionTitle,
    durationSeconds,
    focusLevel,
    goals,
    remarks,
    progress,
    pausedCount,
    startedAt,
    endedAt,
  } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!sessionTitle || durationSeconds === undefined || focusLevel === undefined) {
    return res.status(400).json({ message: 'sessionTitle, durationSeconds, and focusLevel are required.' });
  }

  const parsedDuration = parseNonNegativeInt(durationSeconds);
  const parsedFocus = Number(focusLevel);
  const parsedPausedCount = pausedCount === undefined ? 0 : parseNonNegativeInt(pausedCount);
  const parsedEndedAt = parseDateValue(endedAt) ?? new Date();
  const parsedStartedAt = parseDateValue(startedAt) ?? new Date(parsedEndedAt.getTime() - ((parsedDuration ?? 0) * 1000));

  if (parsedDuration === null) {
    return res.status(400).json({ message: 'durationSeconds must be a non-negative integer.' });
  }

  if (!Number.isInteger(parsedFocus) || parsedFocus < 1 || parsedFocus > 5) {
    return res.status(400).json({ message: 'focusLevel must be an integer between 1 and 5.' });
  }

  if (parsedPausedCount === null) {
    return res.status(400).json({ message: 'pausedCount must be a non-negative integer.' });
  }

  if (!parsedStartedAt || !parsedEndedAt || parsedEndedAt <= parsedStartedAt) {
    return res.status(400).json({ message: 'A valid session start and end time are required.' });
  }

  try {
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId,
          sessionTitle: String(sessionTitle).trim(),
          durationSeconds: parsedDuration,
          focusLevel: parsedFocus,
          goals: goals ?? null,
          remarks: remarks ?? null,
          progress: progress ?? null,
          pausedCount: parsedPausedCount,
          startedAt: parsedStartedAt,
          endedAt: parsedEndedAt,
        },
      });

      const calendarEvent = await createCalendarEventForSession(tx, userId, {
        sessionTitle: created.sessionTitle,
        startedAt: parsedStartedAt,
        endedAt: parsedEndedAt,
        goals: created.goals,
        remarks: created.remarks,
        progress: created.progress,
        pausedCount: created.pausedCount,
        focusLevel: created.focusLevel,
        durationSeconds: created.durationSeconds,
      });

      return tx.session.update({
        where: { sessionId: created.sessionId },
        data: {
          calendarEventId: calendarEvent.id,
        },
      });
    });

    const sessionWithInsight = await applySessionInsight(session);

    res.status(201).json(sessionWithInsight);
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ message: 'Failed to create session.' });
  }
};

export const listSessions = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(sessions || []);
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
};

export const getSessionById = async (req, res) => {
  const userId = req.user?.id;
  const sessionId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!Number.isInteger(sessionId)) {
    return res.status(400).json({ message: 'Invalid session id.' });
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sessionId },
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && session.userId !== userId) {
      return res.status(403).json({ message: 'Not allowed to view this session.' });
    }

    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ message: 'Failed to fetch session.' });
  }
};

export const updateSession = async (req, res) => {
  const userId = req.user?.id;
  const sessionId = Number(req.params.id);
  const {
    sessionTitle,
    durationSeconds,
    focusLevel,
    goals,
    remarks,
    progress,
    pausedCount,
    startedAt,
    endedAt,
  } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!Number.isInteger(sessionId)) {
    return res.status(400).json({ message: 'Invalid session id.' });
  }

  try {
    const existing = await prisma.session.findUnique({ where: { sessionId } });

    if (!existing) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && existing.userId !== userId) {
      return res.status(403).json({ message: 'Not allowed to update this session.' });
    }

    const updateData = {};
    const parsedStartedAt = startedAt !== undefined ? parseDateValue(startedAt) : existing.startedAt;
    const parsedEndedAt = endedAt !== undefined ? parseDateValue(endedAt) : existing.endedAt;

    if ((startedAt !== undefined && !parsedStartedAt) || (endedAt !== undefined && !parsedEndedAt)) {
      return res.status(400).json({ message: 'Invalid session start or end time.' });
    }

    if (parsedStartedAt && parsedEndedAt && parsedEndedAt <= parsedStartedAt) {
      return res.status(400).json({ message: 'Session end time must be after session start time.' });
    }

    if (sessionTitle !== undefined) {
      updateData.sessionTitle = String(sessionTitle).trim();
    }

    if (durationSeconds !== undefined) {
      const parsedDuration = parseNonNegativeInt(durationSeconds);
      if (parsedDuration === null) {
        return res.status(400).json({ message: 'durationSeconds must be a non-negative integer.' });
      }
      updateData.durationSeconds = parsedDuration;
    }

    if (focusLevel !== undefined) {
      const parsedFocus = Number(focusLevel);
      if (!Number.isInteger(parsedFocus) || parsedFocus < 1 || parsedFocus > 5) {
        return res.status(400).json({ message: 'focusLevel must be an integer between 1 and 5.' });
      }
      updateData.focusLevel = parsedFocus;
    }

    if (pausedCount !== undefined) {
      const parsedPausedCount = parseNonNegativeInt(pausedCount);
      if (parsedPausedCount === null) {
        return res.status(400).json({ message: 'pausedCount must be a non-negative integer.' });
      }
      updateData.pausedCount = parsedPausedCount;
    }

    if (goals !== undefined) {
      updateData.goals = goals;
    }

    if (remarks !== undefined) {
      updateData.remarks = remarks;
    }

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (startedAt !== undefined) {
      updateData.startedAt = parsedStartedAt;
    }

    if (endedAt !== undefined) {
      updateData.endedAt = parsedEndedAt;
    }

    const updated = await prisma.session.update({
      where: { sessionId },
      data: updateData,
    });

    if (existing.calendarEventId) {
      await prisma.event.updateMany({
        where: {
          id: existing.calendarEventId,
          ownerId: existing.userId,
        },
        data: buildSessionEventData({
          sessionTitle: updated.sessionTitle,
          startedAt: updated.startedAt ?? existing.startedAt ?? updated.createdAt,
          endedAt: updated.endedAt ?? existing.endedAt ?? updated.createdAt,
          goals: updated.goals,
          remarks: updated.remarks,
          progress: updated.progress,
          pausedCount: updated.pausedCount,
          focusLevel: updated.focusLevel,
          durationSeconds: updated.durationSeconds,
        }),
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ message: 'Failed to update session.' });
  }
};

export const deleteSession = async (req, res) => {
  const userId = req.user?.id;
  const sessionId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!Number.isInteger(sessionId)) {
    return res.status(400).json({ message: 'Invalid session id.' });
  }

  try {
    const existing = await prisma.session.findUnique({ where: { sessionId } });

    if (!existing) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && existing.userId !== userId) {
      return res.status(403).json({ message: 'Not allowed to delete this session.' });
    }

    await prisma.$transaction(async (tx) => {
      if (existing.calendarEventId) {
        await tx.eventPermission.deleteMany({
          where: { eventId: existing.calendarEventId },
        });

        await tx.event.deleteMany({
          where: {
            id: existing.calendarEventId,
            ownerId: existing.userId,
          },
        });
      }

      await tx.session.delete({ where: { sessionId } });
    });

    res.json({ message: 'Session deleted.' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ message: 'Failed to delete session.' });
  }
};

export const getMonthlyStats = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ message: 'Valid year and month (1-12) are required.' });
  }

  try {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const sessions = await prisma.session.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        durationSeconds: true,
        createdAt: true,
      },
    });

    const hoursByDay = {};
    for (const session of sessions) {
      const dayKey = session.createdAt.toISOString().slice(0, 10);
      hoursByDay[dayKey] = (hoursByDay[dayKey] || 0) + session.durationSeconds / 3600;
    }

    const days = [];
    let totalHours = 0;
    let activeDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hours = Math.round((hoursByDay[dateStr] || 0) * 100) / 100;
      days.push({ date: dateStr, hours });
      totalHours += hours;
      if (hours > 0) activeDays++;
    }

    res.json({
      days,
      stats: {
        totalHours: Math.round(totalHours * 100) / 100,
        avgHours: Math.round((totalHours / daysInMonth) * 100) / 100,
        activeDays,
      },
    });
  } catch (error) {
    console.error('Get monthly stats error:', error);
    res.status(500).json({ message: 'Failed to fetch monthly stats.' });
  }
};

export const regenerateSessionInsight = async (req, res) => {
  const userId = req.user?.id;
  const sessionId = Number(req.params.id);
  const force = String(req.query?.force || '').toLowerCase() === 'true';

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!Number.isInteger(sessionId)) {
    return res.status(400).json({ message: 'Invalid session id.' });
  }

  try {
    const session = await prisma.session.findUnique({ where: { sessionId } });

    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && session.userId !== userId) {
      return res.status(403).json({ message: 'Not allowed to generate insight for this session.' });
    }

    const sessionWithInsight = await applySessionInsight(session, { force });

    return res.json(sessionWithInsight);
  } catch (error) {
    console.error('Regenerate session insight error:', error);
    return res.status(500).json({ message: 'Failed to regenerate session insight.' });
  }
};
