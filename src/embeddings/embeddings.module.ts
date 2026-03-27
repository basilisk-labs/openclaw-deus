import { Global, Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { SimilarityService } from './similarity.service';

@Global()
@Module({
  providers: [EmbeddingsService, SimilarityService],
  exports: [EmbeddingsService, SimilarityService],
})
export class EmbeddingsModule {}
