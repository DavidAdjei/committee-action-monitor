import { Navigate, Route, Routes } from "react-router-dom";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";
import { useAuth } from "@/state/authContext";
import { Layout } from "@/components/Layout";
import DevSignIn from "@/pages/DevSignIn";
import Dashboard from "@/pages/Dashboard";
import Committees from "@/pages/Committees";
import CommitteeWorkspace from "@/pages/CommitteeWorkspace";
import ActionPoints from "@/pages/ActionPoints";
import Notifications from "@/pages/Notifications";
import CalendarPage from "@/pages/Calendar";
import { LoadingLogo } from "@/components/LoadingLogo";
import { isEntraConfigured } from "@/auth/msalConfig";

/**
 * Route guard:
 * - Entra: AuthenticatedTemplate / UnauthenticatedTemplate (MSAL session)
 * - Dev: local me + x-dev-user-id
 */
function ProfileLoadFailed() {
  const { signOut } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Signed in with Microsoft, but your account is not set up in Committee Action Monitor.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Ask an administrator to sync the directory or enable ENTRA_AUTO_PROVISION on the API. Your Entra
          user must exist (or be creatable) in the local user table.
        </p>
        <button type="button" className="btn-primary mt-4" onClick={() => void signOut()}>
          Sign out
        </button>
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
            <Navigate to="/committees" replace />
          )}
        </AuthenticatedTemplate>
        <UnauthenticatedTemplate>
          <DevSignIn />
        </UnauthenticatedTemplate>
      </>
    );
  }

  if (loading) {
    return <LoadingLogo scope="fullscreen" message="Loading…" />;
  }
  if (me) return <Navigate to="/committees" replace />;
  return <DevSignIn />;
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
      <Route path="*" element={<Navigate to="/committees" replace />} />
    </Routes>
  );
}
