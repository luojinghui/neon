## ADDED Requirements

### Requirement: Soul chat list page is accessible

The system SHALL render a chat room list UI at route `/soul` as a client page.

#### Scenario: User opens Soul page

- **WHEN** the user navigates to `/soul`
- **THEN** the page renders a chat room list view (not placeholder content)

### Requirement: Page uses standard top bar

The page SHALL use the shared `TopBar` component and provide a visible title.

#### Scenario: Top bar renders with title

- **WHEN** the chat list page renders
- **THEN** the user sees a top bar with a centered title for the page

### Requirement: Responsive grid layout

The system SHALL render chat rooms in a responsive grid layout with the following column rules:

- < `sm`: 1 column
- `sm` and up: 2 columns
- `lg` and up: 4 columns
- `xl` and up: 6 columns

#### Scenario: Grid adapts to breakpoints

- **WHEN** the viewport width crosses the defined Tailwind breakpoints
- **THEN** the grid column count changes to match the rule set above

### Requirement: Room card minimum content

Each room card SHALL render at least the following fields:

- name (primary title)
- status badge showing `在线`
- onlineCount (static mock number)
- description (optional, truncated to 1–2 lines when present)
- a primary action control (e.g. “进入”/“查看”)

#### Scenario: User sees room card content

- **WHEN** the page renders at least one room card
- **THEN** the card shows the minimum content fields defined above

### Requirement: Loading state placeholder

The system SHALL provide a loading state that shows skeleton room cards (recommended 8) and keeps the grid layout stable.

#### Scenario: Loading state shows skeletons

- **WHEN** the page is in loading state
- **THEN** the user sees skeleton placeholders in a grid layout

### Requirement: Empty state placeholder

The system SHALL provide an empty state with:

- primary copy `暂无在线聊天室`
- secondary copy indicating to check later (and that creating rooms is future work)

#### Scenario: Empty state is rendered

- **WHEN** the page has no rooms to show
- **THEN** the user sees the empty-state copy and no room cards

### Requirement: Error state placeholder with retry

The system SHALL provide an error state with:

- copy `加载失败`
- a `重试` control that triggers a retry action at UI layer

#### Scenario: User retries after error

- **WHEN** the page is in error state and the user clicks `重试`
- **THEN** the page triggers a retry action that can transition the UI state out of error

### Requirement: Click interaction provides explicit feedback

Clicking a room card or its primary action control SHALL provide explicit user feedback without requiring a backend.

#### Scenario: User clicks a room card

- **WHEN** the user clicks on a room card
- **THEN** the system shows an explicit feedback message (e.g. “TODO: join room”)

#### Scenario: User clicks primary action button

- **WHEN** the user clicks the room card primary action control
- **THEN** the system shows an explicit feedback message (e.g. “TODO: join room”)

### Requirement: Theme compatibility

The page SHALL remain readable and visually coherent in both light and dark themes using existing design tokens (background/surface/border/foreground).

#### Scenario: User toggles theme

- **WHEN** the user switches between light and dark themes
- **THEN** the page remains readable and no key UI elements appear broken (text, borders, backgrounds)

### Requirement: Basic accessibility

The page SHALL meet basic accessibility expectations:

- the primary action control in each card is keyboard-focusable
- room title is rendered with a semantic heading element (e.g. `h2`/`h3`)

#### Scenario: Keyboard user can focus actions

- **WHEN** a keyboard-only user tabs through the page
- **THEN** the primary action controls receive visible focus and are operable
