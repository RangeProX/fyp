import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './record.html',
  styleUrl: './record.css',
})
export class Record implements OnDestroy {
  subject = '';
  goals = '';
  remarks = '';
  isSessionActive = false;
  isPaused = false;
  elapsedSeconds = 0;
  isEndSessionModalOpen = false;
  completedDuration = '';
  focusLevel = 1;
  progress = '';
  pausedCount = 0;

  isSubmitting = false;
  submitError = '';

  private timerInterval: any;
  private readonly apiUrl = '/api/sessions';

  constructor(
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  startSession() {
    if (!this.subject.trim() || !this.goals.trim()) {
      alert('Please enter a subject and goals');
      return;
    }

    this.isSessionActive = true;
    this.isPaused = false;
    this.elapsedSeconds = 0;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.cdr.markForCheck();
    }, 1000);
  }

  pauseSession() {
    if (!this.isSessionActive || !this.timerInterval) return;

    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.isPaused = true;
    this.pausedCount++;
    this.cdr.markForCheck();
  }

  resumeSession() {
    if (!this.isSessionActive || !this.isPaused || this.timerInterval) return;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.cdr.markForCheck();
    }, 1000);

    this.isPaused = false;
    this.cdr.markForCheck();
  }

  stopSession() {
    this.isSessionActive = false;
    this.isPaused = false;
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.completedDuration = this.formatTime(this.elapsedSeconds);
    this.isEndSessionModalOpen = true;
    this.cdr.markForCheck();
  }

  submitSessionDetails() {
    const payload = {
      sessionTitle: this.subject,
      durationSeconds: this.elapsedSeconds,
      focusLevel: this.focusLevel,
      goals: this.goals,
      remarks: this.remarks,
      progress: this.progress,
      pausedCount: this.pausedCount,
    };

    this.isSubmitting = true;
    this.submitError = '';
    this.cdr.markForCheck();

    this.http.post(this.apiUrl, payload).subscribe({
      next: () => {
        this.isSubmitting = false;

        this.closeEndSessionModal(); // close only
        this.resetSessionData();     // reset only after successful POST
        alert('Session saved successfully!');
        this.cdr.markForCheck();
      },
      error: () => {
        this.isSubmitting = false;
        this.submitError = 'Failed to save session. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  closeEndSessionModal() {
    this.isEndSessionModalOpen = false;
    this.cdr.markForCheck();
  }

  private resetSessionData() {
    this.subject = '';
    this.goals = '';
    this.remarks = '';
    this.elapsedSeconds = 0;
    this.completedDuration = '';
    this.focusLevel = 1;
    this.progress = '';
    this.pausedCount = 0;
    this.cdr.markForCheck();
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }
}
