# Agent State Persistence Bug Fix

## Problem Description

**Issue**: Agent iteration counts and state variables were persisting across different user queries within the same session.

**Symptoms**:
- First query after server launch worked correctly
- Subsequent queries in the same session had incorrect iteration counts
- Session IDs continuously incremented but agent state carried over
- Agent behavior became unpredictable after multiple queries

## Root Cause

The bug was in the `get_or_create_agent_for_user()` function which cached LangGraph agent instances per user in memory:

```python
# PROBLEMATIC CODE (before fix)
user_agents = {}  # In-memory storage for user agents

def get_or_create_agent_for_user(user_id: int):
    if user_id not in user_agents:
        user_agents[user_id] = create_agent_graph()
    return user_agents[user_id]  # ❌ Reusing same agent instance
```

**Why this caused issues**:
1. **LangGraph State Persistence**: LangGraph agents maintain internal state between invocations
2. **Shared Agent Instance**: Multiple queries from the same user reused the same agent instance  
3. **State Contamination**: Previous query state (iteration counts, internal variables) carried over to new queries
4. **Session vs Agent Confusion**: New conversation IDs were created but the underlying agent retained old state

## Solution

**Changed to always create fresh agent instances**:

```python
# FIXED CODE (after fix)
def create_fresh_agent_for_user(user_id: int):
    """Create a fresh agent instance for a user to avoid state persistence issues
    
    LangGraph agents maintain internal state between invocations, which can cause:
    - Iteration counts to carry over from previous queries
    - State variables to persist across different conversations  
    - Unexpected behavior in multi-query sessions
    
    Creating a fresh agent for each request ensures clean state and proper iteration tracking.
    """
    logger.debug(f"Creating fresh agent instance for user {user_id}")
    return create_agent_graph()  # ✅ Fresh agent every time
```

## Changes Made

### 1. **Agent Creation Logic** (`mcp_agent/agent_logic.py`)
- ✅ Removed `user_agents` dictionary caching
- ✅ Renamed function to `create_fresh_agent_for_user()`
- ✅ Added comprehensive documentation about state persistence issues
- ✅ Added debug logging for agent creation

### 2. **Views Integration** (`mcp_agent/views.py`)
- ✅ Updated import to use new function name
- ✅ Updated function call to use fresh agent creation
- ✅ Added workflow start/end logging
- ✅ Added agent state initialization logging

### 3. **Documentation**
- ✅ Added clear comments explaining why caching is avoided
- ✅ Documented the state persistence problem
- ✅ Added debug logging for troubleshooting

## Performance Implications

**Trade-off**: Creating fresh agents for each request uses slightly more CPU/memory but:
- ✅ **Ensures Correctness**: No state contamination between queries
- ✅ **Predictable Behavior**: Each query starts with clean slate
- ✅ **Better Debugging**: Clear separation between different requests
- ✅ **Isolation**: User queries don't affect each other

**Impact**: Minimal - agent creation is fast and the benefits far outweigh the small overhead.

## Testing

After the fix, verify:

1. **First Query**: Should work as before (iteration starts at 0)
2. **Second Query**: Should also start at iteration 0 (not continue from previous)
3. **Multiple Users**: Each user's queries should be independent
4. **Session Persistence**: Conversation history still maintained in database
5. **Iteration Limits**: Should properly respect 10-iteration limit per query

## Monitoring

Check logs for these patterns:

```bash
# Agent creation (should appear for each query)
DEBUG: Creating fresh agent instance for user 123

# Workflow tracking  
INFO: Starting agent workflow for user 123, conversation 456
INFO: Agent workflow completed for user 123, final iteration: 2

# State initialization (should always show iteration=0)
DEBUG: Initialized fresh agent state: iteration=0, messages=1
```

## Related Files Modified

- `mcp_agent/agent_logic.py` - Agent creation logic
- `mcp_agent/views.py` - Integration with views
- `AGENT_STATE_BUG_FIX.md` - This documentation

## Future Considerations

If performance becomes an issue with many concurrent users, consider:
1. **Agent Pooling**: Maintain a pool of pre-created agents
2. **State Reset**: Develop a method to reset agent state instead of recreating
3. **Caching with TTL**: Cache agents with short time-to-live

For now, the fresh agent approach provides the best balance of correctness and simplicity.

## Validation

To confirm the fix worked:
1. Deploy the changes
2. Run multiple queries in the same session
3. Check logs for fresh agent creation
4. Verify iteration counts start at 0 for each query
5. Confirm no state bleeding between different user queries

The agent should now behave consistently across all queries, with proper iteration tracking and no state persistence issues. 