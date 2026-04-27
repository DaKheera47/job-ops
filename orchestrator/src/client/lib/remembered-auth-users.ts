export type RememberedAuthUser = {
  username: string;
  displayName: string | null;
  rememberedAt: number;
};

const REMEMBERED_AUTH_USERS_KEY = "jobops.rememberedAuthUsers";
const MAX_REMEMBERED_AUTH_USERS = 8;

function normalizeUsername(username: string): string {
  return username.trim();
}

function parseRememberedAuthUsers(value: string | null): RememberedAuthUser[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Partial<RememberedAuthUser>;
        if (typeof candidate.username !== "string") return [];

        const username = normalizeUsername(candidate.username);
        if (!username) return [];

        return [
          {
            username,
            displayName:
              typeof candidate.displayName === "string" &&
              candidate.displayName.trim()
                ? candidate.displayName.trim()
                : null,
            rememberedAt:
              typeof candidate.rememberedAt === "number"
                ? candidate.rememberedAt
                : 0,
          },
        ];
      })
      .sort((left, right) => right.rememberedAt - left.rememberedAt)
      .slice(0, MAX_REMEMBERED_AUTH_USERS);
  } catch {
    return [];
  }
}

function writeRememberedAuthUsers(users: RememberedAuthUser[]): void {
  try {
    localStorage.setItem(REMEMBERED_AUTH_USERS_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

export function loadRememberedAuthUsers(): RememberedAuthUser[] {
  try {
    return parseRememberedAuthUsers(
      localStorage.getItem(REMEMBERED_AUTH_USERS_KEY),
    );
  } catch {
    return [];
  }
}

export function rememberAuthUser(input: {
  username: string;
  displayName?: string | null;
}): RememberedAuthUser[] {
  const username = normalizeUsername(input.username);
  if (!username) return loadRememberedAuthUsers();

  const existingUsers = loadRememberedAuthUsers();
  const existingUser = existingUsers.find((user) => user.username === username);
  const displayName =
    input.displayName === undefined
      ? (existingUser?.displayName ?? null)
      : input.displayName?.trim() || null;
  const nextUsers = [
    { username, displayName, rememberedAt: Date.now() },
    ...existingUsers.filter((user) => user.username !== username),
  ].slice(0, MAX_REMEMBERED_AUTH_USERS);

  writeRememberedAuthUsers(nextUsers);
  return nextUsers;
}
