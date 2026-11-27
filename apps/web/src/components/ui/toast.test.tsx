import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import '@testing-library/jest-dom';
import { ToastMessage, ToastProvider } from './toast';
import { NotificationIcon, type NotificationType } from './notification-icon';

describe('preview notifications', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps persistent progress visible when React checks effect cleanup in Strict Mode', () => {
    render(
      <StrictMode>
        <ToastProvider>
          <ToastMessage
            title="Importing products"
            message="2 of 10 processed · 8 remaining"
            tone="info"
            duration={null}
            progress={0.2}
          />
        </ToastProvider>
      </StrictMode>,
    );
    act(() => jest.advanceTimersByTime(30000));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 10 processed · 8 remaining');
    expect(screen.getByRole('status').querySelector('svg')).toHaveAttribute(
      'data-notification-icon',
      'loading',
    );
  });

  it('updates one persistent toast and removes it when preparation ends', () => {
    const view = render(
      <ToastProvider>
        <ToastMessage
          title="Preparing your preview"
          message="1 of 10 products ready"
          tone="info"
          duration={null}
        />
      </ToastProvider>,
    );
    const notification = screen.getByRole('status');
    act(() => jest.advanceTimersByTime(30_000));
    expect(notification).toBeInTheDocument();
    view.rerender(
      <ToastProvider>
        <ToastMessage
          title="Preparing your preview"
          message="8 of 10 products ready"
          tone="info"
          duration={null}
        />
      </ToastProvider>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toBe(notification);
    expect(notification).toHaveTextContent('8 of 10');
    view.rerender(
      <ToastProvider>
        <div>Preview complete</div>
      </ToastProvider>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('automatically dismisses the completion toast', () => {
    render(
      <ToastProvider>
        <ToastMessage
          title="Your preview is ready"
          message="Review your products below."
          tone="success"
        />
      </ToastProvider>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

it('keeps the notification mounted for its exit animation after dismissing', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <ToastMessage
          message="Import started"
          tone="success"
          action={{ label: 'View import history', href: '/admin/imports?tab=history' }}
        />
      </ToastProvider>,
    );
    const notification = screen.getByRole('status');
    expect(screen.getByRole('link', { name: 'View import history' })).toHaveAttribute(
      'href',
      '/admin/imports?tab=history',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(notification).toHaveAttribute('data-state', 'leaving');
    expect(notification).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(220));
    expect(notification).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it('pauses dismissal while the user is reading or interacting with a toast', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <ToastMessage message="Your preview is ready" tone="success" />
      </ToastProvider>,
    );
    const notification = screen.getByRole('status');
    act(() => jest.advanceTimersByTime(5000));
    fireEvent.mouseEnter(notification);
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole('status')).toBe(notification);
    fireEvent.mouseLeave(notification);
    act(() => jest.advanceTimersByTime(1000));
    expect(notification).toHaveAttribute('data-state', 'leaving');
    act(() => jest.advanceTimersByTime(220));
    expect(notification).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it('does not reopen a manually dismissed persistent operation on its next progress update', () => {
  jest.useFakeTimers();
  try {
    const view = render(
      <ToastProvider>
        <ToastMessage message="1 product ready" tone="info" duration={null} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => jest.advanceTimersByTime(220));
    view.rerender(
      <ToastProvider>
        <ToastMessage message="8 products ready" tone="info" duration={null} />
      </ToastProvider>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it('returns keyboard focus to the previous control after dismissal', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <button type="button">Continue editing</button>
        <ToastMessage message="Saved" tone="success" />
      </ToastProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Continue editing' });
    act(() => trigger.focus());
    const close = screen.getByRole('button', { name: 'Dismiss notification' });
    act(() => close.focus());
    fireEvent.click(close);
    expect(trigger).toHaveFocus();
    act(() => jest.advanceTimersByTime(220));
  } finally {
    jest.useRealTimers();
  }
});

it.each(['success', 'error', 'info'] as const)(
  'uses the shared %s SVG without an icon background or inline styles',
  (tone) => {
    const { container } = render(
      <ToastProvider>
        <ToastMessage title="Notification" message="A short message" tone={tone} />
      </ToastProvider>,
    );
    const notification = screen.getByRole(tone === 'error' ? 'alert' : 'status');
    expect(notification.querySelectorAll('svg')).toHaveLength(1);
    expect(notification.querySelector('svg')).toHaveAttribute('data-notification-icon', tone);
    expect(notification).toHaveAttribute('aria-atomic', 'true');
    expect(container.querySelector('[style]')).toBeNull();
  },
);

it.each<NotificationType>([
  'success',
  'error',
  'warning',
  'info',
  'critical',
  'loading',
  'pending',
  'offline',
])('renders the supplied %s icon with consistent, nonshrinking geometry', (type) => {
  const { container } = render(<NotificationIcon type={type} />);
  const icon = container.querySelector('svg');
  expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  expect(icon).toHaveAttribute('stroke-width', '1.7');
  expect(icon).toHaveAttribute('stroke-linecap', 'round');
  expect(icon).toHaveAttribute('stroke-linejoin', 'round');
  expect(icon).toHaveAttribute('aria-hidden', 'true');
  expect(icon).toHaveClass('h-9', 'w-9', 'shrink-0', 'self-center');
  if (type === 'loading') expect(icon).toHaveClass('motion-safe:animate-spin');
});

it('enters from the left, exits to the right and fills the timer from left to right', () => {
  jest.useFakeTimers();
  try {
    render(
      <ToastProvider>
        <ToastMessage title="Saved" message="Your changes are saved." tone="success" />
      </ToastProvider>,
    );
    const notification = screen.getByRole('status');
    expect(notification).toHaveClass('starting:-translate-x-[100vw]');
    act(() => jest.advanceTimersByTime(1000));
    expect(notification).toHaveClass('translate-x-0');
    const progress = notification.querySelector('progress')!;
    expect(progress.value).toBeCloseTo(1 / 6);
    fireEvent.mouseEnter(notification);
    act(() => jest.advanceTimersByTime(1000));
    expect(progress.value).toBeCloseTo(1 / 6);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(notification).toHaveClass('translate-x-[100vw]');
    act(() => jest.advanceTimersByTime(220));
  } finally {
    jest.useRealTimers();
  }
});
