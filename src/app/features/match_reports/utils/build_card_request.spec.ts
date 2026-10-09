import { EMPTY_CARD_DRAFT } from '../constants/empty_card_draft.constant';
import { IncidentType } from '../enums/incident_type.enum';
import { ReasonCode } from '../enums/reason_code.enum';
import { TeamSide } from '../enums/team_side.enum';
import { ICardDraft } from '../models/card_draft.model';
import { build_card_request, parse_jersey_number } from './build_card_request';

const COMPLETE: ICardDraft = {
  ...EMPTY_CARD_DRAFT,
  team_side: TeamSide.AWAY,
  incident_type: IncidentType.RED,
  jersey_digits: '10',
  reason_code: ReasonCode.VIOLENT_CONDUCT,
};

describe('parse_jersey_number', () => {
  it('reads the typed digits as a number', () => {
    expect(parse_jersey_number({ jersey_digits: '7', no_number: false })).toBe(7);
    expect(parse_jersey_number({ jersey_digits: '99', no_number: false })).toBe(99);
    expect(parse_jersey_number({ jersey_digits: '0', no_number: false })).toBe(0);
  });

  it('is null with no digits or when "No number" was chosen', () => {
    expect(parse_jersey_number({ jersey_digits: '', no_number: false })).toBeNull();
    expect(parse_jersey_number({ jersey_digits: '12', no_number: true })).toBeNull();
  });

  it('is null for digits outside 0 to 99', () => {
    expect(parse_jersey_number({ jersey_digits: '100', no_number: false })).toBeNull();
    expect(parse_jersey_number({ jersey_digits: 'ab', no_number: false })).toBeNull();
  });
});

describe('build_card_request', () => {
  it('builds the request from a finished draft and the minute', () => {
    expect(build_card_request(COMPLETE, 62, 'fixed-key-000001')).toEqual({
      idempotency_key: 'fixed-key-000001',
      team_side: TeamSide.AWAY,
      incident_type: IncidentType.RED,
      jersey_number: 10,
      minute: 62,
      reason_code: 'VIOLENT_CONDUCT',
      notes: null,
    });
  });

  it('sends no number and no reason when none were chosen', () => {
    const request = build_card_request(
      { ...COMPLETE, jersey_digits: '', reason_code: null },
      5,
      'fixed-key-000001',
    );

    expect(request).toMatchObject({ jersey_number: null, reason_code: null });
  });

  it('generates a fresh key when none is given', () => {
    const first = build_card_request(COMPLETE, 1);
    const second = build_card_request(COMPLETE, 1);

    expect(first?.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
    expect(first?.idempotency_key).not.toBe(second?.idempotency_key);
  });

  it('builds nothing while the team or the card is missing', () => {
    expect(build_card_request({ ...COMPLETE, team_side: null }, 1)).toBeNull();
    expect(build_card_request({ ...COMPLETE, incident_type: null }, 1)).toBeNull();
    expect(build_card_request(EMPTY_CARD_DRAFT, 1)).toBeNull();
  });
});
