import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="signin-page">
      <div className="signin-intro">
        <p className="eyebrow">SAGE · OPERATIONS</p>
        <h1>Run of Show Compiler</h1>
        <p className="muted">Sign in with your approved Google account. Access is limited to the SAGE operations team.</p>
      </div>
      <SignIn
        appearance={{
          variables: {
            colorPrimary: "#4fb6a8",
            colorBackground: "#10161c",
            colorForeground: "#e8eef2",
            colorMutedForeground: "#8fa1ad",
            colorInput: "#0b1014",
            colorInputForeground: "#e8eef2",
            borderRadius: "6px",
          },
        }}
      />
    </main>
  );
}
