import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { INCIDENT_TYPE_PRESENTATION } from '../../constants/incident_type_presentation.constant';
import { REASON_LABEL } from '../../constants/reason_label.constant';
import { ReasonCode } from '../../enums/reason_code.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { IIncidentView } from '../../models/incident_view.model';

/**
 * The cards recorded so far: for each one the kind (icon and words), the team, the player number and the
 * minute, with a Remove button. Removing asks for no confirmation because the host offers Undo instead,
 * so a slip is one tap to put right.
 */
@Component({
  selector: 'app-recorded-cards',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, CardHeaderComponent],
  templateUrl: './recorded_cards.component.html',
  styleUrl: './recorded_cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordedCardsComponent {
  private readonly translation = inject(AppTranslationService);

  /** The cards on the report, in the order they were added. */
  public readonly incidents = input.required<readonly IIncidentView[]>();
  /** The home team's name. */
  public readonly home_name = input.required<string>();
  /** The away team's name. */
  public readonly away_name = input.required<string>();
  /** True when the report cannot be edited, so nothing can be removed. */
  public readonly disabled = input(false);

  /** The referee pressed Remove on this card. */
  public readonly remove_requested = output<IIncidentView>();

  public readonly presentation = INCIDENT_TYPE_PRESENTATION;
  /** "1 card" or "3 cards". */
  public readonly count_text = computed(() =>
    this.incidents().length === 1
      ? this.t('1 card')
      : this.t('{{count}} cards', { count: this.incidents().length }),
  );

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }

  /**
   * The name of the team a card belongs to.
   * @param incident The card.
   * @returns The team's name.
   */
  public team_name(incident: IIncidentView): string {
    return incident.team_side === TeamSide.HOME ? this.home_name() : this.away_name();
  }

  /**
   * The words for a card's reason.
   * @param incident The card.
   * @returns The translated reason, or null when there is none (or it is one this app does not know).
   */
  public reason_text(incident: IIncidentView): string | null {
    const known = Object.values(ReasonCode).find((reason) => reason === incident.reason_code);
    return known ? this.t(REASON_LABEL[known]) : null;
  }

  /**
   * The words for a card's player number.
   * @param incident The card.
   * @returns "#7", or "No number".
   */
  public number_text(incident: IIncidentView): string {
    return incident.jersey_number === null
      ? this.t('No number')
      : this.t('Number {{number}}', { number: incident.jersey_number });
  }

  /**
   * The words for a card's minute.
   * @param incident The card.
   * @returns "Minute 34", or an empty string when unknown.
   */
  public minute_text(incident: IIncidentView): string {
    return incident.minute === null ? '' : this.t('Minute {{minute}}', { minute: incident.minute });
  }
}
