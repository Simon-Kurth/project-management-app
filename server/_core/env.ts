export const ENV = {
  appId:        process.env.APP_ID ?? "project-management-app",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl:  process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Optional — only needed if LLM features are enabled
  forgeApiUrl:  process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey:  process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

const REQUIRED_ENV_VARS: Array<{ key: keyof typeof ENV; envVar: string }> = [
  { key: "cookieSecret", envVar: "JWT_SECRET" },
];

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter(({ key }) => !ENV[key]);
  if (missing.length > 0) {
    const list = missing.map(({ envVar }) => `  - ${envVar}`).join("\n");
    throw new Error(`Server startup failed — missing required environment variables:\n${list}`);
  }
}
