/**
 * Providers connectable via better-auth's account-linking system
 * (`authClient.linkSocial()` / `auth.api.getAccessToken()`), distinct from
 * the providers used for signing in to Relay itself.
 *
 * Scopes are a starting point covering the node families each provider is
 * expected to support — revisit per-provider when building the node that
 * actually needs a given scope. Slack in particular: a plain OAuth "connect"
 * grants a *user* token, but sending messages as a bot into channels
 * typically needs a Slack app installed to the workspace with bot scopes —
 * a different flow than Google/GitHub/Microsoft's simpler user-OAuth. The
 * scopes below assume user-token Slack for now; revisit when building the
 * Slack node.
 */
export const CREDENTIAL_PROVIDERS = [
  {
    id: "google",
    label: "Google",
    description: "Sheets, Docs, and Gmail nodes",
    icon: "/google.svg",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    clientIdEnvVar: "GOOGLE_CLIENT_ID",
    clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Send messages to a channel",
    icon: "/slack.svg",
    scopes: ["chat:write", "channels:read"],
    clientIdEnvVar: "SLACK_CLIENT_ID",
    clientSecretEnvVar: "SLACK_CLIENT_SECRET",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Repository nodes",
    icon: "/github.svg",
    scopes: ["repo"],
    clientIdEnvVar: "GITHUB_CLIENT_ID",
    clientSecretEnvVar: "GITHUB_CLIENT_SECRET",
  },
  {
    id: "microsoft",
    label: "Microsoft",
    description: "Outlook mail nodes",
    icon: "/microsoft.svg",
    scopes: ["Mail.Send", "Mail.Read"],
    clientIdEnvVar: "MICROSOFT_CLIENT_ID",
    clientSecretEnvVar: "MICROSOFT_CLIENT_SECRET",
  },
  {
    id: "discord",
    label: "Discord",
    description: "Send messages to a channel",
    icon: "/discord.svg",
    // A plain OAuth "connect" grants a *user* token, same caveat as Slack
    // above — sending messages as a bot into a server's channels typically
    // needs a Discord application installed with a bot token, a different
    // flow than this simple user-OAuth. Revisit when building the Discord
    // node.
    scopes: ["identify"],
    clientIdEnvVar: "DISCORD_CLIENT_ID",
    clientSecretEnvVar: "DISCORD_CLIENT_SECRET",
  },
] as const;

export type CredentialProviderId = (typeof CREDENTIAL_PROVIDERS)[number]["id"];

export function isProviderConfigured(providerId: CredentialProviderId): boolean {
  const provider = CREDENTIAL_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return false;
  return Boolean(
    process.env[provider.clientIdEnvVar] && process.env[provider.clientSecretEnvVar],
  );
}
