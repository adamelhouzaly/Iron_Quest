import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, RouterProvider, createHashRouter, createRoutesFromElements } from 'react-router-dom';
import { useStore } from './state/store';
import { AppShell } from './ui/AppShell';
import { ConfirmHost, Loading, Toasts } from './ui/kit';
import { R } from './routes';
import { initCloud } from './services/cloud';

const Landing = lazy(() => import('./features/landing/Landing'));

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page"><h1 className="display text-4xl">Something broke</h1>
        <p className="mt-2 max-w-xl text-sm">This screen failed to load, but your saved training data is stored separately and has not been touched. If you just came back online or the app updated, a reload usually fixes it.</p>
        <button className="btn btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

// A data router, so useBlocker can guard unsaved edits. Hash URLs keep deep links working on GitHub Pages.
const router = createHashRouter(createRoutesFromElements(
  <Route element={<Boundary><Suspense fallback={<div className="min-h-dvh"><Loading /></div>}><Outlet /></Suspense></Boundary>}>
    <Route path="/" element={<Landing />} />
    <Route path="/app" element={<AppShell />}>
      <Route index element={<R.Dashboard />} />
      <Route path="workout" element={<R.Workout />} />
      <Route path="complete/:id" element={<R.Complete />} />
      <Route path="exercises" element={<R.Exercises />} />
      <Route path="exercises/:id" element={<R.ExerciseDetail />} />
      <Route path="routines" element={<R.Routines />} />
      <Route path="routines/:id" element={<R.RoutineEdit />} />
      <Route path="history" element={<R.History />} />
      <Route path="history/:id" element={<R.HistoryDetail />} />
      <Route path="analytics" element={<R.Analytics />} />
      <Route path="body" element={<R.Body />} />
      <Route path="chamber" element={<R.Chamber />} />
      <Route path="quests" element={<R.Quests />} />
      <Route path="achievements" element={<R.Achievements />} />
      <Route path="calendar" element={<R.Calendar />} />
      <Route path="tools" element={<R.Tools />} />
      <Route path="community" element={<R.Community />} />
      <Route path="profile" element={<R.Profile />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>,
));

export function App() {
  const boot = useStore((s) => s.boot);
  const ready = useStore((s) => s.ready);
  const reduced = useStore((s) => s.settings.reducedEffects);
  useEffect(() => { void boot().then(() => initCloud()); }, [boot]);
  useEffect(() => { document.documentElement.classList.toggle('reduced-effects', reduced); }, [reduced]);

  if (!ready) return <div className="min-h-dvh"><Loading label="Waking the forge" /></div>;
  return (
    <div className="grain">
      <RouterProvider router={router} />
      <Toasts />
      <ConfirmHost />
    </div>
  );
}
