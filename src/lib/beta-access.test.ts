import { describe, expect, it } from "vitest";
import { betaModeRequested, isBetaEmailInvited } from "./beta-access";

describe("invite-only beta allowlist", () => {
  it("accepts only exact, case-insensitive invited addresses", () => {
    const allow = " a@example.com ,Team.Beta@example.org ";
    expect(isBetaEmailInvited("A@EXAMPLE.COM", allow)).toBe(true);
    expect(isBetaEmailInvited(" team.beta@example.org ", allow)).toBe(true);
    expect(isBetaEmailInvited("a@example.com.evil.test", allow)).toBe(false);
    expect(isBetaEmailInvited("outsider@example.com", allow)).toBe(false);
  });
  it("fails closed when the list or email is missing", () => {
    expect(isBetaEmailInvited("a@example.com", undefined)).toBe(false);
    expect(isBetaEmailInvited(undefined, "a@example.com")).toBe(false);
    expect(isBetaEmailInvited("not-an-email", "not-an-email")).toBe(false);
  });
  it("never activates for a full launch or without explicit enablement", () => {
    expect(betaModeRequested({ BETA_ENABLED: "true", LAUNCH_ENABLED: "false" })).toBe(true);
    expect(betaModeRequested({ BETA_ENABLED: "true", LAUNCH_ENABLED: "true" })).toBe(false);
    expect(betaModeRequested({})).toBe(false);
  });
});
