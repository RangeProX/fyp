import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { deleteSavedFlashcards, listSavedFlashcards, saveFlashcards } from '../controllers/flashcards.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', listSavedFlashcards);
router.post('/', saveFlashcards);
router.delete('/', deleteSavedFlashcards);

export default router;
