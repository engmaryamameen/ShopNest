import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  }

  /** First address a user adds becomes their default automatically. The
   * row lock serializes this against a concurrent first-address create
   * from the same user (double-submit) — same pattern as setDefault. */
  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Address" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      const count = await tx.address.count({ where: { userId } });
      return tx.address.create({ data: { userId, ...dto, isDefault: count === 0 } });
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.owned(userId, addressId);
    return this.prisma.address.update({ where: { id: addressId }, data: dto });
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.owned(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  /** Locks the user's address rows before flipping isDefault — same
   * "lock + partial unique index" discipline as the cart-row-lock
   * pattern elsewhere in this app. */
  async setDefault(userId: string, addressId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Address" WHERE "userId" = ${userId}::uuid FOR UPDATE`;
      const address = await tx.address.findUnique({ where: { id: addressId } });
      if (!address || address.userId !== userId) throw new NotFoundException('Address not found');

      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  private async owned(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) throw new NotFoundException('Address not found');
  }
}
