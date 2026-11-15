import { afterEach, beforeEach, expect, it, mock, spyOn } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HIDE_NATIVE_PREVIEWS, WindowGeometry } from '../../solarium_tgui_fallback/components/WindowGeometry';
import { CharacterPreview } from '../../tgui/interfaces/common/CharacterPreview';
import {
  normalizePreferenceNumber,
  PreferenceSlider,
} from '../../solarium_tgui_fallback/components/PreferenceSlider';

let root: Root;
let container: HTMLDivElement;
const winset = mock((_id: string, _params: Record<string, unknown>) => {});
const sendMessage = mock(() => {});
let callbacks: FrameRequestCallback[];
let bounds: ReturnType<typeof spyOn>;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalByond = (globalThis as typeof globalThis & { Byond?: unknown })
  .Byond;
beforeEach(() => {
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    Byond: { windowId: 'preferences', winset, sendMessage },
  });
  bounds = spyOn(
    HTMLElement.prototype,
    'getBoundingClientRect',
  ).mockReturnValue({
    x: 20,
    y: 100,
    left: 20,
    top: 100,
    right: 240,
    bottom: 600,
    width: 220,
    height: 500,
    toJSON: () => ({}),
  });
  callbacks = [];
  globalThis.requestAnimationFrame = (callback) => {
    callbacks.push(callback);
    return callbacks.length;
  };
  globalThis.cancelAnimationFrame = mock(() => {});
  winset.mockClear();
  sendMessage.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  bounds.mockRestore();
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  Object.assign(globalThis, { Byond: originalByond });
});

it('rounds fractional voice values and clamps manual input', () => {
  expect(normalizePreferenceNumber(6.479999999999995, 1, 20, 0.01)).toBe(6.48);
  expect(normalizePreferenceNumber(9999, 1, 20, 0.01)).toBe(20);
  expect(normalizePreferenceNumber(-10, 1, 20, 0.01)).toBe(1);
  expect(normalizePreferenceNumber(0.34, 0.05, 1.05, 0.1)).toBe(0.35);
});

it('commits the range endpoint once on release, without fractional noise', async () => {
  const commit = mock(() => {});
  await act(() =>
    root.render(
      <PreferenceSlider
        label="Speed"
        value={6.479999999999995}
        min={1}
        max={20}
        step={0.01}
        onCommit={commit}
      />,
    ),
  );
  const number =
    container.querySelector<HTMLInputElement>('input[type=number]')!;
  expect(number.value).toBe('6.48');
  const range = container.querySelector<HTMLInputElement>('input[type=range]')!;
  range.value = '20';
  expect(commit).not.toHaveBeenCalled();
  await act(() =>
    range.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })),
  );
  expect(commit).toHaveBeenCalledWith(20);
  await act(() =>
    range.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })),
  );
  expect(commit).toHaveBeenCalledTimes(1);
});

it('does not reattach the old native preview after a tab switch with a pending resize', async () => {
  await act(() => root.render(<CharacterPreview id="preview" height="100%" />));
  window.dispatchEvent(new Event('resize'));
  expect(callbacks.length).toBe(1);
  await act(() => root.render(<div>Ship roles</div>));
  expect(winset).toHaveBeenLastCalledWith('preview', {
    'is-visible': false,
    parent: '',
  });
  winset.mockClear();
  callbacks[0](0);
  expect(winset).not.toHaveBeenCalled();
  expect(sendMessage).toHaveBeenLastCalledWith('unmountByondUi', {
    renderByondUi: 'preview',
  });
});

it('detaches before the next preview attaches, and hides it behind a modal', async () => {
  await act(() => root.render(<CharacterPreview id="first" height="100%" />));
  winset.mockClear();
  await act(() => root.render(<CharacterPreview id="second" height="100%" />));
  expect(winset.mock.calls[0]).toEqual(['first', { 'is-visible': false }]);
  expect(winset.mock.calls[1]).toEqual([
    'first',
    { 'is-visible': false, parent: '' },
  ]);
  await act(() =>
    root.render(<CharacterPreview id="second" height="100%" visible={false} />),
  );
  expect(winset).toHaveBeenLastCalledWith('second', {
    'is-visible': false,
    parent: '',
  });
});

it('waits for restored window geometry without overriding native map zoom', async () => {
  const preview = (ready: boolean) => (
    <WindowGeometry.Provider value={ready}>
      <CharacterPreview id="preview" height="100%" />
    </WindowGeometry.Provider>
  );
  await act(() => root.render(preview(false)));
  expect(winset).not.toHaveBeenCalled();
  await act(() => root.render(preview(true)));
  callbacks.at(-1)!(0);
  expect(winset).toHaveBeenLastCalledWith('preview', {
    parent: 'preferences',
    type: 'map',
    pos: '20,100',
    size: '220x500',
    anchor1: '0,0',
    anchor2: '0,0',
    'is-visible': true,
  });
  await act(() => root.render(preview(false)));
  expect(winset).toHaveBeenLastCalledWith('preview', {
    'is-visible': false,
    parent: '',
  });
  winset.mockClear();
  await act(() => root.render(preview(true)));
  callbacks.at(-1)!(0);
  expect(winset.mock.calls.at(-1)?.[1]).toMatchObject({
    size: '220x500',
    'is-visible': true,
  });
  expect(winset.mock.calls.at(-1)?.[1]).not.toHaveProperty('zoom');
});

it('hides native previews immediately on close without waiting for the server', async () => {
  await act(() => root.render(<CharacterPreview id="preview" height="100%" />));
  callbacks.at(-1)!(0);
  winset.mockClear();
  window.dispatchEvent(new Event(HIDE_NATIVE_PREVIEWS));
  expect(winset.mock.calls).toEqual([
    ['preview', { 'is-visible': false }],
    ['preview', { 'is-visible': false, parent: '' }],
  ]);
  winset.mockClear();
  callbacks.at(-1)!(0);
  expect(winset).not.toHaveBeenCalled();
});
