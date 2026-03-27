import { Module } from '@nestjs/common';
import { IntrospectionService } from './introspection.service';
import { IntrospectionController } from './introspection.controller';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { MemoryModule } from '../memory/memory.module';
import { WorldModelModule } from '../world-model/world-model.module';

@Module({
  imports: [BeliefsModule, MemoryModule, WorldModelModule],
  providers: [IntrospectionService],
  controllers: [IntrospectionController],
  exports: [IntrospectionService],
})
export class IntrospectionModule {}
