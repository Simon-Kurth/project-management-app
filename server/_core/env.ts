export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

const REQUIRED_ENV_VARS: Array<{ key: keyof typeof ENV; envVar: string }> = [
  { key: "cookieSecret", envVar: "JWT_SECRET" },
  { key: "appId",        envVar: "VITE_APP_ID" },
  { key: "oAuthServerUrl", envVar: "OAUTH_SERVER_URL" },
];

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(({ key }) => !ENV[key]);
  if (missing.length > 0) {
    const list = missing.map(({ envVar }) => `  - ${envVar}`).join("\n");
    throw new Error(`Server startup failed — missing required environment variables:\n${list}`);
  }
}
