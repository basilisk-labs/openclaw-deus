import { IsString, IsNumber, Min, Max, IsArray, IsOptional, IsBoolean } from 'class-validator';
import { BeliefClass, BeliefStatus, DecayMode } from '../../common/types/belief.types';

export class UpdateBeliefDto {
  @IsOptional() @IsString()
  content?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  confidence?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  evidence_set?: string[];

  @IsOptional() @IsString()
  source_type?: string;

  @IsOptional() @IsString()
  belief_class?: BeliefClass;

  @IsOptional() @IsString()
  decay_mode?: DecayMode;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  confidence_floor?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  review_threshold?: number;

  @IsOptional() @IsString()
  context_scope?: string;

  @IsOptional() @IsString()
  status?: BeliefStatus;
}
