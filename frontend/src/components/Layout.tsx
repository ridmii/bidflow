import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Layout() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <Link to="/" className="navbar-brand">
          ⚡ BidWave
        </Link>

        {user && (
          <div className="navbar-actions">
            {isAdmin() && (
              <Link to="/admin" className="btn btn-secondary btn-sm">
                Admin Dashboard
              </Link>
            )}
            
            <div className="user-badge">
              <span>{user.name}</span>
              <span className={`role-badge ${user.role}`}>{user.role}</span>
            </div>

            <button onClick={handleLogout} className="btn btn-danger btn-sm">
              Logout
            </button>
          </div>
        )}
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
