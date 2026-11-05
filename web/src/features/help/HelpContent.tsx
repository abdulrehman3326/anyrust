import { Card, CardContent, CardDescription, CardHeader, CardTitle, Icon, IconChip } from '@/shared/ui';
import type { IconName } from '@/shared/ui';

const steps: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'screenShare', title: 'Select what to share', body: 'Choose a browser tab, a window, or your full display. Nothing is shared until you confirm in the browser dialog.' },
  { icon: 'link', title: 'Send your invite link', body: 'Copy the private link and send it to one viewer. Use “Open viewer in new tab” to test the flow yourself.' },
  { icon: 'userCheck', title: 'Approve the viewer', body: 'Review each access request before streaming starts. End the session at any time to stop the stream for both sides.' },
];

const requirements = [
  'Presenting requires a desktop browser over HTTPS or localhost.',
  'Viewing works in any modern browser with WebRTC support.',
  'Connections across restrictive networks may need a TURN relay, which this installation doesn’t configure.',
];

const privacy = [
  'Video is sent peer-to-peer over WebRTC and encrypted in transit (DTLS-SRTP).',
  'One presenter and one approved viewer per session. Access is view-only.',
  'Messages pass through the server, are never written to disk, and clear when the session ends.',
  'History is stored only in this browser. Invite links are never saved.',
];

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3 text-sm lg:gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
          <span className="text-muted-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Product explainer used by the Help view. */
export function HelpContent() {
  return (
    <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:gap-5">
      <ol className="grid gap-6 md:grid-cols-3 lg:gap-5">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card className="h-full">
              <CardHeader className="gap-3 lg:gap-3">
                <div className="flex items-center justify-between">
                  <IconChip icon={step.icon} tone={index === 0 ? 'brand' : 'neutral'} />
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <div className="space-y-1.5">
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.body}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:gap-5 lg:[&>*]:h-full">
        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
            <CardDescription>What you need to present or view.</CardDescription>
          </CardHeader>
          <CardContent><Checklist items={requirements} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Privacy &amp; security</CardTitle>
            <CardDescription>How Deskstream handles your session.</CardDescription>
          </CardHeader>
          <CardContent><Checklist items={privacy} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
