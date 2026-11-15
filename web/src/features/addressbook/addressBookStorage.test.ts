import { ADDRESS_BOOK_KEY, ADDRESS_BOOK_LIMIT, loadContacts, removeContact, saveContacts, touchContact, upsertContact } from './addressBookStorage';
import type { Contact } from './addressBookStorage';

function memoryStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(ADDRESS_BOOK_KEY, JSON.stringify(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}

describe('address book storage', () => {
  it('round-trips and drops invalid entries', () => {
    const valid: Contact = { deviceId: '123456789', alias: 'Main PC', addedAt: 1 };
    const storage = memoryStorage([valid, { deviceId: '12', alias: 'x', addedAt: 1 }, { deviceId: '987654321', alias: '', addedAt: 1 }, 'junk']);
    expect(loadContacts(storage)).toEqual([valid]);
    saveContacts([valid], storage);
    expect(JSON.parse(storage.data.get(ADDRESS_BOOK_KEY)!)).toEqual([valid]);
  });

  it('survives corrupt or blocked storage', () => {
    expect(loadContacts({ getItem: () => '{not json' })).toEqual([]);
    expect(loadContacts(null)).toEqual([]);
    expect(() => saveContacts([], { setItem: () => { throw new Error('quota'); } })).not.toThrow();
  });

  it('adds, renames instead of duplicating, and defaults blank names', () => {
    let list = upsertContact([], '123456789', '  Main   PC ', 1);
    expect(list).toEqual([{ deviceId: '123456789', alias: 'Main PC', addedAt: 1 }]);
    list = upsertContact(list, '123456789', 'Office', 2);
    expect(list).toHaveLength(1);
    expect(list[0]!.alias).toBe('Office');
    list = upsertContact(list, '987654321', '', 3);
    expect(list[0]).toMatchObject({ deviceId: '987654321', alias: 'Device 321' });
  });

  it('orders by last use and caps the list', () => {
    let list = upsertContact([], '111111111', 'A', 1);
    list = upsertContact(list, '222222222', 'B', 2);
    expect(list.map((c) => c.alias)).toEqual(['B', 'A']);
    list = touchContact(list, '111111111', 3);
    expect(list.map((c) => c.alias)).toEqual(['A', 'B']);
    list = removeContact(list, '111111111');
    expect(list.map((c) => c.alias)).toEqual(['B']);

    let many: Contact[] = [];
    for (let i = 0; i < ADDRESS_BOOK_LIMIT + 5; i++) many = upsertContact(many, String(100000000 + i), `D${i}`, i);
    expect(many).toHaveLength(ADDRESS_BOOK_LIMIT);
  });
});
