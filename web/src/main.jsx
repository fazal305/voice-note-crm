/* eslint-disable react/only-export-components -- entry module, never hot-reloaded as a component */
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import './index.css'
import { AuthProvider } from './lib/auth'
import PublicLayout from './layouts/PublicLayout'
import AppLayout, { RequireAuth, RequireManager } from './layouts/AppLayout'
import { Skeleton } from './components/ui'
import NotFound from './pages/public/NotFound'

const Landing = lazy(() => import('./pages/public/Landing'))
const Login = lazy(() => import('./pages/public/Login'))
const Register = lazy(() => import('./pages/public/Register'))
const Terms = lazy(() => import('./pages/public/Terms'))
const Record = lazy(() => import('./pages/app/Record'))
const Notes = lazy(() => import('./pages/app/Notes'))
const Clients = lazy(() => import('./pages/app/Clients'))
const ClientForm = lazy(() => import('./pages/app/ClientForm'))
const Team = lazy(() => import('./pages/app/Team'))

function Root() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <Outlet />
    </AuthProvider>
  )
}

function Page({ children }) {
  return (
    <Suspense
      fallback={
        <div aria-busy="true" className="mx-auto max-w-5xl space-y-3 p-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Page><Landing /></Page> },
          { path: '/login', element: <Page><Login /></Page> },
          { path: '/register', element: <Page><Register /></Page> },
          { path: '/terms', element: <Page><Terms /></Page> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: '/app',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/app/record" replace /> },
          { path: 'record', element: <Page><Record /></Page> },
          { path: 'notes', element: <Page><Notes /></Page> },
          { path: 'clients', element: <Page><Clients /></Page> },
          { path: 'clients/new', element: <Page><ClientForm /></Page> },
          { path: 'clients/:id', element: <Page><ClientForm /></Page> },
          { path: 'team', element: <RequireManager><Page><Team /></Page></RequireManager> },
          { path: '*', element: <NotFound inApp /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
