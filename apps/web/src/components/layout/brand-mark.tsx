export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="var(--accent)"
        d="M16 2 4 7v8c0 7.2 5.1 13.4 12 15 6.9-1.6 12-7.8 12-15V7L16 2z"
      />
      <path fill="var(--bg)" d="m14.5 20.5-5-5 2-2 3 3 6-6 2 2z" />
    </svg>
  );
}
