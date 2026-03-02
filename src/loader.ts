import matter from "gray-matter";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Skill {
  name: string;
  description: string;
  group: string;
  triggers: string[];
  body: string;
  filePath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILLS_DIR = resolve(import.meta.dir, "..", "skills");

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Read every `.md` file in /skills and parse its YAML frontmatter.
 * Returns a typed array of Skill objects.
 */
export async function loadSkills(): Promise<Skill[]> {
  let entries: string[];
  try {
    entries = await readdir(SKILLS_DIR);
  } catch {
    console.error(`[loader] Skills directory not found at ${SKILLS_DIR}`);
    return [];
  }

  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const skills: Skill[] = [];

  for (const file of mdFiles) {
    const filePath = join(SKILLS_DIR, file);
    const raw = await readFile(filePath, "utf-8");
    const { data, content } = matter(raw);

    if (!data.name || !data.group) {
      console.warn(`[loader] Skipping ${file}: missing required frontmatter (name, group)`);
      continue;
    }

    skills.push({
      name: String(data.name),
      description: String(data.description ?? ""),
      group: String(data.group),
      triggers: Array.isArray(data.triggers)
        ? data.triggers.map(String)
        : [],
      body: content.trim(),
      filePath,
    });
  }

  console.log(`[loader] Loaded ${skills.length} skill(s) from ${SKILLS_DIR}`);
  return skills;
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

/**
 * Find the first skill whose `group` matches the given channel name and whose
 * `triggers` array contains at least one keyword present in the user message.
 * Matching is case-insensitive.
 */
export function findSkill(
  skills: Skill[],
  channelName: string,
  message: string,
): { skill: Skill | null; channelMismatch: Skill | null } {
  const lowerMessage = message.toLowerCase();
  let channelMismatch: Skill | null = null;

  for (const skill of skills) {
    const triggerHit = skill.triggers.some((t) =>
      lowerMessage.includes(t.toLowerCase()),
    );
    if (!triggerHit) continue;

    if (skill.group === channelName || skill.group === "system") {
      return { skill, channelMismatch: null };
    }

    // Trigger matched but wrong channel -- record for redirect.
    if (!channelMismatch) {
      channelMismatch = skill;
    }
  }

  return { skill: null, channelMismatch };
}
