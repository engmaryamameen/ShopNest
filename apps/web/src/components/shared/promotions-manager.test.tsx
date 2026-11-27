import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { PromotionsManager } from './promotions-manager';

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ api: { vendorCreatePromotion: jest.fn() } }));
jest.mock('./offer-pricing-fields', () => ({
  PricingField: ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      {label}
      {children}
    </div>
  ),
}));
jest.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange(label === 'Promotion starts' ? '2026-11-27T00:00' : '2026-11-28T23:59')
      }
    >
      {label}
    </button>
  ),
}));

it('submits a whole-number percentage without native step validation blocking the form', async () => {
  jest
    .mocked(api.vendorCreatePromotion)
    .mockResolvedValue({} as Awaited<ReturnType<typeof api.vendorCreatePromotion>>);
  const user = userEvent.setup();
  render(<PromotionsManager promotions={[]} scope="vendor" />);
  await user.click(screen.getByRole('button', { name: 'New promotion' }));
  await user.type(screen.getByRole('textbox', { name: 'Promotion code' }), 'SAVE5');
  const value = screen.getByRole('spinbutton', { name: 'Promotion value' });
  await user.clear(value);
  await user.type(value, '5');
  await user.click(screen.getByRole('button', { name: 'Promotion starts' }));
  await user.click(screen.getByRole('button', { name: 'Promotion ends' }));
  expect(value).toBeValid();
  await user.click(screen.getByRole('button', { name: 'Create promotion' }));
  await waitFor(() =>
    expect(api.vendorCreatePromotion).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SAVE5', type: 'PERCENT', value: 5 }),
    ),
  );
});
