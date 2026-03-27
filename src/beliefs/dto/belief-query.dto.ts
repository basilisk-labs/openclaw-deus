import { IsOptional, IsString } from 'class-validator';
import { BeliefClass, BeliefStatus } from '../../common/types/belief.types';
import { PaginationDto } from '../../common/types/pagination.types';

export class BeliefQueryDto extends PaginationDto {
  @IsOptional() @IsString()
  class?: BeliefClass;

  @IsOptional() @IsString()
  status?: BeliefStatus;

  @IsOptional() @IsString()
  scope?: string;
}
