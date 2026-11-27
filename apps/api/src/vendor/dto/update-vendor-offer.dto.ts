import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { OfferStatus } from '@prisma/client';
import { CreateVendorOfferDto } from './create-vendor-offer.dto';

// Stock is intentionally not editable here — every stock change goes
// through PATCH .../inventory (a delta + a reason), never a bare "set to
// N" on the offer itself, so it can never happen without a matching
// InventoryAdjustment row.
export class UpdateVendorOfferDto extends PartialType(OmitType(CreateVendorOfferDto, ['productId', 'stockQuantity'] as const)) {
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE'] satisfies OfferStatus[])
  status?: OfferStatus;
}
