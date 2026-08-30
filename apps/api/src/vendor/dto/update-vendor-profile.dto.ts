import { PartialType } from '@nestjs/swagger';
import { ApplyVendorDto } from './apply-vendor.dto';

// Slug isn't part of ApplyVendorDto at all (auto-derived from `name` at
// application time, same convention as Category/Product) so there's
// nothing to omit here — every field a vendor can set at application is
// also editable afterward, just optionally.
export class UpdateVendorProfileDto extends PartialType(ApplyVendorDto) {}
