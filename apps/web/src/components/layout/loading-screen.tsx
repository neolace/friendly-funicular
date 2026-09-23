interface LoadingScreenProps {
  label: string;
}

export function LoadingScreen({ label }: LoadingScreenProps) {
  return (
    <main className="centered" aria-busy="true">
      <div className="card card--compact">
        <span className="spinner" aria-hidden="true" />
        <p role="status" aria-live="polite">
          {label}
        </p>
      </div>
    </main>
  );
}
