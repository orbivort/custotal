import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { ToastProvider } from './components/toast';
import { RequireAuth } from './components/RequireAuth';
import { RequireRole } from './components/RequireRole';
import { AppErrorBoundary, RouteErrorBoundary, SuspendedRoute } from './components/ErrorBoundary';
import AppLayout from './components/AppLayout';
import { SessionProvider } from './features/auth/SessionContext';

// Route-level code splitting: each page ships as its own chunk and is fetched
// on first navigation, keeping the initial bundle to the layout shell and the
// pre-auth screens. Fallbacks come from <SuspendedRoute> (standalone routes)
// and AppLayout's Suspense-wrapped <Outlet /> (authenticated pages).
const LoginPage = lazy(() => import('./features/auth/LoginPage'));
const SetPasswordPage = lazy(() => import('./features/auth/SetPasswordPage'));
const ChangePasswordPage = lazy(() => import('./features/auth/ChangePasswordPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ContactsListPage = lazy(() => import('./features/contacts/ContactsListPage'));
const ContactDetailPage = lazy(() => import('./features/contacts/ContactDetailPage'));
const ContactFormPage = lazy(() => import('./features/contacts/ContactFormPage'));
const AccountsListPage = lazy(() => import('./features/accounts/AccountsListPage'));
const AccountDetailPage = lazy(() => import('./features/accounts/AccountDetailPage'));
const AccountFormPage = lazy(() => import('./features/accounts/AccountFormPage'));
const PipelinePage = lazy(() => import('./features/pipeline/PipelinePage'));
const OpportunityDetailPage = lazy(() => import('./features/pipeline/OpportunityDetailPage'));
const TasksPage = lazy(() => import('./features/tasks/TasksPage'));
const PipelineReportPage = lazy(() => import('./features/reports/PipelineReportPage'));
const WinLossReportPage = lazy(() => import('./features/reports/WinLossReportPage'));
const SearchPage = lazy(() => import('./features/search/SearchPage'));
const AdminIndexPage = lazy(() => import('./features/admin/AdminIndexPage'));
const AdminUsersPage = lazy(() => import('./features/admin/AdminUsersPage'));
const AdminStagesPage = lazy(() => import('./features/admin/AdminStagesPage'));
const ImportWizardPage = lazy(() => import('./features/admin/ImportWizardPage'));
const RecoveryPage = lazy(() => import('./features/admin/RecoveryPage'));

const router = createBrowserRouter([
  {
    path: '/login',
    errorElement: <RouteErrorBoundary />,
    element: (
      <SuspendedRoute>
        <LoginPage />
      </SuspendedRoute>
    ),
  },
  // One-time set-password screens (invitation acceptance / password reset).
  {
    path: '/invite/accept',
    errorElement: <RouteErrorBoundary />,
    element: (
      <SuspendedRoute>
        <SetPasswordPage mode="invite" />
      </SuspendedRoute>
    ),
  },
  {
    path: '/reset-password',
    errorElement: <RouteErrorBoundary />,
    element: (
      <SuspendedRoute>
        <SetPasswordPage mode="reset" />
      </SuspendedRoute>
    ),
  },
  {
    path: '/',
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      // Forced first-login credential rotation (temporary-credential holders).
      { path: 'change-password', element: <ChangePasswordPage /> },
      { path: 'contacts', element: <ContactsListPage /> },
      { path: 'contacts/new', element: <ContactFormPage /> },
      { path: 'contacts/:id', element: <ContactDetailPage /> },
      { path: 'contacts/:id/edit', element: <ContactFormPage /> },
      { path: 'accounts', element: <AccountsListPage /> },
      { path: 'accounts/new', element: <AccountFormPage /> },
      { path: 'accounts/:id', element: <AccountDetailPage /> },
      { path: 'accounts/:id/edit', element: <AccountFormPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'opportunities/:id', element: <OpportunityDetailPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'reports', element: <Navigate to="/reports/pipeline" replace /> },
      { path: 'reports/pipeline', element: <PipelineReportPage /> },
      { path: 'reports/winloss', element: <WinLossReportPage /> },
      {
        path: 'admin',
        element: (
          <RequireRole role="admin">
            <AdminIndexPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <RequireRole role="admin">
            <AdminUsersPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin/stages',
        element: (
          <RequireRole role="admin">
            <AdminStagesPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin/import',
        element: (
          <RequireRole role="admin">
            <ImportWizardPage />
          </RequireRole>
        ),
      },
      {
        path: 'admin/recover',
        element: (
          <RequireRole role="admin">
            <RecoveryPage />
          </RequireRole>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <AppErrorBoundary>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </AppErrorBoundary>
  );
}
