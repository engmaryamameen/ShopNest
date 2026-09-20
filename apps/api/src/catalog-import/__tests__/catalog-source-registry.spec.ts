import { BadRequestException } from '@nestjs/common';
import { CatalogSource } from '@prisma/client';
import { CatalogSourceRegistry } from '../catalog-source-registry';
import { DummyJsonAdapter } from '../dummy-json.adapter';
import { OpenFoodFactsAdapter } from '../open-food-facts.adapter';
import { AmazonAdapter } from '../amazon.adapter';

describe('CatalogSourceRegistry', () => {
  const dummyJson = { fetchProducts: jest.fn() } as unknown as DummyJsonAdapter;
  const openFoodFacts = { fetchProducts: jest.fn() } as unknown as OpenFoodFactsAdapter;
  const amazon = { fetchProducts: jest.fn() } as unknown as AmazonAdapter;
  const registry = new CatalogSourceRegistry(dummyJson, openFoodFacts, amazon);

  it('resolves DUMMY_JSON to the DummyJsonAdapter instance', () => {
    expect(registry.resolve(CatalogSource.DUMMY_JSON)).toBe(dummyJson);
  });

  it('resolves OPEN_FOOD_FACTS to the OpenFoodFactsAdapter instance', () => {
    expect(registry.resolve(CatalogSource.OPEN_FOOD_FACTS)).toBe(openFoodFacts);
  });

  it('resolves AMAZON to the AmazonAdapter instance', () => {
    expect(registry.resolve(CatalogSource.AMAZON)).toBe(amazon);
  });

  it('rejects an unrecognized source rather than silently picking one', () => {
    expect(() => registry.resolve('SOMETHING_ELSE' as CatalogSource)).toThrow(BadRequestException);
  });
});
