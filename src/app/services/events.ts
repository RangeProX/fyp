import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CalendarEventPayload {
  title: string;
  startTime: string;
  endTime: string;
  notes?: string;
  color?: string;
  visibility?: 'PRIVATE' | 'SHARED' | 'PUBLIC';
  rrule?: string;
}

export interface CalendarEventResponse {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  color: string;
  visibility: 'PRIVATE' | 'SHARED' | 'PUBLIC';
  rrule?: string | null;
  exdates?: string | null;
  seriesId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private apiUrl = '/api/events';

  constructor(private http: HttpClient) {}

  createEvent(payload: CalendarEventPayload): Observable<CalendarEventResponse> {
    return this.http.post<CalendarEventResponse>(this.apiUrl, payload);
  }

  listEvents(): Observable<CalendarEventResponse[]> {
    return this.http.get<CalendarEventResponse[]>(this.apiUrl);
  }

  updateEvent(eventId: string, payload: CalendarEventPayload): Observable<CalendarEventResponse> {
    return this.http.put<CalendarEventResponse>(`${this.apiUrl}/${eventId}`, payload);
  }

  editEventOccurrence(eventId: string, occurrenceStart: string, payload: CalendarEventPayload): Observable<CalendarEventResponse> {
    return this.http.post<CalendarEventResponse>(`${this.apiUrl}/${eventId}/edit-occurrence`, {
      occurrenceStart,
      ...payload,
    });
  }

  editSeries(seriesId: string, payload: CalendarEventPayload): Observable<CalendarEventResponse> {
    return this.http.put<CalendarEventResponse>(`${this.apiUrl}/series/${seriesId}`, payload);
  }

  deleteSeries(seriesId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/series/${seriesId}`);
  }

  deleteEvent(eventId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${eventId}`);
  }

  deleteEventOccurrence(eventId: string, occurrenceStart: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${eventId}/delete-occurrence`, {
      occurrenceStart,
    });
  }
}
