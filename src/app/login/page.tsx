import { BetaLoginForm } from "@/components/BetaLoginForm";
import { betaAuthEnabled } from "@/lib/launch-control";

export const dynamic = "force-dynamic";

/**
 * Server-side release gate means OTP form is read-only when the beta is off,
 * even if the user guesses /login directly on a protected Preview URL.
 */
export default function LoginPage() {
  return <BetaLoginForm enabled={betaAuthEnabled(process.env)} />;
}
