import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Public } from "../auth/auth.guard";
import { AdapterService } from "./adapter.service";
import {
  AdapterImportBeliefsSnapshotRequest,
  AdapterImportLogBatchRequest,
} from "./adapter.types";
import {
  DatabaseError,
  DomainError,
  ValidationError,
} from "../common/types/result.types";

@Public()
@Controller("adapter/v1")
export class AdapterController {
  constructor(private readonly adapter: AdapterService) {}

  @Get("health")
  async getHealth() {
    return this.adapter.getHealth();
  }

  @Post("import/log-batch")
  async importLogBatch(@Body() dto: AdapterImportLogBatchRequest) {
    try {
      return await this.adapter.importLogBatch(dto);
    } catch (error) {
      throw this.mapHttpError(error, "Failed to import log batch.");
    }
  }

  @Post("import/beliefs-snapshot")
  async importBeliefsSnapshot(
    @Body() dto: AdapterImportBeliefsSnapshotRequest,
  ) {
    try {
      return await this.adapter.importBeliefsSnapshot(dto);
    } catch (error) {
      throw this.mapHttpError(error, "Failed to import beliefs snapshot.");
    }
  }

  @Get("world-model/latest")
  async getLatestWorldModel() {
    try {
      return await this.adapter.getLatestWorldModel();
    } catch (error) {
      throw this.mapHttpError(error, "Failed to read world model.");
    }
  }

  @Get("metrics/latest")
  async getLatestMetrics() {
    try {
      return await this.adapter.getLatestMetrics();
    } catch (error) {
      throw this.mapHttpError(error, "Failed to read metrics.");
    }
  }

  @Get("diagnosis/latest")
  async getLatestDiagnosis() {
    try {
      return await this.adapter.getLatestDiagnosis();
    } catch (error) {
      throw this.mapHttpError(error, "Failed to read diagnosis.");
    }
  }

  private mapHttpError(error: unknown, fallbackMessage: string) {
    if (error instanceof ValidationError) {
      return new BadRequestException(error.message || fallbackMessage);
    }

    if (error instanceof DatabaseError) {
      return new ServiceUnavailableException(error.message || fallbackMessage);
    }

    if (error instanceof DomainError) {
      return new InternalServerErrorException(error.message || fallbackMessage);
    }

    return new InternalServerErrorException(
      error instanceof Error ? error.message : fallbackMessage,
    );
  }
}
