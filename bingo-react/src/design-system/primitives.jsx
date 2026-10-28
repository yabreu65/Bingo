import { createElement, useId } from 'react';
import './primitives.css';

export function Container({ as: Component = 'div', className = '', ...props }) {
  return createElement(Component, { className: `pf-container ${className}`.trim(), ...props });
}

export function Stack({ className = '', ...props }) {
  return <div className={`pf-stack ${className}`.trim()} {...props} />;
}

export function Cluster({ className = '', ...props }) {
  return <div className={`pf-cluster ${className}`.trim()} {...props} />;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  return <button className={`pf-button pf-button--${variant} ${className}`.trim()} type={type} {...props} />;
}

export function Card({ raised = false, className = '', ...props }) {
  return <section className={`pf-card${raised ? ' pf-card--raised' : ''} ${className}`.trim()} {...props} />;
}

export function Panel({ className = '', ...props }) {
  return <section className={`pf-panel ${className}`.trim()} {...props} />;
}

export function Field({ label, hint, id, children, className = '', ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  return (
    <label className={`pf-field ${className}`.trim()} htmlFor={controlId} {...props}>
      <span className="pf-field__label">{label}</span>
      {children || <input className="pf-field__control" id={controlId} aria-label={label} />}
      {hint ? <span className="pf-field__hint">{hint}</span> : null}
    </label>
  );
}

export function StatusBadge({ tone = 'default', children, className = '', ...props }) {
  return <span className={`pf-status${tone === 'default' ? '' : ` pf-status--${tone}`} ${className}`.trim()} {...props}>{children}</span>;
}

export function Modal({ open = true, title, onClose, children, footer, className = '' }) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="pf-modal__backdrop" role="presentation">
      <section className={`pf-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="pf-modal__header">
          <h2 id={titleId}>{title}</h2>
          {onClose ? <Button className="pf-modal__close" variant="ghost" aria-label="Close" onClick={onClose}>×</Button> : null}
        </header>
        <div className="pf-modal__body">{children}</div>
        {footer ? <footer className="pf-modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
