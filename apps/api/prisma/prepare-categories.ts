import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { prepareMarketplaceTaxonomy } from './marketplace-taxonomy.ts';
const prisma = new PrismaClient();
const directoryIndex = process.argv.indexOf('--taxonomy-directory');
prepareMarketplaceTaxonomy(prisma, {
  apply: process.argv.includes('--apply'),
  reconcileExisting: process.argv.includes('--reconcile'),
  taxonomyDirectory: directoryIndex >= 0 ? resolve(process.argv[directoryIndex + 1]) : undefined,
})
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
