import { IncidentType } from '../enums/incident_type.enum';
import { IIncidentTypePresentation } from '../models/incident_type_presentation.model';

/** Words, icon and tint for each kind of incident: the words and icon carry the meaning, the tint only helps. */
export const INCIDENT_TYPE_PRESENTATION: Readonly<Record<IncidentType, IIncidentTypePresentation>> =
  {
    [IncidentType.YELLOW]: {
      label: 'Yellow card',
      icon: 'crop_portrait',
      accent: 'var(--hch-sys-warning-container)',
    },
    [IncidentType.SECOND_YELLOW]: {
      label: 'Second yellow',
      icon: 'style',
      accent: 'var(--hch-sys-warning-container)',
    },
    [IncidentType.RED]: {
      label: 'Red card',
      icon: 'report',
      accent: 'var(--mat-sys-error-container)',
    },
    [IncidentType.OTHER]: {
      label: 'Other incident',
      icon: 'flag',
      accent: 'var(--mat-sys-surface-container-high)',
    },
  };

/** The card kinds the "Add a card" panel offers, in order. */
export const CARD_CHOICES: readonly IncidentType[] = [
  IncidentType.YELLOW,
  IncidentType.SECOND_YELLOW,
  IncidentType.RED,
];
