import { describe, expect, it } from "vitest";
import {
  buildStagingEnvironment,
  runStagingBuild,
  stagingBuildVarNames
} from "../scripts/build-staging.mjs";

const config = `
[vars]
FINFOLD_DEPLOYMENT_ENV = "staging"
NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_staging"
NEXT_PUBLIC_APP_URL = "https://finfold-staging.example.com"
NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
`;

describe("staging build environment", () => {
  it("injects public staging vars at build time and forces mock mode off", () => {
    const environment = buildStagingEnvironment(config, { PATH: "/bin" });

    expect(environment.PATH).toBe("/bin");
    expect(environment.ALLOW_MOCK).toBe("false");
    expect(environment.NEXT_PUBLIC_ALLOW_MOCK).toBe("false");
    for (const name of stagingBuildVarNames) expect(environment[name]).toBeTruthy();
  });

  it("rejects a production-looking app URL", () => {
    expect(() =>
      buildStagingEnvironment(
        config.replace("finfold-staging.example.com", "www.finfold.app")
      )
    ).toThrow(/staging label/i);
  });

  it("rejects a missing build-time public variable", () => {
    expect(() =>
      buildStagingEnvironment(
        config.replace('NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_staging"', "")
      )
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("runs OpenNext directly so the production build wrapper cannot overwrite staging vars", () => {
    let invocation:
      | { command: string; args: readonly string[]; environment: Record<string, string | undefined> }
      | undefined;
    const status = runStagingBuild(process.cwd(), ((command, args, options) => {
      invocation = {
        command,
        args: args ?? [],
        environment: options?.env ?? {}
      };
      return { status: 0 };
    }) as typeof import("node:child_process").spawnSync);

    expect(status).toBe(0);
    expect(invocation).toMatchObject({
      command: "npx",
      args: ["opennextjs-cloudflare", "build"],
      environment: {
        FINFOLD_DEPLOYMENT_ENV: "staging",
        NEXT_PUBLIC_APP_URL: expect.stringContaining("staging")
      }
    });
  });
});
