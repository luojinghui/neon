type EdgeSwipeTarget = {
  addEventListener(
    type: string,
    listener: (event: { preventDefault(): void }) => void,
    options: AddEventListenerOptions
  ): void;
  removeEventListener(type: string, listener: (event: { preventDefault(): void }) => void, capture: boolean): void;
};

type OverscrollRoot = {
  style: { overscrollBehaviorX: string };
};

const EDGE_LISTENER_OPTIONS: AddEventListenerOptions = { passive: false, capture: true };

function blockBrowserEdgeSwipe(event: { preventDefault(): void }) {
  event.preventDefault();
}

/** 在边缘条上用非 passive 监听认领触摸，取消浏览器的历史前进/后退默认行为。 */
export function attachEdgeSwipeBlock(target: EdgeSwipeTarget): () => void {
  target.addEventListener('touchstart', blockBrowserEdgeSwipe, EDGE_LISTENER_OPTIONS);
  target.addEventListener('touchmove', blockBrowserEdgeSwipe, EDGE_LISTENER_OPTIONS);
  return () => {
    target.removeEventListener('touchstart', blockBrowserEdgeSwipe, true);
    target.removeEventListener('touchmove', blockBrowserEdgeSwipe, true);
  };
}

/** 仅在当前页锁定横向越界导航，离开时恢复进入前的值。 */
export function holdHorizontalOverscrollLock(root: OverscrollRoot): () => void {
  const previous = root.style.overscrollBehaviorX;
  root.style.overscrollBehaviorX = 'none';
  return () => {
    root.style.overscrollBehaviorX = previous;
  };
}
