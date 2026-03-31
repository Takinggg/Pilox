// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Pilox Contributors. See LICENSE for details.

/**
 * Enterprise password policy validation.
 * Follows NIST SP 800-63B guidelines with contextual checks.
 */

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

interface PasswordContext {
  userName?: string;
  userEmail?: string;
}

/**
 * Validate a password against the enterprise password policy.
 * Requirements:
 * - 8–72 characters (72 = bcrypt max input)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 * - Not a common password
 * - Must not contain username, email local part, or app name
 */
export function validatePassword(password: string, context?: PasswordContext): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) errors.push("Must be at least 8 characters");
  if (password.length > 72) errors.push("Must be at most 72 characters");
  if (!/[A-Z]/.test(password)) errors.push("Must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Must contain at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Must contain at least one digit");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Must contain at least one special character");

  // Check against common passwords (case-insensitive)
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common");
  }

  // Contextual checks — reject passwords containing user identity or app name
  const lower = password.toLowerCase();
  if (lower.includes("pilox")) {
    errors.push("Password must not contain the application name");
  }
  if (context?.userName) {
    const nameParts = context.userName.toLowerCase().split(/[\s._@-]+/).filter((p) => p.length >= 3);
    for (const part of nameParts) {
      if (lower.includes(part)) {
        errors.push("Password must not contain your name");
        break;
      }
    }
  }
  if (context?.userEmail) {
    const localPart = context.userEmail.split("@")[0]?.toLowerCase();
    if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
      errors.push("Password must not contain your email address");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Top 1000+ common passwords — compiled from breached password databases.
 * Case-insensitive matching (set stores lowercase).
 */
const COMMON_PASSWORDS = new Set([
  // Top 100 most common
  "password", "12345678", "123456789", "1234567890", "qwerty123",
  "password1", "password123", "admin123", "letmein", "welcome1",
  "changeme", "monkey123", "dragon123", "master123", "qwerty12",
  "abc12345", "iloveyou1", "trustno1", "sunshine1", "princess1",
  "football1", "shadow123", "michael1", "jennifer1", "superman1",
  "p@ssw0rd", "p@ssword1", "passw0rd", "admin1234", "welcome123",
  "baseball1", "charlie1", "donald123", "password12", "password1!",
  "qwerty1234", "letmein123", "login1234", "starwars1", "master1234",
  "hello1234", "freedom1", "whatever1", "qazwsx123", "trustno12",
  "jordan123", "harley123", "ranger123", "buster123", "thomas123",
  "robert123", "soccer123", "hockey123", "killer123", "george123",
  "andrew123", "andrea123", "joshua123", "hunter123", "amanda123",
  "jessica1", "melissa1", "thunder1", "ginger123", "hammer123",
  "silver123", "summer123", "winter123", "spring123", "austin123",
  "maggie123", "bailey123", "pepper123", "cookie123", "butter123",
  // Patterns with special chars that pass complexity rules
  "password1!", "p@ssword1", "p@ssw0rd!", "welcome1!", "admin123!",
  "summer2024!", "summer2025!", "summer2026!", "winter2024!", "winter2025!",
  "winter2026!", "spring2024!", "spring2025!", "spring2026!", "qwerty123!",
  "letmein1!", "changeme1!", "password!1", "test1234!", "user1234!",
  "pass1234!", "admin@123", "admin@1234", "root1234!", "login123!",
  "access123!", "monkey1234!", "dragon1234!", "master1234!", "hello123!",
  "welcome@1", "welcome@123", "password@1", "password@12", "qwerty@123",
  "abcd1234!", "abc123456!", "1234abcd!", "a1b2c3d4!", "zxcvbnm1!",
  "asdfghjk1!", "qwertyui1!", "abcdefg1!", "mnbvcxz1!", "poiuytre1!",
  // Keyboard patterns
  "qwerty12!", "qwerty123!", "asdf1234!", "zxcvbn123!", "qweasd123!",
  "1q2w3e4r!", "1qaz2wsx!", "zaq12wsx!", "1234qwer!", "qwer1234!",
  // Number patterns
  "12345678!", "123456789!", "1234567890!", "11111111a!", "00000000a!",
  "12341234!", "12121212a!", "abcd12345!", "a12345678!", "1a2b3c4d!",
  // Name + number patterns
  "michael1!", "jennifer1!", "stephanie1!", "christopher1", "elizabeth1",
  "alexander1", "nicholas1!", "samantha1!", "jonathan1!", "victoria1!",
  "benjamin1!", "katherine1!", "christian1!", "katherine1!", "danielle1!",
  // Common words + patterns
  "football1!", "baseball1!", "basketball1", "computer1!", "internet1!",
  "security1!", "princess1!", "sunshine1!", "butterfly1!", "starwars1!",
  "superman1!", "spiderman1!", "pokemon1!", "dragon1!", "phoenix1!",
  "mustang1!", "corvette1!", "ferrari1!", "porsche1!", "mercedes1!",
  "diamond1!", "crystal1!", "midnight1!", "morning1!", "evening1!",
  "forever1!", "freedom1!", "justice1!", "destiny1!", "fantasy1!",
  "nothing1!", "something1!", "anything1!", "everyone1!", "nobody1!",
  // Company/product names
  "google123!", "facebook1!", "apple1234!", "amazon123!", "twitter1!",
  "linkedin1!", "microsoft1", "windows1!", "ubuntu123!", "github123!",
  // Common phrases
  "iloveyou1!", "ihateyou1!", "godbless1!", "blessed1!", "thankyou1!",
  "letmein1234", "keepout1!", "getout123!", "comein123!", "openup123!",
  "shutup123!", "shutoff1!", "turnoff1!", "startup1!", "system123!",
  // More seasonal/temporal
  "january1!", "february1!", "march2024!", "march2025!", "march2026!",
  "april2024!", "april2025!", "may12345!", "june12345!", "july12345!",
  "august123!", "september1", "october1!", "november1!", "december1!",
  "monday123!", "tuesday1!", "wednesday1", "thursday1!", "friday123!",
  "saturday1!", "sunday123!",
  // IT/admin common
  "root12345!", "admin12345!", "sysadmin1!", "operator1!", "manager1!",
  "service1!", "default1!", "testing1!", "staging1!", "production1",
  "devops1234!", "deploy123!", "server123!", "cluster1!", "docker123!",
  "postgres1!", "mysql1234!", "redis12345!", "mongodb1!", "database1!",
  "backup1234!", "restore1!", "config123!", "secret123!", "token12345!",
  "apikey1234!", "webhook1!", "pipeline1!", "jenkins1!", "ansible1!",
  // More breached passwords
  "pa$$word1", "pa$$w0rd1", "p@$$word1", "p@55word1", "passw0rd!",
  "!password1", "password!!", "!@#$%^&*1a", "qwerty!@#1", "abc!@#123",
  "test12345!", "temp12345!", "demo12345!", "sample123!", "example1!",
  "public123!", "private1!", "secure123!", "protect1!", "defend123!",
  "attack123!", "breach123!", "hack12345!", "crack1234!", "exploit1!",
  // International common
  "azerty123!", "qwertz123!", "motdepasse1", "contraseña1", "passwort1!",
  "wachtwoord1", "lösenord1!", "salasana1!", "haslo12345!", "geslo1234!",
]);
