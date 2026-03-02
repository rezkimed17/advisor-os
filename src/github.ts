import { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PullRequestResult {
    url: string;
    number: number;
    branch: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

function ownerRepo() {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (!owner || !repo) {
        throw new Error("[github] GITHUB_OWNER and GITHUB_REPO must be set.");
    }
    return { owner, repo };
}

// ---------------------------------------------------------------------------
// Branch Management
// ---------------------------------------------------------------------------

/**
 * Create a new branch from the HEAD of `main`.
 */
async function createBranch(branchName: string): Promise<void> {
    const { owner, repo } = ownerRepo();

    // Get the SHA of the latest commit on main.
    const { data: ref } = await octokit.git.getRef({
        owner,
        repo,
        ref: "heads/main",
    });
    const sha = ref.object.sha;

    await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
    });

    console.log(`[github] Created branch '${branchName}' at ${sha.slice(0, 7)}`);
}

/**
 * Create a feature branch for a new skill: `feat/skill-{name}`.
 */
export async function createSkillBranch(skillName: string): Promise<string> {
    const branch = `feat/skill-${sanitize(skillName)}`;
    await createBranch(branch);
    return branch;
}

/**
 * Create a fix branch for self-healing: `fix/skill-{name}`.
 */
export async function createFixBranch(skillName: string): Promise<string> {
    const branch = `fix/skill-${sanitize(skillName)}`;
    await createBranch(branch);
    return branch;
}

// ---------------------------------------------------------------------------
// File Commits
// ---------------------------------------------------------------------------

/**
 * Commit a single file to a given branch.
 */
export async function commitSkillFile(
    branch: string,
    path: string,
    content: string,
    message: string,
): Promise<void> {
    const { owner, repo } = ownerRepo();

    // Check if the file already exists on the branch (for updates).
    let existingSha: string | undefined;
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref: branch,
        });
        if (!Array.isArray(data) && data.type === "file") {
            existingSha = data.sha;
        }
    } catch {
        // File does not exist yet -- this is expected for new skills.
    }

    await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
    });

    console.log(`[github] Committed '${path}' to '${branch}'`);
}

// ---------------------------------------------------------------------------
// Pull Requests
// ---------------------------------------------------------------------------

/**
 * Open a pull request from the given branch against `main`.
 */
export async function openPullRequest(
    branch: string,
    title: string,
    body: string,
): Promise<PullRequestResult> {
    const { owner, repo } = ownerRepo();

    const { data: pr } = await octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head: branch,
        base: "main",
    });

    console.log(`[github] Opened PR #${pr.number}: ${pr.html_url}`);

    return {
        url: pr.html_url,
        number: pr.number,
        branch,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a skill name for use in branch names.
 */
function sanitize(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
