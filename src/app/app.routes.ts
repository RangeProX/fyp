import { Routes } from '@angular/router';
import { MainLayout } from './layout/main-layout/main-layout';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';

export const routes: Routes = [
    {
        path: '',
        component: MainLayout,
        children: [
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: 'dashboard', component: DashboardComponent },
        ]
    },
    {
        path: 'login',
        component: LoginComponent,
        children: [
            { path: 'login', component: LoginComponent },
        ]
    },
    {
        path: 'register',
        component: RegisterComponent,
        children: [
            { path: 'register', component: RegisterComponent },
        ]
    }
];
