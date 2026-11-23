// LabLoop mark: a looping arrow (sample goes out, report comes back) around a blood drop.
// One colour (currentColor, the theme teal by default), drawn on a 48-unit grid so it stays
// crisp from 24 px (header, favicon) to 96 px (landing hero).
export function Logo({ size = 40, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="logo-mark"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      fill="none"
    >
      {/* 300° loop, clockwise, with an arrowhead closing the circle */}
      <path d="M34.9 11 A17 17 0 1 1 18.2 8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M23.6 6.3 L16.6 3.9 L18.9 11.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* blood drop */}
      <path d="M24 14.5 C24 14.5 17 22.3 17 27 A7 7 0 0 0 31 27 C31 22.3 24 14.5 24 14.5 Z" fill="currentColor" />
    </svg>
  );
}

// "LabLoop" wordmark next to the mark.
export function BrandName() {
  return (
    <span className="brand-name">
      Lab<span>Loop</span>
    </span>
  );
}

export default Logo;
