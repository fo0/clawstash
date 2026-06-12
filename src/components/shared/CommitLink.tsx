interface Props {
  repoFullName: string | null;
  sha: string | null;
}

/**
 * Short-SHA link to a GitHub commit of the backup target repo. Renders the
 * bare short SHA when the repo name is unknown, nothing when there is no
 * SHA. repoFullName is server-validated (strict owner/repo charsets), so it
 * is safe in the URL path.
 */
export default function CommitLink({ repoFullName, sha }: Props) {
  if (!sha) return null;
  const short = sha.slice(0, 7);
  if (!repoFullName) return <code>{short}</code>;
  return (
    <a
      href={`https://github.com/${repoFullName}/commit/${sha}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this backup commit on GitHub"
    >
      <code>{short}</code>
    </a>
  );
}
