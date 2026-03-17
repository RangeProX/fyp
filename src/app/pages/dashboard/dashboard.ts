import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { UpcomingEvents } from '../../widgets/upcoming-events/upcoming-events';
import { CalendarInsights } from '../../widgets/calendar-insights/calendar-insights';
import { StudyFrequency } from '../../widgets/study-frequency/study-frequency';

interface SavedFlashcard {
  id: number;
  group: string;
  front: string;
  back: string;
  createdAt: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, UpcomingEvents, CalendarInsights, StudyFrequency],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit {
  username = '';
  savedFlashcards: SavedFlashcard[] = [];
  randomFlashcard: SavedFlashcard | null = null;
  flashcardLoading = false;
  flashcardError = '';
  isRandomCardFlipped = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.username = payload.username || 'User';
      } catch (error) {
        this.username = 'User';
      }
    }

    this.loadRandomFlashcard();
  }

  loadRandomFlashcard() {
    if (this.savedFlashcards.length > 0) {
      this.flashcardError = '';
      this.randomFlashcard = this.pickRandomFlashcard(this.savedFlashcards);
      this.isRandomCardFlipped = false;
      this.cdr.detectChanges();
      return;
    }

    this.flashcardLoading = true;
    this.flashcardError = '';
    this.isRandomCardFlipped = false;
    this.cdr.detectChanges();

    this.http.get<SavedFlashcard[]>('/api/flashcards')
      .subscribe({
        next: (flashcards) => {
          this.savedFlashcards = Array.isArray(flashcards) ? flashcards : [];
          this.randomFlashcard = this.pickRandomFlashcard(this.savedFlashcards);

          this.flashcardLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.savedFlashcards = [];
          this.flashcardError = err?.error?.message || err?.statusText || 'Failed to load flashcard.';
          this.flashcardLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  reloadRandomFlashcard() {
    if (this.flashcardLoading) {
      return;
    }

    if (this.savedFlashcards.length > 0) {
      this.flashcardError = '';
      this.randomFlashcard = this.pickRandomFlashcard(this.savedFlashcards);
      this.isRandomCardFlipped = false;
      this.cdr.detectChanges();
      return;
    }

    this.loadRandomFlashcard();
  }

  toggleRandomFlashcard() {
    if (!this.randomFlashcard) {
      return;
    }

    this.isRandomCardFlipped = !this.isRandomCardFlipped;
  }

  private pickRandomFlashcard(flashcards: SavedFlashcard[]) {
    if (flashcards.length === 0) {
      return null;
    }

    if (flashcards.length === 1 || !this.randomFlashcard) {
      const randomIndex = Math.floor(Math.random() * flashcards.length);
      return flashcards[randomIndex] || null;
    }

    const alternativeFlashcards = flashcards.filter((card) => card.id !== this.randomFlashcard?.id);
    const sourceFlashcards = alternativeFlashcards.length > 0 ? alternativeFlashcards : flashcards;
    const randomIndex = Math.floor(Math.random() * sourceFlashcards.length);

    return sourceFlashcards[randomIndex] || null;
  }
}
