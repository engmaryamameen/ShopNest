# Shared admin interface

- Reuse `components/ui/admin-form.tsx` for admin inputs, selects, switches and section accordions, and `components/ui/checkbox.tsx` for checkboxes. Preserve their accessible labels, focus styles and disabled states.
- Use `components/ui/date-time-picker.tsx` for a single date with an optional time. The dashboard range dialog and date/time picker share `CalendarMonth` and the dialog surface from `components/ui/calendar-month.tsx`; extend these instead of adding another calendar or a native date popup.
- Reuse `ToastMessage` for brief feedback. Long operations use one persistent, updating toast and keep progressive product results in the preview table below the settings.
- Keep related controls in responsive rows, preserve field widths, and use the existing blue accent. Selected category chips stay inside their field with hidden scrollbars and overflow fades.
- Dialog cancel/close handlers must check `event.target === event.currentTarget`, so canceling a file picker or closing a nested date picker does not dismiss the product editor.
- Apply these conventions to existing and new admin screens without changing the finalized authentication flow or unrelated dashboard behavior.
