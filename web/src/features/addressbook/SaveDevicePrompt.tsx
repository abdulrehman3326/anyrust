import { useState } from 'react';
import type { FormEvent } from 'react';
import { formatRoomId } from '@/shared/lib';
import { Button, Icon, Input } from '@/shared/ui';
import { MAX_ALIAS_LENGTH } from './addressBookStorage';
import { useAddressBook } from './useAddressBook';

/**
 * Offers to save the device this viewer connected to by ID. Renders nothing once it is saved,
 * so it can sit wherever the viewer is (the live session view, the address book).
 */
export function SaveDevicePrompt({ deviceId }: { deviceId: string }) {
  const book = useAddressBook();
  const [alias, setAlias] = useState('');
  if (book.contacts.some((contact) => contact.deviceId === deviceId)) return null;

  const save = (event: FormEvent) => {
    event.preventDefault();
    book.save(deviceId, alias);
  };

  return (
    <form
      onSubmit={save}
      aria-label="Save this device"
      className="flex flex-col gap-3 rounded-lg border border-info/25 bg-info/10 p-3 text-sm sm:flex-row sm:items-center"
    >
      <span className="min-w-0 flex-1">
        Save device <strong className="font-mono font-medium tabular-nums">{formatRoomId(deviceId)}</strong> to reconnect later without a new invite.
      </span>
      <div className="flex gap-2">
        <Input
          aria-label="Nickname for this device"
          placeholder="Nickname"
          maxLength={MAX_ALIAS_LENGTH}
          value={alias}
          className="w-36"
          onChange={(event) => setAlias(event.target.value)}
        />
        <Button type="submit" variant="outline">
          <Icon name="add" />
          Save
        </Button>
      </div>
    </form>
  );
}
