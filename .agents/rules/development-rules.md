# DifaMap Coding & Architecture Rules

## Environment & Monorepo Structure
- **Root**: npm workspaces with `apps/api`, `apps/web`, and `packages/tsconfig`.
- **Backend**: Express + TypeScript + Prisma + Supabase PostGIS (`apps/api`).
- **Frontend**: Next.js 15 App Router + MapLibre GL (`apps/web`).

## Package Management
- Always install packages using workspace flag:
  `npm i <package> --workspace=@difamap/api` or `npm i <package> --workspace=@difamap/web`.

## Prisma Client Sync Rule
- After any `schema.prisma` change, always run `npm run db:generate` in `apps/api`.
- Ensure `.prisma` and `@prisma` are copied/present in `apps/api/node_modules/` to avoid red squiggles in IDE.

## TypeScript Standards
- All internal module imports in `apps/api` must use the `.js` extension (ESM NodeNext).
- Always ensure `npm run lint` (`tsc --noEmit`) passes with exit code 0 before finalizing any task.
