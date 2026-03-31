import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: "admin" | "operator" | "viewer";
    /** Set at sign-in when the account has MFA enabled (password OK, TOTP pending). */
    mfaRequired?: boolean;
  }

  interface Session {
    user: User & {
      id: string;
      role: "admin" | "operator" | "viewer";
      mfaRequired?: boolean;
      mfaVerified?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "operator" | "viewer";
    mfaRequired?: boolean;
    mfaVerified?: boolean;
  }
}
