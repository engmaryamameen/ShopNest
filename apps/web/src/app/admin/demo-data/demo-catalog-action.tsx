'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import styles from './demo-data.module.css';

export function DemoCatalogAction() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function add() {
    setPending(true);
    setMessage('');
    try {
      const result = await api.addDemoCatalog();
      setMessage(result.result === 'created' ? 'Demo catalog added.' : 'This demo catalog has already been added. Existing records were not changed.');
    } catch (error) {
      setMessage(error instanceof ApiError && error.status < 500 ? error.message : 'Could not add demo data. Check the service and try again.');
    } finally {
      setPending(false);
    }
  }
  return <><button className={styles.button} disabled={pending} onClick={add}>{pending ? 'Adding demo data…' : 'Add demo data'}</button><p role="status" aria-live="polite">{message}</p></>;
}
