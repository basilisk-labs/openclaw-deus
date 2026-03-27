import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { EvaluateActionDto } from './dto/evaluate-action.dto';

@Controller('policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateActionDto) {
    const result = await this.policy.evaluateAction(dto);
    if (result.isErr()) throw new BadRequestException(result.error.message);
    return result.value;
  }
}
