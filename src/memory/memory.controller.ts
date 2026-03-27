import { Controller, Get, Post, Query, Body, Param, BadRequestException } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryAggregationService } from './services/memory-aggregation.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { SearchMemoryDto } from './dto/search-memory.dto';

@Controller('memory')
export class MemoryController {
  constructor(
    private readonly memory: MemoryService,
    private readonly aggregation: MemoryAggregationService,
  ) {}

  @Post('activity')
  async logActivity(@Body() dto: LogActivityDto) {
    const result = await this.memory.logActivity(dto);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('search')
  async search(@Query() query: SearchMemoryDto) {
    const result = await this.memory.search(query.q, query.limit);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('entries')
  async getEntries(@Query('dayKey') dayKey?: string, @Query('days') days?: string) {
    if (dayKey) {
      const result = await this.memory.getEntriesByDay(dayKey);
      if (result.isErr()) throw new BadRequestException(result.error.message);
      return result.value;
    }
    const result = await this.memory.getRecentEntries(days ? parseInt(days, 10) : 7);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Post('aggregate')
  async aggregate(@Query('dayKey') dayKey?: string) {
    const result = await this.aggregation.aggregateDay(dayKey);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }

  @Get('daily/:dayKey')
  async getDailyMemory(@Param('dayKey') dayKey: string) {
    const result = await this.aggregation.getDailyMemory(dayKey);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
