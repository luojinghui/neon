## ADDED Requirements

### Requirement: Chat detail page is accessible via dynamic route

The system SHALL render a chat room detail page at route `/soul/[roomId]` as a client page.

#### Scenario: User navigates to chat detail page

- **WHEN** the user navigates to `/soul/room_1`
- **THEN** the page renders a chat room detail view with TopBar, message list, and input area

### Requirement: TopBar displays room name and theme toggle

The detail page SHALL use the shared `TopBar` component with:

- Left: back button (existing behavior)
- Center: chat room name
- Right: ThemeToggle

#### Scenario: TopBar renders correctly

- **WHEN** the chat detail page renders
- **THEN** the user sees a TopBar with the room name centered and a theme toggle on the right

### Requirement: Three-section layout

The page SHALL use a full-height three-section layout:

- TopBar: fixed top
- MessageList: `flex-1 overflow-y-auto`, fills remaining vertical space
- Bottom area: fixed bottom, contains input row + toolbar row

#### Scenario: Layout fills viewport

- **WHEN** the page renders on any viewport height
- **THEN** the message list stretches to fill the space between TopBar and bottom area

### Requirement: Messages display with correct alignment

The system SHALL render:

- Remote messages (other users): left-aligned, avatar on the left
- Local messages (current user): right-aligned, avatar on the right

#### Scenario: Remote message appears on the left

- **WHEN** a remote message is rendered
- **THEN** the avatar appears on the left, bubble on the right of the avatar, left-aligned

#### Scenario: Local message appears on the right

- **WHEN** a local message is rendered
- **THEN** the avatar appears on the right, bubble on the left of the avatar, right-aligned

### Requirement: Message metadata displays name and time inline

Each message SHALL show sender name and timestamp on the same line:

- Format: `用户名 · HH:mm`
- Name: `text-sm font-medium text-foreground`
- Separator `·`: `text-foreground-muted`
- Time: `text-xs text-foreground-muted`
- Local messages: metadata right-aligned, time before name

#### Scenario: Metadata renders inline

- **WHEN** a message renders
- **THEN** the sender name and time appear on one line, separated by `·`

### Requirement: Avatars use DiceBear generation

Each message SHALL display a round avatar generated via DiceBear:

- URL pattern: `https://api.dicebear.com/9.x/adventurer/svg?seed={userId}`
- Size: `w-8 h-8` (32px), circular clip
- Same userId always produces the same avatar

#### Scenario: Avatar renders for a user

- **WHEN** a message from userId "user_abc" renders
- **THEN** the avatar image src uses seed "user_abc" and displays as a 32px circle

### Requirement: Message bubbles use theme chat tokens

The system SHALL use existing chat theme tokens for bubble colors:

- Local bubble: `bg-chat-self text-chat-self-foreground`
- Remote bubble: `bg-chat-other text-chat-other-foreground`

#### Scenario: Bubbles respect theme

- **WHEN** the user switches between light and dark themes
- **THEN** bubble colors update to match the corresponding theme tokens

### Requirement: Message actions appear on tap of bubble only

Action buttons SHALL NOT be shown on pointer hover. The user SHALL tap or click the message bubble to toggle action buttons:

- Position: beside the bubble (remote messages: right side, local messages: left side)
- Actions: Copy, Download, More
- Dismiss: tap the bubble again, tap outside the message row, or after a successful action (copy, download, more)

#### Scenario: Actions appear on bubble click

- **WHEN** the user clicks the message bubble
- **THEN** action buttons (copy, download, more) appear beside the bubble

#### Scenario: Hover does not show actions

- **WHEN** the user moves the pointer over a message bubble without clicking
- **THEN** action buttons do not appear

#### Scenario: Tap outside dismisses actions

- **WHEN** action buttons are visible and the user taps or clicks outside the message row
- **THEN** action buttons are hidden

### Requirement: Copy action copies message text

The copy action button SHALL copy the message text content to the clipboard.

#### Scenario: User copies a message

- **WHEN** the user clicks the copy action on a text message
- **THEN** the message content is copied to the clipboard and a success toast appears

### Requirement: Download action exports message as text file

The download action button SHALL export the message content as a `.txt` file.

#### Scenario: User downloads a message

- **WHEN** the user clicks the download action on a text message
- **THEN** a `.txt` file downloads with the message content

### Requirement: More action is placeholder

The more action button SHALL show a "开发中" toast in the first phase.

#### Scenario: User clicks more

- **WHEN** the user clicks the more action button
- **THEN** a toast message "开发中" appears

### Requirement: Message list auto-scrolls on new messages

The message list SHALL auto-scroll to the bottom when new messages arrive, unless the user has scrolled up.

#### Scenario: User at bottom receives new message

- **WHEN** the user is at or near the bottom (within 100px) and a new message arrives
- **THEN** the list auto-scrolls to show the new message

#### Scenario: User browsing history receives new message

- **WHEN** the user has scrolled up more than 100px from bottom and a new message arrives
- **THEN** the list does NOT auto-scroll, and a "新消息" indicator appears

#### Scenario: User clicks new message indicator

- **WHEN** the user clicks the "新消息" indicator
- **THEN** the list smoothly scrolls to the bottom

### Requirement: Input area uses contenteditable div

The input area SHALL use a `div` with contenteditable behavior:

- Default single-line height, auto-expands up to 5 lines
- `Enter` sends the message, `Shift+Enter` inserts a newline
- Placeholder text: "输入消息..."

#### Scenario: User types and sends

- **WHEN** the user types text and presses Enter
- **THEN** the message is sent (added to the mock list) and the input clears

#### Scenario: User inserts newline

- **WHEN** the user presses Shift+Enter
- **THEN** a newline is inserted without sending

#### Scenario: Input expands with content

- **WHEN** the user types multiple lines
- **THEN** the input area height grows up to 5 lines, then scrolls internally

### Requirement: Send button reflects input state

The send button SHALL be visually disabled when input is empty, and active when content exists.

#### Scenario: Empty input

- **WHEN** the input area is empty
- **THEN** the send button appears in a disabled style

#### Scenario: Non-empty input

- **WHEN** the input area has content
- **THEN** the send button appears active with `bg-primary text-white`

### Requirement: Toolbar displays placeholder icons

The toolbar row SHALL display mini icon buttons for: emoji, file, voice call, video call.
All actions show a "开发中" toast on click.

#### Scenario: Toolbar icons render

- **WHEN** the detail page renders
- **THEN** four icon buttons appear below the input area without text labels

#### Scenario: Toolbar icon click

- **WHEN** the user clicks any toolbar icon
- **THEN** a "开发中" toast appears

### Requirement: Page uses mock data for first phase

The detail page SHALL render using mock message data, not real server data.

#### Scenario: Mock messages display

- **WHEN** the page loads
- **THEN** a set of mock messages (mix of local and remote) render in the message list

### Requirement: Core logic uses class singleton pattern

All non-UI logic SHALL be encapsulated in a `SoulChat` class singleton in `core/index.ts`, following the `NeonCloud` pattern from `src/app/cloud/core.ts`.

#### Scenario: Core class is used by page

- **WHEN** the detail page initializes
- **THEN** it uses the `soulChat` singleton instance for all business logic operations

### Requirement: State management uses zustand

All UI-reactive state SHALL be managed via a zustand store in `store.ts`.

#### Scenario: Store drives UI updates

- **WHEN** a new message is added to the store
- **THEN** the MessageList component re-renders to show the new message
