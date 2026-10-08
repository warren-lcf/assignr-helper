import { describe, expect, it } from 'vitest';
import { make_recipient_greeting } from './make_recipient_greeting.js';

describe('make_recipient_greeting', () => {
  it.each([
    ['Sam Smith', 'Hi Sam,'],
    ['  Dana   Lee ', 'Hi Dana,'],
    ['Madonna', 'Hi Madonna,'],
    ['Zoë Müller', 'Hi Zoë,'],
  ])('greets %j as %j', (name, expected) => {
    expect(make_recipient_greeting(name)).toBe(expected);
  });

  it.each(['', '   '])('has no greeting for %j', (name) => {
    expect(make_recipient_greeting(name)).toBeNull();
  });
});
