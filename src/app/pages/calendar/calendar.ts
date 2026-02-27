import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, HostListener, NgZone, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarApi, CalendarOptions } from '@fullcalendar/core';
import { EventsService } from '../../services/events';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements AfterViewInit {
  constructor(
    private eventsService: EventsService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  @ViewChild(FullCalendarComponent) calendarComponent?: FullCalendarComponent;
  isModalOpen = false;
  isDetailsMode = false;
  draftTitle = '';
  draftStart = '';
  draftEnd = '';
  draftNotes = '';
  message = '';
  hasSubmitted = false;
  isDeleting = false;
  private selectedEventId: string | null = null;
  private pendingCalendar: CalendarApi | null = null;

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    editable: true,
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
    this.message = '';
    this.hasSubmitted = false;
    this.isDetailsMode = false;
    this.selectedEventId = null;
    this.setModalOpenState(true);
  }

  closeModal(): void {
    this.ngZone.run(() => {
      this.pendingCalendar = null;
      this.draftNotes = '';
      this.message = '';
      this.hasSubmitted = false;
      this.isDetailsMode = false;
      this.isDeleting = false;
      this.selectedEventId = null;
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
    if (this.isDetailsMode) {
      this.closeModal();
      return;
    }
    this.hasSubmitted = true;
    this.validateDraft();
    if (this.message || !this.pendingCalendar) {
      return;
    }
    const title = this.draftTitle.trim();
    this.eventsService.createEvent({
      title,
      startTime: this.draftStart,
      endTime: this.draftEnd,
      notes: this.draftNotes?.trim() || '',
    }).subscribe({
      next: (event) => {
        const calendarApi = this.pendingCalendar;
        this.closeModal();
        try {
          calendarApi?.addEvent({
            id: event.id,
            title: event.title,
            start: event.startTime,
            end: event.endTime,
            extendedProps: {
              notes: event.notes ?? '',
            },
          });
        } catch {
          this.loadEvents();
        }
      },
      error: () => {
        this.message = 'Failed to save event';
      },
    });
  }

  deleteSelectedEvent(): void {
    if (!this.isDetailsMode || !this.selectedEventId || this.isDeleting) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this event?');
    if (!confirmed) {
      return;
    }

    this.isDeleting = true;
    this.message = '';

    this.eventsService.deleteEvent(this.selectedEventId).subscribe({
      next: () => {
        const calendarApi = this.pendingCalendar;
        const eventId = this.selectedEventId;
        this.closeModal();
        try {
          if (eventId) {
            calendarApi?.getEventById(eventId)?.remove();
          }
        } catch {
          this.loadEvents();
        }
      },
      error: () => {
        this.isDeleting = false;
        this.message = 'Failed to delete event';
      },
    });
  }

  private loadEvents(): void {
    const calendarApi = this.calendarComponent?.getApi();
    if (!calendarApi) {
      return;
    }
    this.eventsService.listEvents().subscribe({
      next: (events) => {
        calendarApi.removeAllEvents();
        events.forEach((event) => {
          calendarApi.addEvent({
            id: event.id,
            title: event.title,
            start: event.startTime,
            end: event.endTime,
            extendedProps: {
              notes: event.notes ?? '',
            },
          });
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
    extendedProps?: { notes?: string | null };
  }): void {
    const calendarApi = this.calendarComponent?.getApi();
    if (!calendarApi) {
      return;
    }

    this.pendingCalendar = calendarApi;
    this.selectedEventId = event.id;
    this.draftTitle = event.title || '';
    this.draftStart = event.start ? this.formatLocalDateTime(event.start) : '';
    this.draftEnd = event.end ? this.formatLocalDateTime(event.end) : '';
    this.draftNotes = event.extendedProps?.notes ?? '';
    this.hasSubmitted = false;
    this.isDeleting = false;
    this.message = '';
    this.isDetailsMode = true;
    this.setModalOpenState(true);
  }
}