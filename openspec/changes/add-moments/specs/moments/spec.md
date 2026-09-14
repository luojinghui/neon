## ADDED Requirements

### Requirement: Public moments feed

The system SHALL expose a “心迹” page that lists all users' moments in descending publication time.

#### Scenario: User opens the feed

- **WHEN** a user navigates to `/moments`
- **THEN** the system displays published moments from newest to oldest

#### Scenario: User loads additional moments

- **WHEN** more records exist and the user requests the next page
- **THEN** the system appends the next time-ordered page without duplicating existing items

### Requirement: Multi-format moment publishing

The system SHALL allow a profiled user to publish text, up to 9 images or videos, one voice recording, and an optional H5 location from either the feed or their own profile.

#### Scenario: User publishes supported content

- **WHEN** the user supplies at least one text, media, or voice value and submits the composer
- **THEN** the system persists one moment and places it at the beginning of the feed

#### Scenario: User adds browser location

- **WHEN** the user explicitly requests location and grants browser permission
- **THEN** the composer attaches validated latitude, longitude, and a display label that the user can remove before publishing

#### Scenario: Browser capability is unavailable

- **WHEN** microphone or geolocation capability is unavailable or denied
- **THEN** the system shows an actionable error and continues to allow other content types

### Requirement: Flat comments and replies

The system SHALL display comments in one flat sequence, including replies labelled with their target author.

#### Scenario: Feed renders a comment summary

- **WHEN** a moment has more than 2 comments and is rendered in the feed
- **THEN** only its latest 2 comments are initially visible and a control offers the remaining count

#### Scenario: User expands comments

- **WHEN** the user activates the expand control
- **THEN** the system retrieves and displays every comment in chronological order

#### Scenario: User replies to a comment

- **WHEN** the user selects a comment, chooses reply, and submits text
- **THEN** a new flat comment is appended with the target author's user ID

### Requirement: Comment action permissions

The system SHALL show a click-triggered action bar for a comment and enforce its operations on the server.

#### Scenario: Comment author edits their comment

- **WHEN** the author selects edit and submits non-empty text
- **THEN** the comment is updated and presented as edited

#### Scenario: Comment author deletes their comment

- **WHEN** the author confirms deletion
- **THEN** that comment is removed and the displayed count decreases

#### Scenario: Super administrator deletes any comment

- **WHEN** a super administrator issues a valid same-origin management deletion
- **THEN** the selected comment is removed regardless of its author

#### Scenario: Another user attempts mutation

- **WHEN** a non-author and non-administrator attempts to edit or delete a comment
- **THEN** the server rejects the operation

### Requirement: Whole-moment deletion

The system SHALL allow a moment author or super administrator to delete an entire moment.

#### Scenario: Authorized actor deletes a moment

- **WHEN** the author or a super administrator confirms deletion
- **THEN** the moment, all comments, and every stored media or voice attachment are removed

#### Scenario: Unauthorized actor deletes a moment

- **WHEN** another user attempts to delete the moment
- **THEN** the server rejects the operation and retains all data

### Requirement: Profile moments gallery

The system SHALL render profile information by default and expose “心迹” as the second profile section.

#### Scenario: Visitor opens a profile

- **WHEN** a visitor opens a personal profile
- **THEN** the profile information section is selected by default

#### Scenario: Visitor opens the moments section

- **WHEN** the visitor selects “心迹”
- **THEN** the system displays that user's complete time-ordered moment collection in a responsive square grid

#### Scenario: Visitor selects a gallery item

- **WHEN** the visitor selects a moment tile
- **THEN** a carousel opens at that moment and supports browsing every moment while showing its text and/or voice beneath the visual stage

### Requirement: Durable moment storage

The system SHALL persist moment metadata and attachments across application restarts and production releases.

#### Scenario: Application restarts

- **WHEN** the process reloads an existing valid moment data file
- **THEN** all moments and comments remain queryable in their previous order

#### Scenario: Persistence fails

- **WHEN** a storage read or write cannot complete safely
- **THEN** the API returns a service-unavailable error without exposing a partially committed mutation
