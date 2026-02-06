import { Component, OnInit } from '@angular/core';
import { UpcomingEvents } from '../../widgets/upcoming-events/upcoming-events';
import { Analytics } from '../../widgets/analytics/analytics';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [UpcomingEvents, Analytics],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit {
  username = '';

  ngOnInit() {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.username = payload.username || 'User';
      } catch (error) {
        this.username = 'User';
      }
    }
  }
}
