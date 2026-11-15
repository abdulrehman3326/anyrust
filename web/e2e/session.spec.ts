import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/** True once the page's <video> is decoding frames from a live stream. */
const videoIsPlaying = (page: Page) =>
  page.waitForFunction(() => {
    const video = document.querySelector('video');
    return Boolean(video && video.videoWidth > 0 && video.readyState >= 2);
  });

const messageBox = (page: Page) => page.getByRole('textbox', { name: 'Message', exact: true });
const chatLog = (page: Page) => page.getByRole('log', { name: 'Chat messages' });

/**
 * Presenter starts a demo stream (no screen picker needed), a viewer opens the invite,
 * and the presenter approves it with the given chat permission. Resolves once both are live.
 */
async function startLiveSession(browser: Browser, options: { allowChat?: boolean; allowFiles?: boolean } = {}) {
  const presenterContext = await browser.newContext({ permissions: ['microphone'] });
  const viewerContext = await browser.newContext({ acceptDownloads: true });
  const presenter = await presenterContext.newPage();
  const viewer = await viewerContext.newPage();

  await presenter.goto('/session');
  await presenter.getByRole('button', { name: 'Try demo stream' }).click();
  const inviteDialog = presenter.getByRole('dialog', { name: 'Your session is live' });
  const inviteInput = inviteDialog.getByLabel('Invite link');
  await expect(inviteInput).toHaveValue(/#join=/);
  const inviteLink = await inviteInput.inputValue();
  await inviteDialog.getByRole('button', { name: 'Done' }).click();
  await expect(inviteDialog).toBeHidden();

  await viewer.goto(inviteLink);
  const approval = presenter.getByRole('dialog', { name: 'Allow this viewer to see your screen?' });
  await expect(approval).toBeVisible();
  const allowChat = approval.getByRole('switch', { name: 'Allow chat' });
  await expect(allowChat).toBeChecked();
  if (options.allowChat === false) await allowChat.uncheck();
  const allowFiles = approval.getByRole('switch', { name: 'Allow file transfer' });
  await expect(allowFiles).not.toBeChecked();
  if (options.allowFiles) await allowFiles.check();

  // Both sides fetch STUN/TURN settings from the server once the viewer is approved.
  const viewerIce = viewer.waitForResponse((response) => /\/api\/rooms\/\d{9}\/ice/.test(response.url()));
  const presenterIce = presenter.waitForResponse((response) => /\/api\/rooms\/\d{9}\/ice/.test(response.url()));
  await approval.getByRole('button', { name: 'Approve access' }).click();
  expect((await presenterIce).status()).toBe(200);
  expect((await viewerIce).status()).toBe(200);

  await videoIsPlaying(viewer);
  await expect(viewer.getByText('Live · Viewing presenter’s screen').first()).toBeVisible();
  await expect(presenter.getByText('Live · Sharing your screen').first()).toBeVisible();

  const close = async () => {
    await presenterContext.close();
    await viewerContext.close();
  };
  return { presenter, viewer, close };
}

test('presenter shares, approves a viewer, both chat, presenter ends', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser);

  await messageBox(viewer).fill('Hello from the viewer');
  await messageBox(viewer).press('Enter');
  await expect(chatLog(presenter).getByText('Hello from the viewer')).toBeVisible();
  await messageBox(presenter).fill('Hello from the presenter');
  await messageBox(presenter).press('Enter');
  await expect(chatLog(viewer).getByText('Hello from the presenter')).toBeVisible();

  // Ending as the presenter ends the viewer's session too.
  await presenter.getByRole('button', { name: 'End session' }).click();
  await expect(viewer.getByText('The presenter ended the session.', { exact: true })).toBeVisible();
  await expect(presenter.getByText('Session ended · Screen sharing stopped').first()).toBeVisible();
  await close();
});

test('privacy pause, viewer stage tools and connection quality', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser);

  // Live stats grade the connection on both sides.
  await expect(viewer.getByText(/^(Good|Fair|Poor) connection$/)).toBeVisible({ timeout: 10_000 });
  await expect(presenter.getByText(/^(Good|Fair|Poor) connection$/)).toBeVisible({ timeout: 10_000 });

  // Screenshot downloads a PNG of the current frame.
  const download = viewer.waitForEvent('download');
  await viewer.getByRole('button', { name: 'Take screenshot' }).click();
  expect((await download).suggestedFilename()).toMatch(/^deskstream-\d{9}-\d{4}(-\d{2}){5}\.png$/);

  // Original size is a toggle.
  const actualSize = viewer.getByRole('button', { name: 'Show at original size' });
  await actualSize.click();
  await expect(actualSize).toHaveAttribute('aria-pressed', 'true');
  await actualSize.click();
  await expect(actualSize).toHaveAttribute('aria-pressed', 'false');

  // Privacy pause blanks the viewer's stage and disables screenshots until resumed.
  await presenter.getByRole('button', { name: 'Pause sharing' }).click();
  await expect(presenter.getByText('Sharing paused')).toBeVisible();
  await expect(viewer.getByText('The presenter paused sharing')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Take screenshot' })).toBeDisabled();
  await presenter.getByRole('button', { name: 'Resume sharing' }).click();
  await expect(viewer.getByText('The presenter paused sharing')).toBeHidden();
  await expect(viewer.getByRole('button', { name: 'Take screenshot' })).toBeEnabled();

  await close();
});

test('presenter controls whether the viewer can chat', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser, { allowChat: false });

  // Approved without chat: the viewer can read but not send.
  await expect(messageBox(viewer)).toBeDisabled();
  await expect(viewer.getByText('The presenter turned off chat for this session.').first()).toBeVisible();
  await messageBox(presenter).fill('Announcement from the presenter');
  await messageBox(presenter).press('Enter');
  await expect(chatLog(viewer).getByText('Announcement from the presenter')).toBeVisible();

  // Turning chat on mid-session takes effect immediately.
  const viewerCanChat = presenter.getByRole('switch', { name: 'Viewer can chat' });
  await expect(viewerCanChat).not.toBeChecked();
  await viewerCanChat.check();
  await expect(viewer.getByText('The presenter turned chat back on.')).toBeVisible();
  await expect(messageBox(viewer)).toBeEnabled();
  await messageBox(viewer).fill('Thanks, chat works now');
  await messageBox(viewer).press('Enter');
  await expect(chatLog(presenter).getByText('Thanks, chat works now')).toBeVisible();

  await close();
});

test('audio: demo sound reaches the viewer, presenter controls computer audio and microphone', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser);

  // One mixed audio track arrives, and RTP is flowing (a remote track unmutes when packets arrive).
  await viewer.waitForFunction(() => {
    const stream = document.querySelector('video')?.srcObject;
    const tracks = stream instanceof MediaStream ? stream.getAudioTracks() : [];
    return tracks.length === 1 && tracks[0]?.readyState === 'live' && !tracks[0].muted;
  });

  // The viewer starts muted (autoplay rules) and opts in to sound.
  const isMuted = () => viewer.evaluate(() => document.querySelector('video')?.muted);
  expect(await isMuted()).toBe(true);
  await viewer.getByRole('button', { name: 'Turn on sound' }).click();
  expect(await isMuted()).toBe(false);
  await expect(viewer.getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.getByRole('slider', { name: 'Volume' })).toBeEnabled();
  // The presenter never plays its own audio back.
  expect(await presenter.evaluate(() => document.querySelector('video')?.muted)).toBe(true);

  // Muting computer audio leaves nothing audible, so the viewer's sound controls go away.
  const computerAudio = presenter.getByRole('button', { name: 'Share computer audio' });
  await expect(computerAudio).toHaveAttribute('aria-pressed', 'true');
  await computerAudio.click();
  await expect(computerAudio).toHaveAttribute('aria-pressed', 'false');
  await expect(viewer.getByRole('button', { name: 'Sound', exact: true })).toBeHidden();

  // The microphone is off by default; turning it on is announced to the viewer.
  const microphone = presenter.getByRole('button', { name: 'Microphone' });
  await expect(microphone).toHaveAttribute('aria-pressed', 'false');
  await microphone.click();
  await expect(microphone).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer.getByText('Presenter mic on', { exact: false })).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Sound', exact: true })).toBeVisible();
  await microphone.click();
  await expect(viewer.getByText('Presenter mic on', { exact: false })).toBeHidden();

  await close();
});

test('files: viewer sends one the presenter accepts and saves; presenter sends one the viewer declines', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser, { allowFiles: true });
  const content = 'Deskstream file transfer check\n'.repeat(4000); // ~120 KB, several chunks

  // Viewer → presenter: nothing moves until the presenter accepts.
  const viewerPicker = viewer.getByLabel('Choose a file to send');
  await expect(viewerPicker).toBeEnabled();
  await viewerPicker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(content) });
  const incoming = presenter.getByRole('listitem', { name: 'Incoming file notes.txt' });
  await expect(incoming.getByText('Needs your OK')).toBeVisible();
  await incoming.getByRole('button', { name: 'Accept' }).click();
  await expect(incoming.getByText('Verified. Ready to save.')).toBeVisible();
  await expect(viewer.getByRole('listitem', { name: 'Outgoing file notes.txt' }).getByText('Delivered and verified.')).toBeVisible();

  const download = presenter.waitForEvent('download');
  await incoming.getByRole('link', { name: 'Save file' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('notes.txt');
  const path = await saved.path();
  expect(readFileSync(path, 'utf8')).toBe(content);

  // Presenter → viewer: the viewer can decline.
  await presenter.getByLabel('Choose a file to send').setInputFiles({ name: 'report.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  const offered = viewer.getByRole('listitem', { name: 'Incoming file report.csv' });
  await offered.getByRole('button', { name: 'Decline' }).click();
  await expect(presenter.getByRole('listitem', { name: 'Outgoing file report.csv' }).getByText('The other side declined this file.')).toBeVisible();

  await close();
});

test('files: a viewer can only send once the presenter allows it', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser);

  await expect(viewer.getByRole('button', { name: 'Choose file' })).toBeDisabled();
  await expect(viewer.getByText('The presenter hasn’t allowed you to send files.', { exact: false })).toBeVisible();
  // The presenter can always send.
  await expect(presenter.getByRole('button', { name: 'Choose file' })).toBeEnabled();

  await presenter.getByRole('switch', { name: 'Viewer can send files' }).check();
  await expect(viewer.getByText('The presenter allowed you to send files.')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Choose file' })).toBeEnabled();

  await close();
});

test('device ID: a viewer saves the presenter’s device and connects from the address book', async ({ browser }) => {
  const presenterContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const presenter = await presenterContext.newPage();
  const viewer = await viewerContext.newPage();

  // Not sharing yet: the address book reports it plainly.
  await presenter.goto('/session');
  await presenter.getByRole('button', { name: 'Try demo stream' }).click();
  await presenter.getByRole('dialog', { name: 'Your session is live' }).getByRole('button', { name: 'Done' }).click();
  const idLabel = await presenter.getByLabel(/^Your device ID \d{3} \d{3} \d{3}$/).getAttribute('aria-label');
  const deviceId = idLabel!.replace(/\D/g, '');
  expect(deviceId).toMatch(/^[1-9]\d{8}$/);

  // The viewer saves the device with a nickname, then connects; the presenter still approves.
  await viewer.goto('/join');
  const book = viewer.getByRole('region', { name: 'Address book' });
  await book.getByLabel('Device ID').fill(`${deviceId.slice(0, 3)} ${deviceId.slice(3, 6)} ${deviceId.slice(6)}`);
  await book.getByLabel('Nickname').fill('Office PC');
  await book.getByRole('button', { name: 'Save device' }).click();
  const saved = book.getByRole('listitem', { name: 'Saved device Office PC' });
  await expect(saved).toBeVisible();
  await saved.getByRole('button', { name: 'Connect' }).click();
  const approval = presenter.getByRole('dialog', { name: 'Allow this viewer to see your screen?' });
  await approval.getByRole('button', { name: 'Approve access' }).click();
  await videoIsPlaying(viewer);

  // The same device ID works again after the presenter starts a new session.
  await presenter.getByRole('button', { name: 'End session' }).click();
  await expect(viewer.getByText('The presenter ended the session.', { exact: true })).toBeVisible();
  await presenter.getByRole('button', { name: 'Try demo stream' }).click();
  await presenter.getByRole('dialog', { name: 'Your session is live' }).getByRole('button', { name: 'Done' }).click();
  await expect(presenter.getByLabel(`Your device ID ${deviceId.slice(0, 3)} ${deviceId.slice(3, 6)} ${deviceId.slice(6)}`)).toBeVisible();

  // Typing the ID into the join box works too, and offers to save an unsaved device.
  await viewer.goto('/join');
  await viewer.getByRole('region', { name: 'Address book' }).getByRole('button', { name: 'Remove Office PC' }).click();
  await viewer.getByLabel('Invite link or device ID').fill(deviceId);
  await viewer.getByRole('button', { name: 'Request access' }).click();
  await approval.getByRole('button', { name: 'Approve access' }).click();
  await videoIsPlaying(viewer);
  const prompt = viewer.getByRole('form', { name: 'Save this device' });
  await prompt.getByLabel('Nickname for this device').fill('Office PC');
  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(prompt).toBeHidden();

  // When the device stops sharing, connecting explains why.
  await presenter.getByRole('button', { name: 'End session' }).click();
  await viewer.goto('/join');
  await viewer.getByRole('listitem', { name: 'Saved device Office PC' }).getByRole('button', { name: 'Connect' }).click();
  await expect(viewer.getByText('That device isn’t sharing right now.', { exact: false })).toBeVisible();

  await presenterContext.close();
  await viewerContext.close();
});

test('pointer: the presenter sees the viewer’s pointer and clicks, and can turn it off', async ({ browser }) => {
  const { presenter, viewer, close } = await startLiveSession(browser);
  const dot = presenter.getByTestId('remote-pointer');
  await expect(dot).toBeHidden();

  await viewer.getByRole('button', { name: 'Point at the screen' }).click();
  const video = viewer.getByRole('region', { name: 'Screen session' }).locator('video');
  const box = (await video.boundingBox())!;
  await viewer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await viewer.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 5);
  await expect(dot).toBeVisible();

  // The dot lands near the same spot in the presenter's preview (centre of the picture).
  const previewBox = (await presenter.getByRole('region', { name: 'Screen session' }).locator('video').boundingBox())!;
  const dotBox = (await dot.boundingBox())!;
  expect(Math.abs(dotBox.x - (previewBox.x + previewBox.width / 2))).toBeLessThan(previewBox.width * 0.1);
  expect(Math.abs(dotBox.y - (previewBox.y + previewBox.height / 2))).toBeLessThan(previewBox.height * 0.1);

  await viewer.mouse.down();
  await viewer.mouse.up();
  await expect(presenter.getByTestId('pointer-ping').first()).toBeAttached();

  // The floating pop-out (Document Picture-in-Picture) shows the pointer too.
  const popup = presenter.context().waitForEvent('page');
  await presenter.getByRole('button', { name: 'Pop out preview' }).click();
  const popOut = await popup;
  await viewer.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await expect(popOut.getByTestId('remote-pointer')).toBeVisible();
  await presenter.getByRole('button', { name: 'Pop out preview' }).click();
  await expect(presenter.getByRole('button', { name: 'Pop out preview' })).toHaveAttribute('aria-pressed', 'false');

  // Turning the permission off hides the dot and the viewer's pointer control.
  await presenter.getByRole('switch', { name: 'Viewer can point' }).uncheck();
  await expect(dot).toBeHidden();
  await expect(viewer.getByText('The presenter turned off your pointer.')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Point at the screen' })).toBeHidden();

  await close();
});
