import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import filesRoutes from './routes/files.routes.js';
import eventsRoutes from './routes/events.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import aiRoutes from './routes/ai.routes.js';
import flashcardsRoutes from './routes/flashcards.routes.js';
import calendarInsightRoutes from './routes/calendar-insights.routes.js';
import prisma from './config/prisma.js';

const app = express();

app.use(cors({
  origin: ['http://localhost:4200'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

// development: Get all users (remove in production)
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.userAuth.findMany({
      select: { id: true, username: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users || []);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/flashcards', flashcardsRoutes);
app.use('/api/calendar-insights', calendarInsightRoutes);

app.get('/health', (req, res) => {
  res.json({ message: 'Backend is running' });
});

// centralized error handler
app.use((err, req, res, next) => {
  const status = err?.status || 500;
  const message = err?.message || 'Internal server error';
  res.status(status).json({ message });
});

export default app;
