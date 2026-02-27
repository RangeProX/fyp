import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  focusLevel = 0;
  progress = '';
  pausedCount = 0;
  private timerInterval: any;

  constructor(private cdr: ChangeDetectorRef) {}

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
    if (!this.isSessionActive || !this.timerInterval) {
      return;
    }

    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.isPaused = true;
    this.pausedCount++;
    this.cdr.markForCheck();
  }

  resumeSession() {
    if (!this.isSessionActive || !this.isPaused || this.timerInterval) {
      return;
    }

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
    this.closeEndSessionModal();
  }

  closeEndSessionModal() {
    this.isEndSessionModalOpen = false;
    this.subject = '';
    this.goals = '';
    this.remarks = '';
    this.elapsedSeconds = 0;
    this.completedDuration = '';
    this.focusLevel = 0;
    this.progress = '';
    this.cdr.markForCheck();
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  ngOnDestroy() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
