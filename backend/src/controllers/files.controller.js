import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '../../');

export const uploadFile = async (req, res) => {
  const file = req.file;
  const fileId = req.fileId;
  const userId = req.user?.id;

  if (!file || !fileId || !userId) {
    return res.status(400).json({ message: 'Invalid upload' });
  }

  const relativePath = path.relative(backendRoot, file.path);

  try {
    await prisma.$transaction([
      prisma.file.create({
        data: {
          id: fileId,
          ownerId: userId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
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
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  } catch (err) {
    fs.unlink(file.path, () => {});
    res.status(500).json({ message: 'Upload failed' });
  }
};

export const listFiles = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const rows = await prisma.file.findMany({
      where: {
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
        createdAt: true,
        ownerId: true,
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
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
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

export const shareFile = async (req, res) => {
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

  try {
    const access = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId },
      },
    });

    if (!access || access.role !== 'owner') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await prisma.userAuth.findUnique({ where: { username } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await prisma.filePermission.upsert({
      where: {
        fileId_userId: { fileId, userId: user.id },
      },
      update: { role: resolvedRole },
      create: {
        fileId,
        userId: user.id,
        role: resolvedRole,
      },
    });

    res.json({ message: 'File shared' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to share file' });
  }
};
