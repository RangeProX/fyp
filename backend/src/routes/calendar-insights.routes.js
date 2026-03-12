import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import aiRateLimitMiddleware from '../middleware/ai-rate-limit.middleware.js';
import {
  generateCalendarInsights,
  getInsightStatus
} from '../controllers/calendar-insights.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.get('/status', getInsightStatus);
router.post('/generate', aiRateLimitMiddleware, generateCalendarInsights);

export default router;