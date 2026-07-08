import type { SourceReference, SourceType } from '@mnemosyne/schema';

export interface SourceArtifact {
  artifactId: string;
  path: string;
  sourceType: SourceType;
  contentHash: string;
}

export class SourceMapEngine {
  toReference(artifact: SourceArtifact): SourceReference {
    return {
      artifactId: artifact.artifactId,
      path: artifact.path,
      contentHash: artifact.contentHash,
      sourceType: artifact.sourceType,
    };
  }
}
