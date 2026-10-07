import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { LoginPage } from "./pages/Login";
import { SetsPage } from "./pages/Sets";
import { SetChecklistPage } from "./pages/SetChecklist";
import { MatchesPage } from "./pages/Matches";
import { ExchangesPage } from "./pages/Exchanges";
import { PublicCollectionPage } from "./pages/PublicCollection";

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
        <NavLink to="/sets">Sets</NavLink>
        <NavLink to="/exchanges">Exchanges</NavLink>
        <span className="muted">{user.display_name}</span>
        <button
          className="link"
          onClick={() => {
            void logout().then(() => navigate("/login"));
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
          <Route path="/c/:shareId" element={<PublicCollectionPage />} />
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
          <Route
            path="/exchanges"
            element={
              <RequireAuth>
                <ExchangesPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/sets" replace />} />
        </Routes>
      </main>
    </div>
  );
}
