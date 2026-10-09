import { TestBed } from '@angular/core/testing';
import { USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { BARE_GAME, OPEN_GAME, make_game_view } from '../../../games/mocks/game_view.mock';
import { ReportStatus } from '../../enums/report_status.enum';
import { make_summary } from '../../mocks/match_report.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGameReportEntry } from '../../models/game_report_entry.model';
import { ReportGameRowComponent } from './report_game_row.component';

function render(entry: IGameReportEntry, can_open = true, viewer_zone?: string) {
  TestBed.configureTestingModule({
    imports: [ReportGameRowComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      ...(viewer_zone ? [{ provide: USER_DATE_TIMEZONE, useValue: () => viewer_zone }] : []),
    ],
  });
  const fixture = TestBed.createComponent(ReportGameRowComponent);
  fixture.componentRef.setInput('entry', entry);
  fixture.componentRef.setInput('can_open', can_open);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const opened: IGameReportEntry[] = [];
  fixture.componentInstance.open_requested.subscribe((value) => opened.push(value));
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (id: string) => by_testid(id)?.textContent?.trim();
  return { fixture, element, opened, by_testid, text };
}

describe('ReportGameRowComponent', () => {
  describe('the game', () => {
    it('shows the teams and the venue', () => {
      const { text, element } = render({ game: OPEN_GAME, report: null });

      expect(text('report-title-game-1')).toBe('Lions vs Tigers');
      expect(element.textContent).toContain('Field 3');
    });

    it('shows kick-off on the venue’s own clock with its zone', () => {
      const { text } = render({ game: OPEN_GAME, report: null }, true, 'Pacific/Honolulu');

      expect(text('report-time-game-1')).toMatch(/^9:00\s?AM CDT$/);
    });

    it('shows the calendar date as a weekday heading', () => {
      const { element } = render({ game: OPEN_GAME, report: null });

      expect(element.textContent).toContain('Saturday, Oct 10');
    });

    it('says when the date or teams are not known, and leaves out a missing venue', () => {
      const { text, element } = render({ game: BARE_GAME, report: null });

      expect(text('report-title-game-4')).toBe('Teams to be announced');
      expect(element.textContent).toContain('Date to be announced');
      expect(element.textContent).not.toContain('Venue:');
    });
  });

  describe('a game with no report', () => {
    it('says it needs a report, and offers Start report', () => {
      const { text, by_testid } = render({ game: OPEN_GAME, report: null });

      expect(text('report-status-game-1')).toContain('Needs a report');
      expect(by_testid('report-open-game-1')?.textContent?.trim()).toBe('Start report');
    });

    it('shows no score or card counts', () => {
      const { by_testid } = render({ game: OPEN_GAME, report: null });

      expect(by_testid('report-score-game-1')).toBeNull();
      expect(by_testid('report-yellow-game-1')).toBeNull();
    });

    it('names the button after the game', () => {
      const { by_testid } = render({ game: OPEN_GAME, report: null });

      expect(by_testid('report-open-game-1')?.getAttribute('aria-label')).toBe(
        'Start report: Lions vs Tigers',
      );
    });

    it('asks the host to open the game when pressed', () => {
      const entry: IGameReportEntry = { game: OPEN_GAME, report: null };
      const { by_testid, opened } = render(entry);

      by_testid('report-open-game-1')?.click();

      expect(opened).toEqual([entry]);
    });
  });

  describe('a game with a report', () => {
    const draft: IGameReportEntry = {
      game: OPEN_GAME,
      report: make_summary({
        game_id: 'game-1',
        status: ReportStatus.DRAFT,
        home_score: 1,
        away_score: null,
        yellow_count: 2,
        red_count: 0,
      }),
    };
    const ready: IGameReportEntry = {
      game: make_game_view({ game_id: 'game-2' }),
      report: make_summary({
        game_id: 'game-2',
        status: ReportStatus.READY,
        home_score: 3,
        away_score: 0,
        yellow_count: 1,
        red_count: 1,
      }),
    };

    it('shows a draft as in progress with Continue report, a dash for a missing score', () => {
      const { text, by_testid } = render(draft);

      expect(text('report-status-game-1')).toContain('In progress');
      expect(text('report-score-game-1')).toBe('1 – –');
      expect(by_testid('report-open-game-1')?.textContent?.trim()).toBe('Continue report');
    });

    it('shows a finished report as Ready with View report', () => {
      const { text, by_testid } = render(ready);

      expect(text('report-status-game-2')).toContain('Ready');
      expect(by_testid('report-open-game-2')?.textContent?.trim()).toBe('View report');
    });

    it('shows the score and the card counts', () => {
      const { text } = render(ready);

      expect(text('report-score-game-2')).toBe('3 – 0');
      expect(text('report-yellow-game-2')).toBe('1');
      expect(text('report-red-game-2')).toBe('1');
    });

    it('labels the counts Yellow cards and Red cards, which is what the summary counts (yellows include second yellows)', () => {
      const { element } = render(ready);

      const labels = Array.from(element.querySelectorAll('.report-row__fact dt'), (label) =>
        label.textContent?.trim(),
      );

      expect(labels).toEqual(['Score', 'Yellow cards', 'Red cards']);
    });

    it('shows 0 cards as 0, not as missing', () => {
      const { text } = render({
        game: OPEN_GAME,
        report: make_summary({ home_score: 0, away_score: 0 }),
      });

      expect(text('report-score-game-1')).toBe('0 – 0');
      expect(text('report-yellow-game-1')).toBe('0');
      expect(text('report-red-game-1')).toBe('0');
    });

    it.each([
      [ReportStatus.SUBMITTED, 'Sent'],
      [ReportStatus.NOT_SUPPORTED, 'Kept in this app'],
    ])('words a %s report as "%s"', (status, label) => {
      const { text } = render({ game: OPEN_GAME, report: make_summary({ status }) });

      expect(text('report-status-game-1')).toContain(label);
    });

    it('draws the status with an icon as well as words', () => {
      const { by_testid } = render(ready);

      expect(
        by_testid('report-status-game-2')?.querySelector('mat-icon')?.textContent?.trim(),
      ).toBe('check_circle');
    });
  });

  it('offers no button to someone who may read reports but not write them', () => {
    const { by_testid } = render({ game: OPEN_GAME, report: null }, false);

    expect(by_testid('report-open-game-1')).toBeNull();
  });
});
