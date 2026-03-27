import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class SearchMemoryDto {
  @IsString() @IsNotEmpty()
  q!: string;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  limit?: number;
}
