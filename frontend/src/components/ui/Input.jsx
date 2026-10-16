import * as React from 'react';

const baseInput = {
  display: 'flex',
  width: '100%',
  borderRadius: 'var(--do-r-sm)',
  border: '1.5px solid var(--do-border-dark)',
  background: 'var(--do-surface)',
  padding: '0 12px',
  fontSize: 13.5,
  color: 'var(--do-text)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  fontWeight: 400,
  transition: 'border-color .15s ease, box-shadow .15s ease',
  lineHeight: 1,
};

const LABEL = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.45px',
  textTransform: 'uppercase',
  color: 'var(--do-text3)',
  marginBottom: 5,
  display: 'block',
  fontFamily: 'var(--do-font-mono)',
};

const Input = React.forwardRef(
  ({ label, error, className, variant, size, style, onFocus, onBlur, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);

    const heightStyle =
      size === 'sm'  ? { height: 32, fontSize: 12.5, padding: '0 10px' } :
      size === 'lg'  ? { height: 46, fontSize: 15,   padding: '0 16px' } :
                       { height: 40 };

    const variantStyle =
      variant === 'destructive'
        ? { borderColor: 'var(--do-red)', color: 'var(--do-red)' }
        : {};

    const focusStyle = focused
      ? { borderColor: 'var(--do-gold)', boxShadow: '0 0 0 3px var(--gold-dim)' }
      : {};

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {label && <label style={LABEL}>{label}</label>}
        <input
          ref={ref}
          className={className}
          style={{ ...baseInput, ...heightStyle, ...variantStyle, ...focusStyle, ...style }}
          onFocus={e => { setFocused(true);  onFocus?.(e); }}
          onBlur={e  => { setFocused(false); onBlur?.(e);  }}
          {...props}
        />
        {error && (
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--do-red)', fontWeight: 500 }}>{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
export default Input;