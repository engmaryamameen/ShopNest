import { notFound } from 'next/navigation';
import { DemoCatalogAction } from './demo-catalog-action';
import styles from './demo-data.module.css';

export default function DemoDataPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.DEMO_CATALOG_ENABLED !== 'true') notFound();
  return (
    <section className={styles.panel} aria-labelledby="demo-title">
      <h1 id="demo-title">Demo data</h1>
      <p>Add two fictional sellers and two sample products. Payments and orders are simulated; no accounts or passwords are created.</p>
      <p>To test vendor access, register a separate test account, apply to sell, and approve the application in Vendors.</p>
      <DemoCatalogAction />
    </section>
  );
}
