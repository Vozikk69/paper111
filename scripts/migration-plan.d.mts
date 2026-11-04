export function migrationName(path: string): string;
export function isMigrationFile(path: string): boolean;
export function pendingMigrations(
  paths: Iterable<string>,
  applied: Iterable<string>,
): Array<{ name: string; path: string }>;
