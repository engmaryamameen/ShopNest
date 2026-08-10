import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReverseGeocodeQueryDto } from './dto/reverse-geocode-query.dto';
import { LocationSuggestionsQueryDto } from './dto/location-suggestions-query.dto';
import { LocationService } from './location.service';

@ApiTags('location')
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('reverse')
  @ApiOperation({ summary: 'Convert coordinates into a delivery-area label' })
  reverse(@Query() query: ReverseGeocodeQueryDto) {
    return this.locationService.reverse(query.latitude, query.longitude);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Search delivery addresses in Punjab, Pakistan' })
  suggestions(@Query() query: LocationSuggestionsQueryDto) {
    return this.locationService.search(query.query);
  }
}
