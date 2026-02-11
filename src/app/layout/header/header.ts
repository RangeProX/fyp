import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements OnInit {
  username = '';

  constructor(private auth: Auth, private router: Router) {}

  ngOnInit() {
    this.username = this.auth.getUsername() || 'Unknown';
  }

  
  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
