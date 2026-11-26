export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  position?: number;
  isActive?: boolean;
  imageUrl?: string | null;
  aliases?: Array<{ slug: string }>;
};
export function categoryLineage<T extends CategoryNode>(categories: T[], category: T): T[] {
  const byId = new Map(categories.map((node) => [node.id, node]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current: T | undefined = category;
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
export function categoryOptions<T extends CategoryNode>(categories: T[], includeInactive = false) {
  const result: Array<T & { path: string; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    categories
      .filter((category) => (category.parentId ?? null) === parentId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
      .forEach((category) => {
        if (visited.has(category.id) || (!includeInactive && category.isActive === false)) return;
        visited.add(category.id);
        result.push({
          ...category,
          path: categoryLineage(categories, category)
            .map((node) => node.name)
            .join(' → '),
          depth,
        });
        walk(category.id, depth + 1);
      });
  };
  walk(null, 0);
  return result;
}
export function findCategory<T extends CategoryNode>(categories: T[], slug?: string) {
  return categories.find(
    (category) => category.slug === slug || category.aliases?.some((alias) => alias.slug === slug),
  );
}
