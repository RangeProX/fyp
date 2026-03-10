import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

type SessionItem = {
  sessionId: number;
  sessionTitle: string;
  goals?: string | null;
  remarks?: string;
  durationSeconds: number;
  focusLevel: number;
  progress?: string | null;
  pausedCount: number;
  aiInsightStatus?: string;
  aiInsight?: string | null;
  aiInsightReason?: string | null;
  aiInsightGeneratedAt?: string | null;
  createdAt: string;
};

@Component({
  selector: 'app-sessions-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sessions-list.html',
  styleUrl: './sessions-list.css',
})
export class SessionsList implements OnInit {
  sessions: SessionItem[] = [];
  selectedSession: SessionItem | null = null;
  isLoading = false;
  isGeneratingInsight = false;
  error = '';

  private readonly apiUrl = '/api/sessions';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadSessions();
  }

  loadSessions(): void {
    this.isLoading = true;
    this.error = '';

    this.http.get<SessionItem[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.sessions = [...(data || [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Failed to load sessions.';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  formatDuration(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  deleteSession(sessionId: number): void {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }

    this.selectedSession = null;
    this.cdr.detectChanges();

    this.http.delete(`${this.apiUrl}/${sessionId}`).subscribe({
      next: () => {
        this.sessions = this.sessions.filter(session => session.sessionId !== sessionId);
        this.cdr.detectChanges();
      },
      error: () => {
        this.error = 'Failed to delete session.';
        this.cdr.detectChanges();
      },
    });
  }

  viewSessionDetails(sessionId: number): void {
    const session = this.sessions.find(item => item.sessionId === sessionId) || null;
    this.selectedSession = session;
    this.cdr.detectChanges();
  }

  closeSessionDetails(): void {
    this.selectedSession = null;
    this.cdr.detectChanges();
  }

  formatInsightStatus(status?: string | null): string {
    const normalized = String(status || '').trim().toLowerCase();

    if (!normalized || normalized === 'none') {
      return 'Not generated';
    }

    if (normalized === 'generated') {
      return 'Generated';
    }

    if (normalized === 'skipped') {
      return 'Skipped by conditions';
    }

    if (normalized === 'failed') {
      return 'Generation failed';
    }

    return normalized;
  }

  generateInsight(sessionId: number): void {
    if (this.isGeneratingInsight) {
      return;
    }

    this.isGeneratingInsight = true;
    this.error = '';
    this.cdr.detectChanges();

    this.http.post<SessionItem>(`${this.apiUrl}/${sessionId}/insight`, {}).subscribe({
      next: (updatedSession) => {
        this.sessions = this.sessions.map((session) =>
          session.sessionId === sessionId ? updatedSession : session
        );

        if (this.selectedSession?.sessionId === sessionId) {
          this.selectedSession = updatedSession;
        }

        this.isGeneratingInsight = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isGeneratingInsight = false;
        this.error = 'Failed to generate session insight.';
        this.cdr.detectChanges();
      },
    });
  }
}