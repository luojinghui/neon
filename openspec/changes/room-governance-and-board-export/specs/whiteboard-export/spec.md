## ADDED Requirements

### Requirement: Export whiteboard as image

The system SHALL let any call participant export the current shared whiteboard content as a PNG or SVG file, covering all items regardless of the current viewport.

#### Scenario: Export PNG

- **WHEN** the participant chooses PNG export on a non-empty whiteboard
- **THEN** the browser downloads a PNG with a white background cropped to the bounding box of all items with padding, at 2× scale and no longer than 4096px on its longest side

#### Scenario: Export SVG

- **WHEN** the participant chooses SVG export
- **THEN** the browser downloads a self-contained SVG with the same content and bounds

#### Scenario: Empty whiteboard

- **WHEN** the whiteboard has no items
- **THEN** the export actions are disabled

#### Scenario: Pending edit

- **WHEN** a text edit or style change is still in progress at export time
- **THEN** the system commits it before generating the file

### Requirement: Save whiteboard to the room

The system SHALL let a participant save the whiteboard as a PNG image message in the room chat.

#### Scenario: Save to room

- **WHEN** the participant chooses save to room while joined to the room
- **THEN** the system sends the rendered PNG as an image message visible to all members and confirms success

#### Scenario: Save fails

- **WHEN** rendering or upload fails
- **THEN** the system shows an error and the whiteboard content remains unchanged

### Requirement: Rendering consistency

The exported image SHALL reproduce strokes, shapes (rectangle, ellipse, line, arrow, fill) and text with the colors and widths shown on the live whiteboard.

#### Scenario: Compare export with live board

- **WHEN** an exported file is opened
- **THEN** every item appears with the same position, color, stroke width and text content as on the live board
