import { useEffect, useRef, useState } from 'react';

const SECONDS = 5;

export function useAutoConfirm(active: boolean, onConfirm: () => void) {
  const [left, setLeft] = useState(SECONDS);
  const onConfirmRef = useRef(onConfirm);
  const fireRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  });

  useEffect(() => {
    if (!active) {
      fireRef.current = null;
      queueMicrotask(() => setLeft(SECONDS));
      return;
    }

    let fired = false;
    const started = Date.now();
    const id = setInterval(() => {
      const remain = Math.max(0, SECONDS - (Date.now() - started) / 1000);
      setLeft(remain);
      if (remain > 0 || fired) return;
      fired = true;
      clearInterval(id);
      onConfirmRef.current();
    }, 80);

    fireRef.current = () => {
      if (fired) return;
      fired = true;
      clearInterval(id);
      onConfirmRef.current();
    };

    return () => {
      clearInterval(id);
      fireRef.current = null;
    };
  }, [active]);

  const seconds = Math.max(1, Math.ceil(left));
  const progress = active ? Math.min(1, Math.max(0, 1 - left / SECONDS)) : 0;

  const confirm = () => {
    if (fireRef.current) {
      fireRef.current();
      return;
    }
    onConfirmRef.current();
  };

  return { seconds, progress, confirm };
}
