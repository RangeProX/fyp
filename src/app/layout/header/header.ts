import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth/auth';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements OnInit {
  username = '';
  isLogoutModalOpen = false;

  constructor(private auth: Auth, private router: Router) {}

  ngOnInit() {
    this.username = this.auth.getUsername() || 'Unknown';
  }

  openLogoutModal() {
    this.isLogoutModalOpen = true;
  }

  closeLogoutModal() {
    this.isLogoutModalOpen = false;
  }

  confirmLogout() {
    this.isLogoutModalOpen = false;
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
