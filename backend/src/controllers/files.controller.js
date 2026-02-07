import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '../../');

const getFileAccess = (fileId, userId, callback) => {
  db.get(
    'SELECT role FROM file_permissions WHERE file_id = ? AND user_id = ?',
    [fileId, userId],
    (err, row) => {
      if (err) return callback(err);
      return callback(null, row || null);
    }
  );
};

export const uploadFile = (req, res) => {
  const file = req.file;
  const fileId = req.fileId;
  const userId = req.user?.id;

  if (!file || !fileId || !userId) {
    return res.status(400).json({ message: 'Invalid upload' });
  }

  const relativePath = path.relative(backendRoot, file.path);

  db.run(
    'INSERT INTO files (id, owner_id, original_name, mime_type, size, storage_path) VALUES (?, ?, ?, ?, ?, ?)',
    [fileId, userId, file.originalname, file.mimetype, file.size, relativePath],
    function (err) {
      if (err) {
        fs.unlink(file.path, () => {});
        return res.status(500).json({ message: 'Upload failed' });
      }

      db.run(
        'INSERT INTO file_permissions (file_id, user_id, role) VALUES (?, ?, ?)',
        [fileId, userId, 'owner'],
        (permErr) => {
          if (permErr) {
            fs.unlink(file.path, () => {});
            return res.status(500).json({ message: 'Upload failed' });
          }

          res.status(201).json({
            id: fileId,
            name: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
          });
        }
      );
    }
  );
};

export const listFiles = (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  db.all(
    `
      SELECT f.id, f.original_name, f.mime_type, f.size, f.created_at, f.owner_id
      FROM files f
      JOIN file_permissions p ON p.file_id = f.id
      WHERE p.user_id = ?
      ORDER BY f.created_at DESC
    `,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to fetch files' });
      }
      res.json(rows || []);
    }
  );
};

export const downloadFile = (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  getFileAccess(fileId, userId, (accessErr, access) => {
    if (accessErr) {
      return res.status(500).json({ message: 'Failed to fetch permissions' });
    }
    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to fetch file' });
      }
      if (!file) {
        return res.status(404).json({ message: 'File not found' });
      }

      const absolutePath = path.join(backendRoot, file.storage_path);
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ message: 'File not found' });
      }

      res.download(absolutePath, file.original_name);
    });
  });
};

export const shareFile = (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;
  const { username, role } = req.body || {};
  const resolvedRole = role || 'viewer';

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!username) {
    return res.status(400).json({ message: 'Username required' });
  }

  getFileAccess(fileId, userId, (accessErr, access) => {
    if (accessErr) {
      return res.status(500).json({ message: 'Failed to fetch permissions' });
    }
    if (!access || access.role !== 'owner') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    db.get('SELECT id FROM users_auth WHERE username = ?', [username], (err, user) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to fetch user' });
      }
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      db.run(
        'INSERT OR REPLACE INTO file_permissions (file_id, user_id, role) VALUES (?, ?, ?)',
        [fileId, user.id, resolvedRole],
        (permErr) => {
          if (permErr) {
            return res.status(500).json({ message: 'Failed to share file' });
          }
          res.json({ message: 'File shared' });
        }
      );
    });
  });
};
