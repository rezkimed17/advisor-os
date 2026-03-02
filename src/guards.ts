// ---------------------------------------------------------------------------
// Security Guards -- Ingress (Echo Check) and Egress (Content Check)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngressResult {
    safe: boolean;
    reason?: string;
}

export interface EgressResult {
    safe: boolean;
    violations: string[];
}

// ---------------------------------------------------------------------------
// Ingress Guard -- Prompt Injection Detection
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?(previous|above|prior)/i,
    /forget\s+(everything|all|your)\s*(instructions|rules|guidelines)?/i,
    /you\s+are\s+now\s+(a|an|the)\s+/i,
    /system\s*prompt/i,
    /\bdo\s+not\s+follow\s+(your|the)\s+(rules|instructions)\b/i,
    /\bact\s+as\s+(if|though)\s+you\s+have\s+no\s+restrictions\b/i,
    /\boverride\s+(your|all|the)\s+(rules|safety|guidelines)\b/i,
    /\bjailbreak\b/i,
    /\bDAN\s+mode\b/i,
];

/**
 * Check user input for known prompt injection patterns.
 * Returns `{ safe: true }` if the input passes, or `{ safe: false, reason }`
 * with a description of the matched pattern.
 */
export function checkIngress(input: string): IngressResult {
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            return {
                safe: false,
                reason: `Blocked: input matched a restricted pattern (${pattern.source}).`,
            };
        }
    }
    return { safe: true };
}

// ---------------------------------------------------------------------------
// Egress Guard -- Output Content Scanning
// ---------------------------------------------------------------------------

interface EgressRule {
    pattern: RegExp;
    label: string;
}

const EGRESS_RULES: EgressRule[] = [
    // Environment / secrets access
    { pattern: /process\.env/g, label: "References process.env" },
    { pattern: /\.env\b/g, label: "References .env file" },
    { pattern: /dotenv/g, label: "References dotenv package" },

    // Destructive filesystem operations
    { pattern: /rm\s+-rf\s+\//g, label: "Destructive rm -rf on root" },
    { pattern: /rmdir\s+\/|del\s+\/\*/gi, label: "Destructive directory deletion" },
    { pattern: /format\s+[cC]:/g, label: "Disk format command" },

    // Unauthorized network calls
    { pattern: /\bfetch\s*\(/g, label: "Unauthorized fetch() call" },
    { pattern: /\baxios\b/g, label: "Unauthorized axios usage" },
    { pattern: /\bhttp\.request\b/g, label: "Unauthorized http.request call" },
    { pattern: /\bchild_process\b/g, label: "References child_process module" },
    { pattern: /\bexec\s*\(/g, label: "Shell exec() call" },
    { pattern: /\bspawn\s*\(/g, label: "Shell spawn() call" },
];

/**
 * Scan LLM output for dangerous patterns before returning it to the user.
 * Returns `{ safe: true, violations: [] }` if clean, or a list of violations.
 */
export function checkEgress(output: string): EgressResult {
    const violations: string[] = [];

    for (const rule of EGRESS_RULES) {
        // Reset lastIndex for global regexes.
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(output)) {
            violations.push(rule.label);
        }
    }

    return {
        safe: violations.length === 0,
        violations,
    };
}
