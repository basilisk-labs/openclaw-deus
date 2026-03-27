import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { AdapterService } from './adapter.service';
import {
  AdapterImportBeliefsSnapshotRequest,
  AdapterImportLogBatchRequest,
} from './adapter.types';

@Public()
@Controller('adapter/v1')
export class AdapterController {
  constructor(private readonly adapter: AdapterService) {}

  @Get('health')
  async getHealth() {
    return this.adapter.getHealth();
  }

  @Post('import/log-batch')
  async importLogBatch(@Body() dto: AdapterImportLogBatchRequest) {
    try {
      return await this.adapter.importLogBatch(dto);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to import log batch.',
      );
    }
  }

  @Post('import/beliefs-snapshot')
  async importBeliefsSnapshot(
    @Body() dto: AdapterImportBeliefsSnapshotRequest,
  ) {
    try {
      return await this.adapter.importBeliefsSnapshot(dto);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to import beliefs snapshot.',
      );
    }
  }

  @Get('world-model/latest')
  async getLatestWorldModel() {
    try {
      return await this.adapter.getLatestWorldModel();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to read world model.',
      );
    }
  }

  @Get('metrics/latest')
  async getLatestMetrics() {
    try {
      return await this.adapter.getLatestMetrics();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to read metrics.',
      );
    }
  }

  @Get('diagnosis/latest')
  async getLatestDiagnosis() {
    try {
      return await this.adapter.getLatestDiagnosis();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to read diagnosis.',
      );
    }
  }
}
