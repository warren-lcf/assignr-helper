import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { BigNumpadComponent } from '@hch-shared-libraries/ui-kit/common/big_numpad';
import {
  ChoiceSelectionModeEnum,
  ChoiceTileColumnsEnum,
  ChoiceTileGroupComponent,
  IChoiceTile,
} from '@hch-shared-libraries/ui-kit/common/choice_tile_group';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { EMPTY_CARD_DRAFT } from '../../constants/empty_card_draft.constant';
import {
  CARD_CHOICES,
  INCIDENT_TYPE_PRESENTATION,
} from '../../constants/incident_type_presentation.constant';
import { JERSEY_MAX_DIGITS } from '../../constants/match_report_limits.constant';
import { REASON_CHOICES, REASON_LABEL } from '../../constants/reason_label.constant';
import { IncidentType } from '../../enums/incident_type.enum';
import { ReasonCode } from '../../enums/reason_code.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { IAddIncidentRequest } from '../../models/add_incident_request.model';
import { ICardDraft } from '../../models/card_draft.model';
import { build_card_request } from '../../utils/build_card_request';
import { compute_default_minute } from '../../utils/compute_default_minute';
import { MinutePickerComponent } from '../minute_picker/minute_picker.component';

/**
 * The "Add a card" panel: team, card, player number, minute and an optional reason, all on one screen
 * with big targets and no extra steps. Team and card are one tap each (ui-kit `hch-choice-tile-group`),
 * the player number is typed on the ui-kit `hch-big-numpad`, and the minute starts at the whole minutes
 * since kick-off. One primary "Add card" button, enabled once a team and a card are chosen, hands the
 * finished card to the host and clears the panel for the next one.
 */
@Component({
  selector: 'app-card-entry-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    CardHeaderComponent,
    BigNumpadComponent,
    ChoiceTileGroupComponent,
    MinutePickerComponent,
  ],
  templateUrl: './card_entry_panel.component.html',
  styleUrl: './card_entry_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardEntryPanelComponent {
  private readonly translation = inject(AppTranslationService);

  /** The home team's name. */
  public readonly home_name = input.required<string>();
  /** The away team's name. */
  public readonly away_name = input.required<string>();
  /** Kick-off, UTC milliseconds, or null when the game is not known. */
  public readonly kickoff_at = input<number | null>(null);
  /** True when the report cannot be edited. */
  public readonly disabled = input(false);
  /** True when the report already holds as many cards as it can. */
  public readonly is_full = input(false);

  /** A finished card, ready to be added. */
  public readonly card_added = output<IAddIncidentRequest>();

  public readonly selection_mode = ChoiceSelectionModeEnum.SINGLE;
  public readonly two_columns = ChoiceTileColumnsEnum.TWO;
  public readonly three_columns = ChoiceTileColumnsEnum.THREE;
  public readonly jersey_max_digits = JERSEY_MAX_DIGITS;
  public readonly reason_choices = REASON_CHOICES;

  /** The card being put together. */
  public readonly draft = signal<ICardDraft>(EMPTY_CARD_DRAFT);
  /** The time the default minute is measured against; refreshed on every tap so it never goes stale. */
  private readonly now_ms = signal(Date.now());

  /** The minute shown: the one the referee chose, otherwise whole minutes since kick-off. */
  public readonly minute = computed(
    () => this.draft().minute ?? compute_default_minute(this.kickoff_at(), this.now_ms()),
  );
  /** True once the card has what the backend needs: a team and a kind of card. */
  public readonly can_add = computed(
    () =>
      !this.disabled() &&
      !this.is_full() &&
      this.draft().team_side !== null &&
      this.draft().incident_type !== null,
  );
  public readonly team_options = computed<IChoiceTile[]>(() => [
    {
      value: TeamSide.HOME,
      label: this.t('{{team}} (home)', { team: this.home_name() }),
      icon: 'home',
    },
    {
      value: TeamSide.AWAY,
      label: this.t('{{team}} (away)', { team: this.away_name() }),
      icon: 'directions_bus',
    },
  ]);
  public readonly card_options = computed<IChoiceTile[]>(() =>
    CARD_CHOICES.map((type) => ({
      value: type,
      label: this.t(INCIDENT_TYPE_PRESENTATION[type].label),
      icon: INCIDENT_TYPE_PRESENTATION[type].icon,
      accent_token: INCIDENT_TYPE_PRESENTATION[type].accent,
    })),
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
   * The label of a reason chip.
   * @param reason The reason.
   * @returns Its translated name.
   */
  public reason_label(reason: ReasonCode): string {
    return this.t(REASON_LABEL[reason]);
  }

  /**
   * A team tile was chosen.
   * @param value The tile's value.
   * @returns Nothing.
   */
  public on_team_selected(value: string | readonly string[] | null): void {
    this.touch();
    this.draft.update((draft) => ({
      ...draft,
      team_side: Object.values(TeamSide).find((side) => side === value) ?? null,
    }));
  }

  /**
   * A card tile was chosen.
   * @param value The tile's value.
   * @returns Nothing.
   */
  public on_card_selected(value: string | readonly string[] | null): void {
    this.touch();
    this.draft.update((draft) => ({
      ...draft,
      incident_type: Object.values(IncidentType).find((type) => type === value) ?? null,
    }));
  }

  /**
   * The keypad's digits changed. Typing a number cancels "No number".
   * @param digits The digits typed so far.
   * @returns Nothing.
   */
  public on_digits_changed(digits: string): void {
    this.touch();
    this.draft.update((draft) => ({ ...draft, jersey_digits: digits, no_number: false }));
  }

  /**
   * "No number" was pressed: the player's number is unknown.
   * @returns Nothing.
   */
  public on_no_number(): void {
    this.touch();
    this.draft.update((draft) => ({ ...draft, jersey_digits: '', no_number: !draft.no_number }));
  }

  /**
   * "Clear" was pressed: wipe the digits.
   * @returns Nothing.
   */
  public on_clear_number(): void {
    this.touch();
    this.draft.update((draft) => ({ ...draft, jersey_digits: '', no_number: false }));
  }

  /**
   * The minute was changed by hand.
   * @param minute The chosen minute.
   * @returns Nothing.
   */
  public on_minute_changed(minute: number): void {
    this.touch();
    this.draft.update((draft) => ({ ...draft, minute }));
  }

  /**
   * A reason chip was pressed; pressing the chosen one again takes it back.
   * @param reason The reason.
   * @returns Nothing.
   */
  public on_reason_toggled(reason: ReasonCode): void {
    this.touch();
    this.draft.update((draft) => ({
      ...draft,
      reason_code: draft.reason_code === reason ? null : reason,
    }));
  }

  /**
   * "Add card" was pressed: hand over the finished card and clear the panel for the next one.
   * @returns Nothing.
   */
  public on_add(): void {
    if (!this.can_add()) return;
    this.touch();
    const request = build_card_request(this.draft(), this.minute());
    if (request === null) return;
    this.card_added.emit(request);
    this.draft.set(EMPTY_CARD_DRAFT);
  }

  private touch(): void {
    this.now_ms.set(Date.now());
  }
}
