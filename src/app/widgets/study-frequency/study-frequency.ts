import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

interface DayData {
  date: string;
  hours: number;
}

interface MonthlyStatsResponse {
  days: DayData[];
  stats: {
    totalHours: number;
    avgHours: number;
    activeDays: number;
  };
}

interface CalendarCell {
  date: string | null;
  hours: number;
  color: string;
  label: string;
  isFuture: boolean;
  isEmpty: boolean;
}

@Component({
  selector: 'app-study-frequency',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './study-frequency.html',
  styleUrl: './study-frequency.css',
})
export class StudyFrequency implements OnInit {
  selectedMonth = new Date();
  monthData: DayData[] = [];
  stats = { totalHours: 0, avgHours: 0, activeDays: 0 };
  calendarGrid: CalendarCell[][] = [];
  isLoading = false;
  hasData = false;
  errorMessage = '';

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  legendItems = [
    { color: '#e5e7eb', label: '0h' },
    { color: '#fbd38d', label: '1h' },
    { color: '#f97316', label: '3h' },
    { color: '#ea580c', label: '5h' },
    { color: '#c2410c', label: '8h' },
    { color: '#9a3412', label: '8h+' },
  ];

  tooltip = { visible: false, x: 0, y: 0, text: '' };

  private cache = new Map<string, MonthlyStatsResponse>();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadMonth();
  }

  get monthLabel(): string {
    return this.selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  get isCurrentMonth(): boolean {
    const now = new Date();
    return (
      this.selectedMonth.getFullYear() === now.getFullYear() &&
      this.selectedMonth.getMonth() === now.getMonth()
    );
  }

  prevMonth() {
    const d = new Date(this.selectedMonth);
    d.setMonth(d.getMonth() - 1);
    this.selectedMonth = d;
    this.cdr.detectChanges();
    this.loadMonth();
  }

  nextMonth() {
    if (this.isCurrentMonth) return;
    const d = new Date(this.selectedMonth);
    d.setMonth(d.getMonth() + 1);
    this.selectedMonth = d;
    this.cdr.detectChanges();
    this.loadMonth();
  }

  loadMonth() {
    const year = this.selectedMonth.getFullYear();
    const month = this.selectedMonth.getMonth() + 1;
    const key = `${year}-${month}`;

    if (this.cache.has(key)) {
      this.isLoading = false;
      this.applyData(this.cache.get(key)!);
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.cdr.detectChanges();

    this.http
      .get<MonthlyStatsResponse>(`/api/sessions/monthly-stats?year=${year}&month=${month}`)
      .subscribe({
        next: (data) => {
          this.cache.set(key, data);
          this.applyData(data);
          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Failed to load study data.';
          this.isLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  private applyData(data: MonthlyStatsResponse) {
    this.monthData = data.days;
    this.stats = data.stats;
    this.hasData = data.stats.activeDays > 0;
    this.errorMessage = '';
    this.buildGrid();
  }

  private getColor(hours: number, isFuture: boolean): string {
    if (isFuture || hours === 0) return '#e5e7eb';
    if (hours <= 1) return '#fbd38d';
    if (hours <= 3) return '#f97316';
    if (hours <= 5) return '#ea580c';
    if (hours <= 8) return '#c2410c';
    return '#9a3412';
  }

  private buildGrid() {
    const year = this.selectedMonth.getFullYear();
    const month = this.selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hoursMap = new Map<string, number>();
    for (const d of this.monthData) {
      hoursMap.set(d.date, d.hours);
    }

    const cells: CalendarCell[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ date: null, hours: 0, color: 'transparent', label: '', isFuture: false, isEmpty: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cellDate = new Date(year, month, d);
      const isFuture = cellDate > today;
      const hours = hoursMap.get(dateStr) || 0;

      cells.push({
        date: dateStr,
        hours,
        color: this.getColor(hours, isFuture),
        label: this.formatTooltip(dateStr, hours, isFuture),
        isFuture,
        isEmpty: false,
      });
    }

    this.calendarGrid = [];
    for (let i = 0; i < cells.length; i += 7) {
      this.calendarGrid.push(cells.slice(i, i + 7));
    }
  }

  private formatTooltip(dateStr: string, hours: number, isFuture: boolean): string {
    const date = new Date(dateStr + 'T00:00:00');
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (isFuture) return dayName;
    return hours > 0
      ? `${dayName}\n${hours.toFixed(1)} hours studied`
      : `${dayName}\nNo study sessions recorded`;
  }

  showTooltip(event: MouseEvent, cell: CalendarCell) {
    if (cell.isEmpty || !cell.date) return;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.tooltip = {
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      text: cell.label,
    };
  }

  hideTooltip() {
    this.tooltip = { ...this.tooltip, visible: false };
  }
}
