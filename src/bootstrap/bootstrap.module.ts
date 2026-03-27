import { Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { IntrospectionModule } from '../introspection/introspection.module';
import { WorldModelModule } from '../world-model/world-model.module';

@Module({
  imports: [IntrospectionModule, WorldModelModule],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
