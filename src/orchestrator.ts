import OpenAI from "openai";
import { loadSkills, findSkill, type Skill } from "./loader";
import { checkIngress, checkEgress } from "./guards";
import {
    createSkillBranch,
    createFixBranch,
    commitSkillFile,
    openPullRequest,
} from "./github";

// ---------------------------------------------------------------------------
// OpenRouter Client (OpenAI-compatible)
// ---------------------------------------------------------------------------

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = "openai/gpt-4o";

// ---------------------------------------------------------------------------
// Skill Cache
// ---------------------------------------------------------------------------

let cachedSkills: Skill[] = [];

/**
 * Reload skills from disk. Called at startup and after a webhook
 * indicates a PR was merged.
 */
export async function reloadSkills(): Promise<void> {
    cachedSkills = await loadSkills();
}

// ---------------------------------------------------------------------------
// Core Message Handler
// ---------------------------------------------------------------------------

/**
 * Main entry point for processing a user message from Discord.
 *
 * Pipeline:
 * 1. Ingress guard -- block prompt injection
 * 2. Skill lookup -- match by channel group and trigger keywords
 * 3. If matched: call OpenRouter with skill body as system context
 * 4. If no match: invoke the skill-creator workflow
 * 5. If channel mismatch: redirect
 */
export async function handleMessage(
    channelName: string,
    userMessage: string,
): Promise<string> {
    // -- 1. Ingress Guard ---------------------------------------------------
    const ingress = checkIngress(userMessage);
    if (!ingress.safe) {
        return `[Guard] ${ingress.reason}`;
    }

    // -- 2. Skill Lookup -----------------------------------------------------
    const { skill, channelMismatch } = findSkill(
        cachedSkills,
        channelName,
        userMessage,
    );

    // -- 5. Channel Mismatch Redirect ----------------------------------------
    if (!skill && channelMismatch) {
        return (
            `This request matches the **${channelMismatch.name}** skill, ` +
            `which is scoped to the **#${channelMismatch.group}** channel. ` +
            `Please re-post your message there.`
        );
    }

    // -- 4. No Skill Found -- Invoke Skill Creator --------------------------
    if (!skill) {
        return await createNewSkill(channelName, userMessage);
    }

    // -- 3. Execute Skill with Healing Wrapper ------------------------------
    return await executeWithHealing(skill.name, async () => {
        return await callModel(skill.body, userMessage);
    });
}

// ---------------------------------------------------------------------------
// Model Interaction
// ---------------------------------------------------------------------------

async function callModel(
    systemPrompt: string,
    userPrompt: string,
): Promise<string> {
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        max_tokens: 2048,
    });

    const output = response.choices[0]?.message?.content ?? "";

    // -- Egress Guard -------------------------------------------------------
    const egress = checkEgress(output);
    if (!egress.safe) {
        console.warn(`[egress] Blocked output. Violations: ${egress.violations.join(", ")}`);
        return (
            "[Guard] The generated response was blocked because it contained " +
            "potentially unsafe content. Please refine your request."
        );
    }

    return output;
}

// ---------------------------------------------------------------------------
// Skill Creator Workflow
// ---------------------------------------------------------------------------

async function createNewSkill(
    channelName: string,
    userMessage: string,
): Promise<string> {
    const skillName = await deriveSkillName(userMessage);

    // Ask the LLM to generate a GENERIC skill file.
    const prompt = [
        "You are an AI that generates reusable skill definition files in Markdown with YAML frontmatter.",
        "",
        "CRITICAL RULE: The skill MUST be GENERIC and REUSABLE. Do NOT create a skill",
        "that only handles the specific example in the user's request. Instead, abstract",
        "the request into a broad capability.",
        "",
        "Examples of correct generalization:",
        '- "translate hello to Spanish" -> a general Translation skill (any language pair)',
        '- "summarize this article about AI" -> a general Summarization skill (any content)',
        '- "write a Python function for sorting" -> a general Code Generation skill (any language/task)',
        "",
        "The file MUST include:",
        "- YAML frontmatter with: name (kebab-case, generic), description, group, triggers (broad keywords)",
        `- The group MUST be: ${channelName}`,
        "- A body section containing a GENERIC system prompt. The prompt must instruct the AI",
        "  to handle the entire category of tasks, not just the specific example given.",
        "- The system prompt must tell the AI to ask for clarification if the user's input",
        "  is ambiguous (e.g., which target language for translation).",
        "",
        "Do NOT include hardcoded examples, specific languages, or specific inputs in the",
        "system prompt body. Keep it generic and parameterized.",
        "",
        "Return ONLY the raw Markdown content, no surrounding code fences.",
        "",
        `User request (use this to identify the CATEGORY, not as the exact scope): ${userMessage}`,
    ].join("\n");

    const skillContent = await callModel(prompt, userMessage);

    if (skillContent.startsWith("[Guard]")) {
        return skillContent;
    }

    try {
        const branch = await createSkillBranch(skillName);
        const filePath = `skills/${skillName}.md`;
        await commitSkillFile(
            branch,
            filePath,
            skillContent,
            `feat: add skill '${skillName}'`,
        );
        const pr = await openPullRequest(
            branch,
            `Add skill: ${skillName}`,
            [
                `## Functional Summary`,
                "",
                `A new skill **${skillName}** was auto-generated for the **#${channelName}** channel.`,
                "",
                `### Trigger Keywords`,
                `Extracted from the user request.`,
                "",
                `### Origin`,
                `> ${userMessage}`,
                "",
                "This PR was created automatically by Advisor-OS.",
            ].join("\n"),
        );

        return (
            `No existing skill matched your request. I have designed a new one and ` +
            `opened a Pull Request for review:\n\n` +
            `**PR:** ${pr.url}\n` +
            `**Branch:** \`${pr.branch}\`\n\n` +
            `The skill will become active once the PR is merged.`
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[skill-creator] Failed to create skill PR: ${msg}`);
        return `Failed to create a new skill PR. Error: ${msg}`;
    }
}

// ---------------------------------------------------------------------------
// Self-Healing (3-Attempt Threshold)
// ---------------------------------------------------------------------------

const HEAL_MAX_ATTEMPTS = 3;

/**
 * Execute a skill function with automatic self-healing. If the function
 * throws, capture the error, generate a fix via OpenRouter, and open a
 * fix/ branch PR. Halt after 3 consecutive failures.
 */
export async function executeWithHealing(
    skillName: string,
    fn: () => Promise<string>,
): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= HEAL_MAX_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(
                `[healing] Skill '${skillName}' failed (attempt ${attempt}/${HEAL_MAX_ATTEMPTS}): ${lastError.message}`,
            );

            if (attempt < HEAL_MAX_ATTEMPTS) {
                await attemptAutoFix(skillName, lastError, attempt);
            }
        }
    }

    // All attempts exhausted -- request human intervention.
    return (
        `The skill **${skillName}** has failed ${HEAL_MAX_ATTEMPTS} consecutive times. ` +
        `The last error was:\n\`\`\`\n${lastError?.message}\n\`\`\`\n` +
        `Automatic healing was unable to resolve the issue. Human intervention is required.`
    );
}

async function attemptAutoFix(
    skillName: string,
    error: Error,
    attempt: number,
): Promise<void> {
    try {
        const fixPrompt = [
            "You are debugging a skill that crashed at runtime.",
            `Skill name: ${skillName}`,
            `Error message: ${error.message}`,
            `Stack trace: ${error.stack ?? "N/A"}`,
            "",
            "Analyze the error and generate a corrected version of the skill file.",
            "Return ONLY the raw Markdown content with YAML frontmatter.",
        ].join("\n");

        const fixContent = await callModel(fixPrompt, error.message);

        const branch = await createFixBranch(`${skillName}-attempt-${attempt}`);
        await commitSkillFile(
            branch,
            `skills/${skillName}.md`,
            fixContent,
            `fix: auto-heal '${skillName}' (attempt ${attempt})`,
        );
        await openPullRequest(
            branch,
            `Fix skill: ${skillName} (attempt ${attempt})`,
            [
                `## Auto-Heal Report`,
                "",
                `Skill **${skillName}** crashed with the following error:`,
                "```",
                error.message,
                "```",
                "",
                `This is auto-heal attempt **${attempt}/${HEAL_MAX_ATTEMPTS}**.`,
            ].join("\n"),
        );

        console.log(`[healing] Opened fix PR for '${skillName}' (attempt ${attempt})`);
    } catch (fixError) {
        console.error(
            `[healing] Failed to create fix PR: ${fixError instanceof Error ? fixError.message : fixError}`,
        );
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deriveSkillName(message: string): Promise<string> {
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            {
                role: "system",
                content: [
                    "Extract the broad capability category from the user's request.",
                    "Return ONLY a short kebab-case name (1-3 words) for the GENERIC skill.",
                    "",
                    "Examples:",
                    '"translate this to Spanish" -> translation',
                    '"summarize this article about dogs" -> summarization',
                    '"write a Python sort function" -> code-generation',
                    '"review my PR" -> code-review',
                    '"explain quantum physics" -> explanation',
                    "",
                    "Return ONLY the kebab-case name, nothing else.",
                ].join("\n"),
            },
            { role: "user", content: message },
        ],
        max_tokens: 32,
    });

    const name = (response.choices[0]?.message?.content ?? "unknown-skill")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return name || "unknown-skill";
}
