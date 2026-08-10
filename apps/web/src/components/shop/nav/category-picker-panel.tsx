'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { CheckIcon, SearchIcon } from '@/assets/icons';
import { FOCUS_RING_INSET } from './styles';
import type { HeaderCategory } from './types';

interface PickerOption {
  slug: string | null;
  name: string;
}

interface CategoryPickerPanelProps {
  categories: HeaderCategory[];
  /** Pinned option representing "no filter" / "browse everything". Omit to list categories only. */
  allLabel?: string;
  /** Currently chosen slug (or null for the "all" option) — renders a check mark. */
  selectedSlug?: string | null;
  /** When provided, options render as links to this href and navigate on click. */
  getHref?: (slug: string | null) => string;
  /** When `getHref` is omitted, options are buttons that report the choice here instead. */
  onSelect?: (slug: string | null) => void;
  onRequestClose: () => void;
  className?: string;
}

/**
 * Shared, filterable listbox used by both the header's search-scope picker
 * and the "All categories" mega menu — a searchable, keyboard-navigable
 * dropdown with a scrollable list and an explicit empty state.
 */
export function CategoryPickerPanel({
  categories,
  allLabel,
  selectedSlug,
  getHref,
  onSelect,
  onRequestClose,
  className = '',
}: CategoryPickerPanelProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  const options = useMemo<PickerOption[]>(() => {
    const filtered = categories.filter((category) => category.name.toLowerCase().includes(query.trim().toLowerCase()));
    const mapped = filtered.map((category) => ({ slug: category.slug, name: category.name }));
    return allLabel && query.trim() === '' ? [{ slug: null, name: allLabel }, ...mapped] : mapped;
  }, [categories, allLabel, query]);

  function commit(option: PickerOption) {
    if (getHref) {
      onRequestClose();
      return;
    }
    onSelect?.(option.slug);
    onRequestClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0 && event.key !== 'Escape') return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (options[activeIndex]) commit(options[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        onRequestClose();
        break;
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-950/10 ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5 transition-colors focus-within:border-brand-400 focus-within:bg-brand-50/40">
        <SearchIcon className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Filter categories"
          className="w-full min-w-0 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
      </div>

      <ul id={listId} role="listbox" aria-label="Categories" className="max-h-72 overflow-y-auto py-1.5">
        {options.length === 0 && (
          <li className="px-3.5 py-6 text-center text-sm text-zinc-400" role="presentation">
            No categories match &ldquo;{query}&rdquo;
          </li>
        )}
        {options.map((option, index) => {
          const isSelected = selectedSlug !== undefined && selectedSlug === option.slug;
          const isActive = index === activeIndex;
          const content = (
            <>
              <span className="truncate">{option.name}</span>
              {isSelected && <CheckIcon className="h-4 w-4 shrink-0 text-brand-600" />}
            </>
          );
          const itemClassName = `flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${FOCUS_RING_INSET} ${
            isActive ? 'bg-brand-50 text-brand-800' : 'text-zinc-700'
          } ${isSelected ? 'font-semibold' : ''}`;

          return (
            <li key={option.slug ?? '__all'} id={`${listId}-${index}`} role="option" aria-selected={isSelected} onMouseEnter={() => setActiveIndex(index)}>
              {getHref ? (
                <Link href={getHref(option.slug)} onClick={() => commit(option)} className={itemClassName}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => commit(option)} className={itemClassName}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
