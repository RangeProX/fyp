import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  createEvent,
  deleteEvent,
  deleteEventOccurrence,
  deleteSeries,
  editEventOccurrence,
  editSeries,
  listEvents,
  editEvent,
} from '../controllers/events.controller.js';

const router = express.Router();

router.post('/', authMiddleware, createEvent);
router.get('/', authMiddleware, listEvents);
// Series-level routes must come before /:id to avoid being matched as an id='series'
router.put('/series/:seriesId', authMiddleware, editSeries);
router.delete('/series/:seriesId', authMiddleware, deleteSeries);
router.put('/:id', authMiddleware, editEvent);
router.post('/:id/edit-occurrence', authMiddleware, editEventOccurrence);
router.post('/:id/delete-occurrence', authMiddleware, deleteEventOccurrence);
router.delete('/:id', authMiddleware, deleteEvent);

export default router;
