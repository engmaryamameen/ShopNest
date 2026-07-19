/**
 * Admin seed/bootstrap utility.
 * Admins are created via CLI only — never through an HTTP endpoint.
 *
 * Usage:
 *   DATABASE_URL=... node -e "
 *     const { PrismaClient } = require('@prisma/client');
 *     const argon2 = require('argon2');
 *     const prisma = new PrismaClient();
 *     argon2.hash('YourSecurePassword123!', { type: argon2.argon2id })
 *       .then(hash => prisma.user.create({
 *         data: { email: 'admin@shopnest.com', passwordHash: hash, role: 'ADMIN' }
 *       }))
 *       .then(() => prisma.cart.create({ data: { userId: ... } }))
 *       .then(() => { console.log('Admin created'); prisma.\$disconnect(); });
 *   "
 *
 * For convenience, a seed script is provided at apps/api/prisma/seed.ts
 */
export {};
