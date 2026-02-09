import { ChangeDetectorRef, Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Auth } from '../../core/auth/auth';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  errorMessage = '';
  hasAttemptedLogin = false;

  constructor(
    private auth: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.username = '';
    this.password = '';
    this.errorMessage = '';
    this.hasAttemptedLogin = false;
  }

  login(form: NgForm) {
    this.hasAttemptedLogin = true;
    if (form.invalid || !this.username?.trim() || !this.password?.trim()) {
      form.control.markAllAsTouched();
      this.errorMessage = 'Please enter username and password';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.auth.login({ username: this.username, password: this.password })
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: () => {
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          if (err?.name === 'TimeoutError') {
            this.errorMessage = 'Server took too long to respond';
          } else if (err?.status === 0) {
            this.errorMessage = 'Unable to reach server';
          } else if (err?.status === 401) {
            this.errorMessage = 'Username or password is incorrect';
          } else {
            this.errorMessage = err?.error?.message || 'Username or password is incorrect';
          }
          this.cdr.detectChanges();
        },
      });
  }

  onInputChange() {
    if (this.hasAttemptedLogin) {
      this.errorMessage = '';
    }
  }

  showPassword = false;

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
