# Jepoy Floor AI free-account API

The service keeps the `/v1/licenses` name for desktop compatibility. Its token now proves free account sign-in, not a purchase. Every authenticated account receives `plan: free`, `status: free`, an expiry 24 hours after issue, and a computer-bound `did` claim. The token is an EdDSA JWS with `iss`, `aud`, `sub`, `iat`, `exp`, `email`, `name`, `jti`, `plan`, `status`, and `features` claims.

| Endpoint | Use |
|---|---|
| `GET /oauth/authorize` | Begin desktop OAuth with PKCE S256, state and a registered custom-scheme or `127.0.0.1` loopback redirect. |
| `POST /oauth/token` | Exchange one-use code or rotate a refresh token. |
| `POST /oauth/revoke` | Revoke a refresh session. |
| `GET /login`, `GET /login/:provider`, callback | Google/Yahoo sign-in with verified email. |
| `GET /account`, `POST /logout` | Browser account page and sign-out. |
| `POST /v1/licenses` | Bearer-authenticated free token issue; accepts `device_id`, optional `device_name`, `platform`, `app_version`. |
| `DELETE /v1/devices/:id` | Remove a signed-in computer from the account list. |
| `GET /health` | Service health. |

`GET /start` and `GET /redeem` redirect old website links to `/account`. Purchase, redemption and trial-charge endpoints return `410 {"error":"purchases_retired"}`. The Stripe webhook acknowledges old retries without processing them. No new checkout or charge endpoint exists.

The desktop may use a free token offline until `exp`; it must have a stored refresh session to unlock. An existing signed, machine-bound perpetual activation keeps its original offline grant until sign-out and does not renew automatically. Server-side refresh token expiry is 90 days; access token expiry is 15 minutes. Both OAuth code and refresh tokens are single-use, and replay of a spent refresh token revokes its family.
