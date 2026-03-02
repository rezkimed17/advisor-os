export const metadata = {
    title: "Advisor-OS",
    description: "Self-evolving AI advisor -- control plane",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
                />
            </head>
            <body style={{ margin: 0, fontFamily: "'Inter', sans-serif" }}>
                {children}
            </body>
        </html>
    );
}
