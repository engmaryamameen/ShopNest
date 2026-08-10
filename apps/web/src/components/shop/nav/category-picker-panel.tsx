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

  /**
   * Pinned option representing "no filter" / browse everything.
   */
  allLabel?: string;

  /**
   * Currently selected category.
   */
  selectedSlug?: string | null;

  /**
   * When provided, options navigate instead of reporting a selection.
   */
  getHref?: (slug: string | null) => string;

  /**
   * Called when an option is selected without `getHref`.
   */
  onSelect?: (slug: string | null) => void;

  onRequestClose: () => void;

  className?: string;
}

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
  const [activeIndex, setActiveIndex] = useState(-1);

  const listId = useId();

  const options = useMemo<PickerOption[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = categories.filter((category) =>
      category.name.toLowerCase().includes(normalizedQuery),
    );

    const mapped = filtered.map((category) => ({
      slug: category.slug,
      name: category.name,
    }));

    if (allLabel && normalizedQuery === '') {
      return [
        {
          slug: null,
          name: allLabel,
        },
        ...mapped,
      ];
    }

    return mapped;
  }, [categories, allLabel, query]);

  function commit(option: PickerOption) {
    if (!getHref) {
      onSelect?.(option.slug);
    }

    onRequestClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();

        if (!options.length) return;

        setActiveIndex((current) => (current < 0 ? 0 : Math.min(current + 1, options.length - 1)));

        break;
      }

      case 'ArrowUp': {
        event.preventDefault();

        if (!options.length) return;

        setActiveIndex((current) => (current <= 0 ? options.length - 1 : current - 1));

        break;
      }

      case 'Home': {
        if (!options.length) return;

        event.preventDefault();
        setActiveIndex(0);

        break;
      }

      case 'End': {
        if (!options.length) return;

        event.preventDefault();
        setActiveIndex(options.length - 1);

        break;
      }

      case 'Enter': {
        if (activeIndex < 0 || !options[activeIndex]) return;

        event.preventDefault();
        commit(options[activeIndex]);

        break;
      }

      case 'Escape': {
        event.preventDefault();
        onRequestClose();

        break;
      }
    }
  }

  return (
    <div
      className={`
        overflow-hidden
        rounded-[6px]
        border border-black/[0.08]
        bg-white
        shadow-[0_8px_28px_rgba(0,0,0,0.08)]
        ${className}
      `}
    >
      {/* Search */}
      <div
        className="
          flex h-[42px] items-center
          gap-2.5
          border-b border-black/[0.07]
          px-3.5
        "
      >
        <SearchIcon className="h-4 w-4 shrink-0 text-black/65" />

        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search categories"
          className="
            min-w-0 flex-1
            bg-transparent
            text-[12px] font-normal
            leading-[18px]
            text-black
            outline-none
            placeholder:text-black/40
          "
        />
      </div>

      {/* Category options */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Categories"
        className="
          max-h-[200px]
          overflow-y-auto
          py-1.5
          [&::-webkit-scrollbar]:w-[5px]
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:bg-black/15
          hover:[&::-webkit-scrollbar-thumb]:bg-black/25
        "
      >
        {options.length === 0 && (
          <li
            role="presentation"
            className="
              px-4 py-8
              text-center
              text-[12px]
              font-normal
              text-black/40
            "
          >
            No categories found
          </li>
        )}

        {options.map((option, index) => {
          const isSelected = selectedSlug !== undefined && selectedSlug === option.slug;

          const isActive = index === activeIndex;

          const itemClassName = `
            group
            flex min-h-[36px] w-full
            items-center justify-between
            gap-3
            px-4
            text-left
            text-[12px]
            leading-[18px]
            transition-colors
            duration-150

          cursor-pointer

            ${
              isActive
                ? 'bg-black/[0.045] text-black'
                : 'text-black/70 hover:bg-black/[0.035] hover:text-black'
            }

            ${isSelected ? 'font-medium text-black' : 'font-normal'}

            ${FOCUS_RING_INSET}
          `;

          const content = (
            <>
              <span className="truncate">{option.name}</span>

              {isSelected && (
                <CheckIcon
                  className="
                    h-4 w-4
                    shrink-0
                    text-brand-600
                  "
                />
              )}
            </>
          );

          return (
            <li
              key={option.slug ?? '__all'}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(-1)}
            >
              {getHref ? (
                <Link
                  href={getHref(option.slug)}
                  onClick={() => commit(option)}
                  className={itemClassName}
                >
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
