import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import aiRateLimitMiddleware from '../middleware/ai-rate-limit.middleware.js';
import {
  generateQuestions,
  generateFlashcards,
} from '../controllers/ai.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(aiRateLimitMiddleware);

router.post('/questions', generateQuestions);
router.post('/flashcards', generateFlashcards);

export default router;
