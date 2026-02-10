import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

@Component({
  selector: 'app-notes-list',
  imports: [CommonModule],
  templateUrl: './notes-list.html',
  styleUrl: './notes-list.css',
})
export class NotesList implements OnInit {
  files: FileItem[] = [];
  loading = true;
  error = '';

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

  deleteFile(fileId: string) {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    this.http.delete(`/api/files/${fileId}`)
      .subscribe({
        next: () => {
          this.loadFiles();
        },
        error: (err) => {
          console.error('Delete error:', err);
          const message = err?.error?.message || err?.statusText || 'Unknown error';
          alert('Failed to delete file: ' + message);
        },
      });
  }
}
