import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class EvaluateActionDto {
  @IsString()
  action_type!: string;

  @IsString() @IsNotEmpty()
  goal!: string;

  @IsOptional() @IsString()
  target?: string;

  @IsOptional() @IsBoolean()
  confirmed_by_human?: boolean;

  @IsOptional() @IsBoolean()
  external?: boolean;

  @IsOptional() @IsBoolean()
  destructive?: boolean;

  @IsOptional() @IsBoolean()
  belief_mutation?: boolean;

  @IsOptional() @IsString()
  urgency?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  dependencies?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  context_sources?: string[];
}
