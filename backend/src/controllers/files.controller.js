import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '../../');

const FILE_VISIBILITY_VALUES = new Set(['PRIVATE', 'PUBLIC']);
const FILE_TYPE_VALUES = new Set(['NOTES', 'PAST_YEAR_PAPER', 'OTHER']);

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

const normalizeFileGroupName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const sanitized = raw
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sanitized) {
    return null;
  }

  return sanitized.slice(0, 80);
};

export const uploadFile = async (req, res) => {
  const file = req.file;
  const fileId = req.fileId;
  const userId = req.user?.id;
  const fileType = normalizeFileType(req.body?.fileType);
  const visibility = normalizeFileVisibility(req.body?.visibility);
  const groupName = normalizeFileGroupName(req.body?.groupName);

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
          groupName,
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
      groupName,
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
        groupName: true,
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

export const listPublicFiles = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized, you are not logged in.' });
  }

  try {
    const rows = await prisma.file.findMany({
      where: {
        visibility: 'PUBLIC',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        originalName: true,
        groupName: true,
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

    return res.json(rows || []);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch public files' });
  }
};

export const downloadFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }

  try {
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.visibility !== 'PUBLIC') {
      const access = await prisma.filePermission.findUnique({
        where: {
          fileId_userId: { fileId, userId },
        },
      });

      if (!access) {
        return res.status(403).json({ message: 'You have no access to this file.' });
      }
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
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    if (file.visibility !== 'PUBLIC') {
      const access = await prisma.filePermission.findUnique({
        where: {
          fileId_userId: { fileId, userId },
        },
      });

      if (!access) {
        return res.status(403).json({ message: 'You have no access to this file.' });
      }
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

export const listSharedUsers = async (req, res) => {
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

    if (!access || access.role !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can view shared users.' });
    }

    const rows = await prisma.filePermission.findMany({
      where: {
        fileId,
        NOT: { role: 'owner' },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    const users = rows
      .map((row) => ({
        username: row.user?.username,
        role: row.role,
      }))
      .filter((row) => Boolean(row.username));

    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch shared users' });
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

export const unshareFile = async (req, res) => {
  const userId = req.user?.id;
  const fileId = req.params.id;
  const username = String(req.body?.username || '').trim();

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
      return res.status(403).json({ message: 'Only the owner can unshare this file.' });
    }

    const targetUser = await prisma.userAuth.findUnique({ where: { username } });
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ message: 'Owner access cannot be removed.' });
    }

    const targetPermission = await prisma.filePermission.findUnique({
      where: {
        fileId_userId: { fileId, userId: targetUser.id },
      },
    });

    if (!targetPermission) {
      return res.status(404).json({ message: 'This user does not have access to the file.' });
    }

    if (targetPermission.role === 'owner') {
      return res.status(400).json({ message: 'Owner access cannot be removed.' });
    }

    await prisma.filePermission.delete({
      where: {
        fileId_userId: { fileId, userId: targetUser.id },
      },
    });

    return res.json({ message: 'File unshared' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to unshare file' });
  }
};

export const updateFileGrouping = async (req, res) => {
  const userId = req.user?.id;
  const rawFileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
  const fileIds = Array.from(
    new Set(
      rawFileIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );

  if (!userId) {
    return res.status(401).json({ message: 'You are not logged in.' });
  }

  if (fileIds.length === 0) {
    return res.status(400).json({ message: 'At least one file must be selected.' });
  }

  const groupName = req.body?.groupName === null
    ? null
    : normalizeFileGroupName(req.body?.groupName);

  try {
    const user = await prisma.userAuth.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const isAdmin = user?.username === 'admin';

    let updatableFileIds = [];

    if (isAdmin) {
      const rows = await prisma.file.findMany({
        where: { id: { in: fileIds } },
        select: { id: true },
      });

      updatableFileIds = rows.map((row) => row.id);
    } else {
      const ownerAccessRows = await prisma.filePermission.findMany({
        where: {
          userId,
          role: 'owner',
          fileId: { in: fileIds },
        },
        select: { fileId: true },
      });

      updatableFileIds = ownerAccessRows.map((row) => row.fileId);
    }

    if (updatableFileIds.length === 0) {
      return res.status(403).json({ message: 'Only file owners can edit grouping.' });
    }

    const result = await prisma.file.updateMany({
      where: { id: { in: updatableFileIds } },
      data: { groupName },
    });

    const skippedCount = Math.max(fileIds.length - updatableFileIds.length, 0);

    return res.json({
      message: 'File grouping updated',
      updatedCount: result.count,
      skippedCount,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update file grouping' });
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
