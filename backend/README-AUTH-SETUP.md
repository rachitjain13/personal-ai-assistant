# Personal AI Assistant — Login + User Data

## What this adds
- Register with name, email and password.
- Login with email + password.
- JWT authentication.
- Passwords are bcrypt-hashed; plaintext passwords are never stored.
- Every conversation belongs to a user.
- Every user's token usage is stored separately.
- A user can only read/delete their own chats.
- `/api/auth/me` restores the account and usage after refresh/login.

## Backend install
From `D:\personal-ai-assistant\backend`:

```powershell
npm install bcryptjs jsonwebtoken
npm install -D @types/jsonwebtoken
```

Ensure `.env` contains:

```env
JWT_SECRET=replace-this-with-a-long-random-secret
```

## Replace/add files
Add the files in this ZIP under `backend/src`.

Replace:
- `models/Conversation.ts` with `models/Conversation.auth.ts` (rename it to `Conversation.ts`)
- `controllers/chat.controller.ts` with `controllers/chat.controller.auth.ts` (rename it to `chat.controller.ts`)
- `controllers/conversation.controller.ts` with `controllers/conversation.controller.auth.ts` (rename it to `conversation.controller.ts`)
- `routes/conversation.routes.ts` with `routes/conversation.routes.auth.ts` (rename it to `conversation.routes.ts`)

Add:
- `models/User.ts`
- `models/UserUsage.ts`
- `middleware/auth.middleware.ts`
- `controllers/auth.controller.ts`
- `routes/auth.routes.ts`

Use `server.auth.patch.ts` as the reference for `server.ts`: keep your existing `chat.route`/`chat.routes` import exactly as it currently exists, and add `authRoutes` plus `app.use("/api/auth", authRoutes)`.

## Frontend
Replace `frontend/src/App.tsx` with the provided `App_auth_ready.tsx`.

## Test
1. Register Account A.
2. Send messages.
3. Logout by clicking the account row at the bottom-left.
4. Register Account B.
5. B should see no chats from A and token usage should start at 0.
6. Login back as A. A's chats and account token usage should return.

## Note
This mini-project stores the JWT in localStorage for simplicity. For production, prefer secure HttpOnly cookies plus email verification, password reset, rate limiting and stronger session controls.
