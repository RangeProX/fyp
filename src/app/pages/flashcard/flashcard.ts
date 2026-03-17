import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

interface SavedFlashcard {
  id: number;
  group: string;
  front: string;
  back: string;
  createdAt: string;
}

interface FlashcardGroup {
  name: string;
  cards: SavedFlashcard[];
}

interface DeleteFlashcardsResponse {
  message: string;
  deletedCount: number;
}

interface UpdateFlashcardsGroupingResponse {
  message?: string;
  updatedCount?: number;
  skippedCount?: number;
}

@Component({
  selector: 'app-flashcard',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './flashcard.html',
  styleUrl: './flashcard.css',
})
export class Flashcard implements OnInit {
  readonly allGroupOption = 'All';
  readonly createGroupingOption = '__internal_create_grouping_option__';
  flashcards: SavedFlashcard[] = [];
  groupedFlashcards: FlashcardGroup[] = [];
  selectedGroup = this.allGroupOption;
  searchQuery = '';
  loading = true;
  error = '';
  flippedFlashcardIds = new Set<number>();
  isSelectingFlashcards = false;
  selectedFlashcardIds = new Set<number>();
  deletingSelectedFlashcards = false;
  editGroupingModalOpen = false;
  editGroupingSubmitting = false;
  editGroupingError = '';
  editGroupingSelection = '';
  newGroupingName = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadSavedFlashcards();
  }

  loadSavedFlashcards() {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    this.http.get<SavedFlashcard[]>('/api/flashcards')
      .subscribe({
        next: (cards) => {
          this.flashcards = Array.isArray(cards) ? cards : [];
          this.groupedFlashcards = this.buildGroupedFlashcards(this.flashcards);

          const hasSelectedGroup = this.groupedFlashcards.some((group) => group.name === this.selectedGroup);
          if (this.selectedGroup !== this.allGroupOption && !hasSelectedGroup) {
            this.selectedGroup = this.allGroupOption;
          }

          this.flippedFlashcardIds.clear();
          this.isSelectingFlashcards = false;
          this.selectedFlashcardIds.clear();
          this.deletingSelectedFlashcards = false;
          this.editGroupingModalOpen = false;
          this.editGroupingSubmitting = false;
          this.editGroupingError = '';
          this.editGroupingSelection = '';
          this.newGroupingName = '';
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.groupedFlashcards = [];
          this.isSelectingFlashcards = false;
          this.selectedFlashcardIds.clear();
          this.deletingSelectedFlashcards = false;
          this.editGroupingModalOpen = false;
          this.editGroupingSubmitting = false;
          this.editGroupingError = '';
          this.editGroupingSelection = '';
          this.newGroupingName = '';
          this.error = err?.error?.message || err?.statusText || 'Failed to load saved flashcards.';
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
  }

  private buildGroupedFlashcards(cards: SavedFlashcard[]): FlashcardGroup[] {
    const grouped = new Map<string, SavedFlashcard[]>();

    cards.forEach((card) => {
      const groupName = String(card.group || '').trim();

      if (!groupName) {
        return;
      }

      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }

      grouped.get(groupName)?.push(card);
    });

    return Array.from(grouped.entries()).map(([name, cards]) => ({ name, cards }));
  }

  get groupOptions() {
    return this.groupedFlashcards.map((group) => group.name);
  }

  get existingGroupingNames() {
    const uniqueNames = new Set<string>();

    this.flashcards.forEach((card) => {
      const name = String(card.group || '').trim();
      if (name) {
        uniqueNames.add(name);
      }
    });

    return Array.from(uniqueNames).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' })
    );
  }

  get isCreatingNewGrouping() {
    return this.editGroupingSelection === this.createGroupingOption;
  }

  get canSubmitEditGrouping() {
    if (this.editGroupingSubmitting || this.selectedFlashcardIds.size === 0) {
      return false;
    }

    return this.resolveEditGroupingValue() !== undefined;
  }

  toExistingGroupingOption(groupName: string): string {
    return `existing:${encodeURIComponent(String(groupName || '').trim())}`;
  }

  get visibleGroupedFlashcards() {
    const normalizedQuery = String(this.searchQuery || '').trim().toLowerCase();

    const selectedGroups = this.selectedGroup === this.allGroupOption
      ? this.groupedFlashcards
      : this.groupedFlashcards.filter((group) => group.name === this.selectedGroup);

    if (!normalizedQuery) {
      return selectedGroups;
    }

    return selectedGroups
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) =>
          String(card.front || '').toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.cards.length > 0);
  }

  trackByGroupName(_index: number, group: FlashcardGroup) {
    return group.name;
  }

  trackByCardId(_index: number, card: SavedFlashcard) {
    return card.id;
  }

  toggleFlashcard(cardId: number) {
    if (this.isSelectingFlashcards) {
      if (this.selectedFlashcardIds.has(cardId)) {
        this.selectedFlashcardIds.delete(cardId);
      } else {
        this.selectedFlashcardIds.add(cardId);
      }
      return;
    }

    if (this.flippedFlashcardIds.has(cardId)) {
      this.flippedFlashcardIds.delete(cardId);
    } else {
      this.flippedFlashcardIds.add(cardId);
    }
  }

  isFlashcardFlipped(cardId: number) {
    return this.flippedFlashcardIds.has(cardId);
  }

  isFlashcardSelected(cardId: number) {
    return this.selectedFlashcardIds.has(cardId);
  }

  isGroupFullySelected(groupName: string) {
    const targetGroup = this.groupedFlashcards.find((group) => group.name === groupName);
    if (!targetGroup || targetGroup.cards.length === 0) {
      return false;
    }

    return targetGroup.cards.every((card) => this.selectedFlashcardIds.has(card.id));
  }

  selectFlashcardsInGroup(groupName: string) {
    if (!this.isSelectingFlashcards || this.deletingSelectedFlashcards) {
      return;
    }

    const targetGroup = this.groupedFlashcards.find((group) => group.name === groupName);
    if (!targetGroup || targetGroup.cards.length === 0) {
      return;
    }

    const allCardsInGroupSelected = targetGroup.cards.every((card) => this.selectedFlashcardIds.has(card.id));

    if (allCardsInGroupSelected) {
      targetGroup.cards.forEach((card) => this.selectedFlashcardIds.delete(card.id));
    } else {
      targetGroup.cards.forEach((card) => this.selectedFlashcardIds.add(card.id));
    }

    this.cdr.detectChanges();
  }

  selectFlashcards() {
    this.isSelectingFlashcards = true;
    this.selectedFlashcardIds.clear();
    this.flippedFlashcardIds.clear();
    this.cdr.detectChanges();
  }

  cancelSelectFlashcards() {
    this.isSelectingFlashcards = false;
    this.selectedFlashcardIds.clear();
    this.deletingSelectedFlashcards = false;
    this.editGroupingModalOpen = false;
    this.editGroupingSubmitting = false;
    this.editGroupingError = '';
    this.editGroupingSelection = '';
    this.newGroupingName = '';
    this.cdr.detectChanges();
  }

  get selectedFlashcardCount() {
    return this.selectedFlashcardIds.size;
  }

  get canDeleteSelectedFlashcards() {
    return this.selectedFlashcardIds.size > 0 && !this.deletingSelectedFlashcards;
  }

  openEditGroupingModal() {
    if (!this.isSelectingFlashcards || this.selectedFlashcardIds.size === 0 || this.deletingSelectedFlashcards) {
      return;
    }

    const selectedCards = this.flashcards.filter((card) => this.selectedFlashcardIds.has(card.id));
    const selectedGroupNames = Array.from(
      new Set(selectedCards.map((card) => String(card.group || '').trim()))
    );

    if (selectedGroupNames.length === 1) {
      this.editGroupingSelection = this.toExistingGroupingOption(selectedGroupNames[0]);
    } else {
      this.editGroupingSelection = '';
    }

    this.newGroupingName = '';
    this.editGroupingError = '';
    this.editGroupingSubmitting = false;
    this.editGroupingModalOpen = true;
    this.cdr.detectChanges();
  }

  closeEditGroupingModal() {
    if (this.editGroupingSubmitting) {
      return;
    }

    this.editGroupingModalOpen = false;
    this.editGroupingSubmitting = false;
    this.editGroupingError = '';
    this.editGroupingSelection = '';
    this.newGroupingName = '';
    this.cdr.detectChanges();
  }

  submitEditGrouping() {
    if (this.editGroupingSubmitting) {
      return;
    }

    const selectedIds = Array.from(this.selectedFlashcardIds);
    if (selectedIds.length === 0) {
      this.editGroupingError = 'Select at least one flashcard first.';
      this.cdr.detectChanges();
      return;
    }

    const resolvedGrouping = this.resolveEditGroupingValue();
    if (resolvedGrouping === undefined) {
      this.editGroupingError = 'Please select a grouping or enter a new grouping name.';
      this.cdr.detectChanges();
      return;
    }

    this.editGroupingSubmitting = true;
    this.editGroupingError = '';

    this.http.patch<UpdateFlashcardsGroupingResponse>('/api/flashcards/grouping', {
      ids: selectedIds,
      groupName: resolvedGrouping,
    })
      .subscribe({
        next: (response) => {
          const updatedCount = Number(response?.updatedCount || 0);
          const skippedCount = Number(response?.skippedCount || 0);

          this.editGroupingSubmitting = false;
          this.editGroupingModalOpen = false;
          this.editGroupingError = '';
          this.editGroupingSelection = '';
          this.newGroupingName = '';

          if (updatedCount === 0) {
            alert('No flashcard grouping was updated.');
          } else if (skippedCount > 0) {
            alert(`${updatedCount} flashcard(s) updated. ${skippedCount} flashcard(s) skipped.`);
          }

          this.loadSavedFlashcards();
          this.cdr.detectChanges();
        },
        error: (err) => {
          const message = err?.error?.message || err?.statusText || 'Unknown error';
          this.editGroupingError = 'Failed to update grouping: ' + message;
          this.editGroupingSubmitting = false;
          this.cdr.detectChanges();
        },
      });
  }

  private resolveEditGroupingValue(): string | undefined {
    const selection = String(this.editGroupingSelection || '').trim();
    if (!selection) {
      return undefined;
    }

    if (selection === this.createGroupingOption) {
      const normalizedNewGroup = this.normalizeGroupingInput(this.newGroupingName);
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
      return normalizedExistingGroup || undefined;
    }

    return undefined;
  }

  private normalizeGroupingInput(value: string): string {
    const sanitized = String(value || '')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return sanitized.slice(0, 60);
  }

  deleteSelectedFlashcards() {
    if (!this.isSelectingFlashcards || !this.canDeleteSelectedFlashcards) {
      return;
    }

    const ids = Array.from(this.selectedFlashcardIds);

    if (!confirm(`Delete ${ids.length} selected flashcard(s)?`)) {
      return;
    }

    this.deletingSelectedFlashcards = true;
    this.http.request<DeleteFlashcardsResponse>('delete', '/api/flashcards', {
      body: { ids },
    })
      .subscribe({
        next: () => {
          const deletedIdSet = new Set(ids);

          this.flashcards = this.flashcards.filter((card) => !deletedIdSet.has(card.id));
          this.groupedFlashcards = this.buildGroupedFlashcards(this.flashcards);

          if (
            this.selectedGroup !== this.allGroupOption
            && !this.groupedFlashcards.some((group) => group.name === this.selectedGroup)
          ) {
            this.selectedGroup = this.allGroupOption;
          }

          this.flippedFlashcardIds = new Set(
            Array.from(this.flippedFlashcardIds).filter((id) => !deletedIdSet.has(id))
          );

          this.isSelectingFlashcards = false;
          this.selectedFlashcardIds.clear();
          this.deletingSelectedFlashcards = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.deletingSelectedFlashcards = false;
          const message = err?.error?.message || err?.statusText || 'Failed to delete flashcards.';
          alert(message);
          this.cdr.detectChanges();
        },
      });
  }

}
