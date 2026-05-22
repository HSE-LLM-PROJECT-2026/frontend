export const PLATFORM_TEAM_OPTIONS = [
  'Data Science',
  'Backend API',
  'Analytics',
  'R&D',
] as const;

export function resolveUnifiedTeamOptions(extraTeams: string[] = []): string[] {
  const base: string[] = [...PLATFORM_TEAM_OPTIONS];
  const seen = new Set<string>(base);

  const normalizedExtra = Array.from(
    new Set(
      extraTeams
        .map((team) => team.trim())
        .filter((team) => team.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  for (const team of normalizedExtra) {
    if (!seen.has(team)) {
      seen.add(team);
      base.push(team);
    }
  }

  return base;
}
