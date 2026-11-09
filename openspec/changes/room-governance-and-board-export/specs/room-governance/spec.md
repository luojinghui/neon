## ADDED Requirements

### Requirement: Room announcement and rules

The system SHALL let a room owner or super administrator edit a plain-text announcement (max 500 chars) and rules (max 2000 chars), and SHALL show them to every member who can view the room.

#### Scenario: Owner publishes an announcement

- **WHEN** the room owner saves a non-empty announcement
- **THEN** the system persists it with its update time and broadcasts it to online members, who see a dismissible banner at the top of the chat

#### Scenario: Member attempts to edit

- **WHEN** a user who is neither owner nor super administrator submits an announcement or rules update
- **THEN** the system rejects the request with a permission error and leaves the data unchanged

#### Scenario: Content exceeds limits

- **WHEN** the submitted announcement or rules exceed their length limit
- **THEN** the system rejects the request and reports the limit

#### Scenario: Legacy room without governance data

- **WHEN** a room persisted before this change is loaded
- **THEN** it SHALL behave as having empty announcement, empty rules, no pinned messages and no bans

### Requirement: Pinned messages

The system SHALL let a room owner or super administrator pin and unpin messages, with at most 3 pinned messages per room, and SHALL display them in a pinned bar in the chat view.

#### Scenario: Owner pins a message

- **WHEN** the owner pins a message in a room with fewer than 3 pinned messages
- **THEN** the message is added at the front of the pinned list and all online members see the updated pinned bar

#### Scenario: Pin limit reached

- **WHEN** the owner pins a fourth message
- **THEN** the system rejects the request and asks the owner to unpin one first

#### Scenario: Pinned message removed

- **WHEN** a pinned message is recalled or deleted
- **THEN** the system removes it from the pinned list and broadcasts the update

#### Scenario: Member jumps to a pinned message

- **WHEN** a member clicks a pinned entry
- **THEN** the chat scrolls to and highlights the original message, loading earlier history when it is not yet loaded

### Requirement: Member list

The system SHALL show a member list in room information containing each member's name, avatar and role (owner, administrator, member), with duplicates of the same user merged.

#### Scenario: Public room

- **WHEN** a member opens the member list of a public room
- **THEN** the system lists currently online members only

#### Scenario: Private or password room

- **WHEN** a member opens the member list of a private or password-protected room
- **THEN** the system lists online members and approved offline members, marking offline ones

#### Scenario: Ordering

- **WHEN** the list is displayed
- **THEN** it is ordered owner, administrator, online members, then offline members

### Requirement: Remove members

The system SHALL let a room owner or super administrator remove a member from a room, and SHALL prevent the room owner from being removed.

#### Scenario: Owner removes an online member

- **WHEN** the owner confirms removal of an online member
- **THEN** all of the target's connections leave the room, receive a removal notice and are redirected to the room list, and remaining members see the member list update

#### Scenario: Private or password room removal

- **WHEN** a member is removed from a private or password-protected room
- **THEN** the system revokes their access so they must re-apply or re-enter the password

#### Scenario: Public room removal

- **WHEN** a member is removed from a public room
- **THEN** the system rejects their re-join with a banned error for 10 minutes

#### Scenario: Invalid target

- **WHEN** a removal targets the room owner, the actor themselves, or a non-member
- **THEN** the system rejects the request and changes nothing

#### Scenario: Unauthorized actor

- **WHEN** a user who is neither owner nor super administrator requests a removal
- **THEN** the system rejects it with a permission error
