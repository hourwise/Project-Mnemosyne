# MCP Tools

Initial governed tools:

- `almanac_status`
- `mnemosyne_inspect`
- `mnemosyne_negotiate_protocol`
- `almanac_search`
- `almanac_get_context_pack`
- `almanac_read_memory`
- `almanac_request_source_context`
- `almanac_write_memory`
- `almanac_append_journal`
- `almanac_report_conflict`
- `almanac_revalidate`

No raw filesystem tool is exposed to an agent. All memory tools require a
separate trusted operation context; authenticated identity is never accepted in
model-visible tool arguments. Missing or invalid context returns a deterministic
typed failure. Inspection and protocol negotiation are sanitized and do not
grant memory access.
