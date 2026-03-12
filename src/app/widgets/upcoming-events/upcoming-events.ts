import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RRule } from 'rrule';
import { CalendarEventResponse, EventsService } from '../../services/events';

interface UpcomingEventItem {
  key: string;
  eventId: string;
  occurrenceStartToken: string;
  title: string;
  start: Date;
  end: Date;
  dayNumber: string;
  dayName: string;
  timeLabel: string;
  isToday: boolean;
}

interface ExpandedOccurrence {
  key: string;
  eventId: string;
  occurrenceStartToken: string;
  title: string;
  start: Date;
  end: Date;
}

@Component({
  selector: 'app-upcoming-events',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upcoming-events.html',
  styleUrl: './upcoming-events.css',
})
export class UpcomingEvents implements OnInit {
  isLoading = false;
  loadError = '';
  upcomingEvents: UpcomingEventItem[] = [];

  private readonly maxUpcomingEvents = 6;
  private readonly lookAheadDays = 3;
  private readonly monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long' });
  private readonly dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  private readonly timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  currentMonthLabel = this.monthFormatter.format(new Date());

  constructor(
    private eventsService: EventsService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadUpcomingEvents();
  }

  private loadUpcomingEvents(): void {
    this.isLoading = true;
    this.loadError = '';
    this.cdr.detectChanges();

    this.eventsService.listEvents().subscribe({
      next: (events) => {
        const normalized = Array.isArray(events) ? events : [];
        this.upcomingEvents = this.buildUpcomingItems(normalized);
        this.currentMonthLabel = this.upcomingEvents.length > 0
          ? this.monthFormatter.format(this.upcomingEvents[0].start)
          : this.monthFormatter.format(new Date());
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        this.loadError = 'Failed to load events';
        this.cdr.detectChanges();
      },
    });
  }

  private buildUpcomingItems(events: CalendarEventResponse[]): UpcomingEventItem[] {
    const now = new Date();
    const horizon = new Date(now.getTime());
    horizon.setDate(horizon.getDate() + this.lookAheadDays);

    const occurrences = events
      .flatMap((event) => this.expandOccurrences(event, now, horizon))
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    const seen = new Set<string>();
    const uniqueOccurrences = occurrences.filter((item) => {
      const key = `${item.key}-${this.formatLocalDateTimeWithSeconds(item.start)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return uniqueOccurrences.slice(0, this.maxUpcomingEvents).map((item) => {
      const dayNumber = String(item.start.getDate());
      const dayName = this.dayFormatter.format(item.start);
      const isToday = this.isSameLocalDate(item.start, now);
      const timeLabel = `${this.timeFormatter.format(item.start)} - ${this.timeFormatter.format(item.end)}`;

      return {
        key: `${item.key}-${item.start.getTime()}`,
        eventId: item.eventId,
        occurrenceStartToken: item.occurrenceStartToken,
        title: item.title,
        start: item.start,
        end: item.end,
        dayNumber,
        dayName,
        timeLabel,
        isToday,
      };
    });
  }

  private expandOccurrences(event: CalendarEventResponse, now: Date, horizon: Date): ExpandedOccurrence[] {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [];
    }

    const durationMs = Math.max(60_000, end.getTime() - start.getTime());

    if (!event.rrule) {
      if (start.getTime() < now.getTime()) {
        return [];
      }

      return [{
        key: event.id,
        eventId: event.id,
        occurrenceStartToken: this.formatLocalDateTimeWithSeconds(start),
        title: event.title,
        start,
        end,
      }];
    }

    const parsedRule = this.parseStoredRrule(event.rrule);
    if (!parsedRule) {
      return [];
    }

    const effectiveUntil = parsedRule.until && parsedRule.until.getTime() < horizon.getTime()
      ? parsedRule.until
      : horizon;

    if (effectiveUntil.getTime() < now.getTime()) {
      return [];
    }

    const excludedTokens = new Set(
      this.parseStoredExdates(event.exdates)
        .map((token) => this.normalizeOccurrenceToken(token))
        .filter((token): token is string => Boolean(token))
    );

    const rule = new RRule({
      freq: parsedRule.freq,
      dtstart: start,
      ...(parsedRule.until ? { until: parsedRule.until } : {}),
    });

    return rule
      .between(now, effectiveUntil, true)
      .filter((occurrenceStart) => !excludedTokens.has(this.formatLocalDateTimeWithSeconds(occurrenceStart)))
      .map((occurrenceStart, index) => ({
        key: `${event.id}-${index}`,
        eventId: event.id,
        occurrenceStartToken: this.formatLocalDateTimeWithSeconds(occurrenceStart),
        title: event.title,
        start: occurrenceStart,
        end: new Date(occurrenceStart.getTime() + durationMs),
      }));
  }

  openCalendarEvent(event: UpcomingEventItem): void {
    this.router.navigate(['/calendar'], {
      queryParams: {
        eventId: event.eventId,
        occurrenceStart: event.occurrenceStartToken,
      },
    });
  }

  private parseStoredRrule(rrule?: string | null): { freq: number; until: Date | null } | null {
    const value = String(rrule || '').trim().toUpperCase();
    if (!value) {
      return null;
    }

    const freqMatch = value.match(/FREQ=(DAILY|WEEKLY|MONTHLY)/i);
    if (!freqMatch) {
      return null;
    }

    const freqMap: Record<string, number> = {
      DAILY: RRule.DAILY,
      WEEKLY: RRule.WEEKLY,
      MONTHLY: RRule.MONTHLY,
    };

    let until: Date | null = null;
    const untilDateTimeMatch = value.match(/UNTIL=(\d{8})T(\d{6})Z?/i);
    const untilDateOnlyMatch = value.match(/UNTIL=(\d{8})(?!T)/i);

    if (untilDateTimeMatch) {
      const datePart = untilDateTimeMatch[1];
      const timePart = untilDateTimeMatch[2];
      const year = Number(datePart.slice(0, 4));
      const month = Number(datePart.slice(4, 6));
      const day = Number(datePart.slice(6, 8));
      const hours = Number(timePart.slice(0, 2));
      const minutes = Number(timePart.slice(2, 4));
      const seconds = Number(timePart.slice(4, 6));
      const parsed = new Date(year, month - 1, day, hours, minutes, seconds);

      if (!Number.isNaN(parsed.getTime())) {
        until = parsed;
      }
    } else if (untilDateOnlyMatch) {
      const datePart = untilDateOnlyMatch[1];
      const year = Number(datePart.slice(0, 4));
      const month = Number(datePart.slice(4, 6));
      const day = Number(datePart.slice(6, 8));
      const parsed = new Date(year, month - 1, day, 23, 59, 59);

      if (!Number.isNaN(parsed.getTime())) {
        until = parsed;
      }
    }

    return {
      freq: freqMap[freqMatch[1].toUpperCase()],
      until,
    };
  }

  private parseStoredExdates(exdates?: string | null): string[] {
    const value = String(exdates || '').trim();
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => String(item || '').trim())
        .filter((item) => item.length > 0);
    } catch {
      return [];
    }
  }

  private normalizeOccurrenceToken(value: string): string | null {
    const token = String(value || '').trim();
    if (!token) {
      return null;
    }

    const localMatch = token.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = '00'] = localMatch;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    }

    const parsed = new Date(token);
    return Number.isNaN(parsed.getTime()) ? null : this.formatLocalDateTimeWithSeconds(parsed);
  }

  private formatLocalDateTimeWithSeconds(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  private isSameLocalDate(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear()
      && left.getMonth() === right.getMonth()
      && left.getDate() === right.getDate();
  }

}
