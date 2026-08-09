WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm run build
