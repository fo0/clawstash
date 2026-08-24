'use client';

import App from '../../App';
import ErrorBoundary from '../../components/ErrorBoundary';

export default function CatchAllPage() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
