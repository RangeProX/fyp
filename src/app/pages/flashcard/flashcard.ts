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

@Component({
  selector: 'app-flashcard',
  imports: [CommonModule, FormsModule],
  standalone: true,
  templateUrl: './flashcard.html',
  styleUrl: './flashcard.css',
})
export class Flashcard implements OnInit {
  readonly allGroupOption = 'All';
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
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.groupedFlashcards = [];
          this.isSelectingFlashcards = false;
          this.selectedFlashcardIds.clear();
          this.deletingSelectedFlashcards = false;
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

      this.cdr.detectChanges();
      return;
    }

    if (this.flippedFlashcardIds.has(cardId)) {
      this.flippedFlashcardIds.delete(cardId);
    } else {
      this.flippedFlashcardIds.add(cardId);
    }

    this.cdr.detectChanges();
  }

  isFlashcardFlipped(cardId: number) {
    return this.flippedFlashcardIds.has(cardId);
  }

  isFlashcardSelected(cardId: number) {
    return this.selectedFlashcardIds.has(cardId);
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
    this.cdr.detectChanges();
  }

  get selectedFlashcardCount() {
    return this.selectedFlashcardIds.size;
  }

  get canDeleteSelectedFlashcards() {
    return this.selectedFlashcardIds.size > 0 && !this.deletingSelectedFlashcards;
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
