import { Navigate, Route, Routes } from "react-router-dom";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import { useAuth } from "@/state/authContext";
import { Layout } from "@/components/Layout";
import SignIn from "@/pages/SignIn";
import Dashboard from "@/pages/Dashboard";
import Committees from "@/pages/Committees";
import CommitteeWorkspace from "@/pages/CommitteeWorkspace";
import ActionPoints from "@/pages/ActionPoints";
import ActionDetailPage from "@/pages/ActionDetailPage";
import Notifications from "@/pages/Notifications";
import MeetingDetailPage from "@/pages/MeetingDetail";
import ReportsPage from "@/pages/Reports";
import CalendarPage from "@/pages/Calendar";
import { LoadingLogo } from "@/components/LoadingLogo";
import { isEntraConfigured } from "@/auth/msalConfig";
import { homePathFor } from "@/lib/homePath";

/**
 * Route guard:
 * - Entra: AuthenticatedTemplate / UnauthenticatedTemplate (MSAL session)
 * - Bearer JWT from MSAL (Entra) only
 */
function ProfileLoadFailed() {
  const { signOut, authError, refresh } = useAuth();
  const detail =
    authError ??
    "Signed in with Microsoft, but your account is not set up in Committee Action Monitor.";
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cannot open your workspace</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{detail}</p>
        <p className="mt-3 text-xs text-slate-500">
          If this continues, contact Cyber & Information Security with your work email address.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn" onClick={() => void refresh()}>
            Try again
          </button>
          <button type="button" className="btn-primary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading, entraEnabled } = useAuth();

  if (entraEnabled && isEntraConfigured()) {
    return (
      <>
        <AuthenticatedTemplate>
          {loading ? (
            <LoadingLogo scope="fullscreen" message="Loading your workspace…" />
          ) : me ? (
            <Layout>{children}</Layout>
          ) : (
            <ProfileLoadFailed />
          )}
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <Navigate to="/signin" replace />
        </UnauthenticatedTemplate>
      </>
    );
  }

  if (loading) {
    return <LoadingLogo scope="fullscreen" message="Authenticating & loading workspace..." />;
  }
  if (!me) return <Navigate to="/signin" replace />;
  return <Layout>{children}</Layout>;
}

function SignInRoute() {
  const { me, loading, entraEnabled } = useAuth();

  if (entraEnabled && isEntraConfigured()) {
    return (
      <>
        <AuthenticatedTemplate>
          {loading ? (
            <LoadingLogo scope="fullscreen" message="Signing you in…" />
          ) : (
            <Navigate to={homePathFor(me)} replace />
          )}
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <SignIn />
        </UnauthenticatedTemplate>
      </>
    );
  }

  if (loading) {
    return <LoadingLogo scope="fullscreen" message="Loading…" />;
  }
  if (me) return <Navigate to={homePathFor(me)} replace />;
  return <SignIn />;
}

function HomeRedirect() {
  const { me } = useAuth();
  return <Navigate to={homePathFor(me)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInRoute />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/committees"
        element={
          <RequireAuth>
            <Committees />
          </RequireAuth>
        }
      />
      <Route
        path="/committees/:id"
        element={
          <RequireAuth>
            <CommitteeWorkspace />
          </RequireAuth>
        }
      />
      <Route
        path="/actions"
        element={
          <RequireAuth>
            <ActionPoints />
          </RequireAuth>
        }
      />
      <Route
        path="/actions/:actionId"
        element={
          <RequireAuth>
            <ActionDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/calendar"
        element={
          <RequireAuth>
            <CalendarPage />
          </RequireAuth>
        }
      />
      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <Notifications />
          </RequireAuth>
        }
      />
      <Route
        path="/meetings/:meetingId"
        element={
          <RequireAuth>
            <MeetingDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <ReportsPage />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <HomeRedirect />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
