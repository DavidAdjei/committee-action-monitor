import { Navigate, Route, Routes } from "react-router-dom";
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

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <LoadingLogo scope="fullscreen" message="Authenticating & loading workspace..." />;
  if (!me) return <Navigate to="/signin" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<DevSignIn />} />
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
