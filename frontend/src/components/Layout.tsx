import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    navigate('/login');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <Link to="/" className="navbar-brand">
          ⚡ BidWave
        </Link>

        {user && (
          <>
            <div className="navbar-actions desktop-navbar-actions">
              {isAdmin() && (
                <>
                  <Link to="/admin" className="btn btn-secondary btn-sm">
                    Admin Dashboard
                  </Link>
                  <Link to="/admin?create=1" className="btn btn-primary btn-sm">
                    Create Auction
                  </Link>
                </>
              )}

              <div className="user-badge">
                <span>{user.name}</span>
                <span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
              </div>

              <button onClick={handleLogout} className="btn btn-danger btn-sm">
                Logout
              </button>
            </div>

            <button
              type="button"
              className="navbar-menu-toggle"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? 'Close' : 'Menu'}
            </button>

            {mobileMenuOpen && (
              <div className="mobile-navbar-menu">
                {isAdmin() && (
                  <>
                    <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>Admin Dashboard</Link>
                    <Link to="/admin?create=1" onClick={() => setMobileMenuOpen(false)}>Create Auction</Link>
                  </>
                )}
                <div className="user-badge">
                  <span>{user.name}</span>
                  <span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
                </div>
                <button onClick={handleLogout} className="btn btn-danger btn-sm">Logout</button>
              </div>
            )}
          </>
        )}
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
