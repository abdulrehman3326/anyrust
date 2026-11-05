import { emptyState, workflow } from './presentation';

describe('workflow', () => {
  it('starts at step one when idle', () => {
    expect(workflow('host', false, 'idle').map((step) => step.state)).toEqual(['active', 'upcoming', 'upcoming']);
  });
  it('advances to invitation once a room exists', () => {
    expect(workflow('host', true, 'waiting').map((step) => step.state)).toEqual(['complete', 'active', 'upcoming']);
  });
  it('completes everything when live', () => {
    expect(workflow('host', true, 'live').map((step) => step.state)).toEqual(['complete', 'complete', 'complete']);
  });
  it('uses viewer wording for viewers', () => {
    expect(workflow('viewer', true, 'waiting')[0]?.title).toBe('Invite opened');
  });
});

describe('emptyState', () => {
  it('tells a waiting viewer the presenter is next', () => {
    expect(emptyState('viewer', true, 'waiting').title).toMatch(/presenter/);
  });
  it('invites a presenter to start sharing', () => {
    expect(emptyState('host', false, 'idle').caption).toMatch(/begin/);
  });
});
