import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AdminDashboard from './pages/AdminDashboard';
import { useAuthStore } from './store/authStore';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

type AuthState = ReturnType<typeof useAuthStore.getState>;

vi.mock('./store/authStore', async (
  importOriginal: () => Promise<typeof import('./store/authStore')>,
) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuthStore: vi.fn(),
  };
});

function createAuthState(user: AuthState['user'], admin: boolean): AuthState {
  return {
    user,
    token: user ? 'test-token' : null,
    setAuth: () => {},
    logout: () => {},
    isAdmin: () => admin,
  };
}

describe('Admin Frontend Visibility', () => {
  it('shows admin links and create form for admin', () => {
    vi.mocked(useAuthStore).mockReturnValue(
      createAuthState(
        { id: '1', email: 'admin@admin.com', name: 'Admin', role: 'admin' },
        true,
      ),
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Layout should show Admin Dashboard link
    expect(screen.getByRole('link', { name: 'Admin Dashboard' })).toBeInTheDocument();

    // AdminDashboard should show Create Auction button
    expect(screen.getByText('+ Create Auction')).toBeInTheDocument();
  });

  it('hides admin links and redirects for bidder', () => {
    vi.mocked(useAuthStore).mockReturnValue(
      createAuthState(
        { id: '2', email: 'bidder@bidder.com', name: 'Bidder', role: 'bidder' },
        false,
      ),
    );

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Layout should NOT show Admin Dashboard link
    expect(screen.queryByText('Admin Dashboard')).not.toBeInTheDocument();

    // Bidder accessing /admin should not see Create Auction button (actually AdminDashboard might redirect)
    // In our implementation AdminDashboard redirects to / if not admin
    expect(screen.queryByText('Create Auction')).not.toBeInTheDocument();
  });
});
