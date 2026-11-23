import appConfig from '../app.config';

describe('catalog import configuration', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = originalEnv; });

  it.each(['development', 'production'])('cannot enable imports in %s', (nodeEnv) => {
    process.env = { ...originalEnv, NODE_ENV: nodeEnv, CATALOG_IMPORT_TEST_ENABLED: 'true' };
    expect(appConfig().catalogImportEnabled).toBe(false);
  });

  it('requires an explicit flag even in the test environment', () => {
    process.env = { ...originalEnv, NODE_ENV: 'test', CATALOG_IMPORT_TEST_ENABLED: 'false' };
    expect(appConfig().catalogImportEnabled).toBe(false);
    process.env.CATALOG_IMPORT_TEST_ENABLED = 'true';
    expect(appConfig().catalogImportEnabled).toBe(true);
  });

  it('keeps the scheduler and worker off when not explicitly configured', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.CATALOG_WORKER_ENABLED;
    delete process.env.CATALOG_SCHEDULE_ENABLED;
    expect(appConfig().catalogWorkerEnabled).toBe(false);
    expect(appConfig().catalogScheduleEnabled).toBe(false);
  });
});
