import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { UpcomingEvents } from '../../widgets/upcoming-events/upcoming-events';
import { CalendarInsights } from '../../widgets/calendar-insights/calendar-insights';

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
  imports: [CommonModule, UpcomingEvents, CalendarInsights],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit {
  username = '';
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
    this.flashcardLoading = true;
    this.flashcardError = '';
    this.randomFlashcard = null;
    this.isRandomCardFlipped = false;
    this.cdr.detectChanges();

    this.http.get<SavedFlashcard[]>('/api/flashcards')
      .subscribe({
        next: (flashcards) => {
          const cards = Array.isArray(flashcards) ? flashcards : [];

          if (cards.length > 0) {
            const randomIndex = Math.floor(Math.random() * cards.length);
            this.randomFlashcard = cards[randomIndex] || null;
          }

          this.flashcardLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.flashcardError = err?.error?.message || err?.statusText || 'Failed to load flashcard.';
          this.flashcardLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  toggleRandomFlashcard() {
    if (!this.randomFlashcard) {
      return;
    }

    this.isRandomCardFlipped = !this.isRandomCardFlipped;
  }
}
