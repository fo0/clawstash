import { useState } from 'react';

const buildInfo = __BUILD_INFO__;

export default function Footer() {
  const [showDetails, setShowDetails] = useState(false);

  const buildDate = new Date(buildInfo.buildDate);
  const formattedDate = buildDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = buildDate.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <footer className="app-footer">
      <div className="footer-row">
        <div className="footer-left">
          <span className="footer-title" title={`ClawStash v${buildInfo.version}`}>
            ClawStash <span className="footer-version">v{buildInfo.version}</span>
          </span>
          <button
            type="button"
            className={`footer-info-btn${showDetails ? ' active' : ''}`}
            onClick={() => setShowDetails((prev) => !prev)}
            title="Toggle build details"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span className="footer-info-label">Build Info</span>
          </button>

          {showDetails && (
            <div className="footer-details-desktop">
              {buildInfo.branch && (
                <span className="footer-detail" title={`Branch: ${buildInfo.branch}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" x2="6" y1="3" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {buildInfo.branch}
                </span>
              )}
              <span className="footer-detail" title={`Built: ${formattedDate} ${formattedTime}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
                {formattedDate} {formattedTime}
              </span>
            </div>
          )}
        </div>

        <div className="footer-right">
          <a
            href="https://github.com/fo0/clawstash"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-github-link"
            title="View on GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
          </a>
        </div>
      </div>

      {showDetails && (
        <div className="footer-details-mobile">
          {buildInfo.branch && (
            <div className="footer-mobile-row">
              <span className="footer-mobile-label">Branch:</span>
              <span>{buildInfo.branch}</span>
            </div>
          )}
          <div className="footer-mobile-row">
            <span className="footer-mobile-label">Built:</span>
            <span>{formattedDate} {formattedTime}</span>
          </div>
        </div>
      )}
    </footer>
  );
}
