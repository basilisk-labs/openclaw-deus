import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ActivityType } from '../../common/types/memory.types';

export class LogActivityDto {
  @IsString()
  type!: ActivityType;

  @IsString() @IsNotEmpty()
  description!: string;

  @IsOptional() @IsObject()
  context?: Record<string, unknown>;
}
