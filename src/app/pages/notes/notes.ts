import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { NotesList } from '../../widgets/notes-list/notes-list';

@Component({
  selector: 'app-notes',
  imports: [CommonModule, NotesList],
  templateUrl: './notes.html',
  styleUrl: './notes.css',
})
export class Notes {
  uploading = false;
  message = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  onUploadClick(input: HTMLInputElement) {
    input.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    this.uploading = true;
    this.message = '';

    this.http.post('/api/files/upload', formData)
      .pipe(finalize(() => {
        this.uploading = false;
        input.value = '';
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.message = 'File uploaded successfully';
          this.cdr.detectChanges();
        },
        error: (err) => {
          const serverMessage = typeof err?.error === 'string' ? err.error : err?.error?.message;
          this.message = serverMessage || err?.message || 'Upload failed';
          this.cdr.detectChanges();
        },
      });
  }

}
