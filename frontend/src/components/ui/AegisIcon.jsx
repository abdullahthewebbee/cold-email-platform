import React from 'react';
import { ICONS, ICON_ALIASES } from './icons';

/**
 * <Icon name="send" size={18} />
 * Aegis rule: fill="none", stroke="currentColor", round caps — so the icon
 * takes the colour of the surrounding text. Unknown names fall back to 'dot'.
 */
export default function Icon({ name, size = 18, strokeWidth = 1.8, className, style, title, ...rest }) {
  const key = ICONS[name] ? name : (ICON_ALIASES[name] || 'dot');
  const body = ICONS[key] || ICONS.dot;
  const filled = key === 'check-badge';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + body }}
    />
  );
}

export { ICONS, ICON_ALIASES };
