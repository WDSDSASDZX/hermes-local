import path from 'node:path'

type SourcePythonCandidateOptions = {
  explicitVenv?: string
  pathModule?: path.PlatformPath
  platform?: NodeJS.Platform
}

/**
 * Return Python executables that can run a local Hermes source checkout.
 *
 * Local installs intentionally keep their virtual environment outside the
 * checkout at ~/.hermes/venvs/hermes-local. Keep repository-local venvs first,
 * then reuse the managed development environments documented by Hermes.
 */
export function sourcePythonCandidates(
  root: string,
  hermesHome: string,
  options: SourcePythonCandidateOptions = {}
): string[] {
  const platform = options.platform ?? process.platform
  const pathModule = options.pathModule ?? (platform === 'win32' ? path.win32 : path.posix)
  const pythonParts = platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']

  const venvRoots = [
    options.explicitVenv,
    pathModule.join(root, '.venv'),
    pathModule.join(root, 'venv'),
    pathModule.join(hermesHome, 'venvs', pathModule.basename(root)),
    pathModule.join(hermesHome, 'venvs', 'hermes-local'),
    pathModule.join(hermesHome, 'venvs', 'hermes-dev')
  ].filter((candidate): candidate is string => Boolean(candidate))

  return [
    ...new Set(
      venvRoots.map(venvRoot => {
        return pathModule.join(venvRoot, ...pythonParts)
      })
    )
  ]
}

export function findUsableSourcePython(
  candidates: string[],
  systemPython: string | null,
  isUsable: (candidate: string) => boolean
): string | null {
  for (const candidate of candidates) {
    if (isUsable(candidate)) {
      return candidate
    }
  }

  return systemPython && isUsable(systemPython) ? systemPython : null
}
