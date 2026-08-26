function parseSecretProbe(output) {
  const [nonEmpty, carriageReturn, lineFeed] = output.trim().split('|');
  return {
    accessible: nonEmpty === 'nonempty' || nonEmpty === 'empty',
    nonEmpty: nonEmpty === 'nonempty',
    hasCarriageReturn: carriageReturn === '1',
    hasLineFeed: lineFeed === '1',
  };
}

export function parseSecretInventory(output, expectedCount) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== expectedCount) {
    throw new Error('secret inventory response has an unexpected item count');
  }
  return lines.map((line, expectedIndex) => {
    const [rawIndex, nonEmpty, carriageReturn, lineFeed, ...extra] = line.split('|');
    if (
      rawIndex !== String(expectedIndex) ||
      extra.length > 0 ||
      !['nonempty', 'empty', 'denied'].includes(nonEmpty) ||
      !['0', '1'].includes(carriageReturn) ||
      !['0', '1'].includes(lineFeed)
    ) {
      throw new Error('secret inventory response is malformed');
    }
    return parseSecretProbe([nonEmpty, carriageReturn, lineFeed].join('|'));
  });
}

export function remoteSecretInventoryCommand(projectId, secretNames) {
  // Values never reach stdout: each value goes to a temporary file and only indexed metadata is
  // emitted. One command covers the inventory so preflight opens one IAP tunnel instead of 13.
  const probes = secretNames.flatMap((secretName, index) => [
    `probe="$probe_dir/${index}"`,
    `if gcloud secrets versions access latest --project '${projectId}' --secret '${secretName}' >"$probe" 2>/dev/null; then bytes=$(stat -c %s "$probe"); cr=$(tr -dc '\\r' <"$probe" | wc -c); lf=$(tr -dc '\\n' <"$probe" | wc -c); if [ "$bytes" -gt 0 ]; then non=nonempty; else non=empty; fi; if [ "$cr" -gt 0 ]; then crf=1; else crf=0; fi; if [ "$lf" -gt 0 ]; then lff=1; else lff=0; fi; echo '${index}|'"$non|$crf|$lff"; else echo '${index}|denied|0|0'; fi`,
  ]);
  return [
    'set -euo pipefail',
    'probe_dir=$(mktemp -d)',
    'trap \'rm -rf -- "$probe_dir"\' EXIT',
    ...probes,
  ].join('; ');
}
