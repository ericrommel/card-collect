import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { LoginPage } from "./pages/Login";
import { SetsPage } from "./pages/Sets";
import { SetChecklistPage } from "./pages/SetChecklist";
import { MatchesPage } from "./pages/Matches";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="app-header">
      <NavLink to="/sets" className="brand">
        Cards Collect
      </NavLink>
      <nav>
        <span className="muted">{user.display_name}</span>
        <button
          className="link"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/sets"
            element={
              <RequireAuth>
                <SetsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/sets/:setId"
            element={
              <RequireAuth>
                <SetChecklistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/sets/:setId/matches"
            element={
              <RequireAuth>
                <MatchesPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </main>
    </div>
  );
}
