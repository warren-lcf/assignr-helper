import { is_plausible_email } from './is_plausible_email';

describe('is_plausible_email', () => {
  it.each(['a@b.co', 'first.last+tag@mail.example.com', 'x_y@sub.domain.org'])(
    'accepts %s',
    (value) => {
      expect(is_plausible_email(value)).toBe(true);
    },
  );

  it.each([
    '',
    'plain',
    'no-at.example.com',
    'two@@example.com',
    'a b@example.com',
    'a@nodot',
    'a@b.c',
    '<a@b.co>',
    'a,b@example.com',
  ])('rejects %s', (value) => {
    expect(is_plausible_email(value)).toBe(false);
  });

  it('rejects an address longer than the limit', () => {
    expect(is_plausible_email(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});
