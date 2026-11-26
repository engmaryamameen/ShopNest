import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export async function writeProductSpecifications(
  tx: Prisma.TransactionClient,
  productId: string,
  specifications: Record<string, string>,
  replace = false,
) {
  const entries = Object.entries(specifications);
  if (
    entries.length > 50 ||
    entries.some(
      ([name, value]) =>
        !name.trim() || name.length > 150 || typeof value !== 'string' || value.length > 4000,
    )
  )
    throw new BadRequestException('Use up to 50 specifications with short names and text values.');
  if (replace) await tx.productAttributeValue.deleteMany({ where: { productId } });
  for (const [name, value] of entries) {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
    if (!slug || !value.trim()) continue;
    const definition = await tx.attributeDefinition.upsert({
      where: { slug },
      update: {},
      create: { name: name.trim(), slug },
    });
    await tx.productAttributeValue.upsert({
      where: {
        productId_attributeDefinitionId: { productId, attributeDefinitionId: definition.id },
      },
      update: { value },
      create: { productId, attributeDefinitionId: definition.id, value },
    });
  }
}
