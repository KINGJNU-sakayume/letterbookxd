# Data identity migration plan

The current production data uses a legacy composite edition-set reference (`workId::publisher`). Application code now accesses that format only through `src/domain/books/identity.ts`.

## Next database migration

When the production database is ready to migrate without downtime:

1. Create an `edition_sets` table with UUID `id`, `work_id`, and publisher metadata.
2. Backfill one row for each distinct `(work_id, publisher)` pair.
3. Add nullable `edition_set_id` foreign keys to `editions` and `logs`, then backfill them.
4. Add `author_id` to `works` and backfill it from the current author name.
5. Deploy application code that reads UUID IDs while retaining legacy parsing for old logs.
6. After verification, make the new foreign keys non-null and remove string-derived relationships.

Do not rename publishers or author names as a substitute for an ID migration: historical log references must remain stable.
