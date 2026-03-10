import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  createSession,
  listSessions,
  getSessionById,
  updateSession,
  deleteSession,
  regenerateSessionInsight,
} from '../controllers/sessions.controller.js';

const router = express.Router();

router.post('/', authMiddleware, createSession);
router.get('/', authMiddleware, listSessions);
router.get('/:id', authMiddleware, getSessionById);
router.post('/:id/insight', authMiddleware, regenerateSessionInsight);
router.put('/:id', authMiddleware, updateSession);
router.delete('/:id', authMiddleware, deleteSession);

export default router;
