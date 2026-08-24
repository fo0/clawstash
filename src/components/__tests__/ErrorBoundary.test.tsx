// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// React logs the caught error itself; silence it so a passing run stays clean.
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom({ explode }: { explode: boolean }): React.ReactElement {
  if (explode) throw new Error('render exploded');
  return <p>all good</p>;
}

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeTruthy();
  });

  it('replaces a crashed tree with a recovery UI instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom explode={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    // The three recoveries that actually exist must all be offered.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeTruthy();
  });

  it('keeps the error message available for a bug report', () => {
    render(
      <ErrorBoundary>
        <Boom explode={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/render exploded/)).toBeTruthy();
  });

  it('re-renders the children when "Try again" clears the error', () => {
    let explode = true;
    function Flaky() {
      return <Boom explode={explode} />;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    explode = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('all good')).toBeTruthy();
  });
});
