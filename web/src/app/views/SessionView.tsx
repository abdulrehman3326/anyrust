import { SaveDevicePrompt } from '@/features/addressbook';
import { ChatPanel } from '@/features/chat';
import { FileTransferPanel } from '@/features/files';
import { InvitePanel, StartSharingActions } from '@/features/present';
import { SessionDetails, SessionPanel, phaseBadge } from '@/features/session';
import { Page, PageHeader } from '@/shared/layout';
import { Badge, Button, Icon } from '@/shared/ui';
import { ViewLink } from './shared';
import type { ViewProps } from './shared';

export function SessionView({ session, chat }: ViewProps) {
  const { state } = session;
  const badge = phaseBadge[state.phase];
  const hosting = state.active && state.role === 'host';
  const chatMuted = state.role === 'viewer' && state.chatReady && !state.viewerPermissions.chat;

  return (
    <Page>
      <PageHeader
        eyebrow={<Badge tone={badge.tone} dot pulse={state.phase === 'live'}>{badge.label}</Badge>}
        title="Live session"
        description={
          !state.active
            ? 'Start sharing or join with an invite link to begin a session.'
            : hosting
              ? 'You’re presenting. Viewers only see the source you selected.'
              : 'You’re viewing in read-only mode. The presenter controls what’s shared.'
        }
        actions={
          state.active ? (
            <Button variant="danger" disabled={state.ending} onClick={() => void session.endSession()}>
              <Icon name="close" />
              {state.ending ? 'Ending…' : 'End session'}
            </Button>
          ) : (
            <ViewLink to="join">Join a session</ViewLink>
          )
        }
      />

      {state.active && state.role === 'viewer' && state.deviceId && <SaveDevicePrompt deviceId={state.deviceId} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SessionPanel
          state={state}
          onPrivacyPauseChange={session.setPrivacyPause}
          onSystemAudioChange={session.setSystemAudio}
          onMicrophoneChange={(enabled) => void session.setMicrophone(enabled)}
          onControl={session.onControl}
          sendControl={session.sendControl}
          idleActions={
            <StartSharingActions
              state={state}
              onShare={(useSample) => void session.share(useSample)}
              className="flex flex-wrap justify-center gap-2"
            />
          }
          renderChat={({ open, fullscreen, onOpenChange }) => (
            <ChatPanel
              log={chat}
              selfRole={state.role}
              ready={state.chatReady && state.service === 'ready' && !state.ending && !chatMuted}
              unavailableReason={chatMuted ? 'The presenter turned off chat for this session.' : undefined}
              open={open}
              tray={fullscreen}
              onOpenChange={onOpenChange}
              onSend={session.sendChat}
            />
          )}
        />
        <div className="flex flex-col gap-6">
          {hosting && <InvitePanel state={state} />}
          {state.active && state.chatReady && (
            <FileTransferPanel
              transfers={state.transfers}
              canSend={state.controlReady && (hosting || state.viewerPermissions.files)}
              unavailableReason={
                !state.controlReady ? 'Files can be sent once the connection is live.' : 'The presenter hasn’t allowed you to send files. You can still receive them.'
              }
              peerLabel={hosting ? 'the viewer' : 'the presenter'}
              onSend={(file) => void session.sendFile(file)}
              onAccept={session.acceptFile}
              onDecline={session.declineFile}
              onCancel={session.cancelFile}
              onDismiss={session.dismissFile}
            />
          )}
          <SessionDetails state={state} onQualityChange={session.setQuality} onPermissionsChange={(permissions) => void session.setViewerPermissions(permissions)} />
        </div>
      </div>
    </Page>
  );
}
