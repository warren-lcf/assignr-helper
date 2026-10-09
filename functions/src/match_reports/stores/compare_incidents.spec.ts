import { describe, expect, it } from 'vitest';
import { make_contract_incident } from './contracts/make_contract_match_report.js';
import { compare_incidents } from './compare_incidents.js';

describe('compare_incidents', () => {
  it('orders by created_at first', () => {
    const early = make_contract_incident('z', { created_at: 1 });
    const late = make_contract_incident('a', { created_at: 2 });

    expect(compare_incidents(early, late)).toBeLessThan(0);
    expect(compare_incidents(late, early)).toBeGreaterThan(0);
  });

  it('breaks a tie by incident id', () => {
    const a = make_contract_incident('a', { created_at: 5 });
    const b = make_contract_incident('b', { created_at: 5 });

    expect(compare_incidents(a, b)).toBeLessThan(0);
    expect(compare_incidents(b, a)).toBeGreaterThan(0);
  });

  it('treats the same incident as equal', () => {
    const a = make_contract_incident('a');

    expect(compare_incidents(a, { ...a })).toBe(0);
  });

  it('sorts a list oldest first', () => {
    const sorted = [
      make_contract_incident('c', { created_at: 3 }),
      make_contract_incident('b', { created_at: 1 }),
      make_contract_incident('a', { created_at: 1 }),
    ].sort(compare_incidents);

    expect(sorted.map((incident) => incident.incident_id)).toEqual(['a', 'b', 'c']);
  });
});
