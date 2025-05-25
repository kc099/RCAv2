# Text-to-SQL Agent Setup Guide

This guide explains how to set up and use the new LangGraph-powered text-to-SQL agent functionality.

## Prerequisites

1. **Anthropic API Key**: You need an API key from Anthropic to use Claude models
2. **Database Connection**: A configured database connection in the system
3. **SQL Notebook**: An active SQL notebook to work with

## Environment Setup

Add the following environment variable to your system or `.env` file:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Features

### 1. Natural Language to SQL Conversion
- Type natural language queries in the workbench
- The agent iteratively generates and refines SQL queries
- Automatic execution and result validation
- Conversation history tracking

### 2. Agent Capabilities
- **Schema Understanding**: Automatically analyzes your database schema
- **Iterative Refinement**: Improves queries based on execution results
- **Error Handling**: Fixes SQL errors and provides explanations
- **Context Awareness**: Maintains conversation context across queries

### 3. Integration Points
- **Workbench Integration**: Seamlessly integrated into the existing SQL workbench
- **Notebook Integration**: Generated SQL can be added directly to notebooks
- **Connection Management**: Works with existing database connections

## Usage

### Basic Usage
1. Open a SQL notebook in the workbench
2. Ensure you have an active database connection
3. Type your natural language query in the input field
4. Click "Ask Agent" or press Enter
5. Watch as the agent generates, executes, and refines SQL queries
6. Add successful queries to your notebook

### Example Queries
- "Show me all customers who made purchases in the last 30 days"
- "Calculate the average order value by product category"
- "Find the top 10 selling products this month"
- "List employees with the highest sales in each region"

### Advanced Features
- **Conversation History**: Previous queries and results are remembered
- **Schema Context**: Agent understands your database structure
- **Error Recovery**: Automatically fixes common SQL errors
- **Multi-iteration**: Complex queries may require multiple refinement steps

## API Endpoints

### Text-to-SQL Agent
- **URL**: `/mcp_agent/text-to-sql/`
- **Method**: POST
- **Parameters**:
  - `query`: Natural language query
  - `connection_id`: Database connection ID
  - `notebook_id`: SQL notebook ID
  - `conversation_id`: (Optional) Existing conversation ID

### Conversation Management
- **List Conversations**: `GET /mcp_agent/conversations/`
- **Get History**: `GET /mcp_agent/conversations/{id}/`

## Technical Architecture

### Components
1. **LangGraph State Machine**: Manages the agent workflow
2. **Anthropic Integration**: Uses Claude for SQL generation
3. **Database Integration**: Executes queries and retrieves results
4. **Conversation Management**: Tracks chat history and context

### Agent Workflow
1. **Input Processing**: Receives natural language query
2. **Schema Analysis**: Retrieves and analyzes database schema
3. **SQL Generation**: Uses LLM to generate initial SQL
4. **Execution**: Runs SQL against the database
5. **Result Analysis**: Evaluates results and errors
6. **Refinement**: Iteratively improves the query if needed
7. **Completion**: Returns final SQL and results

### State Management
- **AgentState**: Tracks conversation state, iterations, and context
- **Message History**: Maintains full conversation history
- **Error Handling**: Captures and recovers from errors
- **Iteration Limits**: Prevents infinite loops

## Configuration

### Agent Settings
- **Max Iterations**: Default 5 (configurable)
- **Model**: Claude 3 Opus (configurable)
- **Temperature**: Optimized for SQL generation
- **Context Window**: Manages schema and conversation context

### Database Support
- **MySQL**: Full support
- **PostgreSQL/Redshift**: Planned support
- **Schema Introspection**: Automatic table and column discovery

## Troubleshooting

### Common Issues
1. **API Key Not Set**: Ensure `ANTHROPIC_API_KEY` is configured
2. **Database Connection**: Verify active database connection
3. **Schema Access**: Ensure user has schema read permissions
4. **Query Complexity**: Very complex queries may hit iteration limits

### Error Messages
- **"Agent processing failed"**: Check API key and network connectivity
- **"Database connection not found"**: Verify connection ID and permissions
- **"Schema retrieval failed"**: Check database permissions
- **"Max iterations reached"**: Query may be too complex or ambiguous

### Debugging
- Check browser console for JavaScript errors
- Review Django logs for backend errors
- Verify database connection settings
- Test with simpler queries first

## Security Considerations

### Data Privacy
- Queries and schema information are sent to Anthropic's API
- Consider data sensitivity before using with production databases
- Review Anthropic's data usage policies

### Access Control
- Agent respects existing user permissions
- Database connections must be pre-configured
- Conversation history is user-specific

### Best Practices
- Use read-only database connections when possible
- Avoid sending sensitive data in natural language queries
- Regularly review conversation history
- Set appropriate iteration limits

## Future Enhancements

### Planned Features
- **Multi-database Support**: PostgreSQL, Redshift, BigQuery
- **Query Optimization**: Performance analysis and suggestions
- **Data Visualization**: Automatic chart generation
- **Export Options**: Save queries and results in various formats
- **Collaboration**: Share conversations and queries with team members

### Integration Roadmap
- **Knowledge Graph Integration**: Enhanced schema understanding
- **Dashboard Integration**: Automatic dashboard creation
- **Scheduling**: Automated query execution
- **Alerting**: Notifications for data changes

## Support

For issues or questions:
1. Check this documentation
2. Review the troubleshooting section
3. Check the Django logs
4. Verify environment configuration
5. Test with simple queries first

## Version History

- **v1.0**: Initial release with basic text-to-SQL functionality
- **v1.1**: Added conversation management and history
- **v1.2**: Enhanced error handling and recovery
- **v1.3**: Improved schema understanding and context management 