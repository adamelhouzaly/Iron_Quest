import { lazy } from 'react';

const loaders = {
  Dashboard: () => import('./features/dashboard/Dashboard'),
  Workout: () => import('./features/workout/WorkoutPage'),
  Complete: () => import('./features/workout/CompletePage'),
  Exercises: () => import('./features/exercises/ExercisesPage'),
  ExerciseDetail: () => import('./features/exercises/ExerciseDetail'),
  Routines: () => import('./features/routines/RoutinesPage'),
  RoutineEdit: () => import('./features/routines/RoutineEditor'),
  History: () => import('./features/history/HistoryPage'),
  HistoryDetail: () => import('./features/history/HistoryDetail'),
  Analytics: () => import('./features/analytics/AnalyticsPage'),
  Body: () => import('./features/body/BodyPage'),
  Chamber: () => import('./features/chamber/ChamberPage'),
  Quests: () => import('./features/quests/QuestsPage'),
  Achievements: () => import('./features/achievements/AchievementsPage'),
  Calendar: () => import('./features/calendar/CalendarPage'),
  Tools: () => import('./features/tools/ToolsPage'),
  Community: () => import('./features/community/CommunityPage'),
  Profile: () => import('./features/profile/ProfilePage'),
};
export const R = Object.fromEntries(Object.entries(loaders).map(([k, l]) => [k, lazy(l as () => Promise<{ default: React.ComponentType }>)])) as Record<keyof typeof loaders, React.LazyExoticComponent<React.ComponentType>>;
export const preloadAppRoutes = () => Promise.all(Object.values(loaders).map((l) => l().catch(() => undefined)));
