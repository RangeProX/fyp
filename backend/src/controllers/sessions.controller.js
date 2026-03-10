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

  if (parsedDuration === null) {
    return res.status(400).json({ message: 'durationSeconds must be a non-negative integer.' });
  }

  if (!Number.isInteger(parsedFocus) || parsedFocus < 1 || parsedFocus > 5) {
    return res.status(400).json({ message: 'focusLevel must be an integer between 1 and 5.' });
  }

  if (parsedPausedCount === null) {
    return res.status(400).json({ message: 'pausedCount must be a non-negative integer.' });
  }

  try {
    const session = await prisma.session.create({
      data: {
        userId,
        sessionTitle: String(sessionTitle).trim(),
        durationSeconds: parsedDuration,
        focusLevel: parsedFocus,
        goals: goals ?? null,
        remarks: remarks ?? null,
        progress: progress ?? null,
        pausedCount: parsedPausedCount,
      },
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

    const updated = await prisma.session.update({
      where: { sessionId },
      data: updateData,
    });

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

    await prisma.session.delete({ where: { sessionId } });
    res.json({ message: 'Session deleted.' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ message: 'Failed to delete session.' });
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
