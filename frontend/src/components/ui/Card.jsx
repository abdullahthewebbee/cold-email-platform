import React from 'react';

export function Card({ className, style, children, ...props }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--do-surface)',
        border: '1px solid var(--do-border)',
        borderRadius: 'var(--do-r-lg)',
        boxShadow: 'var(--do-shadow-sm)',
        padding: '20px 22px',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;