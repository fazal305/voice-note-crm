/* eslint-disable react/only-export-components -- entry module, never hot-reloaded as a component */
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration } from 'react-router'
import './index.css'
import { AuthProvider } from './lib/auth'
import PublicLayout from './layouts/PublicLayout'
import { RequireAuth, RequireManager } from './layouts/guards'
import { Skeleton } from './components/ui'
import { usePageMeta } from './hooks/usePageMeta'
import NotFound from './pages/public/NotFound'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

// The app shell (navigation, upload queue) loads only once someone opens /app, so public pages stay light.
const AppLayout = lazy(() => import('./layouts/AppLayout'))

const Landing = lazy(() => import('./pages/public/Landing'))
const Login = lazy(() => import('./pages/public/Login'))
const Register = lazy(() => import('./pages/public/Register'))
const Terms = lazy(() => import('./pages/public/Terms'))
const Privacy = lazy(() => import('./pages/public/Privacy'))
const Faq = lazy(() => import('./pages/public/Faq'))
const Record = lazy(() => import('./pages/app/Record'))
const Notes = lazy(() => import('./pages/app/Notes'))
const NoteDetail = lazy(() => import('./pages/app/NoteDetail'))
const Clients = lazy(() => import('./pages/app/Clients'))
const ClientForm = lazy(() => import('./pages/app/ClientForm'))
const ClientDetail = lazy(() => import('./pages/app/ClientDetail'))
const Dashboard = lazy(() => import('./pages/app/Dashboard'))
const Settings = lazy(() => import('./pages/app/Settings'))
const Tasks = lazy(() => import('./pages/app/Tasks'))
const Team = lazy(() => import('./pages/app/Team'))

function Root() {
  usePageMeta()
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
          { path: '/privacy', element: <Page><Privacy /></Page> },
          { path: '/faq', element: <Page><Faq /></Page> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: '/app',
        element: (
          <RequireAuth>
            <Page>
              <AppLayout />
            </Page>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/app/record" replace /> },
          { path: 'record', element: <Page><Record /></Page> },
          { path: 'notes', element: <Page><Notes /></Page> },
          { path: 'notes/:id', element: <Page><NoteDetail /></Page> },
          { path: 'tasks', element: <Page><Tasks /></Page> },
          { path: 'clients', element: <Page><Clients /></Page> },
          { path: 'clients/new', element: <Page><ClientForm /></Page> },
          { path: 'clients/:id', element: <Page><ClientDetail /></Page> },
          { path: 'clients/:id/edit', element: <Page><ClientForm /></Page> },
          { path: 'dashboard', element: <RequireManager><Page><Dashboard /></Page></RequireManager> },
          { path: 'team', element: <RequireManager><Page><Team /></Page></RequireManager> },
          { path: 'settings', element: <RequireManager><Page><Settings /></Page></RequireManager> },
          { path: '*', element: <NotFound inApp /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
