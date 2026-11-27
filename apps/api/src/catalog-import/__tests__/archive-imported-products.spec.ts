import { CatalogSource } from '@prisma/client';
import { CatalogImportService } from '../catalog-import.service';

describe('archive imported products', () => {
  const product = { count: jest.fn(), updateMany: jest.fn() };
  const service = new CatalogImportService({ product } as never, {} as never, {} as never);

  beforeEach(() => jest.resetAllMocks());

  it('refuses an unfiltered archive', async () => {
    await expect(service.archiveImportedProducts({}, true)).rejects.toThrow('Choose products');
    expect(product.updateMany).not.toHaveBeenCalled();
  });

  it('previews without changing products and limits the action to imported products', async () => {
    product.count.mockResolvedValue(2);
    expect(
      await service.archiveImportedProducts({ source: CatalogSource.OPEN_FOOD_FACTS }, false),
    ).toEqual({ eligible: 2, excluded: 0, archived: 0 });
    expect(product.updateMany).not.toHaveBeenCalled();
    expect(product.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        sources: { some: { source: CatalogSource.OPEN_FOOD_FACTS } },
        offers: { none: { importRunId: null } },
      }),
    });
  });

  it('archives eligible products without deleting them', async () => {
    product.count.mockResolvedValue(2);
    product.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.archiveImportedProducts({ runId: 'run-id' }, true)).toEqual({
      eligible: 2,
      excluded: 0,
      archived: 1,
    });
    expect(product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { publishStatus: 'ARCHIVED' } }),
    );
  });
});
