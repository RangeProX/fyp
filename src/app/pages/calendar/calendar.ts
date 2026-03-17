import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, HostListener, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import rrulePlugin from '@fullcalendar/rrule';
import { CalendarApi, CalendarOptions, EventInput } from '@fullcalendar/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RRule } from 'rrule';
import { CalendarEventResponse, EventsService } from '../../services/events';

interface CalendarRenderedOccurrence {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isMultiDay: boolean;
  notes: string;
  color: string;
  rrule: string | null;
  seriesId: string | null;
  sortRank: number;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements AfterViewInit {
  private readonly defaultEventColor = '#3788d8';
  private rawEvents: CalendarEventResponse[] = [];
  private activeRangeStart: Date | null = null;
  private activeRangeEnd: Date | null = null;
  readonly monthOptions = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  readonly yearOptions = Array.from({ length: 151 }, (_, index) => 1970 + index);
  private pendingLinkedEventId: string | null = null;
  private pendingLinkedOccurrenceStartToken: string | null = null;

  constructor(
    private eventsService: EventsService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;
  selectedMonth = new Date().getMonth();
  selectedYear = new Date().getFullYear();
  isModalOpen = false;
  isDetailsMode = false;
  isEditingDetails = false;
  draftTitle = '';
  draftStart = '';
  draftEnd = '';
  draftNotes = '';
  draftColor = this.defaultEventColor;
  draftIsRecurring = false;
  draftRecurrenceFreq: 'daily' | 'weekly' | 'monthly' = 'weekly';
  draftRecurrenceEnd = '';
  detailsRruleFreq: string | null = null;
  detailsRruleUntil: string | null = null;
  message = '';
  hasSubmitted = false;
  isDeleting = false;
  isSavingEdit = false;
  isExportingCalendar = false;
  isDeleteConfirmOpen = false;
  deleteAllRecurringInSeries = false;
  editAllRecurringInSeries = false;
  private selectedEventId: string | null = null;
  private selectedSeriesId: string | null = null;
  private selectedOccurrenceStartToken: string | null = null;
  private pendingCalendar: CalendarApi | null = null;
  private detailsDraftSnapshot: {
    title: string;
    start: string;
    end: string;
    notes: string;
    color: string;
  } | null = null;

  calendarEvents: EventInput[] = [];

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin, rrulePlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'title',
      right: 'prev,next',
    },
    editable: true,
    events: [],
    contentHeight: '100%',
    height: '100%',
    eventDisplay: 'block',
    displayEventTime: false,
    eventOrder: (eventA: any, eventB: any) => this.compareCalendarEventOrder(eventA, eventB),
    eventOrderStrict: true,
    eventClick: (info) => {
      info.jsEvent?.preventDefault();
      info.jsEvent?.stopPropagation();

      this.ngZone.run(() => {
        const sourceEventId = String(info.event.extendedProps?.['sourceEventId'] || info.event.id || '').trim();
        const occurrenceStartToken = String(info.event.extendedProps?.['occurrenceStart'] || '').trim();
        const occurrenceEndToken = String(info.event.extendedProps?.['occurrenceEnd'] || '').trim();
        const occurrenceStart = occurrenceStartToken ? this.parseOccurrenceStartToken(occurrenceStartToken) : null;
        const occurrenceEnd = occurrenceEndToken ? this.parseOccurrenceStartToken(occurrenceEndToken) : null;

        this.openEventDetailsFromApi({
          id: sourceEventId || info.event.id,
          title: info.event.title,
          start: occurrenceStart ?? info.event.start,
          end: occurrenceEnd ?? info.event.end,
          backgroundColor: info.event.backgroundColor,
          extendedProps: {
            notes: String(info.event.extendedProps?.['notes'] || ''),
            color: String(info.event.extendedProps?.['color'] || info.event.backgroundColor || ''),
            rrule: info.event.extendedProps?.['rrule'] ? String(info.event.extendedProps['rrule']) : null,
            seriesId: info.event.extendedProps?.['seriesId'] ? String(info.event.extendedProps['seriesId']) : null,
            originalStart: occurrenceStartToken || (info.event.extendedProps?.['originalStart'] ? String(info.event.extendedProps['originalStart']) : undefined),
            originalEnd: occurrenceEndToken || (info.event.extendedProps?.['originalEnd'] ? String(info.event.extendedProps['originalEnd']) : undefined),
          },
        });

        // FullCalendar callbacks can race Angular rendering; force a sync pass.
        this.cdr.detectChanges();
      });
    },
    datesSet: (arg) => {
      this.ngZone.run(() => {
        const current = arg?.view?.currentStart ? new Date(arg.view.currentStart) : new Date();
        this.selectedMonth = current.getMonth();
        this.selectedYear = current.getFullYear();
        this.activeRangeStart = arg?.view?.activeStart ? new Date(arg.view.activeStart) : null;
        this.activeRangeEnd = arg?.view?.activeEnd ? new Date(arg.view.activeEnd) : null;
        this.rebuildCalendarEvents();
        this.cdr.detectChanges();
      });
    },
  };

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.pendingLinkedEventId = params.get('eventId');
      this.pendingLinkedOccurrenceStartToken = params.get('occurrenceStart');
    });
  }

  ngAfterViewInit(): void {
    const api = this.calendarComponent?.getApi();
    if (api) {
      const current = api.getDate();
      this.selectedMonth = current.getMonth();
      this.selectedYear = current.getFullYear();
      this.activeRangeStart = api.view?.activeStart ? new Date(api.view.activeStart) : null;
      this.activeRangeEnd = api.view?.activeEnd ? new Date(api.view.activeEnd) : null;
    }

    this.loadEvents();
    this.cdr.detectChanges();
  }

  onCalendarMonthYearChange(): void {
    const api = this.calendarComponent?.getApi();
    if (!api) {
      return;
    }

    const safeMonth = Math.min(Math.max(Number(this.selectedMonth), 0), 11);
    const safeYear = Number(this.selectedYear);

    if (!Number.isFinite(safeYear)) {
      return;
    }

    api.gotoDate(new Date(safeYear, safeMonth, 1));
    this.cdr.detectChanges();
  }

  exportCalendarAsIcs(): void {
    if (this.isExportingCalendar) {
      return;
    }

    this.isExportingCalendar = true;

    this.eventsService.listEvents().subscribe({
      next: (events) => {
        this.downloadCalendarIcs(events);
        this.isExportingCalendar = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isExportingCalendar = false;
        window.alert('Failed to export calendar. Please try again.');
        this.cdr.detectChanges();
      },
    });
  }

  openModal(): void {
    const calendarApi = this.calendarComponent?.getApi();
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    this.pendingCalendar = calendarApi ?? this.pendingCalendar;
    this.draftTitle = '';
    this.draftStart = this.formatLocalDateTime(now);
    this.draftEnd = this.formatLocalDateTime(end);
    this.draftNotes = '';
    this.draftColor = this.defaultEventColor;
    this.draftIsRecurring = false;
    this.draftRecurrenceFreq = 'weekly';
    this.draftRecurrenceEnd = '';
    this.detailsRruleFreq = null;
    this.detailsRruleUntil = null;
    this.message = '';
    this.hasSubmitted = false;
    this.isDetailsMode = false;
    this.isEditingDetails = false;
    this.isSavingEdit = false;
    this.detailsDraftSnapshot = null;
    this.selectedEventId = null;
    this.selectedSeriesId = null;
    this.selectedOccurrenceStartToken = null;
    this.isDeleteConfirmOpen = false;
    this.deleteAllRecurringInSeries = false;
    this.editAllRecurringInSeries = false;
    this.setModalOpenState(true);
  }

  closeModal(): void {
    this.ngZone.run(() => {
      this.pendingCalendar = null;
      this.draftNotes = '';
      this.draftColor = this.defaultEventColor;
      this.draftIsRecurring = false;
      this.draftRecurrenceFreq = 'weekly';
      this.draftRecurrenceEnd = '';
      this.detailsRruleFreq = null;
      this.detailsRruleUntil = null;
      this.message = '';
      this.hasSubmitted = false;
      this.isDetailsMode = false;
      this.isEditingDetails = false;
      this.isDeleting = false;
      this.isSavingEdit = false;
      this.detailsDraftSnapshot = null;
      this.selectedEventId = null;
      this.selectedSeriesId = null;
      this.selectedOccurrenceStartToken = null;
      this.isDeleteConfirmOpen = false;
      this.deleteAllRecurringInSeries = false;
      this.editAllRecurringInSeries = false;
      this.setModalOpenState(false);
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isModalOpen) {
      this.closeModal();
    }
  }

  onAddEventModalEnter(event: Event): void {
    if (!this.isModalOpen || this.isDetailsMode) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.saveEvent();
  }

  saveEvent(): void {
    if (this.isDetailsMode && !this.isEditingDetails) {
      this.closeModal();
      return;
    }

    this.hasSubmitted = true;
    this.validateDraft();
    if (this.message) {
      return;
    }

    const title = this.draftTitle.trim();
    const color = this.normalizeEventColor(this.draftColor);

    if (this.isDetailsMode && this.isEditingDetails) {
      if (!this.selectedEventId) {
        return;
      }

      const payload = {
        title,
        startTime: this.draftStart,
        endTime: this.draftEnd,
        notes: this.draftNotes?.trim() || '',
        color,
      };

      const isRecurringSeries = Boolean(this.detailsRruleFreq);
      // A detached occurrence has no rrule but has a seriesId pointing to its root
      const isDetachedOccurrence = !isRecurringSeries && Boolean(this.selectedSeriesId);
      const effectiveSeriesId = this.selectedSeriesId;

      // Determine which call to make:
      // 1. edit all:   recurring root → editSeries; detached with seriesId → editSeries
      // 2. edit one:   recurring root → editEventOccurrence; detached → plain updateEvent
      let request$;
      if (this.editAllRecurringInSeries && effectiveSeriesId) {
        request$ = this.eventsService.editSeries(effectiveSeriesId, payload);
      } else if (!this.editAllRecurringInSeries && isRecurringSeries && this.selectedOccurrenceStartToken) {
        request$ = this.eventsService.editEventOccurrence(this.selectedEventId, this.selectedOccurrenceStartToken, payload);
      } else {
        // plain non-recurring event, or detached event editing just itself
        request$ = this.eventsService.updateEvent(this.selectedEventId, payload);
      }

      this.isSavingEdit = true;
      request$.subscribe({
        next: (updated) => {
          if (!this.editAllRecurringInSeries && Boolean(this.detailsRruleFreq) && this.selectedOccurrenceStartToken) {
            // occurrence-edit: detached event created, just reload
            this.isSavingEdit = false;
            this.editAllRecurringInSeries = false;
            this.closeModal();
            this.loadEvents();
            return;
          }

          const normalizedColor = this.normalizeEventColor(updated.color);

          this.draftTitle = updated.title || '';
          this.draftStart = updated.startTime ? this.formatLocalDateTime(new Date(updated.startTime)) : '';
          this.draftEnd = updated.endTime ? this.formatLocalDateTime(new Date(updated.endTime)) : '';
          this.draftNotes = updated.notes ?? '';
          this.draftColor = normalizedColor;
          this.message = '';
          this.hasSubmitted = false;
          this.isSavingEdit = false;
          this.isEditingDetails = false;
          this.editAllRecurringInSeries = false;
          this.detailsDraftSnapshot = null;
          this.loadEvents();
          this.cdr.detectChanges();
        },
        error: () => {
          this.isSavingEdit = false;
          this.message = 'Failed to update event';
          this.cdr.detectChanges();
        },
      });

      return;
    }

    this.eventsService.createEvent({
      title,
      startTime: this.draftStart,
      endTime: this.draftEnd,
      notes: this.draftNotes?.trim() || '',
      color,
      ...(this.draftIsRecurring && this.draftRecurrenceEnd ? {
        rrule: `FREQ=${this.draftRecurrenceFreq.toUpperCase()};UNTIL=${this.draftRecurrenceEnd.replace(/-/g, '')}T235959`,
      } : {}),
    }).subscribe({
      next: () => {
        this.closeModal();
        this.loadEvents();
      },
      error: () => {
        this.message = 'Failed to save event';
      },
    });
  }

  startEditingDetails(): void {
    if (!this.isDetailsMode || this.isSavingEdit || this.isDeleting) {
      return;
    }

    this.detailsDraftSnapshot = {
      title: this.draftTitle,
      start: this.draftStart,
      end: this.draftEnd,
      notes: this.draftNotes,
      color: this.draftColor,
    };

    this.message = '';
    this.hasSubmitted = false;
    this.isEditingDetails = true;
    this.editAllRecurringInSeries = false;
    this.cdr.detectChanges();
  }

  cancelEditingDetails(): void {
    if (!this.isDetailsMode || !this.isEditingDetails || this.isSavingEdit) {
      return;
    }

    if (this.detailsDraftSnapshot) {
      this.draftTitle = this.detailsDraftSnapshot.title;
      this.draftStart = this.detailsDraftSnapshot.start;
      this.draftEnd = this.detailsDraftSnapshot.end;
      this.draftNotes = this.detailsDraftSnapshot.notes;
      this.draftColor = this.detailsDraftSnapshot.color;
    }

    this.message = '';
    this.hasSubmitted = false;
    this.isEditingDetails = false;
    this.editAllRecurringInSeries = false;
    this.detailsDraftSnapshot = null;
    this.cdr.detectChanges();
  }

  openDeleteConfirmModal(): void {
    if (!this.isDetailsMode || !this.selectedEventId || this.isDeleting) {
      return;
    }

    this.deleteAllRecurringInSeries = false;
    this.isDeleteConfirmOpen = true;
    this.cdr.detectChanges();
  }

  closeDeleteConfirmModal(): void {
    if (this.isDeleting) {
      return;
    }

    this.isDeleteConfirmOpen = false;
    this.deleteAllRecurringInSeries = false;
    this.cdr.detectChanges();
  }

  deleteSelectedEvent(): void {
    if (!this.isDetailsMode || !this.selectedEventId || this.isDeleting) {
      return;
    }

    this.isDeleting = true;
    this.message = '';

    const isRecurringSeries = Boolean(this.detailsRruleFreq);
    const isDetachedOccurrence = !isRecurringSeries && Boolean(this.selectedSeriesId);
    // Show checkboxes if this event is part of a series (root OR detached)
    const eventBelongsToSeries = isRecurringSeries || isDetachedOccurrence;

    const seriesIdForDelete = this.selectedSeriesId ?? (isRecurringSeries ? this.selectedEventId : null);

    let request$;
    if (eventBelongsToSeries && this.deleteAllRecurringInSeries && seriesIdForDelete) {
      request$ = this.eventsService.deleteSeries(seriesIdForDelete);
    } else if (isRecurringSeries && !this.deleteAllRecurringInSeries && this.selectedOccurrenceStartToken) {
      request$ = this.eventsService.deleteEventOccurrence(this.selectedEventId, this.selectedOccurrenceStartToken);
    } else {
      request$ = this.eventsService.deleteEvent(this.selectedEventId);
    }

    request$.subscribe({
      next: () => {
        this.isDeleteConfirmOpen = false;
        this.deleteAllRecurringInSeries = false;
        this.closeModal();
        this.loadEvents();
      },
      error: () => {
        this.isDeleting = false;
        this.isDeleteConfirmOpen = false;
        this.deleteAllRecurringInSeries = false;
        this.message = 'Failed to delete event';
        this.cdr.detectChanges();
      },
    });
  }

  private loadEvents(): void {
    this.eventsService.listEvents().subscribe({
      next: (events) => {
        this.ngZone.run(() => {
          this.rawEvents = Array.isArray(events) ? events : [];
          this.rebuildCalendarEvents();
          this.openPendingLinkedEvent(this.rawEvents);
        });
      },
      error: () => {
        console.error('Failed to load events');
      },
    });
  }

  private rebuildCalendarEvents(): void {
    const { start, end } = this.getRenderRange();
    this.calendarEvents = this.buildCalendarEventsForRange(this.rawEvents, start, end);
    this.calendarOptions = {
      ...this.calendarOptions,
      events: [...this.calendarEvents],
    };
    this.cdr.detectChanges();
    this.refreshCalendarEventRender();
  }

  private refreshCalendarEventRender(): void {
    setTimeout(() => {
      const api = this.calendarComponent?.getApi();
      if (api) {
        api.render();
      }
      this.cdr.detectChanges();
    }, 0);
  }

  private getRenderRange(): { start: Date; end: Date } {
    if (this.activeRangeStart && this.activeRangeEnd) {
      return {
        start: new Date(this.activeRangeStart),
        end: new Date(this.activeRangeEnd),
      };
    }

    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }

  private openPendingLinkedEvent(events: CalendarEventResponse[]): void {
    if (!this.pendingLinkedEventId) {
      return;
    }

    const matched = events.find((event) => event.id === this.pendingLinkedEventId);
    if (!matched) {
      this.clearPendingLinkedEventParams();
      return;
    }

    const calendarApi = this.calendarComponent?.getApi();
    if (!calendarApi) {
      return;
    }

    const startDate = this.pendingLinkedOccurrenceStartToken
      ? this.parseOccurrenceStartToken(this.pendingLinkedOccurrenceStartToken)
      : new Date(matched.startTime);
    const fallbackStart = new Date(matched.startTime);
    const safeStartDate = startDate && !Number.isNaN(startDate.getTime()) ? startDate : fallbackStart;
    const durationMs = Math.max(60_000, new Date(matched.endTime).getTime() - new Date(matched.startTime).getTime());
    const endDate = new Date(safeStartDate.getTime() + durationMs);

    calendarApi.gotoDate(safeStartDate);
    this.openEventDetailsFromApi({
      id: matched.id,
      title: matched.title,
      start: safeStartDate,
      end: endDate,
      backgroundColor: matched.color,
      extendedProps: {
        notes: matched.notes ?? '',
        color: matched.color,
        rrule: matched.rrule ?? null,
        seriesId: matched.seriesId ?? null,
        originalStart: matched.startTime,
        originalEnd: matched.endTime,
      },
    });

    this.clearPendingLinkedEventParams();
  }

  private clearPendingLinkedEventParams(): void {
    this.pendingLinkedEventId = null;
    this.pendingLinkedOccurrenceStartToken = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  private downloadCalendarIcs(events: CalendarEventResponse[]): void {
    const generatedAt = new Date();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FYP//Calendar Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:FYP Calendar',
      ...events.flatMap((event) => this.buildIcsEventLines(event, generatedAt)),
      'END:VCALENDAR',
    ];

    const content = `${lines.map((line) => this.foldIcsLine(line)).join('\r\n')}\r\n`;
    const file = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    const dateStamp = this.formatLocalDate(generatedAt);

    link.href = url;
    link.download = `calendar-${dateStamp}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private buildIcsEventLines(event: CalendarEventResponse, generatedAt: Date): string[] {
    const lines = [
      'BEGIN:VEVENT',
      `UID:${event.id}@fyp-calendar`,
      `DTSTAMP:${this.formatUtcDateTimeForIcs(generatedAt)}`,
      `SUMMARY:${this.escapeIcsText(event.title)}`,
      `DTSTART:${this.formatLocalDateTimeForIcs(event.startTime)}`,
      `DTEND:${this.formatLocalDateTimeForIcs(event.endTime)}`,
      'STATUS:CONFIRMED',
    ];

    if (event.notes && event.notes.trim()) {
      lines.push(`DESCRIPTION:${this.escapeIcsText(event.notes)}`);
    }

    if (event.rrule && event.rrule.trim()) {
      lines.push(`RRULE:${String(event.rrule).trim().toUpperCase()}`);
    }

    const exdates = this.parseStoredExdates(event.exdates)
      .map((value) => this.formatOccurrenceTokenForIcs(value))
      .filter((value): value is string => Boolean(value));

    if (exdates.length) {
      lines.push(`EXDATE:${exdates.join(',')}`);
    }

    lines.push('END:VEVENT');
    return lines;
  }

  validateDraft(): void {
    const title = this.draftTitle.trim();
    if (!title || !this.draftStart || !this.draftEnd) {
      this.message = this.hasSubmitted ? 'Please fill in all fields' : '';
      return;
    }
    const start = new Date(this.draftStart);
    const end = new Date(this.draftEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      this.message = this.hasSubmitted ? 'End time must be after start time' : '';
      return;
    }
    if (this.draftIsRecurring) {
      if (!this.draftRecurrenceEnd) {
        this.message = this.hasSubmitted ? 'Recurrence end date is required' : '';
        return;
      }
      const recurEnd = new Date(this.draftRecurrenceEnd);
      if (Number.isNaN(recurEnd.getTime()) || recurEnd <= start) {
        this.message = this.hasSubmitted ? 'Recurrence end must be after the event start' : '';
        return;
      }
    }
    this.message = '';
  }

  private formatLocalDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private setModalOpenState(isOpen: boolean): void {
    this.isModalOpen = isOpen;
    this.cdr.detectChanges();

    if (isOpen) {
      // Ensure the modal paints immediately on the next tick as well.
      setTimeout(() => {
        if (this.isModalOpen) {
          this.cdr.detectChanges();
        }
      });
    }
  }

  private buildCalendarEventsForRange(events: CalendarEventResponse[], rangeStart: Date, rangeEnd: Date): EventInput[] {
    const occurrences = events.flatMap((event) => this.buildEventOccurrencesForRange(event, rangeStart, rangeEnd));
    const rankedOccurrences = this.applyStartDayOrdering(occurrences);
    return rankedOccurrences.flatMap((occurrence) => this.splitOccurrenceIntoDailyEvents(occurrence));
  }

  private applyStartDayOrdering(occurrences: CalendarRenderedOccurrence[]): CalendarRenderedOccurrence[] {
    const groupedByStartDay = new Map<string, CalendarRenderedOccurrence[]>();

    occurrences.forEach((occurrence) => {
      const dayKey = this.formatLocalDate(occurrence.start);
      const existing = groupedByStartDay.get(dayKey);
      if (existing) {
        existing.push(occurrence);
      } else {
        groupedByStartDay.set(dayKey, [occurrence]);
      }
    });

    groupedByStartDay.forEach((group) => {
      group.sort((left, right) => {
        const timeDelta = left.start.getTime() - right.start.getTime();
        if (timeDelta !== 0) {
          return timeDelta;
        }

        const titleDelta = left.title.localeCompare(right.title);
        if (titleDelta !== 0) {
          return titleDelta;
        }

        return left.id.localeCompare(right.id);
      });

      group.forEach((occurrence, index) => {
        occurrence.sortRank = index;
      });
    });

    return occurrences;
  }

  private buildEventOccurrencesForRange(event: CalendarEventResponse, rangeStart: Date, rangeEnd: Date): CalendarRenderedOccurrence[] {
    if (event.rrule) {
      return this.buildRecurringOccurrencesForRange(event, rangeStart, rangeEnd);
    }

    const start = new Date(event.startTime);
    const endRaw = new Date(event.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endRaw.getTime())) {
      return [];
    }

    const end = endRaw > start ? endRaw : new Date(start.getTime() + 60_000);
    if (!this.eventOverlapsRange(start, end, rangeStart, rangeEnd)) {
      return [];
    }

    return [{
      id: event.id,
      title: event.title,
      start,
      end,
      isMultiDay: this.isMultiDayOccurrence(start, end),
      notes: event.notes ?? '',
      color: this.normalizeEventColor(event.color),
      rrule: event.rrule ?? null,
      seriesId: event.seriesId ?? null,
      sortRank: 0,
    }];
  }

  private buildRecurringOccurrencesForRange(event: CalendarEventResponse, rangeStart: Date, rangeEnd: Date): CalendarRenderedOccurrence[] {
    const parsedRule = this.parseStoredRrule(event.rrule);
    if (!parsedRule) {
      return [];
    }

    const rootStart = new Date(event.startTime);
    const rootEnd = new Date(event.endTime);
    if (Number.isNaN(rootStart.getTime()) || Number.isNaN(rootEnd.getTime())) {
      return [];
    }

    const durationMs = Math.max(60_000, rootEnd.getTime() - rootStart.getTime());
    const overlapWindowStart = new Date(rangeStart.getTime() - durationMs);
    const effectiveUntil = parsedRule.until && parsedRule.until < rangeEnd ? parsedRule.until : rangeEnd;
    const exdateTokenSet = new Set(
      this.parseStoredExdates(event.exdates)
        .map((value) => this.parseOccurrenceStartToken(value))
        .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
        .map((value) => this.formatLocalDateTimeWithSeconds(value))
    );

    const rrule = new RRule({
      freq: parsedRule.freq === 'daily'
        ? RRule.DAILY
        : parsedRule.freq === 'weekly'
          ? RRule.WEEKLY
          : RRule.MONTHLY,
      dtstart: rootStart,
      until: effectiveUntil,
    });

    const color = this.normalizeEventColor(event.color);
    const effectiveSeriesId = event.seriesId ?? event.id;

    return rrule
      .between(overlapWindowStart, rangeEnd, true)
      .map((occurrenceStart) => {
        const occurrenceToken = this.formatLocalDateTimeWithSeconds(occurrenceStart);
        if (exdateTokenSet.has(occurrenceToken)) {
          return null;
        }

        const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
        if (!this.eventOverlapsRange(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
          return null;
        }

        return {
          id: event.id,
          title: event.title,
          start: occurrenceStart,
          end: occurrenceEnd,
          isMultiDay: this.isMultiDayOccurrence(occurrenceStart, occurrenceEnd),
          notes: event.notes ?? '',
          color,
          rrule: event.rrule ?? null,
          seriesId: effectiveSeriesId,
          sortRank: 0,
        } as CalendarRenderedOccurrence;
      })
      .filter((occurrence): occurrence is CalendarRenderedOccurrence => Boolean(occurrence));
  }

  private splitOccurrenceIntoDailyEvents(occurrence: CalendarRenderedOccurrence): EventInput[] {
    const events: EventInput[] = [];

    if (occurrence.end <= occurrence.start) {
      return events;
    }

    const originalStart = this.formatLocalDateTimeWithSeconds(occurrence.start);
    const originalEnd = this.formatLocalDateTimeWithSeconds(occurrence.end);

    let dayCursor = new Date(occurrence.start);
    dayCursor.setHours(0, 0, 0, 0);

    while (dayCursor < occurrence.end) {
      const nextDay = new Date(dayCursor);
      nextDay.setDate(nextDay.getDate() + 1);

      const segmentStart = occurrence.start > dayCursor ? new Date(occurrence.start) : new Date(dayCursor);
      const segmentEndBoundary = occurrence.end < nextDay ? new Date(occurrence.end) : new Date(nextDay);

      if (segmentEndBoundary > segmentStart) {
        const segmentEnd = segmentEndBoundary.getTime() === nextDay.getTime()
          ? new Date(segmentEndBoundary.getTime() - 1000)
          : segmentEndBoundary;

        if (segmentEnd > segmentStart) {
          const segmentDayKey = this.formatLocalDate(segmentStart);
          const segmentId = `${occurrence.id}__${originalStart}__${segmentDayKey}`;

          events.push({
            id: segmentId,
            title: occurrence.title,
            start: this.formatLocalDateTimeWithSeconds(segmentStart),
            end: this.formatLocalDateTimeWithSeconds(segmentEnd),
            backgroundColor: occurrence.color,
            borderColor: occurrence.color,
            textColor: this.getEventTextColor(occurrence.color),
            display: 'block',
            sortRank: occurrence.sortRank,
            isMultiDay: occurrence.isMultiDay,
            extendedProps: {
              sourceEventId: occurrence.id,
              notes: occurrence.notes,
              color: occurrence.color,
              rrule: occurrence.rrule,
              seriesId: occurrence.seriesId,
              sortRank: occurrence.sortRank,
              isMultiDay: occurrence.isMultiDay,
              originalStart,
              originalEnd,
              occurrenceStart: originalStart,
              occurrenceEnd: originalEnd,
            },
          });
        }
      }

      dayCursor = nextDay;
    }

    return events;
  }

  private eventOverlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
    return start < rangeEnd && end > rangeStart;
  }

  private isMultiDayOccurrence(start: Date, end: Date): boolean {
    if (end <= start) {
      return false;
    }

    const inclusiveEnd = new Date(end.getTime() - 1);
    return this.formatLocalDate(start) !== this.formatLocalDate(inclusiveEnd);
  }

  private compareCalendarEventOrder(eventA: any, eventB: any): number {
    const multiDayPriorityA = this.getEventOrderMultiDayPriority(eventA);
    const multiDayPriorityB = this.getEventOrderMultiDayPriority(eventB);
    if (multiDayPriorityA !== multiDayPriorityB) {
      return multiDayPriorityA - multiDayPriorityB;
    }

    const rankA = this.getEventOrderSortRank(eventA);
    const rankB = this.getEventOrderSortRank(eventB);
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const startA = this.getEventOrderStartTime(eventA);
    const startB = this.getEventOrderStartTime(eventB);
    if (startA !== startB) {
      return startA - startB;
    }

    const titleA = this.getEventOrderTitle(eventA);
    const titleB = this.getEventOrderTitle(eventB);
    const titleCompare = titleA.localeCompare(titleB);
    if (titleCompare !== 0) {
      return titleCompare;
    }

    const idA = this.getEventOrderId(eventA);
    const idB = this.getEventOrderId(eventB);
    return idA.localeCompare(idB);
  }

  private getEventOrderMultiDayPriority(event: any): number {
    const candidate =
      event?.extendedProps?.isMultiDay ??
      event?.isMultiDay ??
      event?._def?.extendedProps?.isMultiDay ??
      event?.event?.extendedProps?.isMultiDay;

    if (typeof candidate === 'boolean') {
      return candidate ? 0 : 1;
    }

    const occurrenceStart =
      event?.extendedProps?.occurrenceStart ??
      event?._def?.extendedProps?.occurrenceStart ??
      event?.event?.extendedProps?.occurrenceStart;
    const occurrenceEnd =
      event?.extendedProps?.occurrenceEnd ??
      event?._def?.extendedProps?.occurrenceEnd ??
      event?.event?.extendedProps?.occurrenceEnd;

    return this.eventSpansMultipleDaysForOrder(occurrenceStart, occurrenceEnd) ? 0 : 1;
  }

  private eventSpansMultipleDaysForOrder(startValue: unknown, endValue: unknown): boolean {
    const start = new Date(String(startValue || ''));
    const end = new Date(String(endValue || ''));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }

    return this.isMultiDayOccurrence(start, end);
  }

  private getEventOrderSortRank(event: any): number {
    const candidate =
      event?.extendedProps?.sortRank ??
      event?.sortRank ??
      event?._def?.extendedProps?.sortRank ??
      event?.event?.extendedProps?.sortRank;

    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : this.getEventOrderStartTime(event);
  }

  private getEventOrderStartTime(event: any): number {
    const candidates = [
      event?.start,
      event?.startTime,
      event?._instance?.range?.start,
      event?.event?.start,
    ];

    for (const candidate of candidates) {
      if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
        return candidate.getTime();
      }
      const parsed = new Date(candidate || '');
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.getTime();
      }
    }

    return 0;
  }

  private getEventOrderTitle(event: any): string {
    const value = event?.title ?? event?._def?.title ?? event?.event?.title ?? '';
    return String(value || '');
  }

  private getEventOrderId(event: any): string {
    const value =
      event?.id ??
      event?._def?.publicId ??
      event?._instance?.instanceId ??
      event?.event?.id ??
      '';
    return String(value || '');
  }

  private parseStoredRrule(rrule?: string | null): { freq: 'daily' | 'weekly' | 'monthly'; until: Date | null } | null {
    const value = String(rrule || '').trim().toUpperCase();
    if (!value) {
      return null;
    }

    const freqMatch = value.match(/FREQ=(DAILY|WEEKLY|MONTHLY)/i);
    if (!freqMatch) {
      return null;
    }

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
      freq: freqMatch[1].toLowerCase() as 'daily' | 'weekly' | 'monthly',
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

  private formatLocalDateTimeForIcs(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  }

  private formatUtcDateTimeForIcs(date: Date): string {
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  private formatOccurrenceTokenForIcs(value: string): string | null {
    const token = String(value || '').trim();
    if (!token) {
      return null;
    }

    const localMatch = token.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
      const [, year, month, day, hours, minutes, seconds = '00'] = localMatch;
      return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    const parsed = new Date(token);
    return Number.isNaN(parsed.getTime()) ? null : this.formatLocalDateTimeForIcs(parsed);
  }

  private escapeIcsText(value?: string | null): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\n|\r/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  private foldIcsLine(line: string): string {
    const maxLength = 75;
    if (line.length <= maxLength) {
      return line;
    }

    let output = '';
    let cursor = 0;
    while (cursor < line.length) {
      const chunk = line.slice(cursor, cursor + maxLength);
      output += cursor === 0 ? chunk : `\r\n ${chunk}`;
      cursor += maxLength;
    }

    return output;
  }

  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  private parseOccurrenceStartToken(value: string): Date | null {
    const token = String(value || '').trim();
    if (!token) {
      return null;
    }

    const localMatch = token.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
      const [, year, month, day, hours, minutes, seconds = '00'] = localMatch;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
    }

    const parsed = new Date(token);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeEventColor(color?: string | null): string {
    const candidate = String(color || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : this.defaultEventColor;
  }

  private getEventTextColor(color?: string | null): string {
    const hex = this.normalizeEventColor(color).replace('#', '');
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;

    return brightness >= 160 ? '#0f172a' : '#ffffff';
  }

  eventDetails(eventId: string): void {
    const calendarApi = this.calendarComponent?.getApi();
    if (!calendarApi) {
      return;
    }

    const event = calendarApi.getEventById(eventId);
    if (!event) {
      this.message = 'Event details not found';
      return;
    }

    this.openEventDetailsFromApi(event);
  }

  private openEventDetailsFromApi(event: {
    id: string;
    title: string;
    start: Date | null;
    end: Date | null;
    backgroundColor?: string | null;
    extendedProps?: {
      notes?: string | null;
      color?: string | null;
      rrule?: string | null;
      seriesId?: string | null;
      originalStart?: string;
      originalEnd?: string;
    };
  }): void {
    const calendarApi = this.calendarComponent?.getApi();

    const fallbackStart = event.extendedProps?.originalStart
      ? new Date(event.extendedProps.originalStart)
      : null;
    const fallbackEnd = event.extendedProps?.originalEnd
      ? new Date(event.extendedProps.originalEnd)
      : null;

    const startDate = event.start ?? fallbackStart;
    const endDate = event.end ?? fallbackEnd;
    const occurrenceStartToken = startDate ? this.formatLocalDateTimeWithSeconds(startDate) : null;

    this.pendingCalendar = calendarApi ?? this.pendingCalendar;
    this.selectedEventId = event.id;
    this.selectedSeriesId = event.extendedProps?.seriesId ?? null;
    this.selectedOccurrenceStartToken = occurrenceStartToken;
    this.draftTitle = event.title || '';
    this.draftStart = startDate ? this.formatLocalDateTime(startDate) : '';
    this.draftEnd = endDate ? this.formatLocalDateTime(endDate) : '';
    this.draftNotes = event.extendedProps?.notes ?? '';
    this.draftColor = this.normalizeEventColor(event.extendedProps?.color ?? event.backgroundColor ?? null);
    this.draftIsRecurring = false;
    this.draftRecurrenceFreq = 'weekly';
    this.draftRecurrenceEnd = '';
    const rruleStr = event.extendedProps?.rrule ?? null;
    const seriesIdStr = event.extendedProps?.seriesId ?? null;
    this.detailsRruleFreq = null;
    this.detailsRruleUntil = null;
    const parsedRule = this.parseStoredRrule(rruleStr);
    this.detailsRruleFreq = parsedRule?.freq ?? null;
    // Detached occurrences (no rrule but have a seriesId) should still
    // show series checkboxes — we signal this by keeping detailsRruleFreq
    // as a synthetic marker when seriesId exists but rrule is absent.
    if (!this.detailsRruleFreq && seriesIdStr) {
      this.detailsRruleFreq = 'series-member';
    }
    this.detailsRruleUntil = parsedRule?.until ? this.formatLocalDate(parsedRule.until) : null;
    this.hasSubmitted = false;
    this.isDeleting = false;
    this.isSavingEdit = false;
    this.editAllRecurringInSeries = false;
    this.message = '';
    this.isDetailsMode = true;
    this.isEditingDetails = false;
    this.detailsDraftSnapshot = null;
    this.setModalOpenState(true);
  }
}