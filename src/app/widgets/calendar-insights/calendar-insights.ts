import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';

interface CalendarInsight {
  id: number;
  observation: string;
  concern: string | null;
  suggestion: string;
  encouragement: string;
  urgentActions: string[] | null;
  generatedAt: string;
  validUntil: string;
  eventsAnalyzed?: number;
}

interface InsightStatusResponse {
  hasInsight: boolean;
  insight?: CalendarInsight;
  staleness: {
    stale: boolean;
    reason?: string;
    firstTime?: boolean;
    notEnoughData?: boolean;
    message?: string;
    changes?: {
      added: number;
      edited: number;
      total: number;
    };
    ageInDays?: number;
  };
}

interface GenerateInsightResponse {
  insight: CalendarInsight;
  metadata?: {
    eventsAnalyzed?: number;
  };
}

@Component({
  selector: 'app-calendar-insights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar-insights.html',
  styleUrl: './calendar-insights.css',
})
export class CalendarInsights implements OnInit {
  insight: CalendarInsight | null = null;
  staleness: InsightStatusResponse['staleness'] | null = null;

  isLoading = true;
  isGenerating = false;
  error = '';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadInsightStatus();
  }

  loadInsightStatus(): void {
    this.isLoading = true;
    this.error = '';

    this.http.get<InsightStatusResponse>('/api/calendar-insights/status')
      .subscribe({
        next: (response) => {
          this.insight = response.insight || null;
          this.staleness = response.staleness;
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to load insights';
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  generateInsights(): void {
    this.isGenerating = true;
    this.error = '';

    this.http.post<GenerateInsightResponse>('/api/calendar-insights/generate', {})
      .subscribe({
        next: (response) => {
          const insight = response.insight
            ? {
              ...response.insight,
              eventsAnalyzed: response.insight.eventsAnalyzed ?? response.metadata?.eventsAnalyzed,
            }
            : null;

          this.insight = insight;
          this.staleness = { stale: false };
          this.isGenerating = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.error = err?.error?.message || 'Failed to generate insights';
          this.isGenerating = false;
          this.cdr.detectChanges();
        },
      });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    }

    if (diffDays === 1) {
      return 'Yesterday';
    }

    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }

}
