import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth/auth';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class RegisterComponent {
  username ='';
  password = '';
  confirmPassword = '';
  errorMessage = '';

  constructor(private auth: Auth, private router: Router) {}

  ngOnInit() {
    this.username = '';
    this.password = '';
    this.confirmPassword = '';
    this.errorMessage = '';
  }

  register() {
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    this.errorMessage = '';
    this.auth.register({ username: this.username, password: this.password }).subscribe({
      next: () => {
        alert('Registration successful! Please log in.');
        this.router.navigate(['/login']);
      },
      error: () => {
        this.errorMessage = 'Registration failed';
      }
    });
  }

  onInputChange() {
    if (this.errorMessage) {
      this.errorMessage = '';
    }
  }

  // display error when clicked off the input field
  onInputBlur() {
    // make sure password length more than 8 and contain special character and number
    if (this.password.length < 8 || !/\d/.test(this.password) || !/[!@#$%^&*]/.test(this.password)) {
      this.errorMessage = 'Password must be at least 8 characters long and include a number and a special character';
    }
    // check if password and confirm password match
    if (this.password && this.confirmPassword && this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
    }
  }
}