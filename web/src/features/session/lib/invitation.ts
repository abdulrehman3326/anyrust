export class InvitationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvitationError';
  }
}

export interface Invitation {
  id: string;
  token: string;
}

const HASH_PATTERN = /^#join=(\d{9}):([\w-]{32})$/;

/** Parses a full invitation URL, or a bare `#join=` fragment, for the given origin. */
export function parseInvitation(value: string, origin: string): Invitation {
  let hash: string;
  if (value.startsWith('#join=')) {
    hash = value;
  } else {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new InvitationError('Enter the complete invite link.');
    }
    if (url.origin !== origin) throw new InvitationError('This invite link belongs to a different Deskstream server.');
    hash = url.hash;
  }
  const match = HASH_PATTERN.exec(hash);
  if (!match || !match[1] || !match[2]) throw new InvitationError('This invite link is incomplete. Ask the presenter for a new one.');
  return { id: match[1], token: match[2] };
}

export function buildInviteLink(origin: string, roomId: string, viewerToken: string): string {
  return `${origin}/#join=${roomId}:${viewerToken}`;
}
