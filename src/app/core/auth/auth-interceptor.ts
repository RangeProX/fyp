import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Auth } from './auth';

let isHandlingUnauthorized = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(req).pipe(
    catchError(err => {
      if (err?.status === 401 && !isHandlingUnauthorized) {
        isHandlingUnauthorized = true;
        alert('Your session has expired. Please log in again.');
        auth.logout();
        router.navigate(['/login']);
        setTimeout(() => {
          isHandlingUnauthorized = false;
        }, 500);
      }
      return throwError(() => err);
    })
  );
};
