import { useToast } from '@/shared/ui';

/** Copies the invite link to the clipboard and reports the outcome with a toast. */
export function useCopyInvite(inviteLink: string) {
  const toast = useToast();
  return async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast('Invite link copied.');
    } catch {
      toast('Couldn’t copy automatically. Select the link and press Ctrl+C (⌘C on Mac).');
    }
  };
}
