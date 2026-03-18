## 1. Page scaffold

- [x] 1.1 Replace `/soul` placeholder with standard page layout (bg + TopBar + scrollable content area)
- [x] 1.2 Add `ThemeToggle` into `TopBar` right slot and set a proper title

## 2. UI components & mock data

- [x] 2.1 Define `ChatRoom` UI type and create 8–20 mock rooms covering varied name/description lengths and counts
- [x] 2.2 Implement `ChatRoomCard` with minimum fields (title, 在线 badge, onlineCount, description clamp, primary action button)
- [x] 2.3 Implement `ChatRoomGrid` with responsive breakpoints (1/2/4/6 columns) and consistent gaps
- [x] 2.4 Implement `ChatRoomCardSkeleton` (8 items) that preserves the grid layout

## 3. View states (loading/empty/error)

- [x] 3.1 Implement local `viewState` to drive Loading/Ready/Empty/Error rendering
- [x] 3.2 Implement Empty state UI with required copy (`暂无在线聊天室` + secondary copy)
- [x] 3.3 Implement Error state UI with required copy (`加载失败`) and a `重试` control that transitions state out of error

## 4. Interactions & a11y

- [x] 4.1 Wire card click and primary action click to show an explicit placeholder message (e.g. `TODO: join room`)
- [x] 4.2 Ensure primary action is keyboard-focusable and room titles use semantic heading elements

## 5. Verification

- [x] 5.1 Run `pnpm lint` (or `next lint`) and fix any newly introduced issues
- [x] 5.2 Quick manual check: `/soul` renders, grid adapts to viewport, states render, theme toggle remains readable
