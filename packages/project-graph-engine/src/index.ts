import type { ProjectGraphEdge } from '@mnemosyne/schema';

export class ProjectGraphEngine {
  private readonly edges: ProjectGraphEdge[] = [];

  addEdge(edge: ProjectGraphEdge): void {
    this.edges.push(edge);
  }

  listEdges(): ProjectGraphEdge[] {
    return [...this.edges];
  }
}
