# Session Lifecycle

## Start

1. Load the Almanac.
2. Recheck source hashes.
3. Revalidate affected memories.
4. Decay stale memories.
5. Detect conflicts.
6. Build an initial context pack.
7. Expose warnings to the agent and user.

## During Session

1. Retrieve relevant memories for the current task.
2. Recover full source context only when needed.
3. Surface conflicts.
4. Store new facts as tentative unless verified.
5. Let Ananke govern project-changing actions.

## End

1. Summarise the session.
2. Record decisions and failed approaches.
3. Update task state and project graph.
4. Mark superseded memories.
5. Audit memory changes.
