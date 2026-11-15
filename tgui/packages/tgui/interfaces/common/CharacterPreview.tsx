import { useContext, useLayoutEffect, useRef } from 'react';
import {
  HIDE_NATIVE_PREVIEWS,
  WindowGeometry,
} from 'solarium_tgui/components/WindowGeometry';

type Props = {
  height: string;
  id: string;
  width?: string;
  visible?: boolean;
};

export function CharacterPreview({
  height,
  id,
  width = '220px',
  visible = true,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const geometryReady = useContext(WindowGeometry);

  useLayoutEffect(() => {
    if (!visible || !geometryReady || !id || !element.current) return;
    let active = true;
    let frame = 0;
    let lastGeometry = '';
    const render = () => {
      frame = 0;
      if (!active || !element.current) return;
      const rect = element.current.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        window.innerWidth <= 1 ||
        window.innerHeight <= 1
      ) {
        Byond.winset(id, { 'is-visible': false });
        lastGeometry = '';
        return;
      }
      const scale = window.devicePixelRatio || 1;
      const pos = `${Math.round(rect.left * scale)},${Math.round(rect.top * scale)}`;
      const size = `${Math.round(rect.width * scale)}x${Math.round(rect.height * scale)}`;
      const geometry = `${pos}:${size}`;
      if (geometry === lastGeometry) return;
      lastGeometry = geometry;
      Byond.winset(id, {
        parent: Byond.windowId,
        type: 'map',
        pos,
        size,
        anchor1: '0,0',
        anchor2: '0,0',
        'is-visible': true,
      });
    };
    const schedule = () => {
      if (active && !frame) frame = requestAnimationFrame(render);
    };
    const detach = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      Byond.winset(id, { 'is-visible': false });
      Byond.winset(id, { 'is-visible': false, parent: '' });
      Byond.sendMessage('unmountByondUi', { renderByondUi: id });
    };
    Byond.sendMessage('renderByondUi', { renderByondUi: id });
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(element.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('beforeunload', detach);
    window.addEventListener(HIDE_NATIVE_PREVIEWS, detach);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('beforeunload', detach);
      window.removeEventListener(HIDE_NATIVE_PREVIEWS, detach);
      detach();
    };
  }, [id, visible, geometryReady]);

  return (
    <div
      ref={element}
      style={{ width, height, minHeight: '22px', background: '#10161c' }}
    />
  );
}
