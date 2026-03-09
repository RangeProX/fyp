import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '../../');

const FILE_VISIBILITY_VALUES = new Set(['PRIVATE', 'PUBLIC']);
const FILE_TYPE_VALUES = new Set(['NOTES', 'PAST_YEAR_PAPER']);

const normalizeFileVisibility = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return FILE_VISIBILITY_VALUES.has(normalized) ? normalized : 'PRIVATE';
};

const normalizeFileType = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  return FILE_TYPE_VALUES.has(normalized) ? normalized : 'NOTES';
};

const normalizeFileName = (value, fallbackName) => {
  const fallback = String(fallbackName || 'file').trim() || 'file';
  const raw = String(value || '').trim();

  if (!raw) {
    return fallback;
  }

  const sanitized = raw
    .replace(/[\\/]/g, '-')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return fallback;
  }

  const fallbackExtension = path.extname(fallback);
  const hasExtension = path.extname(sanitized).length > 0;
  const withExtension = !hasExtension && fallbackExtension
    ? `${sanitized}${fallbackExtension}`
    : sanitized;

  return withExtension.slice(0, 255);
};

export const uploadFile = async (req, res) => {
  const file = req.file;
  const fileId = req.fileId;
  const userId = req.user?.id;
  const fileType = normalizeFileType(req.body?.fileType);
  const visibility = normalizeFileVisibility(req.body?.visibility);

  if (!file || !fileId || !userId) {
    return res.status(400).json({ message: 'Invalid upload' });
  }

  const relativePath = path.relative(backendRoot, file.path);
  const fileName = normalizeFileName(req.body?.fileName, file.originalname);

  // create row for file and persmission, if one fails, file doesnt upload.
  try {
    await prisma.$transaction([
      prisma.file.create({
        data: {
          id: fileId,
          ownerId: userId,
          originalName: fileName,
          mimeType: file.mimetype,
          size: file.size,
          fileType,
          visibility,
          storagePath: relativePath,
        },
      }),
      prisma.filePermission.create({
        data: {
          fileId,
          userId,
          role: 'owner',
        },
      }),
    ]);

    res.status(201).json({
      id: fileId,
      name: fileName,
      size: file.size,
      mimeType: file.mimetype,
      fileType,
      visibility,
    });
  } catch (err) {
    // if error, delete uploaded file
    fs.unlink(file.path, () => {});
    res.status(500).json({ message: 'Upload failed' });
  }
};

export const listFiles = async (req, res) => {
  const userId = req.user?.id;
  // check if user is logged in
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized, you are not logged in.' });
  }

  // display all files user has access to
  try {
    const user = await prisma.userAuth.findUnique({ where: { id: userId } });
    const isAdmin = user?.username === 'admin'; // admin bypass

    const rows = await prisma.file.findMany({
      where: isAdmin
        ? {}
        : {
          permissions: {
            some: { userId },
          },
        },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        fileType: true,
        visibility: true,
        createdAt: true,
        ownerId: true,
        owner: {
          select: {
            username: true,
          },
        },
      },
    });

    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch files' });
  }
};

export const downloadFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }

  try {
    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!access) {
      return res.status(403).json({ message: 'You have no access to this file.' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const absolutePath = path.join(backendRoot, file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.download(absolutePath, file.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch file' });
  }
};

export const previewFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }

  try {
    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!access) {
      return res.status(403).json({ message: 'You have no access to this file.' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    const absolutePath = path.join(backendRoot, file.storagePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    res.sendFile(absolutePath);
  } catch (err) {
    console.error('Preview file error:', err);
    res.status(500).json({ message: 'Failed to preview file' });
  }
};

export const shareFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;
  const { username } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }
  if (!username) {
    return res.status(400).json({ message: 'Username required' });
  }

  try {
    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!access || access.role !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can share this file.' });
    }

    const user = await prisma.userAuth.findUnique({ where: { username } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await prisma.filePermission.upsert({
      where: {
        fileId_userId: { fileId, userId: user.id },
      },
      update: { role: 'viewer' },
      create: {
        fileId,
        userId: user.id,
        role: 'viewer',
      },
    });

    res.json({ message: 'File shared' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to share file' });
  }
};

export const deleteFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }

  try {
    const user = await prisma.userAuth.findUnique({ where: { id: userId } });
    const isAdmin = user?.username === 'admin';

    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!isAdmin && (!access || access.role !== 'owner')) {
      return res.status(403).json({ message: 'Only the owner can delete this file.' });
    }

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete file from disk
    const absolutePath = path.join(backendRoot, file.storagePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    // Delete database records
    await prisma.$transaction([
      prisma.filePermission.deleteMany({ where: { fileId } }),
      prisma.file.delete({ where: { id: fileId } }),
    ]);

    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ message: 'Failed to delete file' });
  }
};
