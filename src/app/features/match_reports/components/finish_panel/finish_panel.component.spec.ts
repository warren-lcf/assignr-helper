import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ReportStatus } from '../../enums/report_status.enum';
import { IncidentType } from '../../enums/incident_type.enum';
import { READY_REPORT, make_incident, make_report } from '../../mocks/match_report.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IMatchReportView } from '../../models/match_report_view.model';
import { IReportBlocker } from '../../models/report_blocker.model';
import { FinishPanelComponent } from './finish_panel.component';

interface IRenderOptions {
  report?: IMatchReportView;
  pending_count?: number;
  is_busy?: boolean;
  blockers?: IReportBlocker[];
}

function render(options: IRenderOptions = {}) {
  TestBed.configureTestingModule({
    imports: [FinishPanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(FinishPanelComponent);
  fixture.componentRef.setInput('report', options.report ?? make_report());
  fixture.componentRef.setInput('home_name', 'Lions');
  fixture.componentRef.setInput('away_name', 'Tigers');
  fixture.componentRef.setInput('pending_count', options.pending_count ?? 0);
  fixture.componentRef.setInput('is_busy', options.is_busy ?? false);
  fixture.componentRef.setInput('blockers', options.blockers ?? []);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const events: string[] = [];
  fixture.componentInstance.mark_ready_requested.subscribe(() => events.push('mark_ready'));
  fixture.componentInstance.reopen_requested.subscribe(() => events.push('reopen'));
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (id: string) => by_testid(id)?.textContent?.trim();
  const open = () => {
    by_testid('finish-open')?.click();
    fixture.detectChanges();
  };
  return { fixture, element, events, by_testid, text, open };
}

describe('FinishPanelComponent', () => {
  describe('a report being written', () => {
    it('starts as a single big "Finish report" button, with no summary yet', () => {
      const { by_testid, element } = render();

      expect(by_testid('finish-open')?.textContent).toContain('Finish report');
      expect(by_testid('finish-summary')).toBeNull();
      expect(element.querySelector('hch-banner')).toBeNull();
    });

    it('shows the summary once Finish report is pressed, and the button goes', () => {
      const { by_testid, open } = render({
        report: make_report({ home_score: 2, away_score: 1 }),
      });

      open();

      expect(by_testid('finish-summary')).not.toBeNull();
      expect(by_testid('finish-open')).toBeNull();
      expect(by_testid('finish-mark-ready')).not.toBeNull();
    });

    it('shows the final score, with a dash for a score not entered', () => {
      const { text, open } = render({ report: make_report({ home_score: 2, away_score: null }) });

      open();

      expect(text('finish-score-home')).toBe('2');
      expect(text('finish-score-away')).toBe('–');
    });

    it('counts the cards for each team on the client, the three kinds on their own lines', () => {
      const { text, open } = render({
        report: make_report({
          incidents: [
            ...READY_REPORT.incidents,
            make_incident({
              incident_id: 'inc-3',
              idempotency_key: 'key-ccccccccccc3',
              incident_type: IncidentType.SECOND_YELLOW,
            }),
          ],
        }),
      });

      open();

      expect(text('finish-cards-home-yellow')).toBe('1');
      expect(text('finish-cards-home-second-yellow')).toBe('1');
      expect(text('finish-cards-home-red')).toBe('0');
      expect(text('finish-cards-away-yellow')).toBe('0');
      expect(text('finish-cards-away-second-yellow')).toBe('0');
      expect(text('finish-cards-away-red')).toBe('1');
    });

    it('does not count a second yellow as a yellow or as a red', () => {
      const { text, open } = render({
        report: make_report({
          incidents: [make_incident({ incident_type: IncidentType.SECOND_YELLOW })],
        }),
      });

      open();

      expect(text('finish-cards-home-yellow')).toBe('0');
      expect(text('finish-cards-home-second-yellow')).toBe('1');
      expect(text('finish-cards-home-red')).toBe('0');
    });

    it('says "No cards" for a team without any', () => {
      const { text, by_testid, open } = render({
        report: make_report({ home_score: 0, away_score: 0 }),
      });

      open();

      expect(text('finish-cards-home-none')).toBe('No cards');
      expect(text('finish-cards-away-none')).toBe('No cards');
      expect(by_testid('finish-cards-home-yellow')).toBeNull();
    });

    it('names each team above its cards', () => {
      const { text, open } = render({ report: READY_REPORT });

      open();

      expect(text('finish-cards-home')).toContain('Lions');
      expect(text('finish-cards-away')).toContain('Tigers');
    });

    it('lists what is still missing', () => {
      const { text, open } = render({ report: make_report() });

      open();

      expect(text('finish-missing')).toContain('Still missing');
      expect(text('finish-missing')).toContain('Enter the final score for Lions.');
      expect(text('finish-missing')).toContain('Enter the final score for Tigers.');
    });

    it('lists nothing as missing once both scores are in', () => {
      const { by_testid, open } = render({ report: make_report({ home_score: 0, away_score: 0 }) });

      open();

      expect(by_testid('finish-missing')).toBeNull();
    });

    it('asks for Mark ready with a single press', () => {
      const { by_testid, events, open } = render({
        report: make_report({ home_score: 1, away_score: 0 }),
      });
      open();

      by_testid('finish-mark-ready')?.click();

      expect(events).toEqual(['mark_ready']);
    });

    it('can be marked ready even with a score missing, since the server decides', () => {
      const { by_testid, open } = render();

      open();

      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(false);
    });

    it('keeps Mark ready disabled while one change is still saving, and says why', () => {
      const { by_testid, text, open } = render({ pending_count: 1 });

      open();

      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(true);
      expect(text('finish-waiting')).toBe(
        '1 change is still saving. You can mark the report ready once it is saved.',
      );
    });

    it('says how many changes are still saving', () => {
      const { text, open } = render({ pending_count: 3 });

      open();

      expect(text('finish-waiting')).toBe(
        '3 changes are still saving. You can mark the report ready once they are saved.',
      );
    });

    it('shows no waiting note, and enables Mark ready, when nothing is waiting', () => {
      const { by_testid, open } = render({ pending_count: 0 });

      open();

      expect(by_testid('finish-waiting')).toBeNull();
      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables Mark ready while it is in flight', () => {
      const { by_testid, open } = render({ is_busy: true });

      open();

      const button = by_testid('finish-mark-ready') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
    });

    it('lists the blockers the server gave, as an alert', () => {
      const { by_testid, element, open } = render({
        blockers: [
          { path: 'home_score', message: 'Enter the final score for Lions.' },
          { path: 'incidents[x].team_side', message: 'Card 1 needs a team.' },
        ],
      });

      open();

      expect(by_testid('finish-blockers')?.getAttribute('role')).toBe('alert');
      const items = Array.from(element.querySelectorAll('[data-testid="finish-blocker"]'), (item) =>
        item.textContent?.trim(),
      );
      expect(items).toEqual(['Enter the final score for Lions.', 'Card 1 needs a team.']);
    });

    it('shows no blocker box when there are none', () => {
      const { by_testid, open } = render();

      open();

      expect(by_testid('finish-blockers')).toBeNull();
    });
  });

  describe('a ready report', () => {
    it('shows a calm banner saying it stays in this app, and the summary without pressing anything', () => {
      const { by_testid, text } = render({ report: READY_REPORT });

      expect(by_testid('finish-ready-banner')?.textContent).toContain('Ready');
      expect(by_testid('finish-ready-banner')?.textContent).toContain(
        'Reports stay in this app for now.',
      );
      expect(text('finish-score-home')).toBe('2');
      expect(text('finish-score-away')).toBe('1');
    });

    it('offers no Mark ready, no missing list and no blockers', () => {
      const { by_testid } = render({
        report: READY_REPORT,
        blockers: [{ path: 'home_score', message: 'x' }],
      });

      expect(by_testid('finish-mark-ready')).toBeNull();
      expect(by_testid('finish-open')).toBeNull();
      expect(by_testid('finish-missing')).toBeNull();
      expect(by_testid('finish-blockers')).toBeNull();
    });

    it('offers Reopen to edit, which asks the host to reopen', () => {
      const { by_testid, events } = render({ report: READY_REPORT });

      by_testid('finish-reopen')?.click();

      expect(events).toEqual(['reopen']);
    });

    it('disables Reopen while it is in flight', () => {
      const { by_testid } = render({ report: READY_REPORT, is_busy: true });

      expect((by_testid('finish-reopen') as HTMLButtonElement).disabled).toBe(true);
    });

    it.each([
      [ReportStatus.SUBMITTED, 'Sent'],
      [ReportStatus.NOT_SUPPORTED, 'Kept in this app'],
    ])('says %s in the banner and cannot be reopened', (status, title) => {
      const { by_testid } = render({ report: { ...READY_REPORT, status } });

      expect(by_testid('finish-ready-banner')?.textContent).toContain(title);
      expect(by_testid('finish-reopen')).toBeNull();
    });
  });
});
