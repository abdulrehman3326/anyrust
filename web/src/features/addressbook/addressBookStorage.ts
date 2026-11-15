/** A saved presenter device. Stored only in this browser. */
export interface Contact {
  deviceId: string;
  alias: string;
  addedAt: number;
  lastConnectedAt?: number | undefined;
}

export const ADDRESS_BOOK_KEY = 'deskstream-address-book';
export const ADDRESS_BOOK_LIMIT = 50;
export const MAX_ALIAS_LENGTH = 40;

export function isContact(item: unknown): item is Contact {
  if (typeof item !== 'object' || item === null) return false;
  const entry = item as Record<string, unknown>;
  return (
    typeof entry.deviceId === 'string' &&
    /^[1-9]\d{8}$/.test(entry.deviceId) &&
    typeof entry.alias === 'string' &&
    entry.alias.length > 0 &&
    entry.alias.length <= MAX_ALIAS_LENGTH &&
    typeof entry.addedAt === 'number' &&
    Number.isFinite(entry.addedAt) &&
    (entry.lastConnectedAt === undefined || (typeof entry.lastConnectedAt === 'number' && Number.isFinite(entry.lastConnectedAt)))
  );
}

/** Normalizes a nickname; empty means "use a default". */
export const cleanAlias = (alias: string): string => alias.replace(/\s+/g, ' ').trim().slice(0, MAX_ALIAS_LENGTH);

export function loadContacts(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Contact[] {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ADDRESS_BOOK_KEY) ?? '[]');
    return Array.isArray(saved) ? sortContacts(saved.filter(isContact)).slice(0, ADDRESS_BOOK_LIMIT) : [];
  } catch {
    return []; // Corrupt or blocked storage: start empty rather than break the page.
  }
}

export function saveContacts(contacts: Contact[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(ADDRESS_BOOK_KEY, JSON.stringify(contacts));
  } catch {
    /* Keep the in-memory list when storage is unavailable. */
  }
}

/** Most recently used first, then most recently added. */
export function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => (b.lastConnectedAt ?? b.addedAt) - (a.lastConnectedAt ?? a.addedAt));
}

/** Adds a device, or renames it if already saved. */
export function upsertContact(contacts: Contact[], deviceId: string, alias: string, now: number): Contact[] {
  const name = cleanAlias(alias) || `Device ${deviceId.slice(-3)}`;
  const existing = contacts.find((contact) => contact.deviceId === deviceId);
  if (existing) return contacts.map((contact) => (contact.deviceId === deviceId ? { ...contact, alias: name } : contact));
  return sortContacts([{ deviceId, alias: name, addedAt: now }, ...contacts]).slice(0, ADDRESS_BOOK_LIMIT);
}

export const removeContact = (contacts: Contact[], deviceId: string): Contact[] => contacts.filter((contact) => contact.deviceId !== deviceId);

export const touchContact = (contacts: Contact[], deviceId: string, now: number): Contact[] =>
  sortContacts(contacts.map((contact) => (contact.deviceId === deviceId ? { ...contact, lastConnectedAt: now } : contact)));

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
