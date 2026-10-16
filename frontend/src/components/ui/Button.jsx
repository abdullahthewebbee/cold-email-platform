import * as React from 'react';

const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 600,
  letterSpacing: '.2px',
  transition: 'background .15s, box-shadow .15s, opacity .15s, border-color .15s',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  lineHeight: 1,
};

const SIZE = {
  sm: { height: 32, padding: '0 12px', fontSize: 12, borderRadius: 'var(--do-r-sm)' },
  default: { height: 38, padding: '0 16px', fontSize: 13.5, borderRadius: 'var(--do-r)' },
  lg: { height: 44, padding: '0 22px', fontSize: 15, borderRadius: 'var(--do-r)' },
};

const VARIANT = {
  default: {
    background: 'var(--gold-dark)',
    color: 'var(--on-gold)',
    boxShadow: '0 1px 4px var(--gold-dim)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--do-text)',
    border: '1.5px solid var(--do-border-dark)',
  },
  destructive: {
    background: 'var(--do-red)',
    color: 'var(--white)',
  },
  secondary: {
    background: 'var(--do-surf2)',
    color: 'var(--do-text2)',
    border: '1px solid var(--do-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--do-text2)',
  },
  link: {
    background: 'transparent',
    color: 'var(--do-gold-dark)',
    textDecoration: 'underline',
    padding: 0,
    height: 'auto',
  },
};

const Button = React.forwardRef(
  ({ className, variant = 'default', size = 'default', as: Component = 'button', style, disabled, children, ...props }, ref) => {
    const v = VARIANT[variant] || VARIANT.default;
    const s = SIZE[size] || SIZE.default;
    return (
      <Component
        ref={ref}
        className={className}
        disabled={disabled}
        style={{
          ...BASE,
          ...s,
          ...v,
          ...(disabled ? { opacity: 0.45, cursor: 'not-allowed', pointerEvents: 'none' } : {}),
          ...style,
        }}
        {...props}
      >
        {children}
      </Component>
    );
  }
);
Button.displayName = 'Button';

export { Button };
export default Button;