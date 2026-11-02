import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'alert-history',
    loadComponent: () => import('./alert-history/alert-history.page').then((m) => m.AlertHistoryPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
