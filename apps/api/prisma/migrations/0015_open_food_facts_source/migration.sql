-- Adds a second real catalog source alongside DummyJSON. Groceries have no
-- commercial pricing data from this supplier, so CatalogImportService
-- treats a missing price as "leave the product DRAFT, no VendorOffer" —
-- see catalog-source.adapter.ts and the service's syncOffer skip path.
ALTER TYPE "CatalogSource" ADD VALUE 'OPEN_FOOD_FACTS';
ALTER TYPE "CatalogSource" ADD VALUE 'AMAZON';

