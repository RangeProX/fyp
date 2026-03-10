import prisma from '../config/prisma.js';

const MAX_FLASHCARDS_PER_REQUEST = 100;
const MAX_GROUP_LENGTH = 60;

const parseRequiredGroup = (rawGroup) => {
  const value = String(rawGroup ?? '').trim();

  if (!value) {
    return { error: 'group is required.' };
  }

  return { value: value.slice(0, MAX_GROUP_LENGTH) };
};

const normalizeFlashcards = (rawFlashcards, group) => {
  if (!Array.isArray(rawFlashcards)) {
    return [];
  }

  return rawFlashcards
    .map((card) => ({
      front: String(card?.front || '').trim(),
      back: String(card?.back || '').trim(),
      group,
    }))
    .filter((card) => card.front && card.back);
};

export const saveFlashcards = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const groupValidation = parseRequiredGroup(req.body?.group);

  if (groupValidation.error) {
    return res.status(400).json({ message: groupValidation.error });
  }

  const flashcards = normalizeFlashcards(req.body?.flashcards, groupValidation.value);

  if (flashcards.length === 0) {
    return res.status(400).json({ message: 'No valid flashcards were provided.' });
  }

  if (flashcards.length > MAX_FLASHCARDS_PER_REQUEST) {
    return res.status(400).json({
      message: `You can save up to ${MAX_FLASHCARDS_PER_REQUEST} flashcards at once.`,
    });
  }

  try {
    const result = await prisma.savedFlashcard.createMany({
      data: flashcards.map((card) => ({
        userId,
        group: card.group,
        front: card.front,
        back: card.back,
      })),
    });

    return res.status(201).json({
      message: 'Flashcards saved successfully.',
      savedCount: result.count,
    });
  } catch (error) {
    console.error('Save flashcards error:', error);
    return res.status(500).json({ message: 'Failed to save flashcards.' });
  }
};

export const listSavedFlashcards = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  try {
    const cards = await prisma.savedFlashcard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        group: true,
        front: true,
        back: true,
        createdAt: true,
      },
    });

    return res.json(cards || []);
  } catch (error) {
    console.error('List flashcards error:', error);
    return res.status(500).json({ message: 'Failed to load saved flashcards.' });
  }
};

export const deleteSavedFlashcards = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const ids = [...new Set(
    rawIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  if (ids.length === 0) {
    return res.status(400).json({ message: 'ids is required.' });
  }

  try {
    const result = await prisma.savedFlashcard.deleteMany({
      where: {
        userId,
        id: { in: ids },
      },
    });

    return res.json({
      message: 'Flashcards deleted successfully.',
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Delete flashcards error:', error);
    return res.status(500).json({ message: 'Failed to delete flashcards.' });
  }
};
