export interface McpToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
}

export const almanacTools: McpToolDefinition[] = [
  { name: 'almanac_status', description: 'Return Almanac health and storage status.', readOnly: true },
  { name: 'almanac_search', description: 'Search governed memory records.', readOnly: true },
  { name: 'almanac_get_context_pack', description: 'Build a task-specific context pack.', readOnly: true },
  { name: 'almanac_read_memory', description: 'Read one governed memory record.', readOnly: true },
  { name: 'almanac_request_source_context', description: 'Recover source context for a memory.', readOnly: true },
  { name: 'almanac_write_memory', description: 'Create or update a memory record.', readOnly: false },
  { name: 'almanac_append_journal', description: 'Append to the governed session journal.', readOnly: false },
  { name: 'almanac_report_conflict', description: 'Record a surfaced conflict.', readOnly: false },
  { name: 'almanac_revalidate', description: 'Revalidate memories against current sources.', readOnly: false },
];
