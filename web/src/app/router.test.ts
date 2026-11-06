import { hrefFor, parseLocation } from './router';

describe('router', () => {
  it('maps paths to views', () => {
    expect(parseLocation('/join')).toBe('join');
    expect(parseLocation('/history/')).toBe('history');
    expect(parseLocation('/')).toBe('home');
    expect(parseLocation('/nope')).toBe('home');
  });

  it('understands legacy hash URLs', () => {
    expect(parseLocation('/', '#/history')).toBe('history');
    expect(parseLocation('/', '#/nope')).toBe('home');
  });

  it('sends invite links to the session view', () => {
    expect(parseLocation('/', '#join=123456789:abc')).toBe('session');
  });

  it('builds clean hrefs', () => {
    expect(hrefFor('home')).toBe('/');
    expect(hrefFor('join')).toBe('/join');
  });
});
