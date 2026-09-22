import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/config/env";
import { isSafeRedirect } from "@/lib/auth/CustomerAuthContext";


interface SocialLoginButtonsProps {
  /** Post-authentication destination (already open-redirect validated). */
  redirect?: string | undefined;
}

function socialStartUrl(provider: "google" | "facebook", redirect?: string): string {
  const target = redirect && isSafeRedirect(redirect) ? redirect : "/account";
  const url = new URL(`${API_BASE_URL}/auth/customer/${provider}`);
  url.searchParams.set("redirect", target);
  return url.toString();
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.98 11.98 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

/** Facebook "f" brand mark. */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z"
      />
    </svg>
  );
}

export function SocialLoginButtons({ redirect }: SocialLoginButtonsProps) {
  return (
    <div className="space-y-3">
      <Button asChild variant="outline" className="h-11 w-full">
        <a href={socialStartUrl("google", redirect)} data-testid="social-google">
          <GoogleIcon className="h-5 w-5 shrink-0" />
          <span>Continue with Google</span>
        </a>
      </Button>
      <Button asChild variant="outline" className="h-11 w-full">
        <a href={socialStartUrl("facebook", redirect)} data-testid="social-facebook">
          <FacebookIcon className="h-5 w-5 shrink-0" />
          <span>Continue with Facebook</span>
        </a>
      </Button>
    </div>
  );
}

/** Horizontal divider between the password form and the social options. */
export function SocialDivider() {
  return (
    <div className="relative py-2" role="separator" aria-label="Or continue with">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
          or continue with
        </span>
      </div>
    </div>
  );
}
