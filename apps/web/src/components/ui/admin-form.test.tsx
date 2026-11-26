import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { AdminSelect } from './admin-form';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

it('supports listbox navigation, selection and Escape without losing trigger focus', () => {
  function Example() {
    const [value, setValue] = useState('a');
    return (
      <>
        <label htmlFor="choice">Pricing strategy</label>
        <AdminSelect
          id="choice"
          value={value}
          onChange={setValue}
          options={[
            { value: 'a', label: 'Fixed' },
            { value: 'b', label: 'Range' },
            { value: 'c', label: 'Category' },
          ]}
        />
      </>
    );
  }
  render(<Example />);
  const trigger = screen.getByRole('button', { name: 'Pricing strategy' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: 'Fixed' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(screen.getByRole('option', { name: 'Category' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
  expect(screen.getByRole('option', { name: 'Range' })).toHaveFocus();
  fireEvent.click(document.activeElement!);
  expect(trigger).toHaveTextContent('Range');
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
