import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CalendarEventPayload {
  title: string;
  startTime: string;
  endTime: string;
  notes?: string;
  visibility?: 'PRIVATE' | 'SHARED' | 'PUBLIC';
}

export interface CalendarEventResponse {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  visibility: 'PRIVATE' | 'SHARED' | 'PUBLIC';
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

  deleteEvent(eventId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${eventId}`);
  }
}
