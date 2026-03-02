export default function Home() {
    return (
        <main
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                backgroundColor: "#0a0a0a",
                color: "#e5e5e5",
                padding: "2rem",
            }}
        >
            <h1
                style={{
                    fontSize: "2.5rem",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    marginBottom: "0.5rem",
                }}
            >
                Advisor-OS
            </h1>

            <p
                style={{
                    fontSize: "1.1rem",
                    color: "#888",
                    marginBottom: "2rem",
                    textAlign: "center",
                    maxWidth: "480px",
                }}
            >
                Self-evolving AI advisor. Powered by Bun, OpenRouter, and GitHub.
            </p>

            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "8px",
                    backgroundColor: "#111",
                    border: "1px solid #222",
                }}
            >
                <span
                    style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#22c55e",
                    }}
                />
                <span style={{ fontSize: "0.9rem", color: "#aaa" }}>
                    System Online
                </span>
            </div>
        </main>
    );
}
