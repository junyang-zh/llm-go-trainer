import { t } from './i18n';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`settings-dialog${wide ? ' settings-wide' : ''}`}
      aria-labelledby={label}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-toolbar">
          <h2 id={label}>{title}</h2>
          <button aria-label={t('close', { v0: title })} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-scroll">{children}</div>
      </div>
    </dialog>
  );
}
