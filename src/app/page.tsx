'use client';

import App from '../App';
import ErrorBoundary from '../components/ErrorBoundary';

export default function Page() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
