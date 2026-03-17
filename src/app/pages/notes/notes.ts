import { ChangeDetectorRef, Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { NotesList } from '../../widgets/notes-list/notes-list';

type AiModalAction = 'questions' | 'flashcards';

@Component({
  selector: 'app-notes',
  imports: [CommonModule, FormsModule, RouterLink, NotesList],
  templateUrl: './notes.html',
  styleUrl: './notes.css',
})
export class Notes {
  readonly maxStagedFiles = 1;
  readonly createGroupingOption = '__internal_create_grouping_option__';
  readonly ungroupedGroupingOption = '__internal_ungrouped_grouping_option__';
  uploading = false;
  message = '';
  searchQuery = '';
  selectedCount = 0;
  isAddNotesModalOpen = false;
  isDeleteFilesModalOpen = false;
  pendingDeleteFileIds: string[] = [];
  activeAiModal: AiModalAction | null = null;
  pendingUploadFile: File | null = null;
  uploadFileName = '';
  uploadGroupingSelection = this.ungroupedGroupingOption;
  uploadNewGroupingName = '';
  uploadVisibility: 'PRIVATE' | 'PUBLIC' = 'PRIVATE';
  uploadFileType: 'NOTES' | 'PAST_YEAR_PAPER' | 'OTHER' = 'NOTES';
  isDragOver = false;
  questionsForm = { count: 8, difficulty: 'medium', type: 'mcq' };
  flashcardsForm = { count: 12, difficulty: 'medium' };
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(NotesList) notesList!: NotesList;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  triggerFileInput() {
    this.openAddNotesModal();
  }

  onSelectionCountChange(count: number) {
    this.selectedCount = count;
    this.cdr.detectChanges();
  }

  searchFiles() {
    if (!this.notesList) {
      return;
    }

    this.notesList.setSearchQuery(this.searchQuery);
    this.cdr.detectChanges();
  }

  openAddNotesModal() {
    this.pendingUploadFile = null;
    this.uploadFileName = '';
    this.uploadGroupingSelection = this.ungroupedGroupingOption;
    this.uploadNewGroupingName = '';
    this.uploadVisibility = 'PRIVATE';
    this.uploadFileType = 'NOTES';
    this.isDragOver = false;
    this.message = '';
    this.isAddNotesModalOpen = true;
    this.cdr.detectChanges();
  }

  closeAddNotesModal() {
    if (this.uploading) {
      return;
    }

    this.isAddNotesModalOpen = false;
    this.isDragOver = false;
    this.pendingUploadFile = null;
    this.cdr.detectChanges();
  }

  chooseFileFromModal() {
    if (this.uploading) {
      return;
    }

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.click();
    }
  }

  onUploadDragOver(event: DragEvent) {
    event.preventDefault();

    if (this.uploading) {
      return;
    }

    this.isDragOver = true;
    this.cdr.detectChanges();
  }

  onUploadDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    this.cdr.detectChanges();
  }

  onUploadDrop(event: DragEvent) {
    event.preventDefault();

    if (this.uploading) {
      return;
    }

    this.isDragOver = false;
    const files = event.dataTransfer?.files;

    if (!files || files.length === 0) {
      this.cdr.detectChanges();
      return;
    }

    if (files.length > this.maxStagedFiles) {
      this.message = `You can stage up to ${this.maxStagedFiles} file at a time.`;
      this.cdr.detectChanges();
      return;
    }

    const file = files[0];

    if (!file) {
      this.cdr.detectChanges();
      return;
    }

    this.stageUploadFile(file);
  }

  setUploadVisibility(value: 'PRIVATE' | 'PUBLIC') {
    this.uploadVisibility = value;
    this.cdr.detectChanges();
  }

  setUploadFileType(value: 'NOTES' | 'PAST_YEAR_PAPER' | 'OTHER') {
    this.uploadFileType = value;
    this.cdr.detectChanges();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
      return;
    }

    if (files.length > this.maxStagedFiles) {
      this.message = `You can stage up to ${this.maxStagedFiles} file at a time.`;
      input.value = '';
      this.cdr.detectChanges();
      return;
    }

    const file = files[0];

    if (!file) {
      return;
    }

    this.stageUploadFile(file);
    input.value = '';
  }

  submitUpload() {
    if (!this.pendingUploadFile || this.uploading) {
      return;
    }

    this.uploadSelectedFile(this.pendingUploadFile);
  }

  onUploadModalEnter(event: Event) {
    if (!this.isAddNotesModalOpen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.submitUpload();
  }

  get canUploadSelectedFile() {
    return !!this.pendingUploadFile && !this.uploading;
  }

  get existingUploadGroupingNames(): string[] {
    return this.notesList?.existingGroupingNames || [];
  }

  get isCreatingUploadGrouping() {
    return this.uploadGroupingSelection === this.createGroupingOption;
  }

  toExistingGroupingOption(groupName: string): string {
    return `existing:${encodeURIComponent(String(groupName || '').trim())}`;
  }

  private stageUploadFile(file: File) {
    this.pendingUploadFile = file;
    if (!this.uploadFileName.trim()) {
      this.uploadFileName = file.name;
    }
    this.message = '';
    this.cdr.detectChanges();
  }

  private uploadSelectedFile(file: File) {
    if (this.uploading) {
      return;
    }

    const resolvedGrouping = this.resolveUploadGroupingValue();
    if (resolvedGrouping === undefined) {
      this.message = 'Please select a grouping or enter a new grouping name.';
      this.cdr.detectChanges();
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', this.uploadFileName.trim());
    formData.append('groupName', resolvedGrouping || '');
    formData.append('visibility', this.uploadVisibility);
    formData.append('fileType', this.uploadFileType);

    this.uploading = true;
    this.message = '';

    this.http.post('/api/files/upload', formData)
      .pipe(finalize(() => {
        this.uploading = false;
        this.isDragOver = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.message = 'File uploaded successfully';
          this.pendingUploadFile = null;
          this.isAddNotesModalOpen = false;
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

  private resolveUploadGroupingValue(): string | null | undefined {
    const selection = String(this.uploadGroupingSelection || '').trim();

    if (!selection || selection === this.ungroupedGroupingOption) {
      return null;
    }

    if (selection === this.createGroupingOption) {
      const normalizedNewGroup = this.normalizeGroupingInput(this.uploadNewGroupingName);
      return normalizedNewGroup || undefined;
    }

    if (selection.startsWith('existing:')) {
      const encodedName = selection.slice('existing:'.length);
      let decodedName = encodedName;

      try {
        decodedName = decodeURIComponent(encodedName);
      } catch {
        decodedName = encodedName;
      }

      const normalizedExistingGroup = this.normalizeGroupingInput(decodedName);
      return normalizedExistingGroup || null;
    }

    return null;
  }

  private normalizeGroupingInput(value: string): string {
    const sanitized = String(value || '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return sanitized.slice(0, 80);
  }

  deleteSelectedFiles() {
    if (!this.notesList) {
      return;
    }

    const ids = this.notesList.getSelectedIds();
    if (ids.length === 0) {
      return;
    }

    this.pendingDeleteFileIds = ids;
    this.isDeleteFilesModalOpen = true;
    this.cdr.detectChanges();
  }

  closeDeleteFilesModal() {
    this.isDeleteFilesModalOpen = false;
    this.pendingDeleteFileIds = [];
    this.cdr.detectChanges();
  }

  confirmDeleteSelectedFiles() {
    if (!this.notesList || this.pendingDeleteFileIds.length === 0) {
      this.closeDeleteFilesModal();
      return;
    }

    const fileIds = [...this.pendingDeleteFileIds];
    this.closeDeleteFilesModal();
    this.notesList.deleteFiles(fileIds);
  }

  get pendingDeleteFilesCount() {
    return this.pendingDeleteFileIds.length;
  }

  editSelectedGrouping() {
    if (!this.notesList) {
      return;
    }

    const ids = this.notesList.getSelectedIds();
    if (ids.length === 0) {
      return;
    }

    this.notesList.openEditGroupingModal();
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

  runAiAction(action: AiModalAction) {
    if (!this.notesList || this.selectedCount === 0 || this.isAiLoading) {
      return;
    }

    this.activeAiModal = action;
    this.cdr.detectChanges();
  }

  closeAiModal() {
    this.activeAiModal = null;
    this.cdr.detectChanges();
  }

  get aiModalTitle() {
    if (this.activeAiModal === 'questions') {
      return 'Generate Questions';
    }

    return 'Generate Flashcards';
  }

  get aiModalDescription() {
    if (this.activeAiModal === 'questions') {
      return `Generate questions for ${this.selectedCount} selected file(s).`;
    }

    return `Generate flashcards for ${this.selectedCount} selected file(s).`;
  }

  get aiValidationMessage() {
    if (this.activeAiModal === 'questions' && !this.isQuestionsFormValid()) {
      return 'Questions count must be between 3 and 20.';
    }

    if (this.activeAiModal === 'flashcards' && !this.isFlashcardsFormValid()) {
      return 'Flashcards count must be between 5 and 30.';
    }

    return '';
  }

  get canRunAiAction() {
    if (!this.activeAiModal || this.selectedCount === 0 || this.isAiLoading) {
      return false;
    }

    if (this.activeAiModal === 'questions') {
      return this.isQuestionsFormValid();
    }

    return this.isFlashcardsFormValid();
  }

  confirmAiAction() {
    if (!this.notesList || !this.activeAiModal || !this.canRunAiAction) {
      return;
    }

    const action = this.activeAiModal;
    const payload: {
      count?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      type?: 'mcq' | 'short' | 'essay';
    } = {};

    if (action === 'questions') {
      const count = Math.min(Math.max(Math.round(Number(this.questionsForm.count) || 8), 3), 20);
      this.questionsForm.count = count;
      this.questionsForm.difficulty = this.questionsForm.difficulty || 'medium';
      this.questionsForm.type = this.questionsForm.type || 'mcq';
      payload.count = count;
      payload.difficulty = this.questionsForm.difficulty as 'easy' | 'medium' | 'hard';
      payload.type = this.questionsForm.type as 'mcq' | 'short' | 'essay';
    } else if (action === 'flashcards') {
      const count = Math.min(Math.max(Math.round(Number(this.flashcardsForm.count) || 12), 5), 30);
      this.flashcardsForm.count = count;
      this.flashcardsForm.difficulty = this.flashcardsForm.difficulty || 'medium';
      payload.difficulty = this.flashcardsForm.difficulty as 'easy' | 'medium' | 'hard';
      payload.count = count;
    }

    this.closeAiModal();
    this.notesList.runAiAction(action, payload);
    this.cdr.detectChanges();
  }

  private isQuestionsFormValid() {
    const count = Number(this.questionsForm.count);
    return Number.isFinite(count) && count >= 3 && count <= 20;
  }

  private isFlashcardsFormValid() {
    const count = Number(this.flashcardsForm.count);
    return Number.isFinite(count) && count >= 5 && count <= 30;
  }

  get isAiLoading() {
    return !!this.notesList?.aiLoading;
  }
}
