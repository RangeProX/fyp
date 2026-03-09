import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class Auth {
  private apiUrl = 'http://localhost:8080/api/auth';

  constructor(private http: HttpClient) {}

  login(credentials: { username: string; password: string }) {
    return this.http.post<any>(`${this.apiUrl}/login`, credentials).pipe(
      timeout(10000),
      map(res => {
        if (!res?.accessToken) {
          throw new Error('Invalid credentials');
        }
        localStorage.setItem('token', res.accessToken);
        return res;
      })
    );
  }

  register(data: { username: string; password: string }) {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('notesList.aiState');
  }

  getToken() {
    return localStorage.getItem('token');
  }

  getUsername() {
    const token = this.getToken();
    if (!token) return '';

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.username || '';
    } catch {
      return '';
    }
  }

  isLoggedIn() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const exp = payload?.exp;
      if (!exp) return true;
      const isExpired = Date.now() >= exp * 1000;
      if (isExpired) {
        this.logout();
      }
      return !isExpired;
    } catch {
      this.logout();
      return false;
    }
  }
}
