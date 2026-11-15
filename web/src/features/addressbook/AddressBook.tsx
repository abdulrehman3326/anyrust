import { useState } from 'react';
import type { FormEvent } from 'react';
import { parseDeviceId } from '@/features/device';
import type { JoinResult } from '@/features/session';
import { formatRoomId } from '@/shared/lib';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Icon, IconChip, TextField } from '@/shared/ui';
import { MAX_ALIAS_LENGTH } from './addressBookStorage';
import type { Contact } from './addressBookStorage';
import { useAddressBook } from './useAddressBook';
import { SaveDevicePrompt } from './SaveDevicePrompt';

interface AddressBookProps {
  onConnect: (deviceId: string) => Promise<JoinResult>;
  /** True while a session is active or starting; Connect is unavailable then. */
  connectDisabled: boolean;
  /** The device this viewer is connected to by ID, offered for saving if it isn't saved yet. */
  currentDeviceId: string | null;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function lastUsed(contact: Contact): string {
  if (!contact.lastConnectedAt) return 'Never connected';
  const minutes = Math.round((contact.lastConnectedAt - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return `Connected ${relative.format(minutes, 'minute')}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `Connected ${relative.format(hours, 'hour')}`;
  return `Connected ${relative.format(Math.round(hours / 24), 'day')}`;
}

/**
 * Saved presenter devices, stored only in this browser. Connecting to a saved device works while
 * that device is sharing, and its presenter still approves every request.
 */
export function AddressBook({ onConnect, connectDisabled, currentDeviceId }: AddressBookProps) {
  const book = useAddressBook();
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [formError, setFormError] = useState<string>();
  const [editing, setEditing] = useState<string | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [rowError, setRowError] = useState<{ deviceId: string; message: string } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const unsavedCurrent = currentDeviceId && !book.contacts.some((contact) => contact.deviceId === currentDeviceId) ? currentDeviceId : null;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const deviceId = parseDeviceId(deviceIdInput);
    if (!deviceId) {
      setFormError('Enter the 9-digit device ID shown on the presenter’s screen.');
      return;
    }
    book.save(deviceId, aliasInput);
    setDeviceIdInput('');
    setAliasInput('');
    setFormError(undefined);
  };

  const connect = async (deviceId: string) => {
    setRowError(null);
    setConnecting(deviceId);
    const result = await onConnect(deviceId);
    setConnecting(null);
    if (result.ok) book.touch(deviceId);
    else setRowError({ deviceId, message: result.error });
  };

  const rename = (event: FormEvent, deviceId: string) => {
    event.preventDefault();
    book.save(deviceId, editAlias);
    setEditing(null);
  };

  return (
    <Card as="section" aria-label="Address book">
      <CardHeader>
        <div className="flex items-start gap-4">
          <IconChip icon="contacts" />
          <div className="space-y-1.5">
            <CardTitle>Address book</CardTitle>
            <CardDescription>Saved devices, kept only in this browser. Connect works while the device is sharing.</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {unsavedCurrent && <SaveDevicePrompt deviceId={unsavedCurrent} />}

        {book.contacts.length > 0 ? (
          <ul className="flex flex-col gap-3" aria-label="Saved devices">
            {book.contacts.map((contact) => (
              <li key={contact.deviceId} className="flex flex-col gap-3 rounded-lg border p-3" aria-label={`Saved device ${contact.alias}`}>
                {editing === contact.deviceId ? (
                  <form className="flex items-end gap-2" onSubmit={(event) => rename(event, contact.deviceId)}>
                    <div className="min-w-0 flex-1">
                      <TextField label="Nickname" value={editAlias} maxLength={MAX_ALIAS_LENGTH} autoFocus onChange={(event) => setEditAlias(event.target.value)} />
                    </div>
                    <Button type="submit" variant="outline">Save</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{contact.alias}</p>
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatRoomId(contact.deviceId)}</p>
                      <p className="text-xs text-muted-foreground">{lastUsed(contact)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        disabled={connectDisabled || connecting !== null}
                        aria-busy={connecting === contact.deviceId}
                        onClick={() => void connect(contact.deviceId)}
                      >
                        {connecting === contact.deviceId ? 'Connecting…' : 'Connect'}
                      </Button>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={`Rename ${contact.alias}`}
                        title="Rename"
                        onClick={() => {
                          setEditing(contact.deviceId);
                          setEditAlias(contact.alias);
                        }}
                      >
                        <Icon name="edit" />
                      </Button>
                      <Button variant="ghost" iconOnly aria-label={`Remove ${contact.alias}`} title="Remove" onClick={() => book.remove(contact.deviceId)}>
                        <Icon name="remove" />
                      </Button>
                    </div>
                  </div>
                )}
                {rowError?.deviceId === contact.deviceId && (
                  <p className="text-sm text-destructive" role="alert">{rowError.message}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No saved devices yet. Ask the presenter for the device ID on their invite panel.</p>
        )}

        <form className="flex flex-col gap-3 border-t pt-6" onSubmit={add} noValidate aria-label="Save a device">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Device ID"
              placeholder="123 456 789"
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
              value={deviceIdInput}
              error={formError}
              onChange={(event) => {
                setDeviceIdInput(event.target.value);
                setFormError(undefined);
              }}
            />
            <TextField
              label="Nickname"
              placeholder="e.g. Main PC"
              maxLength={MAX_ALIAS_LENGTH}
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
            />
          </div>
          <div>
            <Button type="submit" variant="outline" disabled={!deviceIdInput.trim()}>
              <Icon name="add" />
              Save device
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
