import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

interface FileItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  ownerId: string;
  showAnswer?: boolean;
  fileType?: 'NOTES' | 'PAST_YEAR_PAPER';
  visibility?: 'PRIVATE' | 'PUBLIC';
  owner?: {
    username: string;
  };
}

type AiAction = 'questions' | 'flashcards';

interface AiQuestion {
  question: string;
  answer: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'mcq' | 'short' | 'essay';
  options?: string[];
  correctOption?: string;
}

interface AiFlashcard {
  front: string;
  back: string;
}

interface AiResponse {
  fileIds: string[];
  result: {
    questions?: AiQuestion[];
    flashcards?: AiFlashcard[];
  };
}

interface PersistedAiState {
  action: AiAction;
  result: AiQuestion[] | AiFlashcard[];
}

interface SaveFlashcardsResponse {
  message: string;
  savedCount: number;
}

@Component({
  selector: 'app-notes-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './notes-list.html',
  styleUrl: './notes-list.css',
})
export class NotesList implements OnInit {
  private readonly aiStateStorageKey = 'notesList.aiState';
  files: FileItem[] = [];
  searchQuery = '';
  loading = true;
  error = '';
  selectedFileIds = new Set<string>();
  @Output() selectionCountChange = new EventEmitter<number>();
  aiLoading = false;
  aiError = '';
  aiAction: AiAction | null = null;
  aiResult: AiQuestion[] | AiFlashcard[] | null = null;
  showAnswer = false;
  flippedFlashcardIndexes = new Set<number>();
  isSelectingFlashcards = false;
  selectedFlashcardIndexes = new Set<number>();
  savingSelectedFlashcards = false;
  saveFlashcardsModalOpen = false;
  clearAiResultModalOpen = false;
  flashcardSetName = '';
  saveFlashcardsError = '';
  shareModalOpen = false;
  shareTargetId = '';
  shareUsername = '';
  shareError = '';
  shareSubmitting = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.restoreAiState();
    this.loadFiles();
  }

  loadFiles() {
    this.loading = true;
    this.error = '';
    this.http.get<FileItem[]>('/api/files')
      .subscribe({
        next: (data) => {
          this.files = data;
          const visibleIds = new Set(this.files.map((file) => file.id));
          Array.from(this.selectedFileIds).forEach((id) => {
            if (!visibleIds.has(id)) {
              this.selectedFileIds.delete(id);
            }
          });
          this.emitSelectionCount();
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

  setSearchQuery(query: string) {
    this.searchQuery = String(query || '').trim().toLowerCase();
    this.cdr.detectChanges();
  }

  get filteredFiles(): FileItem[] {
    if (!this.searchQuery) {
      return this.files;
    }

    return this.files.filter((file) => {
      const owner = file.owner?.username || '';
      const type = file.fileType || '';
      const visibility = file.visibility || '';
      const terms = [
        file.originalName,
        file.mimeType,
        owner,
        type,
        visibility,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.includes(this.searchQuery);
    });
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

    this.deleteFiles([fileId]);
  }

  deleteFiles(fileIds: string[]) {
    if (fileIds.length === 0) {
      return;
    }

    const requests = fileIds.map((id) => this.http.delete(`/api/files/${id}`));
    forkJoin(requests).subscribe({
      next: () => {
        fileIds.forEach((id) => this.selectedFileIds.delete(id));
        this.emitSelectionCount();
        this.loadFiles();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Bulk delete error:', err);
        const message = err?.error?.message || err?.statusText || 'Unknown error';
        alert('Failed to delete files: ' + message);
        this.cdr.detectChanges();
      },
    });
  }

  toggleSelectFile(fileId: string) {
    if (this.selectedFileIds.has(fileId)) {
      this.selectedFileIds.delete(fileId);
    } else {
      this.selectedFileIds.add(fileId);
    }
    this.emitSelectionCount();
    this.cdr.detectChanges();
  }

  isSelected(fileId: string) {
    return this.selectedFileIds.has(fileId);
  }

  getSelectedIds() {
    return Array.from(this.selectedFileIds);
  }

  getSelectedCount() {
    return this.selectedFileIds.size;
  }

  clearSelection() {
    this.selectedFileIds.clear();
    this.emitSelectionCount();
    this.cdr.detectChanges();
  }

  private emitSelectionCount() {
    this.selectionCountChange.emit(this.selectedFileIds.size);
  }

  runAiAction(action: AiAction, options?: {
    count?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    type?: 'mcq' | 'short' | 'essay';
  }) {
    if (this.selectedFileIds.size === 0) {
      return;
    }

    const ids = Array.from(this.selectedFileIds);
    const endpointByAction: Record<AiAction, string> = {
      questions: '/api/ai/questions',
      flashcards: '/api/ai/flashcards',
    };

    this.aiLoading = true;
    this.aiError = '';
    this.aiAction = action;
    this.aiResult = null;
    if (action === 'questions') {
      this.showAnswer = false;
    }
    this.flippedFlashcardIndexes.clear();
    this.isSelectingFlashcards = false;
    this.selectedFlashcardIndexes.clear();
    this.cdr.detectChanges();

    const payload: {
      fileIds: string[];
      count?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      type?: 'mcq' | 'short' | 'essay';
    } = {
      fileIds: ids,
    };

    if (typeof options?.count === 'number' && Number.isFinite(options.count)) {
      payload.count = options.count;
    }

    if (options?.difficulty) {
      payload.difficulty = options.difficulty;
    }

    if (options?.type) {
      payload.type = options.type;
    }

    this.http.post<AiResponse>(endpointByAction[action], payload)
      .subscribe({
        next: (response) => {
          if (action === 'questions') {
            this.aiResult = response?.result?.questions || [];
          } else if (action === 'flashcards') {
            this.aiResult = response?.result?.flashcards || [];
            this.cdr.detectChanges();
          }

          this.persistAiState();

          this.aiLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.aiLoading = false;
          this.aiResult = null;
          this.aiError =
            err?.error?.message ||
            err?.error?.error ||
            err?.statusText ||
            'Failed to run AI action.';
          this.cdr.detectChanges();
        },
      });
  }

  clearAiResult() {
    this.clearAiResultModalOpen = false;
    this.aiLoading = false;
    this.aiError = '';
    this.aiAction = null;
    this.aiResult = null;
    this.flippedFlashcardIndexes.clear();
    this.isSelectingFlashcards = false;
    this.selectedFlashcardIndexes.clear();
    localStorage.removeItem(this.aiStateStorageKey);
    this.cdr.detectChanges();
  }

  openClearAiResultModal() {
    if (!this.hasAiResult) {
      return;
    }

    this.clearAiResultModalOpen = true;
    this.cdr.detectChanges();
  }

  closeClearAiResultModal() {
    this.clearAiResultModalOpen = false;
    this.cdr.detectChanges();
  }

  confirmClearAiResult() {
    this.clearAiResult();
  }

  get hasAiResult() {
    if (!this.aiAction || !this.aiResult) {
      return false;
    }

    return Array.isArray(this.aiResult) && this.aiResult.length > 0;
  }

  get questionResults(): AiQuestion[] {
    if (this.aiAction !== 'questions' || !Array.isArray(this.aiResult)) {
      return [];
    }

    return this.aiResult as AiQuestion[];
  }

  getQuestionAnswer(item: AiQuestion) {
    const optionKey = String(item?.correctOption || '').trim().toUpperCase();

    if (Array.isArray(item?.options) && item.options.length > 0 && optionKey) {
      const matchedOption = item.options.find((option) =>
        String(option || '').trim().toUpperCase().startsWith(`${optionKey})`)
      );

      if (matchedOption) {
        return matchedOption;
      }
    }

    return String(item?.answer || '').trim();
  }

  get flashcardResults(): AiFlashcard[] {
    if (this.aiAction !== 'flashcards' || !Array.isArray(this.aiResult)) {
      return [];
    }

    return this.aiResult as AiFlashcard[];
  }

  toggleFlashcard(index: number) {
    if (this.isSelectingFlashcards) {
      if (this.selectedFlashcardIndexes.has(index)) {
        this.selectedFlashcardIndexes.delete(index);
      } else {
        this.selectedFlashcardIndexes.add(index);
      }

      this.cdr.detectChanges();
      return;
    }

    if (this.flippedFlashcardIndexes.has(index)) {
      this.flippedFlashcardIndexes.delete(index);
    } else {
      this.flippedFlashcardIndexes.add(index);
    }

    this.cdr.detectChanges();
  }

  isFlashcardFlipped(index: number) {
    return this.flippedFlashcardIndexes.has(index);
  }

  selectFlashcards() {
    if (this.aiAction !== 'flashcards') {
      return;
    }

    this.isSelectingFlashcards = true;
    this.flippedFlashcardIndexes.clear();

    this.cdr.detectChanges();
  }

  cancelSelectFlashcards() {
    this.isSelectingFlashcards = false;
    this.selectedFlashcardIndexes.clear();

    this.cdr.detectChanges();
  }

  get allFlashcardsSelected() {
    const total = this.flashcardResults.length;

    if (total === 0) {
      return false;
    }

    return this.flashcardResults.every((_, index) => this.selectedFlashcardIndexes.has(index));
  }

  toggleSelectAllFlashcards() {
    if (this.aiAction !== 'flashcards' || !this.isSelectingFlashcards || this.savingSelectedFlashcards) {
      return;
    }

    const total = this.flashcardResults.length;

    if (total === 0) {
      return;
    }

    if (this.allFlashcardsSelected) {
      this.selectedFlashcardIndexes.clear();
    } else {
      this.selectedFlashcardIndexes.clear();
      for (let index = 0; index < total; index += 1) {
        this.selectedFlashcardIndexes.add(index);
      }
    }

    this.cdr.detectChanges();
  }

  openSaveFlashcardsModal() {
    if (this.aiAction !== 'flashcards' || !this.canSaveSelectedFlashcards) {
      return;
    }

    this.saveFlashcardsModalOpen = true;
    this.flashcardSetName = String(this.flashcardSetName || '').trim();
    this.saveFlashcardsError = '';

    this.cdr.detectChanges();
  }

  closeSaveFlashcardsModal() {
    this.saveFlashcardsModalOpen = false;
    this.flashcardSetName = '';
    this.saveFlashcardsError = '';

    this.cdr.detectChanges();
  }

  saveSelectedFlashcards() {
    if (this.aiAction !== 'flashcards' || this.savingSelectedFlashcards) {
      return;
    }

    const group = String(this.flashcardSetName || '').trim();

    if (!group) {
      this.saveFlashcardsError = 'Group name is required.';
      this.cdr.detectChanges();
      return;
    }

    this.saveFlashcardsError = '';

    const selectedCards = Array.from(this.selectedFlashcardIndexes)
      .map((index) => this.flashcardResults[index])
      .filter((card): card is AiFlashcard => !!card)
      .map((card) => ({
        front: String(card.front || '').trim(),
        back: String(card.back || '').trim(),
      }))
      .filter((card) => card.front && card.back);

    if (selectedCards.length === 0) {
      alert('Please select at least one flashcard to save.');
      return;
    }

    this.savingSelectedFlashcards = true;

    this.http.post<SaveFlashcardsResponse>('/api/flashcards', { flashcards: selectedCards, group })
      .subscribe({
        next: (response) => {
          const savedCount = Number(response?.savedCount) || selectedCards.length;
          alert(`${savedCount} flashcard(s) saved.`);
          this.saveFlashcardsModalOpen = false;
          this.flashcardSetName = '';
          this.isSelectingFlashcards = false;
          this.selectedFlashcardIndexes.clear();
          this.savingSelectedFlashcards = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          const message = err?.error?.message || err?.statusText || 'Failed to save flashcards.';
          alert(message);
          this.savingSelectedFlashcards = false;
          this.cdr.detectChanges();
        },
      });
  }

  get canSubmitSaveFlashcards() {
    const group = String(this.flashcardSetName || '').trim();
    return this.canSaveSelectedFlashcards && group.length > 0;
  }

  get canSaveSelectedFlashcards() {
    return this.selectedFlashcardIndexes.size > 0 && !this.savingSelectedFlashcards;
  }

  get selectedFlashcardCount() {
    return this.selectedFlashcardIndexes.size;
  }

  isFlashcardSelected(index: number) {
    return this.selectedFlashcardIndexes.has(index);
  }

  private persistAiState() {
    if (!this.aiAction || !Array.isArray(this.aiResult) || this.aiResult.length === 0) {
      localStorage.removeItem(this.aiStateStorageKey);
      return;
    }

    const payload: PersistedAiState = {
      action: this.aiAction,
      result: this.aiResult,
    };

    try {
      localStorage.setItem(this.aiStateStorageKey, JSON.stringify(payload));
    } catch {
      localStorage.removeItem(this.aiStateStorageKey);
    }
  }

  private restoreAiState() {
    const raw = localStorage.getItem(this.aiStateStorageKey);

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedAiState;

      if (parsed.action === 'questions') {
        const questions = Array.isArray(parsed.result)
          ? parsed.result.filter((item): item is AiQuestion => {
            const question = item as AiQuestion;
            return typeof question?.question === 'string' && typeof question?.answer === 'string';
          })
          : [];

        if (questions.length > 0) {
          this.aiAction = 'questions';
          this.aiResult = questions;
        }
      } else if (parsed.action === 'flashcards') {
        const flashcards = Array.isArray(parsed.result)
          ? parsed.result.filter((item): item is AiFlashcard => {
            const flashcard = item as AiFlashcard;
            return typeof flashcard?.front === 'string' && typeof flashcard?.back === 'string';
          })
          : [];

        if (flashcards.length > 0) {
          this.aiAction = 'flashcards';
          this.aiResult = flashcards;
        }
      }
    } catch {
      localStorage.removeItem(this.aiStateStorageKey);
    }
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

  toggleShowAnswer() {
    this.showAnswer = !this.showAnswer;
    this.cdr.detectChanges();
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
