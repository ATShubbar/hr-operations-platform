import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema, type SearchResponse } from '@hr/contracts';
import { RequirePermission } from '../../../auth/permissions.decorator';
import { SearchService } from '../application/search.service';

// GET /search?q= (ADR-015). `search.read` admits the caller; every result is
// gated inside the service by the caller's own access to it. A query under two
// characters (or over 100) finds nothing rather than erroring — the box calls
// this as the user types.
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @RequirePermission('search.read')
  @Get()
  async find(@Query() query: unknown): Promise<SearchResponse> {
    const parsed = searchQuerySchema.safeParse(query);
    if (!parsed.success) return { hits: [], truncated: false };
    return this.search.search(parsed.data.q);
  }
}
