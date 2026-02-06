import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import db from './config/db.js';

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
app.get('/api/users', (req, res) => {
   db.all('SELECT id, username, created_at FROM users_auth', (err, users) => {
    if (err) {
      return res.status(500).json({ message: 'Error fetching users' });
    }
    res.json(users || []);
  });
});

app.use('/api/auth', authRoutes);

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
