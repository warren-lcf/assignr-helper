import { Page, expect as base_expect, test } from '@playwright/test';
import {
  FAKE_API_KEY,
  IEmailMock,
  IEmailMockOptions,
  MEMBER_PERMISSIONS,
  UNCONFIGURED_SETTINGS,
  install_email_mock,
  requests_to,
} from './helpers/email_api_mock';
import {
  assert_dialog_layout_is_sound,
  assert_settled_layout_is_sound,
  wait_for_animations,
} from './helpers/settled_layout';
import { SEED_USER_EMAIL, sign_in_and_open } from './helpers/sign_in';

/** The dev server compiles lazily and Firebase Auth loads on demand, so a loaded machine needs more than the 5 s default. */
const expect = base_expect.configure({ timeout: 20_000 });

/** Dates are typed and asserted in US English and UTC, whatever the machine running the suite uses. */
test.use({ timezoneId: 'UTC', locale: 'en-US' });

async function open_drafts(page: Page, options: IEmailMockOptions = {}): Promise<IEmailMock> {
  const mock = await install_email_mock(page, options);
  await sign_in_and_open(page, '/email-drafts');
  return mock;
}

/** Opens the draft with this id from the list and waits for the editor. */
async function open_draft(page: Page, draft_id: string): Promise<void> {
  await page.getByTestId(`draft-open-${draft_id}`).click();
  await expect(page.getByTestId('draft-editor')).toBeVisible();
}

/** Switches view with the tab strip, or with the select a phone gets. */
async function choose_view(page: Page, label: string): Promise<void> {
  const views = page.getByTestId('email-view-tabs');
  const tab = views.getByRole('tab', { name: label });
  await expect(tab.or(views.getByRole('combobox'))).toBeVisible();
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    await views.getByRole('combobox').click();
    await page.getByRole('option', { name: label }).click();
  }
}

/** Waits until the editor's preview has loaded, so Send can be judged. */
async function wait_for_preview(page: Page): Promise<void> {
  await expect(page.getByTestId('draft-preview-recipients')).toBeVisible();
}

async function text_align_of(page: Page, testid: string): Promise<string> {
  return page.getByTestId(testid).evaluate((element) => getComputedStyle(element).textAlign);
}

test.describe('email drafts page', () => {
  test.describe.configure({ timeout: 120_000 });

  test('lists drafts with status text, right-aligned numbers and the right actions', async ({
    page,
  }) => {
    await open_drafts(page);

    await expect(page.getByTestId('email-drafts-count')).toHaveText('4 drafts');
    await expect(page.getByTestId('draft-status-draft-1')).toContainText('Draft');
    await expect(page.getByTestId('draft-status-draft-2')).toContainText('Sent');
    await expect(page.getByTestId('draft-status-draft-3')).toContainText('Partly sent');
    await expect(page.getByTestId('draft-status-draft-4')).toContainText('Sending');
    await expect(page.getByTestId('draft-recipients-draft-1')).toHaveText('Everyone who agreed');
    await expect(page.getByTestId('draft-recipients-draft-2')).toHaveText('1,234');
    await expect(page.getByTestId('draft-sent-draft-2')).toContainText('2026');

    // Numbers are right-aligned with tabular figures; only an unsent draft can be edited or deleted.
    expect(['right', 'end']).toContain(await text_align_of(page, 'draft-recipients-draft-2'));
    const numeric = await page
      .getByTestId('draft-recipients-draft-2')
      .evaluate((element) => getComputedStyle(element).fontVariantNumeric);
    expect(numeric).toContain('tabular-nums');
    await expect(page.getByTestId('draft-open-draft-1')).toHaveText('Edit');
    await expect(page.getByTestId('draft-open-draft-2')).toHaveText('View');
    await expect(page.getByTestId('draft-delete-draft-1')).toBeVisible();
    await expect(page.getByTestId('draft-delete-draft-2')).toHaveCount(0);
    await expect(page.getByTestId('draft-delete-draft-3')).toHaveCount(0);

    await assert_settled_layout_is_sound(page);
  });

  test('invites the first draft when there are none, and the invitation opens the editor', async ({
    page,
  }) => {
    await open_drafts(page, { drafts: [] });

    await expect(page.getByTestId('email-drafts-empty')).toContainText('No email drafts yet');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('email-drafts-empty-new').click();

    await expect(page.getByTestId('draft-subject')).toBeVisible();
  });

  test('shows an error with a retry, then the drafts', async ({ page }) => {
    const mock = await open_drafts(page, { list_failures: 1 });

    await expect(page.getByTestId('email-drafts-error')).toContainText(
      'Email drafts could not be loaded',
    );
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('email-drafts-retry').click();

    await expect(page.getByTestId('email-drafts-count')).toHaveText('4 drafts');
    expect(requests_to(mock, 'GET', /^\/api\/email_drafts$/)).toHaveLength(2);
  });

  test('shows a clear no-access state, and asks for nothing, without email.send', async ({
    page,
  }) => {
    const mock = await open_drafts(page, { permissions: MEMBER_PERMISSIONS });

    await expect(page.getByTestId('email-drafts-no-access')).toContainText(
      'You do not have access to email',
    );
    await expect(page.getByTestId('email-new-draft')).toHaveCount(0);
    await expect(page.getByTestId('email-sender-settings')).toHaveCount(0);
    for (const path of [/^\/api\/email_drafts/, /^\/api\/contacts/, /^\/api\/email\/settings/]) {
      expect(requests_to(mock, 'GET', path)).toHaveLength(0);
    }
    await assert_settled_layout_is_sound(page);
  });

  test('warns that sending is not set up, and the banner opens the sender settings', async ({
    page,
  }) => {
    await open_drafts(page, { settings: UNCONFIGURED_SETTINGS });

    await expect(page.getByTestId('email-not-configured-banner')).toContainText(
      'Sending is not set up yet.',
    );
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('email-not-configured-setup').click();

    await expect(page.getByTestId('settings-from-email')).toBeVisible();
    // Nothing is stored yet, so the key field is open for typing and the help says how to finish.
    await expect(page.getByTestId('secret-entry-form-input-api_key')).toBeVisible();
    await expect(page.getByTestId('settings-setup-help')).toBeVisible();
    await expect(page.getByTestId('settings-save')).toHaveCount(0);
    await assert_dialog_layout_is_sound(page);
  });

  test('does not show the banner once sending is set up', async ({ page }) => {
    await open_drafts(page);

    await expect(page.getByTestId('email-drafts-count')).toBeVisible();
    await expect(page.getByTestId('email-not-configured-banner')).toHaveCount(0);
  });

  test('writes a draft: validates, saves explicitly, then previews the saved draft', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await page.getByTestId('email-new-draft').click();
    await expect(page.getByTestId('draft-subject')).toBeVisible();
    await expect(page.getByTestId('draft-preview-unsaved')).toBeVisible();
    await assert_settled_layout_is_sound(page);

    // An empty subject is explained and nothing is sent to the API.
    await page.getByTestId('draft-save').click();
    await expect(page.getByText('Enter a subject.')).toBeVisible();
    expect(requests_to(mock, 'POST', /^\/api\/email_drafts$/)).toHaveLength(0);

    await page.getByTestId('draft-subject').fill('Weekend games');
    await page.getByTestId('draft-intro').fill('Hello referees');
    await expect(page.getByTestId('draft-intro-counter')).toHaveText('14 of 2,000');
    await page.getByTestId('draft-filter-level').click();
    await page.getByRole('option', { name: 'Premier', exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.getByTestId('draft-toggle-open-slots').getByRole('switch').click();
    await page.getByTestId('draft-date-from').fill('10/10/2026');
    await page.getByTestId('draft-date-to').fill('10/12/2026');
    await page.getByTestId('draft-date-to').press('Tab');
    await page.getByTestId('draft-toggle-quick-link').getByRole('switch').click();
    await page.getByTestId('draft-quick-link-days').fill('10');
    await expect(page.getByTestId('draft-dirty')).toBeVisible();
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('draft-save').click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    const [created] = requests_to(mock, 'POST', /^\/api\/email_drafts$/);
    expect(created.body).toEqual({
      subject: 'Weekend games',
      intro: 'Hello referees',
      filters: {
        level: 'Premier',
        only_with_open_slots: true,
        date_from: Date.UTC(2026, 9, 10),
        date_to: Date.UTC(2026, 9, 12),
      },
      include_quick_link: true,
      quick_link_expiry_days: 10,
      recipient_mode: 'ALL_CONSENTED',
    });

    // The preview now reads the saved draft; its numbers are right-aligned.
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-preview-games')).toHaveText('4 games');
    await expect(page.getByTestId('draft-preview-recipients')).toHaveText('2');
    expect(['right', 'end']).toContain(await text_align_of(page, 'draft-preview-recipients'));
    expect(['right', 'end']).toContain(await text_align_of(page, 'draft-quick-link-days'));
    await expect(page.getByTestId('draft-dirty')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);

    // A change after saving makes the preview stale and blocks sending until it is saved.
    await page.getByTestId('draft-subject').fill('Weekend games, revised');
    await expect(page.getByTestId('draft-dirty')).toBeVisible();
    await expect(page.getByTestId('draft-preview-stale')).toBeVisible();
    await expect(page.getByTestId('draft-send')).toBeDisabled();
    await expect(page.getByTestId('draft-test-send')).toBeDisabled();
    await page.getByTestId('draft-save').click();
    await expect(page.getByTestId('draft-dirty')).toHaveCount(0);
    expect(requests_to(mock, 'PUT', /^\/api\/email_drafts\/draft-/)).toHaveLength(1);
  });

  test('blocks Send while the preview has blocking warnings, and explains how to fix them', async ({
    page,
  }) => {
    await open_drafts(page, { settings: UNCONFIGURED_SETTINGS, contacts: [] });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    await expect(page.getByTestId('draft-warning-email_not_configured')).toContainText(
      'Sending is not set up yet',
    );
    await expect(page.getByTestId('draft-warning-email_not_configured')).toContainText(
      'Blocks sending',
    );
    await expect(page.getByTestId('draft-warning-no_recipients')).toContainText(
      'Nobody would receive this email',
    );
    await expect(page.getByTestId('draft-send')).toBeDisabled();
    await expect(page.getByTestId('draft-test-send')).toBeDisabled();
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('draft-warning-fix-email_not_configured').click();
    await expect(page.getByTestId('settings-from-email')).toBeVisible();
  });

  test('shows the email only inside an empty-sandbox frame, with a plain-text alternative', async ({
    page,
  }) => {
    await open_drafts(page);
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    const frame = page.getByTestId('draft-preview-frame');
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(
      page.frameLocator('[data-testid="draft-preview-frame"]').locator('body'),
    ).toContainText('Riverside Park');
    // The mocked email carries a script; the sandbox must have kept it from running.
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>)['__e2e_escaped']),
    ).toBeUndefined();

    await page.getByTestId('draft-preview-show-text').click();
    await expect(page.getByTestId('draft-preview-text')).toContainText('Lions vs Tigers');
    await expect(frame).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
  });

  test('sends a test email to the signed-in user only', async ({ page }) => {
    const mock = await open_drafts(page);
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    await expect(page.getByTestId('draft-test-send')).toBeEnabled();
    await page.getByTestId('draft-test-send').click();

    await expect(page.getByText(`Test email sent to ${SEED_USER_EMAIL}.`)).toBeVisible();
    expect(requests_to(mock, 'POST', /\/draft-1\/test_send$/)).toHaveLength(1);
    expect(requests_to(mock, 'POST', /\/send$/)).toHaveLength(0);
  });

  test('explains a test send that cannot go out', async ({ page }) => {
    await open_drafts(page, { test_send_error: 'NO_EMAIL_ON_ACCOUNT' });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    await page.getByTestId('draft-test-send').click();

    await expect(
      page.getByText('Your account has no email address to send the test to.'),
    ).toBeVisible();
  });

  test('asks for an explicit confirmation that states the consequences, then sends', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-send')).toBeEnabled();

    await page.getByTestId('draft-send').click();
    await expect(page.getByTestId('send-confirm-headline')).toHaveText(
      'This will email 2 people now and cannot be undone.',
    );
    await expect(page.getByTestId('send-confirm-recipients')).toHaveText('Alice Archer, Bob Baker');
    await expect(page.getByTestId('send-confirm-games')).toHaveText('4 games');
    await expect(page.getByTestId('send-confirm-quick-link')).toContainText('expiring in 7 days');
    await expect(page.getByTestId('send-confirm-submit')).toContainText('Send to 2 people now');
    // Names only: no address is ever shown on the confirmation.
    expect(await page.getByRole('dialog').innerText()).not.toContain('@');
    // Cancel has the focus, so Enter cannot send.
    await expect(page.getByTestId('send-confirm-cancel')).toBeFocused();
    await assert_dialog_layout_is_sound(page);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('send-confirm-headline')).toHaveCount(0);
    expect(requests_to(mock, 'POST', /\/send$/)).toHaveLength(0);

    await page.getByTestId('draft-send').click();
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('send-results-summary')).toContainText('Sent to 2 people.');
    await expect(page.getByTestId('send-results-sent')).toHaveText('2');
    await expect(page.getByTestId('send-result-status-contact-1')).toContainText('Sent');
    await expect(page.getByTestId('draft-editor-status')).toContainText('Sent');
    const [sent] = requests_to(mock, 'POST', /\/draft-1\/send$/);
    expect(sent.body).toEqual({ confirm_recipient_count: 2 });
    expect(requests_to(mock, 'POST', /\/send$/)).toHaveLength(1);
    // A sent draft can no longer be edited or sent again.
    await expect(page.getByTestId('draft-subject')).toHaveCount(0);
    await expect(page.getByTestId('draft-send')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
  });

  test('sends once however fast the confirm button is pressed', async ({ page }) => {
    const mock = await open_drafts(page, { send_delay_ms: 800 });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-send')).toBeEnabled();

    await page.getByTestId('draft-send').click();
    await page.getByTestId('send-confirm-submit').dblclick();

    await expect(page.getByTestId('send-results-summary')).toContainText('Sent to 2 people.');
    expect(requests_to(mock, 'POST', /\/send$/)).toHaveLength(1);
  });

  test('recovers when the recipient count changed: nothing sent, the preview refreshes, and the sender confirms again', async ({
    page,
  }) => {
    const mock = await open_drafts(page, { send_plan: ['COUNT_CHANGED', 'OK'] });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-send')).toBeEnabled();

    await page.getByTestId('draft-send').click();
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('draft-count-changed')).toContainText('Nothing was sent');
    await expect(page.getByTestId('draft-preview-recipients')).toHaveText('3');
    await expect(page.getByTestId('send-confirm-headline')).toHaveCount(0);
    await expect(page.getByTestId('send-results')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);

    await expect(page.getByTestId('draft-send')).toBeEnabled();
    await page.getByTestId('draft-send').click();
    await expect(page.getByTestId('send-confirm-headline')).toHaveText(
      'This will email 3 people now and cannot be undone.',
    );
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('send-results-summary')).toContainText('Sent to 3 people.');
    const sends = requests_to(mock, 'POST', /\/send$/);
    expect(sends.map((request) => request.body)).toEqual([
      { confirm_recipient_count: 2 },
      { confirm_recipient_count: 3 },
    ]);
  });

  test('reports a partial failure per person with safe reasons, and retries only the failed', async ({
    page,
  }) => {
    const mock = await open_drafts(page, { send_plan: ['PARTIAL', 'OK'] });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-send')).toBeEnabled();

    await page.getByTestId('draft-send').click();
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('send-results-summary')).toContainText('Sent to 1 person.');
    await expect(page.getByTestId('send-results-summary')).toContainText(
      '1 person could not be reached.',
    );
    await expect(page.getByTestId('send-result-status-contact-1')).toContainText('Sent');
    await expect(page.getByTestId('send-result-status-contact-2')).toContainText('Failed');
    await expect(page.getByTestId('send-result-reason-contact-2')).toHaveText(
      'The email service refused this message.',
    );
    // The raw error code is never shown.
    expect(await page.getByTestId('send-results').innerText()).not.toContain('PROVIDER_REJECTED');
    await expect(page.getByTestId('draft-editor-status')).toContainText('Partly sent');
    await assert_settled_layout_is_sound(page);

    await expect(page.getByTestId('send-results-retry')).toBeEnabled();
    await page.getByTestId('send-results-retry').click();
    await expect(page.getByTestId('send-confirm-retry-note')).toContainText('not emailed twice');
    await expect(page.getByTestId('send-confirm-headline')).toHaveText(
      'This will email 1 person now and cannot be undone.',
    );
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('send-results-summary')).toContainText('Sent to 1 person.');
    await expect(page.getByTestId('send-results-retry')).toHaveCount(0);
    await expect(page.getByTestId('draft-editor-status')).toContainText('Sent');
    expect(requests_to(mock, 'POST', /\/send$/).map((request) => request.body)).toEqual([
      { confirm_recipient_count: 2 },
      { confirm_recipient_count: 1 },
    ]);
  });

  test('shows a send failure in the dialog and lets the sender close it', async ({ page }) => {
    await open_drafts(page, { send_plan: ['SERVER_ERROR'] });
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-send')).toBeEnabled();

    await page.getByTestId('draft-send').click();
    await page.getByTestId('send-confirm-submit').click();

    await expect(page.getByTestId('send-confirm-error')).toContainText(
      'Something went wrong. Try again.',
    );
    await expect(page.getByTestId('send-confirm-submit')).toBeEnabled();
    await assert_dialog_layout_is_sound(page);
    await page.getByTestId('send-confirm-cancel').click();
    await expect(page.getByTestId('send-results')).toHaveCount(0);
  });

  test('lets the sender choose specific people, never an unsubscribed one', async ({ page }) => {
    const mock = await open_drafts(page);
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    await page.getByTestId('recipient-mode-selected').click();
    await expect(page.getByTestId('recipient-option-contact-1')).toBeVisible();
    // Carol unsubscribed: she is listed and marked, and cannot be chosen.
    await expect(page.getByTestId('recipient-option-contact-3')).toContainText('Unsubscribed');
    await expect(page.getByTestId('recipient-option-contact-3')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByTestId('recipient-chosen-count')).toHaveText(
      '0 chosen of 100 allowed per send',
    );
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('recipient-select-all').click();
    await expect(page.getByTestId('recipient-chosen-count')).toHaveText(
      '2 chosen of 100 allowed per send',
    );
    await page.getByTestId('recipient-select-none').click();
    await expect(page.getByTestId('recipient-chosen-count')).toHaveText(
      '0 chosen of 100 allowed per send',
    );
    await page.getByTestId('recipient-option-contact-1').click();
    await expect(page.getByTestId('recipient-chosen-count')).toHaveText(
      '1 chosen of 100 allowed per send',
    );

    await page.getByTestId('draft-save').click();
    await expect(page.getByText('Draft saved.')).toBeVisible();
    const [update] = requests_to(mock, 'PUT', /\/draft-1$/);
    expect(update.body).toMatchObject({
      recipient_mode: 'SELECTED',
      contact_ids: ['contact-1'],
    });
    await wait_for_preview(page);
    await expect(page.getByTestId('draft-preview-recipients')).toHaveText('1');
  });

  test('asks before leaving unsaved changes', async ({ page }) => {
    await open_drafts(page);
    await open_draft(page, 'draft-1');
    await wait_for_preview(page);

    await page.getByTestId('draft-subject').fill('Something else');
    await page.getByTestId('draft-editor-back').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText('Something else');
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toHaveCount(0);
    await expect(page.getByTestId('draft-subject')).toHaveValue('Something else');

    await page.getByTestId('draft-editor-back').click();
    await page.getByTestId('confirmation-dialog-confirm').click();
    await expect(page.getByTestId('email-drafts-count')).toBeVisible();
    await expect(page.getByTestId('draft-card-draft-1')).toContainText(
      'Games available this weekend',
    );
  });

  test('opens sent and sending drafts read-only', async ({ page }) => {
    await open_drafts(page);

    await open_draft(page, 'draft-2');
    await expect(page.getByTestId('draft-locked-subject')).toHaveText('Last weekend');
    await expect(page.getByTestId('draft-locked-recipients')).toHaveText('1234');
    await expect(page.getByTestId('draft-subject')).toHaveCount(0);
    await expect(page.getByTestId('draft-send')).toHaveCount(0);
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('draft-editor-back').click();

    await open_draft(page, 'draft-4');
    await expect(page.getByTestId('draft-sending-notice')).toBeVisible();
    await expect(page.getByTestId('draft-send')).toHaveCount(0);
  });

  test('asks before deleting a draft, naming it', async ({ page }) => {
    const mock = await open_drafts(page);

    await page.getByTestId('draft-delete-draft-1').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText(
      'Games available this weekend',
    );
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText('cannot be undone');
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toHaveCount(0);
    await expect(page.getByTestId('draft-card-draft-1')).toBeVisible();
    expect(requests_to(mock, 'DELETE', /\/api\/email_drafts\//)).toHaveLength(0);

    await page.getByTestId('draft-delete-draft-1').click();
    await page.getByTestId('confirmation-dialog-confirm').click();

    await expect(page.getByTestId('email-drafts-count')).toHaveText('3 drafts');
    await expect(page.getByTestId('draft-card-draft-1')).toHaveCount(0);
    expect(requests_to(mock, 'DELETE', /\/api\/email_drafts\/draft-1$/)).toHaveLength(1);
  });
});

test.describe('email contacts', () => {
  test.describe.configure({ timeout: 120_000 });

  test('lists contacts with consent status in words, and an unsubscribed one marked', async ({
    page,
  }) => {
    await open_drafts(page);
    await choose_view(page, 'Contacts');

    await expect(page.getByTestId('contacts-count')).toHaveText(
      '3 contacts: 2 can receive email, 1 unsubscribed',
    );
    await expect(page.getByTestId('contact-status-contact-1')).toContainText('Granted');
    await expect(page.getByTestId('contact-status-contact-3')).toContainText('Unsubscribed');
    await expect(page.getByTestId('contact-note-contact-3')).toContainText('Unsubscribed on');
    await assert_settled_layout_is_sound(page);

    await page.getByTestId('contacts-filter-bar').getByRole('textbox').fill('bob');
    await expect(page.getByTestId('contact-row-contact-2')).toBeVisible();
    await expect(page.getByTestId('contact-row-contact-1')).toHaveCount(0);
  });

  test('adds a contact only after the consent confirmation is ticked', async ({ page }) => {
    const mock = await open_drafts(page);
    await choose_view(page, 'Contacts');

    await page.getByTestId('contacts-add').click();
    await expect(page.getByTestId('add-contact-name')).toBeFocused();
    await assert_dialog_layout_is_sound(page);
    await page.getByTestId('add-contact-name').fill('Dana Diaz');
    await page.getByTestId('add-contact-email').fill('dana@example.test');
    await page.getByTestId('add-contact-submit').click();

    await expect(page.getByTestId('add-contact-consent-error')).toContainText(
      'Confirm that this person agreed to receive these emails.',
    );
    expect(requests_to(mock, 'POST', /^\/api\/contacts$/)).toHaveLength(0);
    await assert_dialog_layout_is_sound(page);

    await page.getByTestId('add-contact-consent').getByRole('checkbox').check();
    await page.getByTestId('add-contact-submit').click();

    await expect(page.getByText('Added Dana Diaz.')).toBeVisible();
    await expect(page.getByTestId('contacts-count')).toContainText('4 contacts');
    const [created] = requests_to(mock, 'POST', /^\/api\/contacts$/);
    expect(created.body).toEqual({
      display_name: 'Dana Diaz',
      email_address: 'dana@example.test',
      consent_attested: true,
    });
  });

  test('explains an address that is already a contact, under the field', async ({ page }) => {
    await open_drafts(page);
    await choose_view(page, 'Contacts');

    await page.getByTestId('contacts-add').click();
    await expect(page.getByTestId('add-contact-name')).toBeFocused();
    await page.getByTestId('add-contact-name').fill('Alice Again');
    await page.getByTestId('add-contact-email').fill('alice@example.test');
    await page.getByTestId('add-contact-consent').getByRole('checkbox').check();
    await page.getByTestId('add-contact-submit').click();

    await expect(page.getByText('A contact with this email address already exists.')).toBeVisible();
    await expect(page.getByTestId('add-contact-submit')).toBeEnabled();
    await assert_dialog_layout_is_sound(page);
  });

  test('imports a pasted list: shows unusable lines, needs consent, then reports what the server did', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await choose_view(page, 'Contacts');

    await page.getByTestId('contacts-import').click();
    await expect(page.getByTestId('import-text')).toBeFocused();
    await assert_dialog_layout_is_sound(page);
    await page
      .getByTestId('import-text')
      .fill(
        [
          'Eve Evans <eve@example.test>',
          'not an email',
          'frank@example.test',
          'Eve Again <EVE@example.test>',
          'bad@bounce.test',
        ].join('\n'),
      );
    await expect(page.getByTestId('import-summary')).toHaveText('3 ready to import, 2 skipped');
    await expect(page.getByTestId('import-problems')).toContainText(
      'Line 2: Not a valid email address',
    );
    await expect(page.getByTestId('import-problems')).toContainText(
      'Line 4: This address is repeated from an earlier line',
    );
    await assert_dialog_layout_is_sound(page);

    await page.getByTestId('import-submit').click();
    await expect(page.getByTestId('import-consent-error')).toContainText(
      'Confirm that these people agreed to receive these emails.',
    );
    expect(requests_to(mock, 'POST', /\/import$/)).toHaveLength(0);

    await page.getByTestId('import-consent').getByRole('checkbox').check();
    await page.getByTestId('import-submit').click();

    await expect(page.getByTestId('import-result-added')).toHaveText('2');
    await expect(page.getByTestId('import-result-existing')).toHaveText('0');
    await expect(page.getByTestId('import-result-invalid')).toHaveText('1');
    await expect(page.getByTestId('import-result-invalid-list')).toContainText(
      'Row 3: Domain not accepted',
    );
    expect(['right', 'end']).toContain(await text_align_of(page, 'import-result-added'));
    await assert_dialog_layout_is_sound(page);
    const [imported] = requests_to(mock, 'POST', /\/import$/);
    expect(imported.body).toEqual({
      entries: [
        { display_name: 'Eve Evans', email_address: 'eve@example.test' },
        { email_address: 'frank@example.test' },
        { email_address: 'bad@bounce.test' },
      ],
      consent_attested: true,
    });

    await page.getByTestId('import-done').click();
    await expect(page.getByTestId('contacts-count')).toContainText('5 contacts');
  });

  test('asks before deleting a contact, naming them', async ({ page }) => {
    const mock = await open_drafts(page);
    await choose_view(page, 'Contacts');

    await page.getByTestId('contact-delete-contact-2').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText('Bob Baker');
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toHaveCount(0);
    await expect(page.getByTestId('contact-row-contact-2')).toBeVisible();
    expect(requests_to(mock, 'DELETE', /\/api\/contacts\//)).toHaveLength(0);

    await page.getByTestId('contact-delete-contact-2').click();
    await page.getByTestId('confirmation-dialog-confirm').click();

    await expect(page.getByText('Deleted Bob Baker.')).toBeVisible();
    await expect(page.getByTestId('contact-row-contact-2')).toHaveCount(0);
    expect(requests_to(mock, 'DELETE', /\/api\/contacts\/contact-2$/)).toHaveLength(1);
  });

  test('invites the first contact when there are none', async ({ page }) => {
    await open_drafts(page, { contacts: [] });
    await choose_view(page, 'Contacts');

    await expect(page.getByTestId('contacts-empty')).toContainText('No contacts yet');
    await assert_settled_layout_is_sound(page);
    await page.getByTestId('contacts-empty-add').click();
    await expect(page.getByTestId('add-contact-submit')).toBeVisible();
  });
});

test.describe('sender settings', () => {
  test.describe.configure({ timeout: 120_000 });

  async function open_settings(page: Page): Promise<void> {
    await page.getByTestId('email-sender-settings').click();
    // The dialog moves the focus once its opening animation ends; typing earlier could land in the wrong place.
    // (Which field gets it is not asserted: the CDK skips email inputs on iOS, so there it is the next field.)
    await expect(page.getByTestId('settings-from-email')).toBeVisible();
    await wait_for_animations(page);
  }

  test('shows the stored details with the key as configured, and saves details without touching the key', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await expect(page.getByTestId('email-sender-settings')).toBeEnabled();
    await open_settings(page);

    await expect(page.getByTestId('settings-from-email')).toHaveValue('games@example.test');
    await expect(page.getByTestId('settings-postal-address')).toHaveValue('1 Main St, Springfield');
    await expect(page.getByRole('dialog')).toContainText('Configured');
    await expect(page.getByTestId('secret-entry-form-input-api_key')).toHaveCount(0);
    await assert_dialog_layout_is_sound(page);

    await page.getByTestId('settings-from-name').fill('Metro Referees Office');
    await page.getByTestId('settings-save').click();

    await expect(page.getByText('Sender settings saved.')).toBeVisible();
    const [saved] = requests_to(mock, 'PUT', /\/api\/email\/settings$/);
    expect(saved.body).toEqual({
      from_email: 'games@example.test',
      from_name: 'Metro Referees Office',
      reply_to: 'help@example.test',
      postal_address: '1 Main St, Springfield',
    });
    expect('api_key' in (saved.body as object)).toBe(false);
  });

  test('replaces the key through the write-only form and never renders it back', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await open_settings(page);

    await page.getByTestId('secret-entry-form-replace-api_key').click();
    const input = page.getByTestId('secret-entry-form-input-api_key');
    await expect(input).toHaveAttribute('type', 'password');
    await input.fill(FAKE_API_KEY);
    await page.getByTestId('secret-entry-form-save-api_key').click();

    await expect(page.getByText('Sender settings saved.')).toBeVisible();
    const [saved] = requests_to(mock, 'PUT', /\/api\/email\/settings$/);
    expect((saved.body as { api_key: string }).api_key).toBe(FAKE_API_KEY);

    // The key lives only in that one request: not on the page, in the address bar or in storage.
    expect(await page.content()).not.toContain(FAKE_API_KEY);
    expect(page.url()).not.toContain(FAKE_API_KEY);
    expect(
      await page.evaluate(() =>
        JSON.stringify([localStorage, sessionStorage].map((storage) => ({ ...storage }))),
      ),
    ).not.toContain(FAKE_API_KEY);
    for (const request of mock.requests.filter((r) => r.path.startsWith('/api/email_drafts'))) {
      expect(JSON.stringify(request.body)).not.toContain(FAKE_API_KEY);
    }
    // Reopening shows the key as stored, still without its value.
    await open_settings(page);
    await expect(page.getByRole('dialog')).toContainText('Configured');
    expect(await page.getByRole('dialog').innerHTML()).not.toContain(FAKE_API_KEY);
  });

  test('sets sending up for the first time: the key is required and saved with the details', async ({
    page,
  }) => {
    const mock = await open_drafts(page, { settings: UNCONFIGURED_SETTINGS });
    await open_settings(page);

    await page.getByTestId('settings-from-email').fill('not an email');
    await page.getByTestId('secret-entry-form-input-api_key').fill(FAKE_API_KEY);
    await page.getByTestId('secret-entry-form-save-api_key').click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(requests_to(mock, 'PUT', /\/api\/email\/settings$/)).toHaveLength(0);

    await page.getByTestId('settings-from-email').fill('games@example.test');
    await page.getByTestId('settings-postal-address').fill('1 Main St, Springfield');
    await page.getByTestId('secret-entry-form-input-api_key').fill(FAKE_API_KEY);
    await page.getByTestId('secret-entry-form-save-api_key').click();

    await expect(page.getByText('Sender settings saved.')).toBeVisible();
    const [saved] = requests_to(mock, 'PUT', /\/api\/email\/settings$/);
    expect(saved.body).toMatchObject({
      from_email: 'games@example.test',
      postal_address: '1 Main St, Springfield',
      api_key: FAKE_API_KEY,
    });
    await expect(page.getByTestId('email-not-configured-banner')).toHaveCount(0);
  });

  test('asks before removing the sender settings, then shows the banner again', async ({
    page,
  }) => {
    const mock = await open_drafts(page);
    await open_settings(page);

    await page.getByTestId('settings-remove').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toContainText(
      'games@example.test',
    );
    await page.getByTestId('confirmation-dialog-cancel').click();
    await expect(page.getByTestId('confirmation-dialog-message')).toHaveCount(0);
    expect(requests_to(mock, 'DELETE', /\/api\/email\/settings$/)).toHaveLength(0);

    await page.getByTestId('settings-remove').click();
    await page.getByTestId('confirmation-dialog-confirm').click();

    await expect(page.getByText('Sender settings removed.')).toBeVisible();
    await expect(page.getByTestId('email-not-configured-banner')).toBeVisible();
    expect(requests_to(mock, 'DELETE', /\/api\/email\/settings$/)).toHaveLength(1);
  });
});
