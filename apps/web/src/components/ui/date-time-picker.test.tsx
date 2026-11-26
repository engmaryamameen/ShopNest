import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DateTimePicker } from './date-time-picker';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

it('applies the selected date and time from one month', () => {
  const onChange = jest.fn();
  render(<DateTimePicker label="Discount starts" value="2026-11-25T08:45" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Discount starts' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getAllByRole('heading', { level: 3 })).toHaveLength(1);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next month' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Saturday, December 26, 2026' }));
  fireEvent.change(within(dialog).getByLabelText('Discount starts time'), {
    target: { value: '19:30' },
  });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  expect(onChange).toHaveBeenCalledWith('2026-12-26T19:30');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discount starts' })).toHaveFocus();
});

it('keeps the existing value when a date selection is canceled', () => {
  const onChange = jest.fn();
  render(<DateTimePicker label="Discount ends" value="2026-11-25T08:45" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Discount ends' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thursday, November 26, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Discount ends' })).toHaveFocus();
});
