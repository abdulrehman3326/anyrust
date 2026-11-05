import type { Role } from '@/shared/api';
import type { BadgeTone } from '@/shared/ui';
import type { SessionPhase } from '../model/types';

export const phaseBadge: Record<SessionPhase, { label: string; tone: BadgeTone }> = {
  idle: { label: 'Idle', tone: 'neutral' },
  choosing: { label: 'Selecting source', tone: 'info' },
  waiting: { label: 'Waiting', tone: 'warning' },
  request: { label: 'Access request', tone: 'brand' },
  connecting: { label: 'Connecting', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  interrupted: { label: 'Reconnecting', tone: 'warning' },
  ended: { label: 'Ended', tone: 'neutral' },
};

export interface EmptyState {
  title: string;
  description: string;
  caption: string;
}

export function emptyState(role: Role, active: boolean, phase: SessionPhase): EmptyState {
  if (role === 'viewer' && active) {
    const connecting = phase === 'connecting';
    return {
      title: connecting ? 'Connecting to the presenter…' : 'Waiting for the presenter',
      description: 'Keep this tab open. The shared screen appears here as soon as your request is approved.',
      caption: connecting ? 'Establishing a secure connection' : 'Request sent',
    };
  }
  return {
    title: 'No active stream',
    description: 'Start sharing to preview your screen here. You choose exactly what’s visible.',
    caption: 'Start sharing to begin',
  };
}

export interface WorkflowStep {
  title: string;
  description: string;
  state: 'upcoming' | 'active' | 'complete';
}

const hostSteps = [
  ['Select a source', 'A window, browser tab, or full display.'],
  ['Invite a viewer', 'Send your private invite link.'],
  ['Approve access', 'Confirm the viewer before streaming starts.'],
] as const;

const viewerSteps = [
  ['Invite opened', 'Your access request has been sent.'],
  ['Approval pending', 'The presenter is reviewing your request.'],
  ['View the screen', 'Live, view-only stream.'],
] as const;

export function workflow(role: Role, active: boolean, phase: SessionPhase): WorkflowStep[] {
  const live = phase === 'live';
  const approvalStage = phase === 'request' || phase === 'connecting' || live || phase === 'interrupted';
  const current = !active ? 0 : approvalStage ? 2 : 1;
  return (role === 'viewer' && active ? viewerSteps : hostSteps).map(([title, description], index) => ({
    title,
    description,
    state: index < current || live ? 'complete' : index === current ? 'active' : 'upcoming',
  }));
}
