Current State:
We already have traditional JWT-based local authentication implemented.
Existing endpoints: POST /api/auth/register and POST /api/auth/login.
We have a User model in MongoDB.
Task Requirements:
Please implement the following API endpoint and its necessary counterpart:
1. GET /api/auth/google
Action: Redirect the user to the Google OAuth consent screen.
Scopes Required: profile, email, and most importantly, Google Calendar read/write access (https://www.googleapis.com/auth/calendar or the specific equivalent scopes needed to schedule institute events/meetings).
Access Type: Must request offline access to ensure we receive a refresh_token for background calendar operations.
2. GET /api/auth/google/callback (Required for OAuth flow)
Action: Handle the redirect from Google.
Logic: > * Extract the authorization code and exchange it for tokens (access and refresh).
Check if a user with this Google email already exists in our MongoDB.
If they exist: Link the Google account/tokens to their profile and generate our standard app session/JWT.
If they do not exist: Create a new user record, store their Google IDs and tokens, and generate our app session/JWT.
Securely store the refresh_token in the database so the CRM can manage calendar events when the user is not actively logged in.
