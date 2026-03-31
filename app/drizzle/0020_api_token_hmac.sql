-- Add HMAC integrity column to api_tokens to prevent direct DB injection
ALTER TABLE "api_tokens" ADD COLUMN "token_hmac" varchar(64);
