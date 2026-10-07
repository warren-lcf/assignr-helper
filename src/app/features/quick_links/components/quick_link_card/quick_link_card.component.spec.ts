import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  ACTIVE_LINK,
  EXPIRED_LINK,
  REVOKED_LINK,
  make_quick_link_view,
} from '../../mocks/quick_link_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IQuickLinkView } from '../../models/quick_link_view.model';
import { QuickLinkCardComponent } from './quick_link_card.component';

function render(
  link: IQuickLinkView,
  inputs: { can_manage?: boolean; is_busy?: boolean; is_locked?: boolean } = {},
) {
  TestBed.configureTestingModule({
    imports: [QuickLinkCardComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(QuickLinkCardComponent);
  fixture.componentRef.setInput('link', link);
  fixture.componentRef.setInput('can_manage', inputs.can_manage ?? true);
  fixture.componentRef.setInput('is_busy', inputs.is_busy ?? false);
  fixture.componentRef.setInput('is_locked', inputs.is_locked ?? false);
  const revoked: IQuickLinkView[] = [];
  fixture.componentInstance.revoke_requested.subscribe((value) => revoked.push(value));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, element, by_testid, revoked };
}

describe('QuickLinkCardComponent', () => {
  it('titles the card by when the link was created and shows an active state as icon plus text', () => {
    const { element, by_testid } = render(ACTIVE_LINK);

    expect(element.querySelector('[role="heading"]')?.textContent).toContain('Quick link created');
    const state = by_testid('quick-link-state-link-1');
    expect(state?.textContent).toContain('Active');
    expect(state?.querySelector('mat-icon')?.textContent?.trim()).toBe('check_circle');
  });

  it.each([
    [EXPIRED_LINK, 'link-2', 'Expired', 'schedule'],
    [REVOKED_LINK, 'link-3', 'Revoked', 'block'],
  ])('shows %# with its own text and icon, never colour alone', (link, id, text, icon) => {
    const { by_testid } = render(link);
    const state = by_testid(`quick-link-state-${id}`);

    expect(state?.textContent).toContain(text);
    expect(state?.querySelector('mat-icon')?.textContent?.trim()).toBe(icon);
  });

  it('summarises what the link shows', () => {
    const { by_testid } = render(ACTIVE_LINK);
    const scope = by_testid('quick-link-scope-link-1');

    expect(scope?.textContent).toContain('Levels: Premier, Select');
    expect(scope?.textContent).toContain(' to ');
    expect(scope?.getAttribute('aria-label')).toBe('What this link shows');
  });

  it('shows a plain unrestricted link as every level on any date', () => {
    const { by_testid } = render(make_quick_link_view());
    const scope = by_testid('quick-link-scope-link-1');

    expect(scope?.textContent).toContain('All levels');
    expect(scope?.textContent).toContain('Any date');
  });

  it('shows "Never" for no expiry and for a link nobody opened', () => {
    const { by_testid } = render(make_quick_link_view());

    expect(by_testid('quick-link-expires-link-1')?.textContent?.trim()).toBe('Never');
    expect(by_testid('quick-link-last-viewed-link-1')?.textContent?.trim()).toBe('Never');
  });

  it('shows dates for expiry and last view, and the view count with a thousands separator', () => {
    const { by_testid } = render(ACTIVE_LINK);

    expect(by_testid('quick-link-expires-link-1')?.textContent).toMatch(/2026/);
    expect(by_testid('quick-link-last-viewed-link-1')?.textContent).toMatch(/2026/);
    expect(by_testid('quick-link-views-link-1')?.textContent?.trim()).toBe('1,234');
  });

  it('right-aligns the numeric and date values with tabular figures', () => {
    const { by_testid } = render(ACTIVE_LINK);
    const views = by_testid('quick-link-views-link-1') as HTMLElement;
    const style = getComputedStyle(views);

    // jsdom resolves component styles from the stylesheet the component ships with.
    expect(style.textAlign === 'end' || style.textAlign === 'right').toBe(true);
    expect(style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('shows when a revoked link was revoked', () => {
    const { by_testid } = render(REVOKED_LINK);

    expect(by_testid('quick-link-revoked-link-3')?.textContent).toMatch(/2026/);
  });

  it('offers Revoke on an active link to someone who may manage, and emits the link', () => {
    const { by_testid, revoked } = render(ACTIVE_LINK);
    const button = by_testid('quick-link-revoke-link-1') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toContain('Revoke Quick link created');
    button.click();

    expect(revoked).toEqual([ACTIVE_LINK]);
  });

  it.each([
    [EXPIRED_LINK, 'quick-link-revoke-link-2'],
    [REVOKED_LINK, 'quick-link-revoke-link-3'],
  ])('offers no Revoke on a link that no longer works (%#)', (link, id) => {
    expect(render(link).by_testid(id)).toBeNull();
  });

  it('offers no Revoke without quick_links.manage', () => {
    const { by_testid } = render(ACTIVE_LINK, { can_manage: false });

    expect(by_testid('quick-link-revoke-link-1')).toBeNull();
  });

  it('shows a spinner and marks itself busy while its revoke runs', () => {
    const { by_testid, element } = render(ACTIVE_LINK, { is_busy: true });
    const button = by_testid('quick-link-revoke-link-1') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('mat-progress-spinner')).not.toBeNull();
  });

  it('is disabled without a spinner while another link is being revoked', () => {
    const { by_testid, element } = render(ACTIVE_LINK, { is_locked: true });

    expect((by_testid('quick-link-revoke-link-1') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('mat-progress-spinner')).toBeNull();
  });
});
