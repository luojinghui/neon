## MODIFIED Requirements

### Requirement: Click interaction provides explicit feedback

Clicking a room card or its primary action control SHALL navigate to the chat detail page at `/soul/{roomId}`.

#### Scenario: User clicks a room card

- **WHEN** the user clicks on a room card
- **THEN** the browser navigates to `/soul/{room.id}`

#### Scenario: User clicks primary action button

- **WHEN** the user clicks the room card primary action control
- **THEN** the browser navigates to `/soul/{room.id}`
