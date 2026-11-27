import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CatalogSource } from '@prisma/client';
import { ImportScopeDto } from '../dto/import-scope.dto';

describe('import scope validation', () => {
  const errors = (input: object) =>
    validateSync(
      plainToInstance(ImportScopeDto, { source: CatalogSource.OPEN_FOOD_FACTS, ...input }),
    );

  it('accepts a bounded request', () => {
    expect(
      errors({ maxRecords: 500, minImageCount: 2, categoryScope: ['en:snacks'] }),
    ).toHaveLength(0);
  });

  it('rejects excessive record counts, image requirements, and category lists', () => {
    expect(errors({ maxRecords: 501 }).map((error) => error.property)).toContain('maxRecords');
    expect(errors({ minImageCount: 21 }).map((error) => error.property)).toContain('minImageCount');
    expect(
      errors({ categoryScope: Array(51).fill('snacks') }).map((error) => error.property),
    ).toContain('categoryScope');
  });
});
