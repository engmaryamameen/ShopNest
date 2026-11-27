import type { CatalogSource, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKETPLACE_CATEGORIES,
  ABO_CATEGORY_GROUPS,
  FOOD_CATEGORY_GROUPS,
  BEAUTY_CATEGORY_GROUPS,
  categoryRules,
  deriveCategoryMappings,
  commonCategory,
  explicitAudience,
  audienceCategory,
  type SupplierCategoryNode,
} from '../src/catalog/category-taxonomy.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
// Exact historical labels already present in this database, consolidated deliberately.
const legacyTargets: Record<string, string> = {
  'baby-foods': 'baby-food',
  'baking-powder-or-raising-agent': 'baking-ingredients',
  'biscuit-snack-with-chocolate-filling': 'biscuits-cookies',
  'crackers-breakfast': 'biscuits-cookies',
  'filled-wafers': 'biscuits-cookies',
  'bread-coverings': 'pantry',
  'zoet-beleg': 'spreads',
  'first-age-baby-milk-powder': 'baby-formula',
  'growing-up-milk-powder': 'baby-formula',
  'growing-up-milks': 'baby-formula',
  lotion: 'skincare',
  'moisturizing-body-creams': 'body-care',
  'milk-chocolate-sprinkles': 'chocolate',
  sprinkles: 'baking-ingredients',
  'workflow-verification-apparel': 'clothing',
  'imported-products': 'shaving-foam-gel',
};
type Options = { apply?: boolean; reconcileExisting?: boolean; taxonomyDirectory?: string };
type Mapping = SupplierCategoryNode & {
  source: CatalogSource;
  categorySlug: string | null;
  sourceDepth: number;
};

async function supplierMappings(directory?: string): Promise<Mapping[]> {
  const result: Mapping[] = [];
  for (const [source, site, groups] of [
    ['OPEN_FOOD_FACTS', 'openfoodfacts.org', FOOD_CATEGORY_GROUPS],
    ['OPEN_BEAUTY_FACTS', 'openbeautyfacts.org', BEAUTY_CATEGORY_GROUPS],
  ] as const) {
    let nodes: SupplierCategoryNode[];
    if (directory) nodes = JSON.parse(await readFile(join(directory, `${site}.json`), 'utf8'));
    else {
      const response = await fetch(`https://static.${site}/data/taxonomies/categories.full.json`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Could not read ${site} taxonomy (${response.status}).`);
      const taxonomy = (await response.json()) as Record<
        string,
        { name?: Record<string, string>; parents?: string[] }
      >;
      nodes = Object.entries(taxonomy).map(([id, value]) => ({
        id,
        name: value.name?.en ?? Object.values(value.name ?? {})[0] ?? id,
        aliases: Object.values(value.name ?? {}),
        parents: value.parents ?? [],
      }));
    }
    result.push(
      ...deriveCategoryMappings(nodes, categoryRules(groups, 'en:')).map((mapping) => ({
        ...mapping,
        source,
      })),
    );
  }
  // ABO product types are supplied by its first metadata shard. Never create an option from a guessed type.
  let abo: SupplierCategoryNode[];
  if (directory) abo = JSON.parse(await readFile(join(directory, 'abo.json'), 'utf8'));
  else {
    const { createGunzip } = await import('node:zlib');
    const { createInterface } = await import('node:readline');
    const { Readable } = await import('node:stream');
    const response = await fetch(
      'https://amazon-berkeley-objects.s3.us-east-1.amazonaws.com/listings/metadata/listings_0.json.gz',
      { signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok || !response.body) throw new Error('Could not read ABO product types.');
    const input = Readable.fromWeb(response.body as never).pipe(createGunzip());
    const types = new Set<string>();
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      const listing = JSON.parse(line);
      if (
        !listing.item_name?.some((value: { language_tag?: string }) =>
          value.language_tag?.startsWith('en'),
        )
      )
        continue;
      const type = listing.product_type?.find(
        (value: { value?: string }) => typeof value.value === 'string',
      )?.value;
      if (type) types.add(type);
    }
    abo = [...types].map((id) => ({
      id,
      name: id
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      parents: [],
    }));
  }
  result.push(
    ...deriveCategoryMappings(abo, categoryRules(ABO_CATEGORY_GROUPS)).map((mapping) => ({
      ...mapping,
      source: 'AMAZON_BERKELEY' as const,
    })),
  );
  return result;
}

async function categoryImage(asset: string) {
  const file =
    asset === 'baby-kids' ? 'baby-kids.jpg' : asset === 'pet-supplies' ? 'pet-supplies.jpg' : asset;
  const bytes = await readFile(join(repository, 'apps/web/src/assets/images/categories', file));
  const extension = file.slice(file.lastIndexOf('.'));
  const filename = createHash('sha256').update(bytes).digest('hex') + extension;
  // The CLI may be launched from the repository root; media paths belong to the API.
  const uploads = resolve(repository, 'apps/api', process.env.MEDIA_UPLOAD_DIR ?? 'uploads');
  await mkdir(uploads, { recursive: true });
  await writeFile(join(uploads, filename), bytes, { flag: 'w' });
  const url = `${(process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`).replace(/\/$/, '')}/uploads/${filename}`;
  const imageAttribution = ['baby-kids.jpg', 'pet-supplies.jpg'].includes(file)
    ? {
        name: 'Amazon.com — Amazon Berkeley Objects',
        url: 'https://amazon-berkeley-objects.s3.amazonaws.com/index.html',
        license: 'CC BY 4.0; original catalog image, copied unmodified.',
      }
    : undefined;
  return { imageUrl: url, imageAttribution };
}

export async function prepareMarketplaceTaxonomy(prisma: PrismaClient, options: Options = {}) {
  const mappings = options.reconcileExisting
    ? await supplierMappings(options.taxonomyDirectory)
    : [];
  const [existing, products, running] = await Promise.all([
    prisma.category.findMany(),
    options.reconcileExisting
      ? prisma.product.findMany({
          select: { id: true, name: true, categoryId: true, productType: true, sources: true },
        })
      : Promise.resolve([]),
    prisma.catalogImportRun.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
  ]);
  if (options.reconcileExisting && running)
    throw new Error('Finish queued or running imports before reorganizing categories.');
  const definitions = new Map(MARKETPLACE_CATEGORIES.map((category) => [category.slug, category]));
  const categories = new Map(existing.map((category) => [category.id, category]));
  const runIds = [
    ...new Set(
      products.flatMap((product) =>
        product.sources.flatMap((source) => (source.importRunId ? [source.importRunId] : [])),
      ),
    ),
  ];
  const runs = runIds.length
    ? await prisma.catalogImportRun.findMany({
        where: { id: { in: runIds } },
        select: { id: true, source: true, candidateSnapshot: true },
      })
    : [];
  const originalProducts = new Map<string, { categoryName?: string }>();
  for (const run of runs) {
    const snapshot = run.candidateSnapshot as
      | { products?: Array<{ externalId: string; categoryName?: string }> }
      | Array<{ externalId: string; categoryName?: string }>
      | null;
    for (const product of (Array.isArray(snapshot) ? snapshot : snapshot?.products) ?? [])
      originalProducts.set(`${run.source}:${product.externalId}`, product);
  }
  const labels = new Map<string, Mapping[]>();
  for (const mapping of mappings)
    for (const label of [mapping.name, ...(mapping.aliases ?? [])]) {
      const key = `${mapping.source}:${normalize(label)}`;
      const list = labels.get(key) ?? [];
      if (!list.some((item) => item.id === mapping.id)) list.push(mapping);
      labels.set(key, list);
    }
  const bySourceId = new Map(
    mappings.map((mapping) => [`${mapping.source}:${mapping.id}`, mapping]),
  );
  const decisions = products.map((product) => {
    const previous = categories.get(product.categoryId)!;
    const source = product.sources[0];
    const sourceName =
      (source
        ? originalProducts.get(`${source.source}:${source.externalId}`)?.categoryName
        : undefined) ?? previous.name;
    let target = definitions.has(previous.slug) ? previous.slug : legacyTargets[previous.slug];
    let matched: Mapping[] = [];
    const definition = definitions.get(previous.slug);
    const canonical =
      !!definition &&
      (definition.parentSlug
        ? categories.get(previous.parentId ?? '')?.slug === definition.parentSlug
        : !previous.parentId);
    if (source && !canonical) {
      matched =
        product.productType && source.source === 'AMAZON_BERKELEY'
          ? [bySourceId.get(`${source.source}:${product.productType}`)].filter(
              (value): value is Mapping => !!value,
            )
          : (labels.get(`${source.source}:${normalize(sourceName)}`) ?? []);
      const usable = matched.filter((mapping) => mapping.categorySlug);
      if (usable.length) {
        const depth = Math.max(...usable.map((mapping) => mapping.sourceDepth));
        target =
          commonCategory(
            usable
              .filter((mapping) => mapping.sourceDepth === depth)
              .map((mapping) => mapping.categorySlug!),
          ) ?? target;
      }
    }
    if (target && !canonical) target = audienceCategory(target, explicitAudience([product.name]));
    return { product, previous, target, matched, sourceName };
  });
  const unresolved = decisions
    .filter((decision) => !decision.target)
    .map((decision) => ({
      productId: decision.product.id,
      name: decision.product.name,
      previousCategory: decision.previous.name,
    }));
  const report = {
    roots: MARKETPLACE_CATEGORIES.filter((category) => !category.parentSlug).length,
    canonicalCategories: MARKETPLACE_CATEGORIES.length,
    productsExamined: products.length,
    productsToMove: decisions.filter((decision) => decision.target !== decision.previous.slug)
      .length,
    unresolved,
    mappings: [...new Set(mappings.map((mapping) => mapping.source))].map((source) => ({
      source,
      total: mappings.filter((mapping) => mapping.source === source).length,
      mapped: mappings.filter((mapping) => mapping.source === source && mapping.categorySlug)
        .length,
    })),
  };
  if (!options.apply) return report;
  if (unresolved.length)
    throw new Error(`Category review required before applying: ${JSON.stringify(unresolved)}`);
  const images = new Map(
    await Promise.all(
      MARKETPLACE_CATEGORIES.filter((category) => category.imageAsset).map(
        async (category) => [category.slug, await categoryImage(category.imageAsset!)] as const,
      ),
    ),
  );
  await prisma.$transaction(
    async (tx) => {
      const canonical = new Map<string, string>();
      for (const definition of MARKETPLACE_CATEGORIES) {
        const old = existing.find((category) => category.slug === definition.slug);
        const image = old?.imageUrl ? {} : (images.get(definition.slug) ?? {});
        const fields = {
          name: definition.name,
          parentId: definition.parentSlug ? canonical.get(definition.parentSlug)! : null,
          position: definition.position,
          isActive: true,
          ...image,
        };
        const saved = await tx.category.upsert({
          where: { slug: definition.slug },
          create: { slug: definition.slug, ...fields },
          update: options.reconcileExisting ? fields : image,
        });
        canonical.set(definition.slug, saved.id);
      }
      for (const decision of decisions) {
        const categoryId = canonical.get(decision.target!)!;
        if (categoryId !== decision.product.categoryId)
          await tx.product.update({ where: { id: decision.product.id }, data: { categoryId } });
      }
      if (options.reconcileExisting) {
        for (const old of existing.filter((category) => !definitions.has(category.slug))) {
          const targets = decisions
            .filter((decision) => decision.previous.id === old.id)
            .map((decision) => decision.target!);
          const slug = commonCategory(targets) ?? legacyTargets[old.slug];
          if (!slug) continue;
          const categoryId = canonical.get(slug)!;
          await tx.attributeDefinition.updateMany({
            where: { categoryId: old.id },
            data: { categoryId },
          });
          const promotions = await tx.promotion.findMany({
            where: { categoryIds: { has: old.id } },
            select: { id: true, categoryIds: true },
          });
          for (const promotion of promotions)
            await tx.promotion.update({
              where: { id: promotion.id },
              data: {
                categoryIds: [
                  ...new Set(promotion.categoryIds.map((id) => (id === old.id ? categoryId : id))),
                ],
              },
            });
          await tx.category.delete({ where: { id: old.id } });
        }
        await tx.catalogImportPreview.updateMany({
          where: { status: { in: ['READY', 'PREPARING', 'QUEUED'] } },
          data: {
            status: 'FAILED',
            errorMessage:
              'ShopNest categories were reorganized. Prepare a new preview to review the mapped categories.',
            expiresAt: new Date(),
          },
        });
      }
    },
    { timeout: 120000 },
  );
  return report;
}
