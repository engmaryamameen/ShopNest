import { CatalogImportStatus } from '@prisma/client';
import { CatalogImportWorker } from '../catalog-import.worker';

const config = {
  get: jest.fn((key: string, fallback: unknown) => key === 'app.catalogImportEnabled' ? true : fallback),
};

describe('CatalogImportWorker', () => {
  it('leaves queued jobs untouched when imports are disabled', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const imports = { executeRun: jest.fn() };
    const disabled = { get: jest.fn().mockReturnValue(false) };
    const worker = new CatalogImportWorker(prisma as never, imports as never, disabled as never);
    await worker.poll();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(imports.executeRun).not.toHaveBeenCalled();
  });
  it('claims and executes one durable job', async () => {
    const job = { id: 'run-1', attemptCount: 1, maxAttempts: 3 };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([job]),
      catalogImportRun: { update: jest.fn() },
    };
    const imports = { executeRun: jest.fn().mockResolvedValue(undefined) };
    const worker = new CatalogImportWorker(prisma as never, imports as never, config as never);

    await worker.poll();

    expect(imports.executeRun).toHaveBeenCalledWith('run-1');
    expect(prisma.catalogImportRun.update).not.toHaveBeenCalled();
  });

  it('requeues a transient failure with a released lease', async () => {
    const job = { id: 'run-1', attemptCount: 1, maxAttempts: 3 };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([job]),
      catalogImportRun: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const imports = { executeRun: jest.fn().mockRejectedValue(new Error('supplier offline')) };
    const worker = new CatalogImportWorker(prisma as never, imports as never, config as never);

    await worker.poll();

    expect(prisma.catalogImportRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({
        status: CatalogImportStatus.QUEUED,
        lockedAt: null,
        lockedBy: null,
        errorMessage: 'supplier offline',
      }),
    });
  });

  it('marks the final failed attempt terminal', async () => {
    const job = { id: 'run-1', attemptCount: 3, maxAttempts: 3 };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([job]),
      catalogImportRun: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const imports = { executeRun: jest.fn().mockRejectedValue(new Error('invalid payload')) };
    const worker = new CatalogImportWorker(prisma as never, imports as never, config as never);

    await worker.poll();

    expect(prisma.catalogImportRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: expect.objectContaining({ status: CatalogImportStatus.FAILED }),
    });
  });
});
