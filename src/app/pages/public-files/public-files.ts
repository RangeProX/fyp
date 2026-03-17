import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

interface PublicFileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileType?: 'NOTES' | 'PAST_YEAR_PAPER' | 'OTHER';
  visibility?: 'PRIVATE' | 'PUBLIC';
  createdAt: string;
  owner?: {
    username: string;
  };
}

@Component({
  selector: 'app-public-files',
  imports: [CommonModule, FormsModule],
  templateUrl: './public-files.html',
  styleUrl: './public-files.css',
})
export class PublicFiles implements OnInit {
  files: PublicFileItem[] = [];
  loading = true;
  error = '';
  searchQuery = '';
  appliedSearchQuery = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  goToFiles(): void {
    this.router.navigate(['/notes']);
  }

  ngOnInit(): void {
    this.loadPublicFiles();
  }

  loadPublicFiles(): void {
    this.loading = true;
    this.error = '';

    this.http.get<PublicFileItem[]>('/api/files/public').subscribe({
      next: (rows) => {
        this.files = Array.isArray(rows) ? rows : [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = err?.error?.message || err?.statusText || 'Failed to load public files.';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  searchFiles(): void {
    this.appliedSearchQuery = String(this.searchQuery || '').trim().toLowerCase();
    this.cdr.detectChanges();
  }

  get filteredFiles(): PublicFileItem[] {
    if (!this.appliedSearchQuery) {
      return this.files;
    }

    return this.files.filter((file) => {
      const owner = file.owner?.username || '';
      const type = file.fileType || '';
      const terms = [
        file.originalName,
        file.mimeType,
        owner,
        type,
        file.visibility || '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.includes(this.appliedSearchQuery);
    });
  }

  getFileExtension(file: PublicFileItem): string {
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

  formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + units[i];
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
  }

  previewFile(file: PublicFileItem): void {
    const previewable = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'text/plain',
    ]);

    this.http.get(`/api/files/${file.id}/preview`, { responseType: 'blob' }).subscribe({
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
        const message = err?.error?.message || err?.statusText || 'Failed to preview file.';
        window.alert(message);
      },
    });
  }

}
