import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, HostListener, NgZone, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import rrulePlugin from '@fullcalendar/rrule';
import { CalendarApi, CalendarOptions, EventInput } from '@fullcalendar/core';
import { CalendarEventResponse, EventsService } from '../../services/events';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements AfterViewInit {
  private readonly defaultEventColor = '#3788d8';

  constructor(
    private eventsService: EventsService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;
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
    editable: true,
    events: [],
    eventDisplay: 'block',
    eventTimeFormat: {
      hour: 'numeric',
      minute: '2-digit',
      meridiem: 'short',
    },
    eventClick: (info) => {
      this.ngZone.run(() => {
        this.openEventDetailsFromApi(info.event);
      });
    },
  };

  ngAfterViewInit(): void {
    this.loadEvents();
  }

  openModal(): void {
    const calendarApi = this.calendarComponent?.getApi();
    if (!calendarApi) {
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    this.pendingCalendar = calendarApi;
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

  saveEvent(): void {
    if (this.isDetailsMode && !this.isEditingDetails) {
      this.closeModal();
      return;
    }

    this.hasSubmitted = true;
    this.validateDraft();
    if (this.message || !this.pendingCalendar) {
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
          this.calendarEvents = events.map((e) => this.buildCalendarEvent(e));
          this.calendarOptions = {
            ...this.calendarOptions,
            events: this.calendarEvents,
          };
          this.cdr.detectChanges();
        });
      },
      error: () => {
        console.error('Failed to load events');
      },
    });
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
  }

  private buildCalendarEvent(event: CalendarEventResponse): EventInput {
    const color = this.normalizeEventColor(event.color);
    const base = {
      id: event.id,
      title: event.title,
      backgroundColor: color,
      borderColor: color,
      textColor: this.getEventTextColor(color),
      extendedProps: {
        notes: event.notes ?? '',
        color,
        rrule: event.rrule ?? null,
        seriesId: event.seriesId ?? null,
        originalStart: event.startTime,
        originalEnd: event.endTime,
      },
    };

    const parsedRule = this.parseStoredRrule(event.rrule);
    if (parsedRule) {
      return {
        ...base,
        allDay: false,
        rrule: {
          freq: parsedRule.freq,
          dtstart: this.formatLocalDateTimeWithSeconds(new Date(event.startTime)),
          ...(parsedRule.until ? { until: this.formatLocalDateTimeWithSeconds(parsedRule.until) } : {}),
        },
        ...(event.exdates ? { exdate: this.parseStoredExdates(event.exdates) } : {}),
        duration: this.buildEventDuration(event.startTime, event.endTime),
      };
    }

    return { ...base, start: event.startTime, end: event.endTime };
  }

  private buildEventDuration(startTime: string, endTime: string): { minutes: number } {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
    return { minutes: diffMinutes };
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
    if (!calendarApi) {
      return;
    }

    const fallbackStart = event.extendedProps?.originalStart
      ? new Date(event.extendedProps.originalStart)
      : null;
    const fallbackEnd = event.extendedProps?.originalEnd
      ? new Date(event.extendedProps.originalEnd)
      : null;

    const startDate = event.start ?? fallbackStart;
    const endDate = event.end ?? fallbackEnd;
    const occurrenceStartToken = startDate ? this.formatLocalDateTimeWithSeconds(startDate) : null;

    this.pendingCalendar = calendarApi;
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