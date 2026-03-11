import prisma from '../config/prisma.js';

const DEFAULT_EVENT_COLOR = '#3788d8';
const EVENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const normalizeEventColor = (value) => {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_EVENT_COLOR;
  }
  const normalized = String(value).trim();
  return EVENT_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
};

const parseStoredExdates = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
};

const normalizeOccurrenceStartToken = (value) => {
  const input = String(value || '').trim();
  if (!input) {
    return null;
  }

  const localMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '00'] = localMatch;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const pad = (number) => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
};

const isAdminUser = async (userId) => {
  if (!userId) {
    return false;
  }
  const user = await prisma.userAuth.findUnique({ where: { id: userId } });
  return user?.username === 'admin';
};

export const createEvent = async (req, res) => {
  const userId = req.user?.id;
  const { title, startTime, endTime, notes, visibility, color, rrule } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  if (!title || !startTime || !endTime) {
    return res.status(400).json({ message: 'Title, start time, and end time are required.' });
  }

  const normalizedColor = normalizeEventColor(color);
  if (!normalizedColor) {
    return res.status(400).json({ message: 'A valid hex color is required.' });
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          notes: notes || '',
          color: normalizedColor,
          visibility: visibility || 'PRIVATE',
          ...(rrule ? { rrule: String(rrule) } : {}),
          ownerId: userId,
        },
      });

      await tx.eventPermission.create({
        data: { eventId: created.id, userId, role: 'owner' },
      });

      // For recurring series, mark the root as its own series leader
      if (rrule) {
        return tx.event.update({
          where: { id: created.id },
          data: { seriesId: created.id },
        });
      }

      return created;
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Failed to create event' });
  }
};

export const listEvents = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const events = await prisma.event.findMany({
      where: { ownerId: userId },
      orderBy: { startTime: 'asc' },
      include: {
        owner: { select: { username: true } },
        permissions: { select: { userId: true, role: true } },
      },
    });

    res.json(events || []);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch events' });
  }
};

export const editEvent = async (req, res) => {
  const userId = req.user?.id;
  const eventId = req.params.id;
  const { title, startTime, endTime, notes, visibility, color } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const normalizedColor = color !== undefined ? normalizeEventColor(color) : undefined;
  if (color !== undefined && !normalizedColor) {
    return res.status(400).json({ message: 'A valid hex color is required.' });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && event.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can edit this event.' });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(title ? { title } : {}),
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(color !== undefined ? { color: normalizedColor } : {}),
        ...(visibility ? { visibility } : {}),
      },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit event' });
  }
};

export const editEventOccurrence = async (req, res) => {
  const userId = req.user?.id;
  const eventId = req.params.id;
  const occurrenceToken = normalizeOccurrenceStartToken(req.body?.occurrenceStart);
  const { title, startTime, endTime, notes, visibility, color } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle || !startTime || !endTime) {
    return res.status(400).json({ message: 'Title, start time, and end time are required.' });
  }

  if (!occurrenceToken) {
    return res.status(400).json({ message: 'A valid occurrenceStart is required.' });
  }

  const parsedStart = new Date(startTime);
  const parsedEnd = new Date(endTime);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsedStart) {
    return res.status(400).json({ message: 'End time must be after start time.' });
  }

  const normalizedColor = color !== undefined ? normalizeEventColor(color) : undefined;
  if (color !== undefined && !normalizedColor) {
    return res.status(400).json({ message: 'A valid hex color is required.' });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && event.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can edit this event occurrence.' });
    }

    if (!event.rrule) {
      return res.status(400).json({ message: 'This event is not recurring.' });
    }

    const existingExdates = parseStoredExdates(event.exdates);
    if (!existingExdates.includes(occurrenceToken)) {
      existingExdates.push(occurrenceToken);
    }

    const effectiveSeriesId = event.seriesId ?? eventId;

    const createdOccurrence = await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          exdates: JSON.stringify(existingExdates),
        },
      });

      const created = await tx.event.create({
        data: {
          title: trimmedTitle,
          startTime: parsedStart,
          endTime: parsedEnd,
          notes: notes !== undefined ? notes : (event.notes || ''),
          color: normalizedColor ?? event.color ?? DEFAULT_EVENT_COLOR,
          visibility: visibility || event.visibility,
          seriesId: effectiveSeriesId,
          ownerId: event.ownerId,
        },
      });

      await tx.eventPermission.create({
        data: {
          eventId: created.id,
          userId: event.ownerId,
          role: 'owner',
        },
      });

      return created;
    });

    res.json(createdOccurrence);
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit event occurrence' });
  }
};

export const editSeries = async (req, res) => {
  const userId = req.user?.id;
  const seriesId = req.params.seriesId;
  const { title, startTime, endTime, notes, visibility, color } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const normalizedColor = color !== undefined ? normalizeEventColor(color) : undefined;
  if (color !== undefined && !normalizedColor) {
    return res.status(400).json({ message: 'A valid hex color is required.' });
  }

  try {
    const rootEvent = await prisma.event.findUnique({ where: { id: seriesId } });
    if (!rootEvent || !rootEvent.rrule) {
      return res.status(404).json({ message: 'Recurring series not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && rootEvent.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can edit this series.' });
    }

    // Update the series root event with all provided fields
    const updatedRoot = await prisma.event.update({
      where: { id: seriesId },
      data: {
        ...(title ? { title } : {}),
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(normalizedColor ? { color: normalizedColor } : {}),
        ...(visibility ? { visibility } : {}),
      },
    });

    // Update all detached occurrences in the same series (title, notes, color only —
    // their individual start/end times are preserved as-is)
    const detachedUpdate = {};
    if (title) detachedUpdate.title = title;
    if (notes !== undefined) detachedUpdate.notes = notes;
    if (normalizedColor) detachedUpdate.color = normalizedColor;

    if (Object.keys(detachedUpdate).length > 0) {
      await prisma.event.updateMany({
        where: { seriesId, rrule: null },
        data: detachedUpdate,
      });
    }

    res.json(updatedRoot);
  } catch (error) {
    console.error('Edit series error:', error);
    res.status(500).json({ message: 'Failed to edit series' });
  }
};

export const deleteSeries = async (req, res) => {
  const userId = req.user?.id;
  const seriesId = req.params.seriesId;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const rootEvent = await prisma.event.findUnique({ where: { id: seriesId } });
    if (!rootEvent) {
      return res.status(404).json({ message: 'Series not found.' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && rootEvent.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can delete this series.' });
    }

    // Collect all event IDs in this series (root + detached occurrences)
    const allInSeries = await prisma.event.findMany({
      where: { OR: [{ id: seriesId }, { seriesId }] },
      select: { id: true },
    });
    const allIds = allInSeries.map((e) => e.id);

    await prisma.$transaction([
      prisma.eventPermission.deleteMany({ where: { eventId: { in: allIds } } }),
      prisma.event.deleteMany({ where: { id: { in: allIds } } }),
    ]);

    res.json({ message: 'Series deleted' });
  } catch (error) {
    console.error('Delete series error:', error);
    res.status(500).json({ message: 'Failed to delete series' });
  }
};

export const deleteEvent = async (req, res) => {
  const userId = req.user?.id;
  const eventId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && event.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can delete this event.' });
    }

    await prisma.$transaction([
      prisma.eventPermission.deleteMany({ where: { eventId } }),
      prisma.event.delete({ where: { id: eventId } }),
    ]);

    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete event' });
  }
};

export const deleteEventOccurrence = async (req, res) => {
  const userId = req.user?.id;
  const eventId = req.params.id;
  const occurrenceToken = normalizeOccurrenceStartToken(req.body?.occurrenceStart);

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  if (!occurrenceToken) {
    return res.status(400).json({ message: 'A valid occurrenceStart is required.' });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin && event.ownerId !== userId) {
      return res.status(403).json({ message: 'Only the owner can delete this event occurrence.' });
    }

    if (!event.rrule) {
      return res.status(400).json({ message: 'This event is not recurring.' });
    }

    const existingExdates = parseStoredExdates(event.exdates);
    if (!existingExdates.includes(occurrenceToken)) {
      existingExdates.push(occurrenceToken);
    }

    await prisma.event.update({
      where: { id: eventId },
      data: {
        exdates: JSON.stringify(existingExdates),
      },
    });

    res.json({ message: 'Event occurrence deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete event occurrence' });
  }
};

