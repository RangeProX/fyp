import prisma from '../config/prisma.js';

const isAdminUser = async (userId) => {
  if (!userId) {
    return false;
  }
  const user = await prisma.userAuth.findUnique({ where: { id: userId } });
  return user?.username === 'admin';
};

export const createEvent = async (req, res) => {
  const userId = req.user?.id;
  const { title, startTime, endTime, notes, visibility } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
  if (!title || !startTime || !endTime) {
    return res.status(400).json({ message: 'Title, start time, and end time are required.' });
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          notes: notes || '',
          visibility: visibility || 'PRIVATE',
          ownerId: userId,
        },
      });

      await tx.eventPermission.create({
        data: {
          eventId: created.id,
          userId,
          role: 'owner',
        },
      });

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
  const { title, startTime, endTime, notes, visibility } = req.body || {};

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
      return res.status(403).json({ message: 'Only the owner can edit this event.' });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(title ? { title } : {}),
        ...(startTime ? { startTime: new Date(startTime) } : {}),
        ...(endTime ? { endTime: new Date(endTime) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(visibility ? { visibility } : {}),
      },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit event' });
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

