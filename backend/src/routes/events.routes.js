import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  createEvent,
  deleteEvent,
  listEvents,
  editEvent,
} from '../controllers/events.controller.js';

const router = express.Router();

router.post('/', authMiddleware, createEvent);
router.get('/', authMiddleware, listEvents);
router.put('/:id', authMiddleware, editEvent);
router.delete('/:id', authMiddleware, deleteEvent);

export default router;
