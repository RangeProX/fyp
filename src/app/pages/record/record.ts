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
  isSessionActive = false;
  elapsedSeconds = 0;
  private timerInterval: any;

  constructor(private cdr: ChangeDetectorRef) {}

  startSession() {
    if (!this.subject.trim()) {
      alert('Please enter a subject');
      return;
    }

    this.isSessionActive = true;
    this.elapsedSeconds = 0;

    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.cdr.markForCheck();
    }, 1000);
  }

  stopSession() {
    this.isSessionActive = false;
    clearInterval(this.timerInterval);
    alert(`Session completed! Total time: ${this.formatTime(this.elapsedSeconds)}`);
    this.subject = '';
    this.elapsedSeconds = 0;
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
