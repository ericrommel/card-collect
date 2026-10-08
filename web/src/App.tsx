import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "./state/AuthContext";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { SetsPage } from "./pages/Sets";
import { SetExplorerPage } from "./pages/SetExplorer";
import { AddCardPage } from "./pages/AddCard";
import { MatchesPage } from "./pages/Matches";
import { ExchangesPage } from "./pages/Exchanges";
import { PublicCollectionPage } from "./pages/PublicCollection";
import { AccountPage } from "./pages/Account";
import { CollectionFocusPage } from "./pages/CollectionFocus";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className={user ? "app-shell has-session" : "app-shell"}>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      {user && (
        <header className="app-header">
          <NavLink to="/" className="brand" end>
            Cards Collect
          </NavLink>
          <nav className="top-nav" aria-label="Primary">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/sets">Catalog</NavLink>
            <NavLink to="/exchanges">Exchanges</NavLink>
          </nav>
          <div className="header-user">
            <span className="user-name muted">{user.display_name}</span>
            <NavLink to="/account" className="header-account">
              Account
            </NavLink>
            <button
              type="button"
              className="link"
              onClick={() => {
                void logout().then(() => navigate("/login"));
              }}
            >
              Sign out
            </button>
          </div>
        </header>
      )}
      <main id="content" className="app-main">
        {children}
      </main>
      {user && (
        <nav className="bottom-nav" aria-label="Mobile">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/sets">Catalog</NavLink>
          <NavLink to="/exchanges">Exchanges</NavLink>
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/c/:shareId" element={<PublicCollectionPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/collection/:view"
          element={
            <RequireAuth>
              <CollectionFocusPage />
            </RequireAuth>
          }
        />
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
              <SetExplorerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sets/:setId/add"
          element={
            <RequireAuth>
              <AddCardPage />
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
        <Route
          path="/account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
