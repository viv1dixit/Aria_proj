**Context:**
The following authentication endpoints are already fully implemented, and functioning:
1. `POST /api/auth/register` (Local registration)
2. `POST /api/auth/login` (Local login, establishes session/JWT)
3. `GET /api/auth/google` (Google OAuth initialization, requests calendar access)
4. `GET /api/auth/google/callback` (Handles Google OAuth callback, stores tokens)

**Current Task:**
Implement the `GET /api/conversations` endpoint. This route should retrieve a paginated list of all conversations belonging to the currently authenticated user.

**Requirements & Acceptance Criteria:**
1. **Middleware Integration:** Protect this route using the existing authentication middleware. The endpoint must identify the user making the request (e.g., via `req.user` or context).
2. **Database Query:** Query the database for `Conversation` records where the current user is listed in the participants array/relation.
3. **Data Population:** - Fetch the basic profile information (e.g., `id`, `name`, `email`, `avatar`) of the *other* participants in each conversation.
   - Include a preview of the most recent `Message` in the conversation (the last message text and its timestamp) so the frontend can render a standard inbox view.
4. **Sorting & Pagination:**
   - Sort the results by `lastMessageAt` or `updatedAt` in descending order (newest activity first).
   - Implement pagination via query parameters (`?page=1&limit=20`). Provide sensible defaults if they are not passed.
5. **Standardized Response:** Return a JSON payload that includes the conversation array and pagination metadata (total pages, current page).
6. **Error Handling:** Ensure robust error handling (e.g., returning a 401 for unauthorized access, 500 for database failures) matching our existing error-handling patterns.

**Instructions for the Agent:**
- Step 1: Read the existing authentication middleware code to understand how to protect this route.
- Step 2: Check our current database schemas. If the `Conversation` and `Message` models/tables do not exist yet, draft a proposed schema optimized for this query and pause for my approval before proceeding.
- Step 3: Implement the route, controller logic, and any necessary database indexing.
- Step 4: Keep the code modular and stick to the established architectural patterns (e.g., MVC, repository pattern) used in the auth routes.