import { renderHook, act } from '@testing-library/react';
import { useUserStore } from '../store/user.store';

// Reset Zustand store between tests
beforeEach(() => {
  useUserStore.setState({ user: null });
});

describe('useUserStore', () => {
  it('initializes with null user', () => {
    const { result } = renderHook(() => useUserStore());
    expect(result.current.user).toBeNull();
  });

  it('setUser stores user identity (no tokens)', () => {
    const { result } = renderHook(() => useUserStore());

    act(() => {
      result.current.setUser({ id: 'u1', email: 'test@example.com', role: 'CUSTOMER' });
    });

    expect(result.current.user).toEqual({ id: 'u1', email: 'test@example.com', role: 'CUSTOMER' });
  });

  it('setUser(null) clears the user', () => {
    const { result } = renderHook(() => useUserStore());

    act(() => {
      result.current.setUser({ id: 'u1', email: 'test@example.com', role: 'CUSTOMER' });
    });
    act(() => {
      result.current.setUser(null);
    });

    expect(result.current.user).toBeNull();
  });

  it('stores ADMIN role correctly', () => {
    const { result } = renderHook(() => useUserStore());

    act(() => {
      result.current.setUser({ id: 'admin-id', email: 'admin@example.com', role: 'ADMIN' });
    });

    expect(result.current.user?.role).toBe('ADMIN');
  });
});
