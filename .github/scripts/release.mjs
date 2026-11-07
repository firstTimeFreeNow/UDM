import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bumpVersion, parseVersion, validateBump } from './release-version.mjs';

const AUTHOR = { name: 'firstTimeFreeNow', email: '350835172+firstTimeFreeNow@users.noreply.github.com' };

export function githubApi(token, repository) {
  if (!token || !repository) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required.');
  return async function api(path, method = 'GET', body) {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      const error = new Error(`GitHub API ${method} ${path}: ${response.status} ${data?.message ?? ''}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };
}

async function optional(api, path) {
  try { return await api(path); } catch (error) { if (error.status === 404) return null; throw error; }
}

async function pages(api, path) {
  const results = [];
  for (let page = 1; ; page++) {
    const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}

async function releaseFile(api, ref) {
  const file = await api(`/contents/RELEASE?ref=${encodeURIComponent(ref)}`);
  const version = Buffer.from(file.content, 'base64').toString('utf8').trim();
  parseVersion(version);
  return { version, sha: file.sha };
}

async function tagCommit(api, tag) {
  const ref = await optional(api, `/git/ref/tags/${encodeURIComponent(tag)}`);
  if (!ref) return null;
  let object = ref.object;
  for (let i = 0; object.type === 'tag' && i < 10; i++) object = (await api(`/git/tags/${object.sha}`)).object;
  if (object.type !== 'commit') throw new Error(`Tag ${tag} does not resolve to a commit.`);
  return object.sha;
}

export async function prepareRelease(api, repository, type) {
  // Reject invalid inputs before making any writes.
  bumpVersion('0.0.0', type);
  const base = (await api('/git/ref/heads/main')).object.sha;
  const current = await releaseFile(api, base);
  const version = bumpVersion(current.version, type);
  const tag = `v${version}`;
  const branch = `release/${tag}`;
  const open = await pages(api, '/pulls?state=open&base=main');
  const existing = open.find(pr => pr.head.repo?.full_name === repository && pr.head.ref.startsWith('release/v'));
  if (existing) {
    if (existing.head.ref !== branch) throw new Error(`An open release PR already exists: ${existing.html_url}. Merge or close it first.`);
    const files = await pages(api, `/pulls/${existing.number}/files`);
    if (files.length !== 1 || files[0].filename !== 'RELEASE' || (await releaseFile(api, existing.head.sha)).version !== version) throw new Error('Existing release PR has unexpected changes. Review it manually.');
    return { version, url: existing.html_url, reused: true };
  }
  if (await tagCommit(api, tag)) throw new Error(`Tag ${tag} already exists.`);
  const oldBranch = await optional(api, `/git/ref/heads/${branch}`);
  let updateFile = !oldBranch;
  if (oldBranch) {
    // Recover a run that created the branch but failed before opening the PR.
    const compare = await api(`/compare/${base}...${oldBranch.object.sha}`);
    if (oldBranch.object.sha === base) updateFile = true;
    else if (compare.status !== 'ahead' || compare.ahead_by !== 1 || compare.files?.length !== 1 || compare.files[0].filename !== 'RELEASE' || (await releaseFile(api, oldBranch.object.sha)).version !== version) throw new Error(`Branch ${branch} already exists with unexpected changes.`);
  } else {
    await api('/git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: base });
  }
  if (updateFile) {
    await api('/contents/RELEASE', 'PUT', {
      branch, sha: current.sha, content: Buffer.from(`${version}\n`).toString('base64'),
      message: `chore(release): ${tag}`, author: AUTHOR, committer: AUTHOR,
    });
  }
  const pr = await api('/pulls', 'POST', {
    title: `chore(release): ${tag}`, head: branch, base: 'main',
    body: `## Release ${tag}\n\n- Type: ${type}\n- RELEASE: ${current.version} → ${version}\n\nThis PR changes only RELEASE. Merging it builds the merge commit, publishes ${tag}, and deploys to GitHub Pages. Closing without merging does not release.\n\nIf GitHub requests approval for the automated PR checks, select **Approve workflows to run** before merging.`,
  });
  return { version, url: pr.html_url, reused: false };
}

export async function validateReleasePR(api, repository, number) {
  const pr = await api(`/pulls/${number}`);
  if (!pr.merged || pr.base.ref !== 'main' || pr.head.repo?.full_name !== repository || !pr.head.ref.startsWith('release/v')) throw new Error('This is not a merged release PR targeting main.');
  const files = await pages(api, `/pulls/${number}/files`);
  if (files.length !== 1 || files[0].filename !== 'RELEASE' || files[0].status !== 'modified') throw new Error('A release PR must modify only the RELEASE file.');
  const sha = pr.merge_commit_sha;
  const commit = await api(`/git/commits/${sha}`);
  if (!commit.parents?.length) throw new Error('Merge commit has no parent.');
  const previous = (await releaseFile(api, commit.parents[0].sha)).version;
  const version = (await releaseFile(api, sha)).version;
  const type = validateBump(previous, version);
  if (pr.head.ref !== `release/v${version}`) throw new Error('Release branch and RELEASE version do not match.');
  const existing = await tagCommit(api, `v${version}`);
  if (existing && existing !== sha) throw new Error('Release tag points to a different commit.');
  return { version, sha, type };
}

export async function publishRelease(api, version, sha) {
  parseVersion(version);
  if ((await releaseFile(api, sha)).version !== version) throw new Error('RELEASE does not match the version being published.');
  const tag = `v${version}`;
  const existingTag = await tagCommit(api, tag);
  if (existingTag && existingTag !== sha) throw new Error(`Tag ${tag} points to a different commit.`);
  const existing = await optional(api, `/releases/tags/${encodeURIComponent(tag)}`);
  if (existing) {
    if (existing.draft || existing.prerelease || existingTag !== sha) throw new Error('Existing release does not match the expected published release.');
    return existing.html_url;
  }
  const release = await api('/releases', 'POST', {
    tag_name: tag, target_commitish: sha, name: tag,
    draft: false, prerelease: false, make_latest: 'true', generate_release_notes: true,
  });
  return release.html_url;
}

function output(values) {
  for (const [key, value] of Object.entries(values)) {
    if (String(value).includes('\n')) throw new Error('Multiline output is not allowed.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(JSON.stringify(values));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const api = githubApi(process.env.GH_TOKEN, process.env.GITHUB_REPOSITORY);
    const [command, arg, sha] = process.argv.slice(2);
    if (command === 'prepare') output(await prepareRelease(api, process.env.GITHUB_REPOSITORY, arg));
    else if (command === 'validate') output(await validateReleasePR(api, process.env.GITHUB_REPOSITORY, Number(arg)));
    else if (command === 'publish') output({ url: await publishRelease(api, arg, sha) });
    else throw new Error(`Unknown release command: ${command}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
