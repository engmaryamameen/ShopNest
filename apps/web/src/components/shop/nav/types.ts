export interface HeaderCategory {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  position?: number;
  isActive?: boolean;
  imageUrl?: string | null;
  imageAttribution?: { name: string; url: string; license: string } | null;
}
