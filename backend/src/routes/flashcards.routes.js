import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { listSavedFlashcards, saveFlashcards } from '../controllers/flashcards.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', listSavedFlashcards);
router.post('/', saveFlashcards);

export default router;
