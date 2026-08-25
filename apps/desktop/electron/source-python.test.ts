import assert from 'node:assert/strict'
import path from 'node:path'

import { test } from 'vitest'

import { findUsableSourcePython, sourcePythonCandidates } from './source-python'

test('source Python candidates reuse the managed hermes-local environment', () => {
  const candidates = sourcePythonCandidates('/home/luo/hermes-local', '/home/luo/.hermes', {
    explicitVenv: '/tmp/hermes-explicit',
    pathModule: path.posix,
    platform: 'linux'
  })

  assert.deepEqual(candidates, [
    '/tmp/hermes-explicit/bin/python',
    '/home/luo/hermes-local/.venv/bin/python',
    '/home/luo/hermes-local/venv/bin/python',
    '/home/luo/.hermes/venvs/hermes-local/bin/python',
    '/home/luo/.hermes/venvs/hermes-dev/bin/python'
  ])
})

test('source Python candidates support the documented hermes-dev environment', () => {
  const candidates = sourcePythonCandidates('/work/hermes-agent', '/home/test/.hermes', {
    pathModule: path.posix,
    platform: 'linux'
  })

  assert.ok(candidates.includes('/home/test/.hermes/venvs/hermes-dev/bin/python'))
  assert.ok(candidates.includes('/home/test/.hermes/venvs/hermes-local/bin/python'))
})

test('source Python candidates use Windows virtual environment layout', () => {
  const candidates = sourcePythonCandidates(
    'C:\\Users\\test\\hermes-local',
    'C:\\Users\\test\\.hermes',
    {
      pathModule: path.win32,
      platform: 'win32'
    }
  )

  assert.deepEqual(candidates.slice(0, 3), [
    'C:\\Users\\test\\hermes-local\\.venv\\Scripts\\python.exe',
    'C:\\Users\\test\\hermes-local\\venv\\Scripts\\python.exe',
    'C:\\Users\\test\\.hermes\\venvs\\hermes-local\\Scripts\\python.exe'
  ])
})

test('healthy managed Python is selected before an unusable system Python', () => {
  const candidates = ['/repo/.venv/bin/python', '/home/test/.hermes/venvs/hermes-local/bin/python']
  const checked: string[] = []

  const selected = findUsableSourcePython(candidates, '/usr/bin/python3', candidate => {
    checked.push(candidate)

    return candidate.includes('/.hermes/venvs/hermes-local/')
  })

  assert.equal(selected, '/home/test/.hermes/venvs/hermes-local/bin/python')
  assert.deepEqual(checked, candidates)
})

test('unusable system Python is rejected instead of causing a dead backend', () => {
  const selected = findUsableSourcePython([], '/usr/bin/python3', () => false)

  assert.equal(selected, null)
})
