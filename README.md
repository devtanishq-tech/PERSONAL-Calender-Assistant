# Personal Calendar Assistant

An AI-powered Google Calendar Assistant built with Bun, TypeScript, Google Calendar API, and LangChain tools.

## Installation

Clone the repository and install the dependencies:

```bash
bun install
```

or

```bash
bun i
```

## Run the Project

Start the assistant using:

```bash
bun run index.ts
```

## Usage

After the server starts, simply type your request in the terminal.

### Example Queries

#### Create a Meeting

```
Create a meeting with John tomorrow at 3 PM.
Invite john@example.com.
```

```
Schedule a team meeting on Friday at 10 AM.
Invite alice@example.com and bob@example.com.
```

> **Note:** While inviting attendees, you must provide their email addresses.

#### Get Events

```
What meetings do I have today?
```

```
Show my events for tomorrow.
```

#### Delete an Event

```
Delete my meeting with John.
```

```
Cancel the team meeting scheduled for Friday.
```

#### Update an Event

```
Move my meeting with John from 3 PM to 5 PM.
```

```
Change tomorrow's team meeting to 11 AM.
```

## Features

- Create Google Calendar events
- Retrieve upcoming events
- Update existing events
- Delete calendar events
- Invite attendees via email
- Natural language interaction powered by an LLM
