import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middleware/auth.middleware.js';
import { downloadFile, listFiles, shareFile, uploadFile } from '../controllers/files.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    req.fileId = id;
    cb(null, `${id}${ext}`);
  },
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpg',
  'image/jpeg',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const allowedExtension = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
  '.doc',
  '.docx',
]);

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      req.fileValidationError = 'Unsupported file type';
      return cb(null, false);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtension.has(ext)) {
      req.fileValidationError = 'Unsupported file type';
      return cb(null, false);
    }
    
    return cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = express.Router();

router.post('/upload', authMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large (max 10MB)' });
      }
      return res.status(400).json({ message: 'Invalid upload' });
    }
    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }
    return next();
  });
}, uploadFile);
router.get('/', authMiddleware, listFiles);
router.get('/:id', authMiddleware, downloadFile);
router.post('/:id/share', authMiddleware, shareFile);

export default router;
