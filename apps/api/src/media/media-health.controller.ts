import { Controller, Get } from '@nestjs/common';
import { MediaFetcherService, type MediaHealthSnapshot } from './media-fetcher.service.js';

/** Observability co bao ve boi auth global; snapshot khong chua locator hay secret. */
@Controller('health/media')
export class MediaHealthController {
  constructor(private readonly fetcher: MediaFetcherService) {}

  @Get()
  check(): MediaHealthSnapshot {
    return this.fetcher.health();
  }
}
