import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  ownerId: string;
  owner?: {
    username: string;
  };
}

@Component({
  selector: 'app-notes-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './notes-list.html',
  styleUrl: './notes-list.css',
})
export class NotesList implements OnInit {
  files: FileItem[] = [];
  loading = true;
  error = '';
  shareModalOpen = false;
  shareTargetId = '';
  shareUsername = '';
  shareError = '';
  shareSubmitting = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadFiles();
  }

  loadFiles() {
    this.loading = true;
    this.error = '';
    this.http.get<FileItem[]>('/api/files')
      .subscribe({
        next: (data) => {
          this.files = data;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load files';
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + units[i];
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
  }

  getFileExtension(file: FileItem): string {
    const name = file.originalName || '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot > -1 && lastDot < name.length - 1) {
      return name.slice(lastDot + 1).toLowerCase();
    }
    const mime = file.mimeType || '';
    const slashIndex = mime.indexOf('/');
    if (slashIndex > -1 && slashIndex < mime.length - 1) {
      return mime.slice(slashIndex + 1).toLowerCase();
    }
    return 'unknown';
  }

  deleteFile(fileId: string) {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    this.http.delete(`/api/files/${fileId}`)
      .subscribe({
        next: () => {
          this.loadFiles();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Delete error:', err);
          const message = err?.error?.message || err?.statusText || 'Unknown error';
          alert('Failed to delete file: ' + message);
          this.cdr.detectChanges();
        },
      });
  }

  openShareModal(fileId: string) {
    this.shareTargetId = fileId;
    this.shareUsername = '';
    this.shareError = '';
    this.shareSubmitting = false;
    this.shareModalOpen = true;
    this.cdr.detectChanges();
  }

  closeShareModal() {
    this.shareModalOpen = false;
    this.shareError = '';
    this.cdr.detectChanges();
  }

  submitShare() {
    const username = this.shareUsername.trim();
    if (!username) {
      this.shareError = 'Username is required.';
      this.cdr.detectChanges();
      return;
    }

    this.shareSubmitting = true;
    this.shareError = '';

    this.http.post(`/api/files/${this.shareTargetId}/share`, { username })
      .subscribe({
        next: () => {
          this.shareSubmitting = false;
          this.closeShareModal();
        },
        error: (err) => {
          const message = err?.error?.message || err?.statusText || 'Unknown error';
          this.shareError = 'Failed to share file: ' + message;
          this.shareSubmitting = false;
          this.cdr.detectChanges();
        },
      });
  }

  previewFile(file: FileItem) {
    const previewable = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'text/plain',
    ]);

    this.http.get(`/api/files/${file.id}/preview`, { responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          if (previewable.has(file.mimeType)) {
            window.open(url, '_blank');
            setTimeout(() => window.URL.revokeObjectURL(url), 30000);
            return;
          }

          const a = document.createElement('a');
          a.href = url;
          a.download = file.originalName || 'download';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          const message = err?.error?.message || err?.statusText || 'Unknown error';
          alert('Failed to preview file: ' + message);
        },
      });
  }
}
