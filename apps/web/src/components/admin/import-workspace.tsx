'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './import-workspace.module.css';

const tabs = [
  { id: 'new', label: 'New import' },
  { id: 'products', label: 'Imported products' },
  { id: 'history', label: 'Import history' },
] as const;
type Tab = (typeof tabs)[number]['id'];

export function ImportWorkspace({
  form,
  history,
  products,
}: {
  form: ReactNode;
  history: ReactNode;
  products: ReactNode;
}) {
  const params = useSearchParams();
  const runId = params.get('run');
  const requested = params.get('tab');
  const initial = tabs.some((tab) => tab.id === requested)
    ? (requested as Tab)
    : runId
      ? 'products'
      : 'new';
  const [active, setActive] = useState<Tab>(initial);
  const [productsVisited, setProductsVisited] = useState(initial === 'products');
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const next = tabs.some((tab) => tab.id === requested)
      ? (requested as Tab)
      : runId
        ? 'products'
        : 'new';
    setActive(next);
    if (next === 'products') setProductsVisited(true);
  }, [requested, runId]);
  function activate(tab: Tab) {
    setActive(tab);
    if (tab === 'products') setProductsVisited(true);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url);
  }
  return (
    <div className={styles.workspace}>
      <div role="tablist" aria-label="Catalog import sections" className={styles.tabs}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-${tab.id}-tab`}
            aria-controls={`${id}-${tab.id}-panel`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            onClick={() => activate(tab.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              activate(tabs[next].id);
              buttons.current[next]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${id}-${tab.id}-panel`}
          aria-labelledby={`${id}-${tab.id}-tab`}
          hidden={active !== tab.id}
        >
          {tab.id === 'new'
            ? form
            : tab.id === 'history'
              ? history
              : productsVisited
                ? products
                : null}
        </div>
      ))}
    </div>
  );
}
