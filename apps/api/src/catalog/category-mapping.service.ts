import { BadRequestException, Injectable } from '@nestjs/common';
import { CatalogSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupplierProduct, SourceCategory } from '../catalog-import/catalog-source.adapter';
import {
  audienceCategory,
  explicitAudience,
  categoryRules,
  deriveCategoryMappings,
  ABO_CATEGORY_GROUPS,
  FOOD_CATEGORY_GROUPS,
  BEAUTY_CATEGORY_GROUPS,
} from './category-taxonomy';

type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
};
export type CategoryAssignment = { id: string; name: string; path: string };
type Mapping = { categorySlug: string | null; sourceDepth: number };
type MappingDb = Pick<Prisma.TransactionClient, 'category'>;
function sourceRules(source: CatalogSource) {
  if (source === CatalogSource.AMAZON_BERKELEY) return categoryRules(ABO_CATEGORY_GROUPS);
  if (source === CatalogSource.OPEN_FOOD_FACTS) return categoryRules(FOOD_CATEGORY_GROUPS, 'en:');
  if (source === CatalogSource.OPEN_BEAUTY_FACTS)
    return categoryRules(BEAUTY_CATEGORY_GROUPS, 'en:');
  return new Map<string, string>();
}
function directMappings(source: CatalogSource): Map<string, Mapping> {
  return new Map(
    [...sourceRules(source)].map(([id, categorySlug]) => [id, { categorySlug, sourceDepth: 0 }]),
  );
}
export function supplierCategoryIds(source: CatalogSource, product: SupplierProduct): string[] {
  if (product.sourceCategoryIds?.length) return [...new Set(product.sourceCategoryIds)];
  if (source === CatalogSource.AMAZON_BERKELEY || source === CatalogSource.AMAZON)
    return [product.productType ?? product.categoryName.replace(/ /g, '_').toUpperCase()];
  const slug = product.categoryName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return [
    source === CatalogSource.DARAZ
      ? product.categoryName
      : source === CatalogSource.DUMMY_JSON
        ? slug
        : `en:${slug}`,
  ];
}

/** Resolve supplier classifications in code, reading only actual ShopNest categories from the database. */
export class CategoryMappingSession {
  private readonly byId: Map<string, Category>;
  private readonly bySlug: Map<string, Category>;
  constructor(
    private readonly source: CatalogSource,
    categories: Category[],
    private readonly mappings: ReadonlyMap<string, Mapping> = directMappings(source),
  ) {
    this.byId = new Map(categories.map((category) => [category.id, category]));
    this.bySlug = new Map(categories.map((category) => [category.slug, category]));
  }
  private ancestors(id: string) {
    const result: Category[] = [];
    const seen = new Set<string>();
    let category = this.byId.get(id);
    while (category) {
      if (!category.isActive || seen.has(category.id)) return [];
      seen.add(category.id);
      result.unshift(category);
      if (category.parentId && !this.byId.has(category.parentId)) return [];
      category = category.parentId ? this.byId.get(category.parentId) : undefined;
    }
    return result;
  }
  assignment(id: string): CategoryAssignment | undefined {
    const path = this.ancestors(id);
    const category = path.at(-1);
    return category
      ? { id: category.id, name: category.name, path: path.map((node) => node.name).join(' → ') }
      : undefined;
  }
  sourceAssignment(id: string) {
    const slug = this.mappings.get(id)?.categorySlug;
    const category = slug ? this.bySlug.get(slug) : undefined;
    return category ? this.assignment(category.id) : undefined;
  }
  async resolve(
    products: SupplierProduct[],
    overrideId?: string,
  ): Promise<Map<string, CategoryAssignment>> {
    const result = new Map<string, CategoryAssignment>();
    if (overrideId) {
      const target = this.assignment(overrideId);
      if (!target) throw new BadRequestException('Choose an active ShopNest category.');
      for (const product of products) result.set(product.externalId, target);
      return result;
    }
    for (const product of products) {
      const matches = supplierCategoryIds(this.source, product).flatMap((id) => {
        const row = this.mappings.get(id);
        const category = row?.categorySlug ? this.bySlug.get(row.categorySlug) : undefined;
        return category && this.assignment(category.id)
          ? [{ category, sourceDepth: row!.sourceDepth }]
          : [];
      });
      if (!matches.length) continue;
      const depth = Math.max(...matches.map((row) => row.sourceDepth));
      const paths = matches
        .filter((row) => row.sourceDepth === depth)
        .map((row) => this.ancestors(row.category.id));
      const common = paths[0]
        .filter((category, index) => paths.every((path) => path[index]?.id === category.id))
        .at(-1);
      if (!common) continue;
      const audience =
        product.audience ??
        explicitAudience([
          product.specifications?.Department ?? '',
          product.specifications?.Gender ?? '',
          product.name,
        ]);
      const refined = this.bySlug.get(audienceCategory(common.slug, audience));
      const target =
        refined && (refined.id === common.id || refined.parentId === common.id)
          ? this.assignment(refined.id)
          : this.assignment(common.id);
      if (target) result.set(product.externalId, target);
    }
    return result;
  }
}

@Injectable()
export class CategoryMappingService {
  private readonly indexes = new Map<
    CatalogSource,
    { taxonomy: SourceCategory[]; mappings: Map<string, Mapping> }
  >();
  constructor(private readonly prisma: PrismaService) {}
  configure(source: CatalogSource, taxonomy: SourceCategory[]) {
    if (!taxonomy.length || this.indexes.get(source)?.taxonomy === taxonomy) return;
    const mappings = directMappings(source);
    for (const row of deriveCategoryMappings(taxonomy, sourceRules(source)))
      mappings.set(row.id, row);
    this.indexes.set(source, { taxonomy, mappings });
  }
  async session(source: CatalogSource, db: MappingDb = this.prisma) {
    const categories = await db.category.findMany({
      select: { id: true, name: true, slug: true, parentId: true, isActive: true },
    });
    return new CategoryMappingSession(source, categories, this.indexes.get(source)?.mappings);
  }
  async annotate(source: CatalogSource, categories: SourceCategory[]) {
    const session = await this.session(source);
    return categories.map((category) => ({
      ...category,
      mappedCategory: session.sourceAssignment(category.id) ?? null,
    }));
  }
}
