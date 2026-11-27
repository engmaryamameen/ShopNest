import { authDestination } from './auth-destination';

describe('authentication destination', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'])('sends %s to the admin dashboard', (role) => {
    expect(authDestination(role, '/shop')).toBe('/admin');
  });

  it('preserves a customer return destination and rejects external URLs', () => {
    expect(authDestination('CUSTOMER', '/cart')).toBe('/cart');
    expect(authDestination('CUSTOMER', 'https://example.com')).toBe('/');
  });
});
