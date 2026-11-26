'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { navigateListbox, useMenuPosition } from '@/components/ui/use-menu-position';
import styles from './source-category-picker.module.css';

type Category = {
  id: string;
  name: string;
  parents?: string[];
  mappedCategory?: { id: string; name: string; path: string } | null;
};
export function SourceCategoryPicker({
  categories,
  selected,
  query,
  onQueryChange,
  onChange,
  loading,
  error,
}: {
  categories: Category[];
  selected: Category[];
  query: string;
  onQueryChange: (query: string) => void;
  onChange: (categories: Category[]) => void;
  loading: boolean;
  error: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();
  const keyboardFocus = useRef<'first' | 'last' | null>(null);
  const position = useMenuPosition(open, root, field, menu, 320);
  const viewport = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  function updateOverflow() {
    const element = viewport.current;
    if (!element) return;
    setOverflow({
      left: element.scrollLeft > 1,
      right: element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
    });
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    updateOverflow();
    return () => observer.disconnect();
  }, []);
  useEffect(updateOverflow, [selected, query]);
  useEffect(() => {
    if (!open || loading || !keyboardFocus.current) return;
    const items = list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!items?.length) return;
    items[keyboardFocus.current === 'first' ? 0 : items.length - 1].focus();
    keyboardFocus.current = null;
  }, [open, loading, categories]);
  function close() {
    input.current?.focus();
    setOpen(false);
  }
  function toggle(category: Category) {
    onChange(
      selected.some((item) => item.id === category.id)
        ? selected.filter((item) => item.id !== category.id)
        : [...selected, category],
    );
    onQueryChange('');
    input.current?.focus();
  }
  return (
    <div
      ref={root}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (list.current?.contains(event.target as Node))
          navigateListbox(event, list.current);
      }}
    >
      <div className={styles.label}>
        <label htmlFor={inputId}>Source categories</label>
        {selected.length > 0 && <span>{selected.length} selected</span>}
      </div>
      <div ref={field} data-admin-field className={`${styles.field} ${open ? styles.active : ''}`}>
        <div
          ref={viewport}
          className={`${styles.viewport} ${overflow.left ? styles.fadeLeft : ''} ${overflow.right ? styles.fadeRight : ''}`}
          aria-label="Selected source categories"
          onScroll={updateOverflow}
        >
          {selected.map((category) => (
            <span key={category.id} className={styles.chip}>
              <span>{category.name}</span>
              <button
                type="button"
                aria-label={`Remove category ${category.name}`}
                onClick={() => {
                  onChange(selected.filter((item) => item.id !== category.id));
                  input.current?.focus();
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
            </span>
          ))}
          <input
            ref={input}
            id={inputId}
            aria-label="Search source categories"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            placeholder={selected.length ? 'Add category…' : 'All categories · search to narrow'}
            className={selected.length ? styles.searchWithSelection : styles.search}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                const items = list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
                if (open && items?.length)
                  items[event.key === 'ArrowDown' ? 0 : items.length - 1].focus();
                else keyboardFocus.current = event.key === 'ArrowDown' ? 'first' : 'last';
                setOpen(true);
              }
              if (event.key === 'Backspace' && !query && selected.length)
                onChange(selected.slice(0, -1));
            }}
          />
        </div>
        <button
          type="button"
          className={selected.length ? styles.addCategory : styles.chevron}
          aria-label={
            selected.length
              ? 'Add another category'
              : open
                ? 'Close source categories'
                : 'Open source categories'
          }
          title={selected.length ? 'Add another category' : undefined}
          aria-expanded={open}
          onClick={() => {
            if (selected.length || !open) {
              setOpen(true);
              input.current?.focus();
            } else setOpen(false);
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={!selected.length && open ? styles.rotated : ''}
          >
            <path d={selected.length ? 'M12 5v14M5 12h14' : 'm6 9 6 6 6-6'} />
          </svg>
        </button>
      </div>
      {open && (
        <div ref={menu} style={position} className={styles.dropdown}>
          <div className={styles.menuHeader}>
            <span>{selected.length ? `${selected.length} selected` : 'Choose categories'}</span>
            <button
              type="button"
              onClick={() => {
                onChange([]);
                onQueryChange('');
                input.current?.focus();
              }}
            >
              All categories
            </button>
          </div>
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label="Source categories"
            aria-multiselectable="true"
            className={styles.options}
          >
            {loading ? (
              <p role="status" className={styles.message}>
                Loading categories…
              </p>
            ) : error ? (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            ) : categories.length ? (
              categories.map((category) => {
                const checked = selected.some((item) => item.id === category.id);
                const parents = (category.parents ?? [])
                  .filter((parent) => !/^\d+$/.test(parent))
                  .map((parent) => parent.replace(/^en:/, '').replace(/[-_]/g, ' '));
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={`${styles.option} ${checked ? styles.selected : ''}`}
                    onClick={() => toggle(category)}
                  >
                    <span className={styles.check}>
                      {checked && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m5 12 4 4 10-10" />
                        </svg>
                      )}
                    </span>
                    <span>
                      {category.name}
                      {parents.length > 0 && <small>{parents.join(' / ')}</small>}
                      {'mappedCategory' in category && (
                        <small>
                          {category.mappedCategory
                            ? `ShopNest: ${category.mappedCategory.path}`
                            : 'Needs a ShopNest category mapping'}
                        </small>
                      )}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className={styles.message}>No matching categories. Try another search.</p>
            )}
          </div>
          <button type="button" className={styles.done} onClick={close}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
