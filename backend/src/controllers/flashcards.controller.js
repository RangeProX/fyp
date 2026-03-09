import prisma from '../config/prisma.js';

const MAX_FLASHCARDS_PER_REQUEST = 100;

const normalizeFlashcards = (rawFlashcards) => {
  if (!Array.isArray(rawFlashcards)) {
    return [];
  }

  return rawFlashcards
    .map((card) => ({
      front: String(card?.front || '').trim(),
      back: String(card?.back || '').trim(),
    }))
    .filter((card) => card.front && card.back);
};

export const saveFlashcards = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }

  const flashcards = normalizeFlashcards(req.body?.flashcards);

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
