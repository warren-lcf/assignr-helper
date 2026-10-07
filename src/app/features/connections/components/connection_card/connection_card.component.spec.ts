import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ConnectionAction } from '../../enums/connection_action.enum';
import {
  CONNECTED_CONNECTION,
  DISCONNECTED_CONNECTION,
  NEEDS_ATTENTION_CONNECTION,
  make_connection_view,
} from '../../mocks/connection_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IConnectionView } from '../../models/connection_view.model';
import { ConnectionCardComponent } from './connection_card.component';

function render(
  connection: IConnectionView,
  options: { can_manage?: boolean; can_sync?: boolean; busy_action?: ConnectionAction | null } = {},
) {
  TestBed.configureTestingModule({
    imports: [ConnectionCardComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(ConnectionCardComponent);
  fixture.componentRef.setInput('connection', connection);
  fixture.componentRef.setInput('can_manage', options.can_manage ?? false);
  fixture.componentRef.setInput('can_sync', options.can_sync ?? false);
  fixture.componentRef.setInput('busy_action', options.busy_action ?? null);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = (action: string) =>
    element.querySelector<HTMLButtonElement>(
      `[data-testid="connection-${action}-${connection.connection_id}"]`,
    );
  return { fixture, element, button };
}

describe('ConnectionCardComponent', () => {
  it('shows the account, provider, status text and last synced time', () => {
    const { element } = render(CONNECTED_CONNECTION);

    expect(element.textContent).toContain('Metro Youth Soccer Assignor');
    expect(element.textContent).toContain('Assignr');
    expect(element.querySelector('hch-status-chip')?.textContent).toContain('Connected');
    expect(element.querySelector('hch-status-chip mat-icon')?.textContent).toContain(
      'check_circle',
    );
    expect(element.textContent).toContain('Last synced');
    expect(element.textContent).not.toContain('Never');
  });

  it.each([
    [NEEDS_ATTENTION_CONNECTION, 'Needs attention', 'warning'],
    [DISCONNECTED_CONNECTION, 'Disconnected', 'link_off'],
  ])('shows status as text and an icon, not colour alone (%#)', (connection, label, icon) => {
    const { element } = render(connection);
    const chip = element.querySelector('hch-status-chip');

    expect(chip?.textContent).toContain(label);
    expect(chip?.textContent).toContain(icon);
  });

  it('says "Never" when the connection has not synced and names an unnamed account', () => {
    const { element } = render(make_connection_view({ last_sync_at: null, account_label: null }));

    expect(element.textContent).toContain('Never');
    expect(element.textContent).toContain('Unnamed account');
  });

  it('shows the last error when there is one and nothing when there is not', () => {
    const with_error = render(NEEDS_ATTENTION_CONNECTION);
    expect(with_error.element.textContent).toContain('Last error');
    expect(with_error.element.textContent).toContain(
      'The provider rejected the stored credentials.',
    );
    TestBed.resetTestingModule();

    const without_error = render(CONNECTED_CONNECTION);
    expect(without_error.element.textContent).not.toContain('Last error');
  });

  it('is read-only without permissions: no action buttons at all', () => {
    const { element } = render(CONNECTED_CONNECTION);

    expect(element.querySelectorAll('button')).toHaveLength(0);
  });

  it('offers only "Sync now" to a user who can sync but not manage', () => {
    const { button, element } = render(CONNECTED_CONNECTION, { can_sync: true });

    expect(button('sync')).not.toBeNull();
    expect(element.querySelectorAll('button')).toHaveLength(1);
  });

  it('offers test, replace and disconnect to a manager, and sync as well when permitted', () => {
    const { button } = render(CONNECTED_CONNECTION, { can_manage: true, can_sync: true });

    expect(button('sync')).not.toBeNull();
    expect(button('test')).not.toBeNull();
    expect(button('replace')).not.toBeNull();
    expect(button('disconnect')).not.toBeNull();
  });

  it('does not offer sync for a connection that cannot sync', () => {
    const { button } = render(NEEDS_ATTENTION_CONNECTION, { can_manage: true, can_sync: true });

    expect(button('sync')).toBeNull();
    expect(button('test')).not.toBeNull();
    expect(button('replace')).not.toBeNull();
  });

  it('only offers to replace credentials once disconnected (to reconnect)', () => {
    const { button } = render(DISCONNECTED_CONNECTION, { can_manage: true, can_sync: true });

    expect(button('replace')).not.toBeNull();
    expect(button('sync')).toBeNull();
    expect(button('test')).toBeNull();
    expect(button('disconnect')).toBeNull();
  });

  it('names the connection in each button so repeated cards stay distinguishable', () => {
    const { button } = render(CONNECTED_CONNECTION, { can_manage: true, can_sync: true });

    expect(button('sync')?.getAttribute('aria-label')).toBe(
      'Sync now: Metro Youth Soccer Assignor',
    );
    expect(button('disconnect')?.getAttribute('aria-label')).toBe(
      'Disconnect: Metro Youth Soccer Assignor',
    );
  });

  it('emits the connection for each action', () => {
    const { fixture, button } = render(CONNECTED_CONNECTION, { can_manage: true, can_sync: true });
    const component = fixture.componentInstance;
    const emitted: string[] = [];
    component.sync_requested.subscribe((value) => emitted.push(`sync:${value.connection_id}`));
    component.test_requested.subscribe((value) => emitted.push(`test:${value.connection_id}`));
    component.replace_requested.subscribe((value) =>
      emitted.push(`replace:${value.connection_id}`),
    );
    component.disconnect_requested.subscribe((value) =>
      emitted.push(`disconnect:${value.connection_id}`),
    );

    button('sync')?.click();
    button('test')?.click();
    button('replace')?.click();
    button('disconnect')?.click();

    expect(emitted).toEqual(['sync:conn-1', 'test:conn-1', 'replace:conn-1', 'disconnect:conn-1']);
  });

  it('disables every button while an action runs and marks the running one busy', () => {
    const { button, element } = render(CONNECTED_CONNECTION, {
      can_manage: true,
      can_sync: true,
      busy_action: ConnectionAction.SYNC,
    });

    for (const control of Array.from(element.querySelectorAll('button'))) {
      expect(control.disabled).toBe(true);
    }
    expect(button('sync')?.getAttribute('aria-busy')).toBe('true');
    expect(button('sync')?.querySelector('mat-progress-spinner')).not.toBeNull();
    expect(button('test')?.querySelector('mat-progress-spinner')).toBeNull();
  });
});
