import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/users.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
	fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
	// New credentials table (keeps existing users table untouched)
	db.run(`
		CREATE TABLE IF NOT EXISTS users_auth (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// File metadata table
	db.run(`
		CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			owner_id INTEGER NOT NULL,
			original_name TEXT NOT NULL,
			mime_type TEXT NOT NULL,
			size INTEGER NOT NULL,
			storage_path TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// File permissions table
	db.run(`
		CREATE TABLE IF NOT EXISTS file_permissions (
			file_id TEXT NOT NULL,
			user_id INTEGER NOT NULL,
			role TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(file_id, user_id)
		)
	`);
});

export default db;
