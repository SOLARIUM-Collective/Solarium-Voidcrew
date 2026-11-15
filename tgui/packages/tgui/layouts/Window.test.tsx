import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, type PropsWithChildren, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WindowGeometry } from 'solarium_tgui/components/WindowGeometry';

const backend = {
  config: { window: { key: 'sector-prompt', scale: 1, fancy: false } },
  suspended: false,
};
const winset = mock(() => {});
const recallGeometry = mock<() => void | Promise<void>>(() => {});
const setWindowKey = mock(() => {});

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  Byond: { windowId: 'tgui-window-2', winset },
});
mock.module('../backend', () => ({
  useBackend: () => backend,
  globalStore: { dispatch: () => {} },
  backendSuspendStart: () => ({}),
}));
mock.module('../debug', () => ({ useDebug: () => ({}) }));
mock.module('../logging', () => ({ createLogger: () => ({ log: () => {} }) }));
mock.module('../drag', () => ({
  dragStartHandler: () => {},
  resizeStartHandler: () => {},
  recallWindowGeometry: recallGeometry,
  setWindowKey,
}));
mock.module('./Layout', () => ({
  Layout: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
mock.module('./TitleBar', () => ({ TitleBar: () => null }));

const { Window } = await import('./Window');
let root: Root;
let container: HTMLDivElement;

async function renderPrompt() {
  await act(async () => {
    root.render(<Window width={325} height={327} title="Create Outpost" />);
  });
}

beforeEach(async () => {
  backend.config.window.key = 'sector-prompt';
  backend.suspended = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await renderPrompt();
  winset.mockClear();
  recallGeometry.mockClear();
  setWindowKey.mockClear();
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

describe('pooled window reuse', () => {
  it('shows the next same-sized prompt when suspend and resume are batched', async () => {
    // The backend hides the pooled browser immediately. React may only render
    // the next update, leaving the same Window component mounted throughout.
    backend.config.window.key = 'owner-prompt';
    await renderPrompt();

    expect(setWindowKey).toHaveBeenCalledWith('owner-prompt');
    expect(recallGeometry).toHaveBeenCalledTimes(1);
    expect(winset).toHaveBeenCalledWith('tgui-window-2', {
      'is-visible': true,
    });
  });

  it('restores visibility when the same interface resumes from suspension', async () => {
    backend.suspended = true;
    await renderPrompt();
    expect(winset).not.toHaveBeenCalled();
    backend.suspended = false;
    await renderPrompt();

    expect(winset).toHaveBeenCalledWith('tgui-window-2', {
      'is-visible': true,
    });
  });

  it('does not reset geometry for ordinary updates to an open interface', async () => {
    await renderPrompt();

    expect(winset).not.toHaveBeenCalled();
    expect(recallGeometry).not.toHaveBeenCalled();
  });
});

function GeometryProbe() {
  const ready = useContext(WindowGeometry);
  return <div data-geometry-ready={String(ready)} />;
}

it('keeps native previews disabled until geometry is restored on reopen', async () => {
  let finish: () => void = () => {};
  recallGeometry.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  backend.config.window.key = 'character-reopened';
  await act(async () => {
    root.render(
      <Window>
        <GeometryProbe />
      </Window>,
    );
  });
  expect(
    container
      .querySelector('[data-geometry-ready]')
      ?.getAttribute('data-geometry-ready'),
  ).toBe('false');
  expect(winset).not.toHaveBeenCalledWith('tgui-window-2', {
    'is-visible': true,
  });
  await act(() => finish());
  expect(
    container
      .querySelector('[data-geometry-ready]')
      ?.getAttribute('data-geometry-ready'),
  ).toBe('true');
});
