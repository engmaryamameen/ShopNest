-- A third real catalog source. Amazon's "Reviews 2023" per-category
-- metadata files (McAuley Lab, Hugging Face — open, keyless) carry
-- multiple real images and often no price, same "may be commercial-data-
-- free" shape as Open Food Facts — see AmazonAdapter and the shared
-- price-optional handling in CatalogImportService.
ALTER TYPE "CatalogSource" ADD VALUE 'AMAZON';
