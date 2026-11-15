import { useCallback, useEffect, useState } from 'react';
import { ADDRESS_BOOK_KEY, loadContacts, removeContact, saveContacts, touchContact, upsertContact } from './addressBookStorage';
import type { Contact } from './addressBookStorage';

/**
 * Saved devices, persisted in localStorage. Every change re-reads storage first, so two tabs
 * editing at once don't overwrite each other, and other tabs' edits arrive via `storage` events.
 */
export function useAddressBook() {
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === ADDRESS_BOOK_KEY || event.key === null) setContacts(loadContacts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((change: (current: Contact[]) => Contact[]) => {
    const next = change(loadContacts());
    saveContacts(next);
    setContacts(next);
  }, []);

  return {
    contacts,
    save: useCallback((deviceId: string, alias: string) => commit((list) => upsertContact(list, deviceId, alias, Date.now())), [commit]),
    remove: useCallback((deviceId: string) => commit((list) => removeContact(list, deviceId)), [commit]),
    touch: useCallback((deviceId: string) => commit((list) => touchContact(list, deviceId, Date.now())), [commit]),
  };
}
