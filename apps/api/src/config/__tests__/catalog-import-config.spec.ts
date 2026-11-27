import appConfig from '../app.config';

describe('catalog import configuration', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = originalEnv; });

  it('enables local development imports but not production imports', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    expect(appConfig().catalogImportEnabled).toBe(true);
    process.env.NODE_ENV = 'production';
    expect(appConfig().catalogImportEnabled).toBe(false);
  });

  it('requires an explicit flag even in the test environment', () => {
    process.env = { ...originalEnv, NODE_ENV: 'test', CATALOG_IMPORT_TEST_ENABLED: 'false' };
    expect(appConfig().catalogImportEnabled).toBe(false);
    process.env.CATALOG_IMPORT_TEST_ENABLED = 'true';
    expect(appConfig().catalogImportEnabled).toBe(true);
  });

  it('recovers queued imports by default without recurring synchronization', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.CATALOG_WORKER_ENABLED;
    expect(appConfig().catalogWorkerEnabled).toBe(true);
  });
});
