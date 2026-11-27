import { CatalogSource } from '@prisma/client';
import { CategoryMappingSession, CategoryMappingService } from '../category-mapping.service';
import {
  MARKETPLACE_CATEGORIES,
  ABO_CATEGORY_GROUPS,
  FOOD_CATEGORY_GROUPS,
  BEAUTY_CATEGORY_GROUPS,
  audienceCategory,
  explicitAudience,
  categoryRules,
  deriveCategoryMappings,
} from '../category-taxonomy';

describe('controlled marketplace taxonomy', () => {
  it('defines the approved departments with unique, connected category names and slugs', () => {
    expect(MARKETPLACE_CATEGORIES.filter((category) => !category.parentSlug)).toHaveLength(11);
    expect(new Set(MARKETPLACE_CATEGORIES.map((category) => category.slug)).size).toBe(
      MARKETPLACE_CATEGORIES.length,
    );
    expect(new Set(MARKETPLACE_CATEGORIES.map((category) => category.name)).size).toBe(
      MARKETPLACE_CATEGORIES.length,
    );
    const slugs = new Set(MARKETPLACE_CATEGORIES.map((category) => category.slug));
    for (const category of MARKETPLACE_CATEGORIES)
      if (category.parentSlug) expect(slugs.has(category.parentSlug)).toBe(true);
    for (const rules of [ABO_CATEGORY_GROUPS, FOOD_CATEGORY_GROUPS, BEAUTY_CATEGORY_GROUPS])
      for (const slug of Object.keys(rules)) expect(slugs.has(slug)).toBe(true);
  });
  it('inherits a reviewed ancestor mapping and leaves unsupported categories unmapped', () => {
    const rows = deriveCategoryMappings(
      [
        { id: 'en:biscuits', name: 'Biscuits', parents: [] },
        { id: 'en:oat-biscuits', name: 'Oat biscuits', parents: ['en:biscuits'] },
        { id: 'en:mystery', name: 'Unknown', parents: [] },
      ],
      categoryRules({ 'biscuits-cookies': 'biscuits' }, 'en:'),
    );
    expect(rows[1]).toMatchObject({ categorySlug: 'biscuits-cookies', sourceDepth: 1 });
    expect(rows[2].categorySlug).toBeNull();
  });
  it('handles supplier cycles without inventing category nodes', () => {
    const rows = deriveCategoryMappings(
      [
        { id: 'a', name: 'A', parents: ['b'] },
        { id: 'b', name: 'B', parents: ['a'] },
      ],
      new Map(),
    );
    expect(rows.every((row) => row.categorySlug === null)).toBe(true);
  });
  it('uses only explicit audience statements, never colour or style', () => {
    expect(explicitAudience(["Women's Gold-Tone Watch"])).toBe('WOMEN');
    expect(explicitAudience(['Men’s Digital Watch'])).toBe('MEN');
    expect(explicitAudience(['Watch for Men Women'])).toBe('UNISEX');
    expect(explicitAudience(["Girl's Watch"])).toBe('KIDS');
    expect(explicitAudience(['Blush Pink/Rose Gold Dress Watch'])).toBeUndefined();
    expect(audienceCategory('watches')).toBe('watches');
  });
});

describe('source category resolution in the application layer', () => {
  const categories = MARKETPLACE_CATEGORIES.map((category) => ({
    id: category.slug,
    name: category.name,
    slug: category.slug,
    parentId: category.parentSlug,
    isActive: true,
  }));
  const watch = (name: string) => ({
    externalId: name,
    name,
    description: name,
    categoryName: 'Watch',
    sourceCategoryIds: ['WATCH'],
    imageCount: 1,
  });
  it('maps explicit audiences and leaves unspecified watches at the watch parent', async () => {
    const context = new CategoryMappingSession(CatalogSource.AMAZON_BERKELEY, categories);
    const result = await context.resolve([
      watch("Men's Watch"),
      watch("Women's Watch"),
      watch('Pink Watch'),
    ]);
    expect(result.get("Men's Watch")?.id).toBe('mens-watches');
    expect(result.get("Women's Watch")?.id).toBe('womens-watches');
    expect(result.get('Pink Watch')?.id).toBe('watches');
    expect(result.get("Men's Watch")?.path).toBe('Fashion & Accessories → Watches → Men’s Watches');
  });
  it('supports an import-only override without changing the next import', async () => {
    const context = new CategoryMappingSession(CatalogSource.AMAZON_BERKELEY, categories);
    expect(
      (await context.resolve([watch("Women's Watch")], 'watches')).get("Women's Watch")?.id,
    ).toBe('watches');
    expect((await context.resolve([watch("Women's Watch")])).get("Women's Watch")?.id).toBe(
      'womens-watches',
    );
  });
  it('does not map an unknown type or an inactive category branch', async () => {
    const context = new CategoryMappingSession(
      CatalogSource.AMAZON_BERKELEY,
      categories.map((category) =>
        category.slug === 'fashion' ? { ...category, isActive: false } : category,
      ),
    );
    expect((await context.resolve([watch('Watch')])).size).toBe(0);
    await expect(context.resolve([watch('Watch')], 'mens-watches')).rejects.toThrow(
      'active ShopNest category',
    );
    const active = new CategoryMappingSession(CatalogSource.AMAZON_BERKELEY, categories);
    expect(
      (await active.resolve([{ ...watch('Unknown'), sourceCategoryIds: ['SWATCH'] }])).size,
    ).toBe(0);
  });
  it('inherits supplier ancestry in memory and reads only the internal categories once per session', async () => {
    const db = { category: { findMany: jest.fn(async () => categories) } };
    const service = new CategoryMappingService(db as never);
    service.configure(CatalogSource.OPEN_FOOD_FACTS, [
      { id: 'en:biscuits', name: 'Biscuits', parents: [] },
      { id: 'en:oat-biscuits', name: 'Oat biscuits', parents: ['en:biscuits'] },
    ]);
    const context = await service.session(CatalogSource.OPEN_FOOD_FACTS);
    const biscuit = {
      ...watch('Oat biscuits'),
      categoryName: 'Oat biscuits',
      sourceCategoryIds: ['en:oat-biscuits'],
    };
    expect((await context.resolve([biscuit])).get(biscuit.externalId)?.id).toBe('biscuits-cookies');
    await context.resolve([biscuit]);
    expect(db.category.findMany).toHaveBeenCalledTimes(1);
    expect(
      (
        await service.annotate(CatalogSource.OPEN_FOOD_FACTS, [
          { id: 'en:oat-biscuits', name: 'Oat biscuits', parents: ['en:biscuits'] },
        ])
      )[0].mappedCategory?.path,
    ).toBe('Groceries → Bakery & Breakfast → Biscuits & Cookies');
  });
  it('maps Beauty using its own source rules', async () => {
    const context = new CategoryMappingSession(CatalogSource.OPEN_BEAUTY_FACTS, categories);
    const product = { ...watch('Shampoo'), sourceCategoryIds: ['en:shampoos'] };
    expect((await context.resolve([product])).get(product.externalId)?.path).toBe(
      'Beauty & Personal Care → Hair Care → Shampoos',
    );
  });
});
