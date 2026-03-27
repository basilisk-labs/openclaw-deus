import { IsString, IsNotEmpty, IsNumber, Min, Max, IsArray, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { BELIEF_CLASSES, DECAY_MODES, BeliefClass, DecayMode } from '../../common/types/belief.types';

export class CreateBeliefDto {
  @IsString() @IsNotEmpty()
  content!: string;

  @IsNumber() @Min(0) @Max(1)
  confidence!: number;

  @IsArray() @IsString({ each: true })
  evidence_set!: string[];

  @IsString()
  source_type!: string;

  @IsString()
  belief_class!: BeliefClass;

  @IsString()
  decay_mode!: DecayMode;

  @IsNumber() @Min(0) @Max(1)
  confidence_floor!: number;

  @IsNumber() @Min(0) @Max(1)
  review_threshold!: number;

  @IsString()
  context_scope!: string;

  @IsOptional() @IsString()
  ontological_anchor?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  inference_trace?: string[];

  @IsOptional() @IsBoolean()
  archivable?: boolean;
}
