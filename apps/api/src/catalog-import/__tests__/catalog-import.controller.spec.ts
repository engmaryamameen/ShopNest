import { CatalogSource } from '@prisma/client';
import { CatalogImportController } from '../catalog-import.controller';

describe('CatalogImportController', () => {
  it('enqueues the run and fires one immediate poll() — the background worker is off by default, so nothing else would ever process it', async () => {
    const run = { id: 'run-1', source: CatalogSource.AMAZON };
    const imports = { enqueue: jest.fn().mockResolvedValue(run) };
    const worker = { poll: jest.fn().mockResolvedValue(undefined) };
    const controller = new CatalogImportController(imports as never, worker as never);

    const result = await controller.triggerImport({ source: CatalogSource.AMAZON, categoryScope: ['Electronics'] } as never);

    expect(imports.enqueue).toHaveBeenCalledWith(CatalogSource.AMAZON, { source: CatalogSource.AMAZON, categoryScope: ['Electronics'] });
    expect(worker.poll).toHaveBeenCalledTimes(1);
    expect(result).toBe(run);
  });

  it('a poll() failure is logged, not thrown back at the caller — the run stays queued for the next trigger', async () => {
    const run = { id: 'run-1', source: CatalogSource.DUMMY_JSON };
    const imports = { enqueue: jest.fn().mockResolvedValue(run) };
    const worker = { poll: jest.fn().mockRejectedValue(new Error('claim query failed')) };
    const controller = new CatalogImportController(imports as never, worker as never);

    await expect(controller.triggerImport({ source: CatalogSource.DUMMY_JSON } as never)).resolves.toBe(run);
    // Let the fire-and-forget rejection settle before the test ends.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('preview delegates to the service with the requested source', async () => {
    const imports = { preview: jest.fn().mockResolvedValue({ discoveredCount: 0 }) };
    const worker = { poll: jest.fn() };
    const controller = new CatalogImportController(imports as never, worker as never);

    const scope = { source: CatalogSource.OPEN_FOOD_FACTS, maxRecords: 10 };
    await controller.preview(scope as never);

    expect(imports.preview).toHaveBeenCalledWith(CatalogSource.OPEN_FOOD_FACTS, scope);
    expect(worker.poll).not.toHaveBeenCalled(); // a preview never triggers processing
  });
});
