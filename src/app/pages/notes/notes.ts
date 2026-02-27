import { ChangeDetectorRef, Component, ViewChild, ElementRef } from '@angular/core';
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
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(NotesList) notesList!: NotesList;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  triggerFileInput() {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.click();
    }
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
          this.notesList.loadFiles();
          this.cdr.detectChanges();
          setTimeout(() => {
            this.message = '';
            this.cdr.detectChanges();
          }, 3000);
        },
        error: (err) => {
          const serverMessage = typeof err?.error === 'string' ? err.error : err?.error?.message;
          this.message = serverMessage || err?.message || 'Upload failed';
          this.cdr.detectChanges();
        },
      });
  }

  deleteSelectedFiles() {
    if (!this.notesList) {
      return;
    }

    const ids = this.notesList.getSelectedIds();
    if (ids.length === 0) {
      return;
    }

    if (!confirm(`Delete ${ids.length} selected file(s)?`)) {
      return;
    }

    this.notesList.deleteFiles(ids);
  }

  shareSelectedFiles() {
    if (!this.notesList) {
      return;
    }

    const ids = this.notesList.getSelectedIds();
    if (ids.length === 0) {
      return;
    }

    if (ids.length > 1) {
      alert('Please select a single file to share.');
      return;
    }

    this.notesList.openShareModal(ids[0]);
  }

}
