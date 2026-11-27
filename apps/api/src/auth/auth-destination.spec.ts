import { Role } from '@prisma/client';
import { authDestination } from './auth-destination';

describe('authentication destination', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])('sends %s to the dashboard', (role) => {
    expect(authDestination(role, '/shop')).toBe('/admin');
  });

  it('keeps the customer return destination', () => {
    expect(authDestination(Role.CUSTOMER, '/cart')).toBe('/cart');
  });
});
