import { buildInviteLink, InvitationError, parseInvitation } from './invitation';

const origin = 'http://127.0.0.1:4317';
const token = 'a'.repeat(32);

describe('parseInvitation', () => {
  it('parses a full link', () => {
    expect(parseInvitation(buildInviteLink(origin, '123456789', token), origin)).toEqual({ id: '123456789', token });
  });

  it('parses a bare fragment', () => {
    expect(parseInvitation(`#join=123456789:${token}`, origin)).toEqual({ id: '123456789', token });
  });

  it('rejects text that is not a link', () => {
    expect(() => parseInvitation('hello', origin)).toThrow(InvitationError);
  });

  it('rejects another origin', () => {
    expect(() => parseInvitation(buildInviteLink('https://example.com', '123456789', token), origin)).toThrow(/different Deskstream server/);
  });

  it('rejects an incomplete invitation', () => {
    expect(() => parseInvitation(`${origin}/#join=123:short`, origin)).toThrow(/incomplete/);
  });
});
